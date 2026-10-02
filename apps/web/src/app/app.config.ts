import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAsisteGltCore } from '@asisteglt/web-core';
import { Environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideAsisteGltCore(
      Environment.API_BASE_URL,
      Environment.PRIMEUI_LICENSE_KEY.trim() === '' ? null : Environment.PRIMEUI_LICENSE_KEY.trim(),
    ),
  ],
};
