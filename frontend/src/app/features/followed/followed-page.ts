import { Component } from '@angular/core';
import { PageHeader } from '../../shared/components/page-header/page-header';

@Component({
  selector: 'app-followed-page',
  imports: [PageHeader],
  template: `
    <app-page-header title="Followed" />
    <p class="mx-auto max-w-2xl px-4 py-8 text-on-surface-variant">Coming in the next phase.</p>
  `,
})
export class FollowedPage {}
