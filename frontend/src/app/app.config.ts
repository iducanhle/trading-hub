import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { apiErrorInterceptor } from './core/interceptors/api-error.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { dataLayerInterceptors, dataLayerProviders } from './core/providers/data-layer';
import { AppTitleStrategy } from './core/services/app-title.strategy';
import { NavigationService } from './core/services/navigation.service';
import { ThemeService } from './core/services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    // Order matters: errors are mapped after the auth retry; the mock backend sits closest to the network.
    provideHttpClient(
      withFetch(),
      withInterceptors([apiErrorInterceptor, authInterceptor, ...dataLayerInterceptors]),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    ...dataLayerProviders,
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideAppInitializer(() => {
      inject(ThemeService);
      inject(NavigationService);
    }),
  ],
};
