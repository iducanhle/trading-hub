import { HttpInterceptorFn } from '@angular/common/http';
import { Provider } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { MockAuthService } from '../auth/mock-auth.service';
import { FirestoreUserDataGateway } from '../data/firestore-user-data.gateway';
import { LocalUserDataGateway } from '../data/local-user-data.gateway';
import { UserDataGateway } from '../data/user-data.gateway';
import { mockInterceptor } from '../interceptors/mock.interceptor';

// Development builds: Firebase, or mock mode when environment.useMocks is on.
// Production builds use data-layer.prod.ts instead (angular.json fileReplacements), so no mock code ships.

export const dataLayerProviders: Provider[] = [
  { provide: AuthService, useClass: environment.useMocks ? MockAuthService : FirebaseAuthService },
  { provide: UserDataGateway, useClass: environment.useMocks ? LocalUserDataGateway : FirestoreUserDataGateway },
];

/** Runs closest to the network, after the auth interceptor. */
export const dataLayerInterceptors: HttpInterceptorFn[] = environment.useMocks ? [mockInterceptor] : [];
