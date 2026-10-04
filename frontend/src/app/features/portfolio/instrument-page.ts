import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { isApiError } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { Icon } from '../../shared/icon/icon';
import {
  AppDatePipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import {
  DEFAULT_VIEW,
  InstrumentFilters,
  TimelineItem,
  TimelineView,
  applyView,
  buildTimeline,
} from './instrument-filters';
import { PositionHeader, PositionSummary } from './position-summary';
import { TimelineList } from './timeline-list';
import { dayIn, displayTicker } from './portfolio-model';

export interface InstrumentDialogData {
  t212Ticker: string;
}

/**
 * `/portfolio/:t212Ticker`: one instrument over all time: position, average cost, profit/loss, and every trade and
 * dividend with the number of shares held after it. Links to the stock page when the symbol is known.
 * Also opens as a dialog (from the stock page) with `InstrumentDialogData`; then it has a close button instead of
 * the page header and no link back to the stock page.
 */
@Component({
  selector: 'app-instrument-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MatButton,
    MatIconButton,
    EmptyState,
    ErrorState,
    PageHeader,
    Skeleton,
    StaleChip,
    TermInfo,
    Icon,
    InstrumentFilters,
    TimelineList,
    PositionHeader,
    PositionSummary,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
  ],
  template: `
    @if (dialogRef) {
      <div class="px-4 pt-4">
        @if (data.hasValue()) {
          <app-position-header [instrument]="data.value().instrument">
            <button
              matIconButton
              type="button"
              aria-label="Close"
              i18n-aria-label
              (click)="close()"
            >
              <app-icon name="close" />
            </button>
          </app-position-header>
        } @else {
          <div class="flex items-center gap-3">
            <h2 class="min-w-0 flex-1 truncate text-lg font-bold">{{ title() }}</h2>
            <button
              matIconButton
              type="button"
              aria-label="Close"
              i18n-aria-label
              (click)="close()"
            >
              <app-icon name="close" />
            </button>
          </div>
        }
      </div>
    } @else {
      <app-page-header
        [title]="title()"
        [back]="true"
        backFallback="/portfolio"
        maxWidth="max-w-3xl"
      />
    }
    <div
      class="w-full px-4 pt-3"
      [class]="dialogRef ? 'max-h-[80dvh] overflow-y-auto pb-6' : 'mx-auto max-w-3xl pb-10'"
    >
      @if (data.error() && !data.hasValue()) {
        @if (notFound()) {
          <app-empty-state
            icon="search_off"
            title="Not in your portfolio"
            i18n-title
            text="You have no trades, dividends or position in this instrument."
            i18n-text
          />
        } @else {
          <app-error-state [error]="data.error()" (retry)="data.reload()" />
        }
      } @else if (!data.hasValue()) {
        <div class="space-y-3" aria-hidden="true">
          <app-skeleton shape="card" class="h-24" />
          <app-skeleton shape="card" class="h-40" />
          <app-skeleton shape="card" class="h-56" />
        </div>
      } @else {
        @let d = data.value();
        @let i = d.instrument;
        @if (d.stale) {
          <div class="mb-3"><app-stale-chip [asOf]="d.asOf" /></div>
        }
        @if (!dialogRef) {
          <app-position-header class="mb-4" [instrument]="i" [named]="false" />
        }
        <app-position-summary [instrument]="i" [currency]="d.accountCurrency">
          <div>
            <dt class="app-label flex items-center gap-1 text-[11px]">
              <ng-container i18n>FX fees</ng-container><app-term-info term="fxFees" />
            </dt>
            <dd class="tabular-nums" [class]="tone(-fxFees())">
              {{ -fxFees() | money: d.accountCurrency }}
            </dd>
          </div>
          <div>
            <dt class="app-label text-[11px]" i18n>Bought</dt>
            <dd class="tabular-nums">{{ i.bought.value | price: d.accountCurrency }}</dd>
          </div>
          <div>
            <dt class="app-label text-[11px]" i18n>Sold</dt>
            <dd class="tabular-nums">{{ i.sold.value | price: d.accountCurrency }}</dd>
          </div>
          <div>
            <dt class="app-label text-[11px]" i18n>First trade</dt>
            <dd>{{ day(i.firstTradeAt) | appDate }}</dd>
          </div>
          <div>
            <dt class="app-label text-[11px]" i18n>Last trade</dt>
            <dd>{{ day(i.lastTradeAt) | appDate }}</dd>
          </div>
        </app-position-summary>
        @if (i.symbol && !dialogRef) {
          <a matButton="tonal" class="mt-3.5 w-full" [routerLink]="['/stock', i.symbol]">
            <app-icon matButtonIcon name="show_chart" [size]="20" />
            <ng-container i18n>Open stock detail</ng-container>
          </a>
        }

        <ng-template #heading>
          <h2 class="px-1 app-title-section" i18n>Trades and dividends</h2>
        </ng-template>
        @if (timeline().length > 0) {
          <app-instrument-filters
            class="mt-7 mb-3.5 block"
            [view]="view()"
            (viewChange)="view.set($event)"
          >
            <ng-container [ngTemplateOutlet]="heading" />
          </app-instrument-filters>
        } @else {
          <div class="mt-7 mb-3"><ng-container [ngTemplateOutlet]="heading" /></div>
        }
        @if (timeline().length === 0) {
          <p class="app-card text-sm text-on-surface-variant" i18n>
            No trades or dividends synced yet.
          </p>
        } @else if (visible().length === 0) {
          <p class="app-card text-sm text-on-surface-variant" i18n>
            No trades or dividends match the filter.
          </p>
        } @else {
          <app-timeline-list [items]="visible()" [currency]="d.accountCurrency" />
        }
      }
    </div>
  `,
})
export class InstrumentPage {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

