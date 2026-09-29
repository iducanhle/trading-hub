import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Subject, debounceTime } from 'rxjs';
import { NOTE_MAX_LENGTH } from '../../../core/models/user-data';
import { NotesService } from '../../../core/services/notes.service';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { Icon } from '../../../shared/icon/icon';
import { NumberPipe } from '../../../shared/pipes/format.pipes';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';

type Status = 'loading' | 'load-error' | 'idle' | 'editing' | 'saving' | 'saved' | 'save-error';

/** Section 13: private notes per stock (`users/{uid}/notes/{symbol}`), saved 1 s after the last keystroke. */
@Component({
  selector: 'app-notes',
  imports: [CdkTextareaAutosize, MatFormField, MatLabel, MatInput, MatHint, MatButton, Section, Skeleton, Icon, NumberPipe],
  template: `
    <app-section title="My notes" [(expanded)]="expanded">
      <span sectionMeta class="text-xs font-normal text-on-surface-variant" role="status" aria-live="polite">
        @switch (status()) {
          @case ('saving') {
            Saving…
          }
          @case ('saved') {
            <span class="inline-flex items-center gap-1 text-gain"><app-icon name="check" [size]="14" />Saved</span>
          }
          @case ('save-error') {
            <span class="text-error">Not saved</span>
          }
        }
      </span>
      @if (status() === 'loading') {
        <app-skeleton shape="card" class="h-28" />
      } @else if (status() === 'load-error') {
        <div class="flex flex-col items-start gap-2 text-sm text-on-surface-variant">
          Couldn't load your notes.
          <button matButton="outlined" type="button" (click)="load(ctx.symbol())">Retry</button>
        </div>
      } @else {
        <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
          <mat-label>Notes on {{ ctx.symbol() }}</mat-label>
          <textarea
            matInput
            cdkTextareaAutosize
            cdkAutosizeMinRows="4"
            cdkAutosizeMaxRows="16"
            [attr.maxlength]="maxLength"
            [value]="text()"
            (input)="edit($any($event.target).value)"
            placeholder="Thesis, levels to watch, what to check at the next report…"
          ></textarea>
          <mat-hint>Only you can see these notes.</mat-hint>
          <mat-hint align="end">{{ text().length | num: 0 }} / {{ maxLength | num: 0 }}</mat-hint>
        </mat-form-field>
        @if (status() === 'save-error') {
          <button matButton type="button" class="mt-1" (click)="saveNow()">Try saving again</button>
        }
      }
    </app-section>
  `,
})
export class Notes {
  protected readonly ctx = inject(StockContext);
  private readonly notes = inject(NotesService);

  protected readonly maxLength = NOTE_MAX_LENGTH;
  protected readonly expanded = persistedSignal('et.section.notes', true);
  protected readonly text = signal('');
  protected readonly status = signal<Status>('loading');

  private readonly edits = new Subject<void>();
  /** The symbol the text belongs to (edits are saved there even after navigating to another stock). */
  private symbol = '';
  private dirty = false;

  constructor() {
    effect(() => {
      const symbol = this.ctx.symbol();
      const expanded = this.expanded();
      untracked(() => {
        if (this.dirty) void this.save(); // flush the previous stock's pending edit
        if (symbol && expanded) void this.load(symbol);
      });
    });
    this.edits.pipe(debounceTime(1000), takeUntilDestroyed()).subscribe(() => void this.save());
    inject(DestroyRef).onDestroy(() => {
      if (this.dirty) void this.save();
    });
  }

  async load(symbol: string): Promise<void> {
    this.symbol = symbol;
    this.status.set('loading');
    try {
      const note = await this.notes.load(symbol);
      if (this.symbol !== symbol) return;
      this.text.set(note?.text ?? '');
      this.status.set('idle');
    } catch {
      if (this.symbol === symbol) this.status.set('load-error');
    }
  }

  protected edit(value: string): void {
    this.text.set(value);
    this.dirty = true;
    this.status.set('editing');
    this.edits.next();
  }

  protected saveNow(): void {
    this.dirty = true;
    void this.save();
  }

  private async save(): Promise<void> {
    if (!this.dirty || !this.symbol) return;
    const symbol = this.symbol;
    const text = this.text();
    this.dirty = false;
    this.status.set('saving');
    try {
      await this.notes.save(symbol, text);
      if (this.symbol === symbol && !this.dirty) this.status.set('saved');
    } catch {
      this.dirty = true;
      if (this.symbol === symbol) this.status.set('save-error');
    }
  }
}
