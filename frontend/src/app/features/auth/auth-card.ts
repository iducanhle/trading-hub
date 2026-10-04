import { Component, input } from '@angular/core';

/** Centered, phone-first frame shared by the sign-in pages: app mark, title, subtitle, content. */
@Component({
  selector: 'app-auth-card',
  template: `
    <main class="flex min-h-dvh flex-col items-center justify-center px-4 pt-safe pb-safe">
      <section class="w-full max-w-sm py-8">
        <div class="mb-8 flex flex-col items-center text-center">
          <img src="icons/icon.svg" alt="" width="56" height="56" class="mb-4 rounded-2xl" />
          <h1 class="app-title-modal">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="mt-1 text-sm text-on-surface-variant">{{ subtitle() }}</p>
          }
        </div>
        <ng-content />
      </section>
    </main>
  `,
})
export class AuthCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
