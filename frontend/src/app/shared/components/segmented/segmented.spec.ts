import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Segment, Segmented } from './segmented';

@Component({
  imports: [Segmented, Segment],
  template: `
    <app-segmented aria-label="View" [(value)]="view">
      <app-segment value="week">Week</app-segment>
      <app-segment value="month">Month</app-segment>
      <app-segment value="year">Year</app-segment>
    </app-segmented>
  `,
})
class Host {
  readonly view = signal('month');
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const radios = () =>
    [...fixture.nativeElement.querySelectorAll('[role="radio"]')] as HTMLElement[];
  return { fixture, radios };
}

@Component({
  imports: [Segmented, Segment],
  template: `
    <app-segmented aria-label="Range" appearance="chips" [(value)]="range">
      @for (r of ranges; track r) {
        <app-segment [value]="r">{{ r }}</app-segment>
      }
    </app-segmented>
  `,
})
class LoopHost {
  readonly ranges = ['1M', '3M', '1Y'];
  readonly range = signal('3M');
}

describe('Segmented', () => {
  it('renders options created by @for', async () => {
    const fixture = TestBed.createComponent(LoopHost);
    await fixture.whenStable();
    const radios = [...fixture.nativeElement.querySelectorAll('[role="radio"]')] as HTMLElement[];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('is a radio group with the bound value checked and the only tab stop', async () => {
    const { fixture, radios } = await setup();
    expect(fixture.nativeElement.querySelector('app-segmented').getAttribute('role')).toBe(
      'radiogroup',
    );
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('selects on click', async () => {
    const { fixture, radios } = await setup();
    radios()[0].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.view()).toBe('week');
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
  });

  it('moves the choice with the arrow keys, wrapping around, and Home/End', async () => {
    const { fixture, radios } = await setup();
    const key = async (k: string) => {
      radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      await fixture.whenStable();
      return fixture.componentInstance.view();
    };
    expect(await key('ArrowRight')).toBe('year');
    expect(await key('ArrowRight')).toBe('week');
    expect(await key('ArrowLeft')).toBe('year');
    expect(await key('Home')).toBe('week');
    expect(await key('End')).toBe('year');
    expect(document.activeElement).toBe(radios()[2]);
  });
});