  protected readonly dialogRef = inject(MatDialogRef, { optional: true });
  private readonly dialogData = inject<InstrumentDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });

  /** Route parameter (unset in the dialog, which gets the ticker from its data). */
  readonly t212Ticker = input<string>();
  private readonly tickerParam = computed(
    () => this.t212Ticker() ?? this.dialogData?.t212Ticker ?? '',
  );

  protected readonly view = signal<TimelineView>(DEFAULT_VIEW);
  protected readonly data = rxResource({
    params: () => ({ ticker: this.tickerParam(), version: this.t212.dataVersion() }),
    stream: ({ params }) => this.api.t212Instrument(params.ticker),
  });
  protected readonly notFound = computed(() => isApiError(this.data.error(), 'NOT_FOUND'));
  protected readonly ticker = computed(() =>
    this.data.hasValue()
      ? displayTicker(this.data.value().instrument)
      : displayTicker({ symbol: null, t212Ticker: this.tickerParam() }),
  );
  protected readonly title = computed(() =>
    this.data.hasValue() ? this.data.value().instrument.name : this.ticker(),
  );

  /**
   * Fees on all trades, taxes excluded. Trading 212 charges no commission, so in practice this is the currency
   * conversion fee (docs/DATA-SOURCES.md). Already included in Realized.
   */
  protected readonly fxFees = computed(() =>
    this.data.hasValue()
      ? Math.round(this.data.value().trades.reduce((sum, t) => sum + t.fees, 0) * 100) / 100
      : 0,
  );

  /** Trades and dividends together, newest first. */
  protected readonly timeline = computed<TimelineItem[]>(() => {
    if (!this.data.hasValue()) return [];
    const { trades, dividends } = this.data.value();
    return buildTimeline(trades, dividends);
  });

  /** The timeline after the side filter, in the chosen order. */
  protected readonly visible = computed(() => applyView(this.timeline(), this.view()));

  constructor() {
    void this.t212.load();
  }

  protected close(): void {
    this.dialogRef?.close();
  }

  protected day(iso: string | null): string | null {
    return iso ? dayIn(iso) : null;
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }
}
