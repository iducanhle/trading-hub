import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Icon } from '../../shared/icon/icon';

/** `/`: the welcome page, a list of the app's sections. */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, Icon, PageHeader],
  template: `
    <app-page-header title="Tradiqo" maxWidth="max-w-3xl" />
    <ul class="mx-auto max-w-3xl space-y-2 px-3 pt-2 pb-10">
      <li>
        <a routerLink="/followed" class="app-card flex h-16 items-center gap-4 px-5 font-semibold">
          <app-icon name="star" class="text-primary" />
          <ng-container i18n>Followed</ng-container>
        </a>
      </li>
      <li>
        <a routerLink="/calendar" class="app-card flex h-16 items-center gap-4 px-5 font-semibold">
          <app-icon name="calendar_month" class="text-primary" />
          <ng-container i18n>Calendar</ng-container>
        </a>
      </li>
      <li>
        <a routerLink="/portfolio" class="app-card flex h-16 items-center gap-4 px-5 font-semibold">
          <app-icon name="account_balance_wallet" class="text-primary" />
          <ng-container i18n="Bottom navigation tab">Portfolio</ng-container>
        </a>
      </li>
      <li>
        <a routerLink="/settings" class="app-card flex h-16 items-center gap-4 px-5 font-semibold">
          <app-icon name="settings" class="text-primary" />
          <ng-container i18n>Settings</ng-container>
        </a>
      </li>
    </ul>
  `,
})
export class HomePage {}
