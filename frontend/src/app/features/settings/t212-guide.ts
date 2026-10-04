import { Component, inject, signal } from '@angular/core';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheet,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatButton } from '@angular/material/button';
import { LANGUAGE } from '../../core/i18n/language';
import { Sheet } from '../../shared/components/sheet/sheet';
import { Icon } from '../../shared/icon/icon';

/** A Trading 212 permission switch as the T212 app labels it (it doesn't translate them) and how to set it. */
interface Permission {
  label: string;
  on: boolean;
  why: string;
}

/**
 * Step-by-step guide to creating a Trading 212 API key, with screenshots of the T212 app in the UI language
 * (public/guide/t212/<step>-<en|cs>.jpg, cropped with the tap target outlined). Data: the server's IP, or null.
 */
@Component({
  selector: 'app-t212-guide',
  imports: [MatButton, Icon, Sheet],
  styles: `
    .steps {
      counter-reset: step;
    }
    .steps > li {
      position: relative;
      padding: 0 0 28px 48px;
      counter-increment: step;
    }
    /* The step number in a filled circle, joined to the next one by a line. */
    .steps > li::before {
      content: counter(step);
      position: absolute;
      top: -2px;
      left: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font-weight: 600;
    }
    .steps > li:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 38px;
      bottom: 6px;
      left: 15px;
      width: 2px;
      background: var(--mat-sys-outline-variant);
    }
    .step-title {
      margin-bottom: 12px;
      font-weight: 500;
    }
    .shot {
      width: 100%;
      max-width: 360px;
      border-radius: 16px;
      background: #0b1620;
    }
  `,
  template: `
    <app-sheet [title]="labels.title">
      <div
        class="mb-5 flex gap-3 rounded-2xl bg-gain-container p-3 text-[15px] leading-relaxed text-on-surface"
      >
        <app-icon name="shield" [size]="22" class="shrink-0 text-gain" />
        <div>
          <p class="font-semibold" i18n>Tradiqo can only look, it can't change anything</p>
          <p i18n>
            With this key, Tradiqo can see your portfolio, balance and history. It can't buy or sell
            anything, move money or change your pies.
          </p>
        </div>
      </div>

      <ol class="steps text-[15px] leading-relaxed">
        <li>
          <p class="step-title">
            <ng-container i18n
              >In the Trading 212 app, tap ☰ (bottom right), then <b>Settings</b>.</ng-container
            >
          </p>
          <img class="shot" [src]="shot('menu')" alt="" loading="lazy" width="480" height="326" />
        </li>
        <li>
          <p class="step-title">
            <ng-container i18n>Tap <b>API (Beta)</b>.</ng-container>
          </p>
          <img
            class="shot"
            [src]="shot('settings')"
            alt=""
            loading="lazy"
            width="480"
            height="312"
          />
        </li>
        <li>
          <p class="step-title">
            <ng-container i18n>Tap <b>Generate API key</b> at the bottom.</ng-container>
          </p>
          <img class="shot" [src]="shot('api')" alt="" loading="lazy" width="480" height="468" />
        </li>
        <li>
          <p class="step-title">
            <ng-container i18n
              >Type any name. Under IP access, choose <b>Restrict access to trusted IPs only</b> and
              enter this address:</ng-container
            >
          </p>
          @if (ip) {
            <div
              class="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-surface-container-high py-1.5 pr-1.5 pl-4"
            >
              <span class="font-mono text-base font-semibold">{{ ip }}</span>
              <button matButton="tonal" type="button" (click)="copyIp()">
                <app-icon matButtonIcon [name]="copied() ? 'check' : 'content_copy'" [size]="18" />
                @if (copied()) {
                  <ng-container i18n="The IP address was copied">Copied</ng-container>
                } @else {
                  <ng-container i18n>Copy</ng-container>
                }
              </button>
            </div>
          }
          <img class="shot" [src]="shot('ip')" alt="" loading="lazy" width="480" height="499" />
        </li>
        <li>
          <p class="step-title">
            <ng-container i18n
              >Under Permissions, set the switches like this. Trading 212 shows their names in
              English.</ng-container
            >
          </p>
          <ul class="divide-y divide-outline-variant rounded-2xl bg-surface-container px-4">
            @for (p of permissions; track p.label) {
              <li class="flex items-center justify-between gap-3 py-2.5">
                <div class="min-w-0">
                  <p class="font-medium">{{ p.label }}</p>
                  <p class="text-xs text-on-surface-variant">{{ p.why }}</p>
                </div>
                <span
                  class="app-pill shrink-0"
                  [class]="
                    p.on
                      ? 'bg-gain-container text-gain'
                      : 'bg-error-container text-on-error-container'
                  "
                >
                  @if (p.on) {
                    <ng-container i18n="A permission switch to turn on">On</ng-container>
                  } @else {
                    <ng-container i18n="A permission switch to leave off">Off</ng-container>
                  }
                </span>
              </li>
            }
          </ul>
          <p class="mt-3 flex gap-2 text-sm">
            <app-icon name="lock" [size]="18" class="shrink-0 text-on-surface-variant" />
            <ng-container i18n
              >Leave <b>Orders – Execute</b> and <b>Pies – Write</b> off. They are the only switches
              that would let someone trade or change your account.</ng-container
            >
          </p>
        </li>
        <li>
          <p class="step-title">
            <ng-container i18n
              >Tap <b>Generate key</b>, then copy the API key and the secret into Tradiqo. Copy the
              secret straight away: Trading 212 shows it only once.</ng-container
            >
          </p>
        </li>
      </ol>

      <h3 class="mt-6 mb-2 font-semibold" i18n>If it doesn't connect</h3>
      <ul class="list-disc space-y-1.5 pl-5 text-sm text-on-surface-variant">
        <li i18n>
          "Rejected the key": check that you copied the whole key and secret, and entered the IP
          address exactly as above.
        </li>
        <li i18n>
          "Missing permissions": a switch from step 5 was off. Generate a new key with it on.
        </li>
      </ul>

      <button sheetActions matButton="filled" type="button" (click)="close()">
        <ng-container i18n="Closes the Trading 212 key guide">Got it</ng-container>
      </button>
    </app-sheet>
  `,
})
export class T212Guide {
  private readonly sheetRef = inject(MatBottomSheetRef);
  protected readonly ip = inject<string | null>(MAT_BOTTOM_SHEET_DATA);
  protected readonly copied = signal(false);

