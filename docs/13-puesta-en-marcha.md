# 13 · Puesta en marcha (Fase 0 · Fundaciones)

## 1. Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 24 LTS (mínimo 22) |
| npm | 10 o superior |
| Docker + Docker Compose | Para MongoDB, Redis y Mailpit en desarrollo |
| Navegador | Chromium/Chrome para las pruebas e2e |

## 2. Primer arranque

```bash
npm install                     # usa .npmrc (legacy-peer-deps)
cp .env.example .env            # Nx carga .env automáticamente en cada tarea
npm run services:up             # MongoDB (replica set rs0), Redis y Mailpit
npm run start:api               # API en http://localhost:3000/api/v1
npm run start:web               # Web en http://localhost:4200 (proxy /api → :3000)
npm run start:worker            # Worker de colas (opcional en esta fase)
```

Comprobación rápida: `curl http://localhost:3000/api/v1/health` devuelve
`{"service":"api","status":"UP",...}` y la página de inicio muestra **Estado: Operativo**.

> En la Fase 0 la API y el worker **validan** `MONGODB_URI` y `REDIS_URL` pero todavía no se
> conectan; la conexión llega en F1 (identidad) y F4 (colas).

## 3. Comandos

| Comando | Qué hace |
|---|---|
| `npm run lint` | ESLint (TypeScript y plantillas) + stylelint (SCSS) + guardián de reglas |
| `npm run lint:guard` | Demuestra que cada regla normativa detecta su violación (ver §5) |
| `npm run typecheck` | `tsc --noEmit` de todos los proyectos |
| `npm run test` | Pruebas unitarias e integración (Vitest) |
| `npm run build` | Compila web, api y worker en `dist/` |
| `npm run e2e` | Pruebas e2e de la web con Playwright (escritorio y móvil) |
| `npm run verify` | Todo lo anterior salvo e2e (lo mismo que exige el CI) |
| `npx nx graph` | Grafo de proyectos y dependencias |

Con un Chromium ya instalado: `CHROMIUM_PATH=/ruta/a/chromium npm run e2e`.

## 4. Estructura

```text
apps/
  web/            Angular 22 + PrimeNG 22 (zoneless, signals, SCSS)
  web-e2e/        Playwright
  api/            NestJS 12: /api/v1/health, filtro de errores, logs JSON, correlation id
  worker/         NestJS 12 (contexto de aplicación) para colas BullMQ
libs/
  shared/kernel/     Nullable, Optional, Result, DomainError, Entity, AggregateRoot,
                     ValueObject, EntityId, DomainEvent, Decimal, Period, Clock,
                     ReadonlyDictionary, Collections
  shared/contracts/  Contratos de solo tipo compartidos front/back
  api/platform/      EnvironmentReader, JsonLogger, CorrelationContext
  web/core/          BaseStore, ApiClient + Decoder/JsonReader, tema, i18n, ThemeService
tools/
  eslint-plugin-asisteglt/   regla primeng-controls-only
  lint-guard/                fixtures con violaciones intencionales
docker/docker-compose.yml
```

Límites entre módulos (`@nx/enforce-module-boundaries`): `scope:shared` solo depende de
`scope:shared`; `scope:web` y `scope:api` solo de sí mismos y de `scope:shared`.

## 5. Reglas del cliente convertidas en verificaciones

| Regla | Verificación |
|---|---|
| Sin `any` | `no-explicit-any` + `no-unsafe-*` (también detecta el `any` que entregan librerías) |
| Sin `undefined` | `no-undefined`, `no-void`, prohibición de `?:`, parámetros opcionales, `?.`, tipo `undefined` |
| Todo tipado | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, tipos de retorno y accesibilidad explícitos, sin `as` ni `!` |
| POO | Clases para dominio, stores, clientes, decoders, configuración; dependencias inyectadas |
| Solo PrimeNG | `no-restricted-imports` (Material, CDK, Bootstrap…) + regla `primeng-controls-only` en plantillas |
| Solo SCSS con variables del tema | stylelint: sin colores hexadecimales, con nombre ni funciones de color |

`npm run lint:guard` lint-ea `tools/lint-guard/fixtures` (archivos con violaciones a propósito) y
falla si alguna regla deja de detectar su caso.

## 6. Licencia de PrimeNG

PrimeNG 22 se distribuye con la **licencia PrimeUI**: gratuita (*Community*) para
organizaciones con menos de 1 M USD de ingresos anuales, menos de 5 desarrolladores y menos de
10 empleados; *Commercial* (por desarrollador) para el resto. Sin clave válida, PrimeNG muestra
el aviso «Invalid PrimeUI License» en la esquina inferior derecha; la aplicación funciona igual.

Para registrar la clave: `apps/web/src/environments/environment.ts` →
`PRIMEUI_LICENSE_KEY`. La verificación es local, sin conexión a internet (compatible con el
modo servidor local).

## 7. Qué cubre la Fase 0

| Entregable (docs/10 F0) | Estado |
|---|---|
| Monorepo Nx con apps y librerías | ✔ |
| `tsconfig` y ESLint normativos + regla propia + guardián | ✔ |
| Kernel compartido con pruebas | ✔ |
| `docker-compose` (MongoDB rs, Redis, Mailpit) | ✔ (no probado en el entorno de desarrollo de esta sesión, sin Docker) |
| Configuración tipada validada al arrancar, logs JSON con correlation id, filtro de errores | ✔ |
| Shell Angular + PrimeNG (tema, modo oscuro, español, Toast/ConfirmDialog globales) | ✔ |
| CI (GitHub Actions) | ✔ |
