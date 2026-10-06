import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { T212Service } from '../services/t212.service';
import { launchRedirectGuard } from './launch-redirect.guard';

function setup(connected: boolean) {
  const status = signal<{ connected: boolean } | null>(null);
  const t212 = {
    load: vi.fn(async () => status.set({ connected })),
    connected: computed(() => status()?.connected === true),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: T212Service, useValue: t212 }],
  });
  return t212;
}

function run() {
  return TestBed.runInInjectionContext(() =>
    launchRedirectGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot),
  ) as Promise<boolean | UrlTree>;
}

describe('launchRedirectGuard', () => {
  it('opens the portfolio when Trading 212 is connected', async () => {
    setup(true);
    const result = await run();
    expect(result instanceof UrlTree && result.toString()).toBe('/portfolio');
  });

  it('stays on home when Trading 212 is not connected', async () => {
    setup(false);
    expect(await run()).toBe(true);
  });
});