  protected readonly labels = { title: $localize`How to get a Trading 212 key` };

  protected readonly permissions: readonly Permission[] = [
    { label: 'Account data', on: true, why: $localize`Your balance and account currency` },
    { label: 'History', on: true, why: $localize`Past trades, dividends and deposits` },
    { label: 'History – Dividends', on: true, why: $localize`Dividends you received` },
    { label: 'History – Orders', on: true, why: $localize`Your past trades` },
    { label: 'History – Transactions', on: true, why: $localize`Deposits and withdrawals` },
    { label: 'Metadata', on: true, why: $localize`Stock names and tickers` },
    { label: 'Orders – Execute', on: false, why: $localize`Would allow buying and selling` },
    { label: 'Orders – Read', on: false, why: $localize`Not needed` },
    { label: 'Pies – Read', on: true, why: $localize`Your pies, if you use them` },
    { label: 'Pies – Write', on: false, why: $localize`Would allow changing your pies` },
    { label: 'Portfolio', on: true, why: $localize`The stocks you own now` },
  ];

  protected shot(step: string): string {
    return `guide/t212/${step}-${LANGUAGE}.jpg`;
  }

  protected async copyIp(): Promise<void> {
    if (!this.ip) return;
    try {
      await navigator.clipboard.writeText(this.ip);
      this.copied.set(true);
    } catch {
      // Clipboard blocked: the address is still visible to type by hand.
    }
  }

  protected close(): void {
    this.sheetRef.dismiss();
  }
}

/** Opens the guide as a bottom sheet. */
export function openT212Guide(sheet: MatBottomSheet, ip: string | null): void {
  sheet.open(T212Guide, { data: ip, panelClass: 'app-sheet-panel' });
}
