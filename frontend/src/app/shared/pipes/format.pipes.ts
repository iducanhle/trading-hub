import { Pipe, PipeTransform } from '@angular/core';
import { ReportTime } from '../../core/models/contract';
import { DateStyle, formatDate, formatDateTime, relativeDay, timeAgo } from '../utils/dates';
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSignedMoney,
  formatSignedNumber,
  reportTimeLabel,
} from '../utils/format';

/** `{{ 187.44 | price: 'USD' }}` → `$187.44` */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  transform(value: number | null | undefined, currency?: string | null): string {
    return formatPrice(value, currency);
  }
}

/** `{{ 8.4e9 | compact: 'USD' }}` → `$8.4B` */
@Pipe({ name: 'compact' })
export class CompactPipe implements PipeTransform {
  transform(value: number | null | undefined, currency?: string | null): string {
    return formatCompact(value, currency);
  }
}

/** `{{ 3.2 | pct }}` → `+3.20%` */
@Pipe({ name: 'pct' })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 2): string {
    return formatPercent(value, digits);
  }
}

/** `{{ 2.31 | signed }}` → `+2.31` */
@Pipe({ name: 'signed' })
export class SignedNumberPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatSignedNumber(value);
  }
}

/** `{{ 123.4 | money: 'EUR' }}` → `+€123.40` (always signed, for profit and loss) */
@Pipe({ name: 'money' })
export class SignedMoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, currency?: string | null): string {
    return formatSignedMoney(value, currency);
  }
}

/** `{{ 0.5 | qty }}` → `0.5` */
@Pipe({ name: 'qty' })
export class QuantityPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatQuantity(value);
  }
}

/** `{{ 28.4 | num: 1 }}` → `28.4` */
@Pipe({ name: 'num' })
export class NumberPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 2): string {
    return formatNumber(value, digits);
  }
}

/** `{{ 'BMO' | reportTime }}` → `Before open` */
@Pipe({ name: 'reportTime' })
export class ReportTimePipe implements PipeTransform {
  transform(value: ReportTime | null | undefined): string {
    return reportTimeLabel(value);
  }
}

/** `{{ '2026-09-25' | appDate: 'day' }}` → `Fri 25 Sep` */
@Pipe({ name: 'appDate' })
export class AppDatePipe implements PipeTransform {
  transform(value: string | null | undefined, style: DateStyle = 'medium'): string {
    return formatDate(value, style);
  }
}

/** `{{ '2026-10-02' | relativeDay }}` → `In 2 days` */
@Pipe({ name: 'relativeDay' })
export class RelativeDayPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? relativeDay(value) : '—';
  }
}

/** `{{ publishedAt | timeAgo }}` → `3h ago` */
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? timeAgo(value) : '—';
  }
}

/** `{{ asOf | dateTime }}` → `25 Sep, 14:05` */
@Pipe({ name: 'dateTime' })
export class DateTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? formatDateTime(value) : '—';
  }
}
