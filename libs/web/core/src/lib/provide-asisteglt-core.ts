import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { Nullable } from '@asisteglt/shared-kernel';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { authInterceptor } from './auth/auth-http.interceptor';
import { AuthSession } from './auth/auth-session';
import { ApiConfig } from './http/api-config';
import { PRIMENG_ES } from './i18n/primeng-es';
import { AsisteGltPreset, DARK_MODE_CLASS } from './theme/asisteglt-preset';

/**
 * Proveedores base del frontend: HTTP, configuración de API y PrimeNG (tema, español y licencia).
 * `primeUiLicenseKey` es la clave de licencia PrimeUI; con `null` PrimeNG muestra su aviso de licencia.
 */
export function provideAsisteGltCore(
  apiBaseUrl: string,
  primeUiLicenseKey: Nullable<string>,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAppInitializer((): Promise<void> => inject(AuthSession).restore()),
    { provide: ApiConfig, useValue: new ApiConfig(apiBaseUrl) },
    providePrimeNG({
      ...(primeUiLicenseKey === null ? {} : { license: primeUiLicenseKey }),
      ripple: true,
      translation: PRIMENG_ES,
      theme: { preset: AsisteGltPreset, options: { darkModeSelector: `.${DARK_MODE_CLASS}` } },
    }),
    MessageService,
    ConfirmationService,
  ]);
}
