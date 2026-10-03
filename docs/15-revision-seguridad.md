# 15 · Revisión de seguridad (OWASP ASVS 4.0, nivel 2)

Revisión de la fase F8a sobre el código de `main` + rama de endurecimiento. Cada hallazgo indica su
severidad, el estado y dónde se corrigió o por qué se acepta. Criterio de salida de la fase: **sin
hallazgos altos abiertos** ([10-plan-de-trabajo §F8](10-plan-de-trabajo.md)).

## 1. Hallazgos

| # | Capítulo ASVS | Hallazgo | Severidad | Estado |
|---|---|---|---|---|
| 1 | V2.2.1 Anti-automatización | El inicio de sesión solo tenía bloqueo **por cuenta**: desde una IP se podían probar contraseñas contra muchas cuentas (*password spraying*) sin límite. | Alta | Corregido: límite por IP en `login`, `register` y `refresh` (`RateLimitGuard`, `@RateLimited`); 429 con `Retry-After`. |
| 2 | V2.2.1 / V7.1 | Detrás de nginx la API veía la IP del proxy: el límite por IP y la IP de las sesiones no servían. | Media | Corregido: `TRUST_PROXY` (por defecto `none`; `1` en el paquete Docker). |
| 3 | V2.2.2 / V3 enumeración | Con un correo inexistente la respuesta no calculaba argon2 y se respondía en un tiempo claramente menor (enumeración de cuentas por tiempo). | Media | Corregido: se verifica contra un *hash* señuelo con el mismo costo. |
| 4 | V7.2.1 Registro de eventos | No había registro de eventos de seguridad. | Media | Corregido: `SecurityAuditLog` registra inicio de sesión correcto/fallido, bloqueo, intento con cuenta bloqueada, registro, cierre de sesión, reutilización de refresh token, límite superado y 403, en JSON con *correlation id*, sin contraseñas, tokens ni correos en claro (huella SHA-256). |
| 5 | V14.4.3 CSP | El servidor web no enviaba CSP y la compilación de producción incluía un `<script>` en línea (carga diferida de CSS crítico). | Media | Corregido: CSP sin scripts en línea en nginx (`security-headers.conf`) y `inlineCritical: false`; validada con las 30 pruebas e2e contra la compilación de producción y un colector de reportes CSP (0 violaciones). |
| 6 | V14.4 Cabeceras | Faltaban `Permissions-Policy` y `Cross-Origin-Opener-Policy`; nginx publicaba su versión; un `location` con `add_header` perdía las cabeceras heredadas. | Baja | Corregido: cabeceras en un fragmento incluido en cada `location`, `server_tokens off`. |
| 7 | V14.2.1 Dependencias | `npm audit --omit=dev`: `@angular/router` < 22.2 (alta, DoS solo con SSR, que no se usa) y `uuid` < 11.1.1 vía `exceljs` (moderada, solo afecta `v3/v5/v6` con *buffer*, no usados). | Alta / Moderada | Corregido: Angular 22.2.1 y `overrides` de `uuid` 11.1.1 para `exceljs`. `npm audit --omit=dev`: 0 vulnerabilidades. |
| 8 | V2.1 / V3 enumeración | `POST /auth/register` responde 409 si el correo existe. | Baja | Aceptado: inherente al registro abierto; mitigado por el límite por IP (#1). |
| 9 | V11.1.4 | El almacén del límite es en memoria: con varias instancias de API cada una lleva su conteo. | Baja | Aceptado para el despliegue de una instancia; `RateLimitStore` es un puerto para pasar a Redis. |

Durante la validación de la CSP apareció además un defecto funcional solo de producción: el código
QR de acceso no se generaba porque `qrcode` (CommonJS) llega como `default` en la compilación
optimizada. Corregido en `AccessQr.library`.

## 2. Diferencias con el diseño de [09-seguridad](09-seguridad-permisos.md)

Controles de la tabla de diseño que se implementaron de otra forma o siguen pendientes. Ninguno es
un hallazgo alto: la columna «Riesgo» resume por qué.

| Control de diseño | Implementación actual | Riesgo |
|---|---|---|
| JWT EdDSA con `kid` | HS256 con secreto ≥ 32 caracteres validado al arrancar; un solo servicio firma y verifica. | Bajo. Pasar a EdDSA si otro servicio debe verificar tokens. |
| argon2id 64 MiB / 3 iteraciones | argon2id 19 MiB / 2 iteraciones (mínimo recomendado por OWASP). | Bajo; subir el costo según el hardware del servidor. |
| Contraseñas filtradas (k-anonimato) e historial de 5 | No implementado: el servidor local funciona sin internet. | Medio-bajo: hay longitud mínima de 12, bloqueo por cuenta y límite por IP. |
| 2FA TOTP | No implementado. | Medio-bajo; candidato para una fase posterior. |
| `X-CSRF-Token` en refresh/logout | Cookie `HttpOnly; SameSite=Strict`, CORS con lista blanca y cuerpo JSON. | Bajo: `SameSite=Strict` impide el envío de la cookie desde otros sitios. |
| `@nestjs/throttler` + Redis | `RateLimitGuard` propio con almacén en memoria (#9). | Bajo. |
| Colección `audit_logs` | Eventos de seguridad en el log JSON (contexto `SecurityAudit`). | Bajo; la retención la da el recolector de logs. |
| Sanitización de operadores `$` | Los DTO validan tipos (`whitelist`, `forbidNonWhitelisted`); los repositorios construyen los filtros con valores ya tipados, nunca con objetos del cliente. | Bajo. |

## 3. Verificaciones realizadas

- Pruebas: límite por IP (unitarias de `RateLimiter` y e2e con 429 + `Retry-After`), auditoría de
  bloqueo y de cuenta inexistente sin correo en claro, 403 en cada endpoint (definición de
  terminado), rotación y reutilización del refresh token.
- CSP: suite e2e completa (escritorio y móvil) contra `dist/apps/web/browser` servida con la
  política de nginx y `report-uri`; se comprobó que el colector sí recibe reportes con una política
  más estricta.
- `npm audit --omit=dev` sin vulnerabilidades.
