import { HttpInterceptorFn } from '@angular/common/http';
import { Provider } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { FirestoreUserDataGateway } from '../data/firestore-user-data.gateway';
import { UserDataGateway } from '../data/user-data.gateway';

// Production replacement for data-layer.ts: Firebase only, no mock code in the bundle.

export const dataLayerProviders: Provider[] = [
  { provide: AuthService, useClass: FirebaseAuthService },
  { provide: UserDataGateway, useClass: FirestoreUserDataGateway },
];

export const dataLayerInterceptors: HttpInterceptorFn[] = [];
