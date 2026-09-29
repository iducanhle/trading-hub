import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LocalUserDataGateway } from '../data/local-user-data.gateway';
import { UserDataGateway } from '../data/user-data.gateway';
import { normalizeSettings } from '../data/firestore-converters';
import { DEFAULT_SETTINGS } from '../models/user-data';
import { FollowsService } from './follows.service';
import { NotifierService } from './notifier.service';
import { RecentSearchesService } from './recent-searches.service';
import { SettingsService } from './settings.service';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('ThemeService', () => {
  beforeEach(() => localStorage.clear());

  it('applies the preference to <html> and remembers it', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setPreference('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    theme.setPreference('light');
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});

describe('FollowsService', () => {
  let follows: FollowsService;
  let gateway: LocalUserDataGateway;
  let undo: () => void;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: UserDataGateway, useClass: LocalUserDataGateway },
        {
          provide: NotifierService,
          useValue: {
            show: vi.fn(async () => ({ onAction: () => ({ subscribe: (fn: () => void) => (undo = fn) }) })),
          },
        },
      ],
    });
    follows = TestBed.inject(FollowsService);
    gateway = TestBed.inject(UserDataGateway) as LocalUserDataGateway;
    follows.start('u1');
  });

  it('follows and unfollows optimistically, with Undo', async () => {
    const target = { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', region: 'US' as const, logoUrl: null };
    const pending = follows.follow(target);
    expect(follows.isFollowed('MSFT')).toBe(true); // before the write completes
    await pending;
    expect(gateway.followedSymbols().has('MSFT')).toBe(true);

    await follows.unfollow('MSFT');
    expect(follows.isFollowed('MSFT')).toBe(false);
    expect(gateway.followedSymbols().has('MSFT')).toBe(false);

    undo();
    await tick();
    expect(follows.isFollowed('MSFT')).toBe(true);
  });

  it('lists follows newest first', async () => {
    await follows.follow({ symbol: 'ZZZ', name: 'Newest', exchange: 'NYSE', region: 'US', logoUrl: null });
    expect(follows.follows()[0].symbol).toBe('ZZZ');
  });
});

describe('SettingsService', () => {
  beforeEach(() => localStorage.clear());

  it('creates the user document with the contract defaults on first login', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: UserDataGateway, useClass: LocalUserDataGateway }] });
    const settings = TestBed.inject(SettingsService);
    const gateway = TestBed.inject(UserDataGateway);
    settings.start({
      uid: 'u1',
      email: 'a@example.com',
      displayName: 'A',
      photoUrl: null,
      emailVerified: true,
      providers: ['google.com'],
    });
    await tick();
    const { doc } = await firstValueFrom(gateway.watchUser('u1'));
    expect(doc?.email).toBe('a@example.com');
    expect(doc?.settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.loaded()).toBe(true);

    await settings.update({ notifyDaysBefore: 3 });
    expect(settings.settings().notifyDaysBefore).toBe(3);
    expect((await firstValueFrom(gateway.watchUser('u1'))).doc?.settings.notifyDaysBefore).toBe(3);
  });

  it('repairs invalid stored settings', () => {
    expect(normalizeSettings({ theme: 'neon', notifyDaysBefore: 12, notificationEmail: '' })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ theme: 'dark', notificationsEnabled: false, notifyDaysBefore: 7 })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      notificationsEnabled: false,
      notifyDaysBefore: 7,
    });
  });
});

describe('RecentSearchesService', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the last 10 distinct symbols, newest first', () => {
    const recent = TestBed.inject(RecentSearchesService);
    for (let i = 0; i < 12; i++) {
      recent.record({ symbol: `S${i}`, name: '', exchange: '', region: 'US', currency: 'USD', logoUrl: null });
    }
    recent.record({ symbol: 'S5', name: '', exchange: '', region: 'US', currency: 'USD', logoUrl: null });
    expect(recent.items().map((s) => s.symbol)).toEqual(['S5', 'S11', 'S10', 'S9', 'S8', 'S7', 'S6', 'S4', 'S3', 'S2']);
    recent.clear();
    expect(recent.items()).toEqual([]);
  });
});
