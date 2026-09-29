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
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { FirebaseAuthService } from './core/auth/firebase-auth.service';
import { MockAuthService } from './core/auth/mock-auth.service';
import { FirestoreUserDataGateway } from './core/data/firestore-user-data.gateway';
import { LocalUserDataGateway } from './core/data/local-user-data.gateway';
import { UserDataGateway } from './core/data/user-data.gateway';
import { apiErrorInterceptor } from './core/interceptors/api-error.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { mockInterceptor } from './core/interceptors/mock.interceptor';
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
      withInterceptors([apiErrorInterceptor, authInterceptor, ...(environment.useMocks ? [mockInterceptor] : [])]),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: AuthService, useClass: environment.useMocks ? MockAuthService : FirebaseAuthService },
    { provide: UserDataGateway, useClass: environment.useMocks ? LocalUserDataGateway : FirestoreUserDataGateway },
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideAppInitializer(() => {
      inject(ThemeService);
      inject(NavigationService);
    }),
  ],
};
