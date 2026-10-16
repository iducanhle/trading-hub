import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogClose, MatDialogRef } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { T212Group } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { DIALOG_CONFIG, Dialog } from '../../shared/components/dialog/dialog';
import { Icon } from '../../shared/icon/icon';

export const GROUP_NAME_MAX = 40;

export interface GroupNameDialogData {
  /** The current name when renaming; absent when creating. */
  name?: string;
}

/** Asks for a group's name (new or renamed); closes with the trimmed name, or nothing when cancelled. */
@Component({
  selector: 'app-group-name-dialog',
  imports: [
    ReactiveFormsModule,
    MatButton,
    MatDialogClose,
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatInput,
    Dialog,
  ],
  template: `
    <app-dialog [title]="data.name ? labels.rename : labels.create">
      <form id="group-name-form" (submit)="$event.preventDefault(); save()">
        <mat-form-field appearance="fill" class="w-full">
          <mat-label i18n="Name of a group of trades">Name</mat-label>
          <input matInput autocomplete="off" [maxlength]="max" [formControl]="name" />
          <mat-hint align="end">{{ name.value.length }}/{{ max }}</mat-hint>
          <mat-error i18n>Enter a name.</mat-error>
        </mat-form-field>
      </form>
      <button dialogActions matButton="tonal" type="button" mat-dialog-close>
        <ng-container i18n>Cancel</ng-container>
      </button>
      <button dialogActions matButton="filled" type="submit" form="group-name-form">
        {{ data.name ? labels.save : labels.createButton }}
      </button>
    </app-dialog>
  `,
})
export class GroupNameDialog {
  protected readonly data = inject<GroupNameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<GroupNameDialog, string>);

  protected readonly max = GROUP_NAME_MAX;
  protected readonly name = new FormControl(this.data.name ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  });
  protected readonly labels = {
    create: $localize`:Dialog title|Creating a group of trades:New group`,
    rename: $localize`:Dialog title|Renaming a group of trades:Rename group`,
    createButton: $localize`:Button that creates a group of trades:Create`,
    save: $localize`:Button that saves a group's new name:Save`,
  };

  protected save(): void {
    if (this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.ref.close(this.name.value.trim());
  }
}

/** Opens the name dialog; resolves to the name, or null when cancelled. */
export async function askGroupName(dialog: MatDialog, current?: string): Promise<string | null> {
  const ref = dialog.open<GroupNameDialog, GroupNameDialogData, string>(GroupNameDialog, {
    ...DIALOG_CONFIG,
    autoFocus: 'input',
    data: { name: current },
  });
  return (await firstValueFrom(ref.afterClosed())) ?? null;
}

export interface GroupPickerData {
  groups: readonly Pick<T212Group, 'id' | 'name'>[];
  current: string | null;
}

/** What the picker closed with: a group (null = no group), or a request for a new one. */
export type GroupPick = { groupId: string | null } | 'new';

/** Chooses the group of a trade: no group, one of the groups, or a new one. */
@Component({
  selector: 'app-group-picker',
  imports: [Dialog, Icon],
  template: `
    <app-dialog title="Group" i18n-title="Dialog title|Choosing the group of a trade">
      <ul class="-mx-2" role="listbox" [attr.aria-label]="labels.choose">
        @for (option of options; track option.id) {
          <li>
            <button
              type="button"
              role="option"
              [attr.aria-selected]="option.id === data.current"
              class="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-surface-container-high"
              (click)="ref.close({ groupId: option.id })"
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-xl"
                [class]="
                  option.id
                    ? 'bg-primary-container text-primary'
                    : 'bg-surface-container-high text-on-surface-variant'
                "
              >
                <app-icon [name]="option.id ? 'folder' : 'block'" [size]="18" />
              </span>
              <span class="min-w-0 flex-1 truncate app-row-title">{{ option.name }}</span>
              @if (option.id === data.current) {
                <app-icon name="check" class="text-primary" />
              }
            </button>
          </li>
        }
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-primary hover:bg-surface-container-high"
            (click)="ref.close('new')"
          >
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-container-high"
            >
              <app-icon name="add" [size]="18" />
            </span>
            <span class="app-row-title" i18n="Option that creates a group of trades"
              >New group</span
            >
          </button>
        </li>
      </ul>
    </app-dialog>
  `,
})
export class GroupPicker {
  protected readonly data = inject<GroupPickerData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<GroupPicker, GroupPick>);

  protected readonly labels = { choose: $localize`Choose a group` };
  protected readonly options: { id: string | null; name: string }[] = [
    { id: null, name: $localize`:Option meaning the trade is in no group:No group` },
    ...this.data.groups.map((g) => ({ id: g.id, name: g.name })),
  ];
}

/**
 * Lets the user pick the trade's group (creating one if asked) and saves it. Resolves to the new group id, or
 * `undefined` when nothing changed (cancelled, same group, or the change was refused, which is reported).
 */
export async function pickTradeGroup(
  dialog: MatDialog,
  api: ApiService,
  notifier: NotifierService,
  tradeId: string,
  current: string | null,
): Promise<string | null | undefined> {
  let groups: T212Group[];
  try {
    groups = (await firstValueFrom(api.t212Groups())).items;
  } catch (error) {
    void notifier.show(errorMessage(error));
    return undefined;
  }
  const ref = dialog.open<GroupPicker, GroupPickerData, GroupPick>(GroupPicker, {
    ...DIALOG_CONFIG,
    data: { groups: [...groups].sort((a, b) => a.name.localeCompare(b.name)), current },
  });
  const pick = await firstValueFrom(ref.afterClosed());
  if (!pick) return undefined;
  let groupId: string | null;
  if (pick === 'new') {
    const name = await askGroupName(dialog);
    if (!name) return undefined;
    try {
      groupId = (await firstValueFrom(api.t212CreateGroup(name))).id;
    } catch (error) {
      void notifier.show(errorMessage(error));
      return undefined;
    }
  } else {
    groupId = pick.groupId;
  }
  if (groupId === current) return undefined;
  return (await assignTrades(api, notifier, [tradeId], groupId)) ? groupId : undefined;
}

/** Saves the trades' group; reports a failure (e.g. a group that would oversell) and resolves false. */
export async function assignTrades(
  api: ApiService,
  notifier: NotifierService,
  tradeIds: string[],
  groupId: string | null,
): Promise<boolean> {
  try {
    await firstValueFrom(api.t212AssignTrades(tradeIds, groupId), { defaultValue: undefined });
    return true;
  } catch (error) {
    void notifier.show(errorMessage(error));
    return false;
  }
}
