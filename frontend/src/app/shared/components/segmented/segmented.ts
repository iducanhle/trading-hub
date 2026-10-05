import {
  Component,
  afterRenderEffect,
  ElementRef,
  booleanAttribute,
  computed,
  contentChildren,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';

/**
 * One option of an `app-segmented` group; its content is the label (text and/or an `app-icon`). Icon-only options
 * need an `aria-label`.
 */
@Component({
  selector: 'app-segment',
  template: `
    <button
      #button
      type="button"
      role="radio"
      class="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full text-center text-[13px] leading-tight transition-colors"
      [class]="
        (group.appearance() === 'chips' ? 'font-medium ' : 'font-bold ') +
        (group.stretch() ? 'px-2 py-1 ' : 'px-3 whitespace-nowrap ') +
        (selected() ? group.selectedClass() : 'text-on-surface-variant hover:text-on-surface')
      "
      [attr.aria-checked]="selected()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.title]="ariaLabel() || null"
      [tabIndex]="focusable() ? 0 : -1"
      (click)="group.select(value())"
    >
      <ng-content />
    </button>
  `,
  host: {
    class: 'block',
    '[class.flex-1]': 'group.stretch()',
    '[class.shrink-0]': '!group.stretch()',
  },
})
export class Segment {
  protected readonly group = inject(Segmented);
  /**
   * Not `required`: the group reads every option's value, and options rendered by `@for` get their inputs one after
   * another, so a sibling may not have its value yet (it reads as undefined until then).
   */
  readonly value = input<unknown>();
  readonly ariaLabel = input<string>('', { alias: 'aria-label' });

  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  protected readonly selected = computed(() => this.group.value() === this.value());
  /** Roving tabindex: the selected option, or the first one when none is selected. */
  protected readonly focusable = computed(
    () => this.selected() || (!this.group.hasSelection() && this.group.first() === this),
  );

  focus(): void {
    this.button().nativeElement.focus();
  }
}

/**
 * Single choice among a few options, as a radio group: arrow keys, Home and End move the choice, Tab leaves the group.
 *
 * - `appearance="track"` (default): segments in a pill track (the design's "Týden / Měsíc" control).
 *   `inset` = the group sits on a card or a sheet, so the track is one level lighter.
 * - `appearance="chips"`: no track, the chosen option is a filled pill (period selectors).
 * - `stretch`: the options share the full width equally; a label too long for its share wraps (Czech).
 */
@Component({
  selector: 'app-segmented',
  template: `<ng-content />`,
  host: {
    role: 'radiogroup',
    class: 'relative max-w-full overflow-x-auto no-scrollbar',
    '[class]': 'hostClass()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class Segmented<T = unknown> {
  readonly value = model.required<T>();
  readonly appearance = input<'track' | 'chips'>('track');
  readonly inset = input(false, { transform: booleanAttribute });
  readonly stretch = input(false, { transform: booleanAttribute });
  /** Options that don't fit flow onto another line instead of scrolling sideways (long period rows). */
  readonly wrap = input(false, { transform: booleanAttribute });

  private readonly segments = contentChildren(Segment, { descendants: true });
  readonly first = computed(() => this.segments()[0]);
  readonly hasSelection = computed(() => this.segments().some((s) => s.value() === this.value()));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // A row wider than the screen scrolls sideways; keep the chosen option in view (e.g. "All" at the end).
    afterRenderEffect(() => {
      this.value();
      const host = this.host.nativeElement;
      const chosen = host.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!chosen || host.scrollWidth <= host.clientWidth) return;
      const left = chosen.offsetLeft; // The host is positioned, so this is relative to it.
      if (left < host.scrollLeft) host.scrollLeft = left;
      else if (left + chosen.offsetWidth > host.scrollLeft + host.clientWidth)
        host.scrollLeft = left + chosen.offsetWidth - host.clientWidth;
    });
  }

  protected readonly hostClass = computed(() => {
    const layout = this.wrap() ? 'flex flex-wrap' : this.stretch() ? 'flex w-full' : 'inline-flex';
    if (this.appearance() === 'chips') return `${layout} gap-0.5`;
    const track = this.inset() ? 'bg-surface-container-high' : 'bg-surface-container';
    return `${layout} rounded-full p-[3px] ${track}`;
  });

  /** Classes of the chosen option. */
  readonly selectedClass = computed(() =>
    this.appearance() === 'track' && this.inset()
      ? 'bg-surface-container-highest text-on-surface'
      : 'bg-surface-container-high text-on-surface',
  );

  select(value: unknown): void {
    this.value.set(value as T);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const segments = this.segments();
    if (!segments.length) return;
    const current = Math.max(
      0,
      segments.findIndex((s) => s.value() === this.value()),
    );
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % segments.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + segments.length) % segments.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = segments.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.select(segments[next].value());
    segments[next].focus();
  }
}
