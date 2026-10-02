# 13 · Puesta en marcha

Estado: **fase de pruebas** — identidad, proyectos, chat, Reportes (importación, clasificaciones
e informes) e Inventarios (tomas con rondas) funcionando de punta a punta. Guía de pruebas:
[14-guia-de-pruebas.md](14-guia-de-pruebas.md).

## 1. Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 24 LTS (mínimo 22) |
| npm | 10 o superior |
| MongoDB 8 (replica set) | Solo para el modo persistente (`DATA_STORE=mongo`); `docker/docker-compose.yml` lo levanta |
| Navegador | Chromium/Chrome; para las pruebas e2e, Playwright |

## 2. Arranque rápido de demostración (sin base de datos)

```bash
npm install
npm run start:demo        # API en memoria con datos de demostración + web en http://localhost:4200
```

`start:demo` usa `DATA_STORE=memory` y `DEMO_SEED=true`: al arrancar crea usuarios, un proyecto
de Reportes con dos meses cargados, una clasificación y un informe, y un proyecto de Inventarios
con una toma en curso. **Todo es ficticio** y se pierde al detener la API.

| Usuario | Papel en los proyectos de demostración |
|---|---|
| `admin@demo.asisteglt.local` | Propietario de ambos proyectos (configura, supervisa) |
| `analista@demo.asisteglt.local` | Analista en «Demo · Balance ficticio» |
| `contador1@demo.asisteglt.local` | Contador en «Demo · Bodega ficticia» |
| `contador2@demo.asisteglt.local` | Contador en «Demo · Bodega ficticia» |

Contraseña de todos: `DemoAsiste2026`.

## 3. Arranque persistente (MongoDB)

```bash
cp .env.example .env            # Nx carga .env en cada tarea; cambia JWT_SECRET
npm run services:up             # MongoDB (replica set rs0), Redis y Mailpit (Docker)
npm run start:api               # API en http://localhost:3000/api/v1
npm run start:web               # Web en http://localhost:4200 (proxy /api y WebSocket → :3000)
```

- `STORAGE_DIR` (por defecto `var/storage`, fuera del repositorio) guarda los archivos cargados.
  Son datos del cliente: no se versionan y conviene respaldarlos junto con la base.
- `IMPORT_REJECT_THRESHOLD_PERCENT` (20 por defecto): por encima de ese porcentaje de líneas
  rechazadas, una carga queda «Con errores» y no se publica.
- Para el **servidor local sin internet** basta un equipo con Node.js y MongoDB: la cola de
  importación y la presencia del chat funcionan en proceso (no requieren Redis). Con varias
  instancias de API se reemplazan por BullMQ/Redis sin cambiar el dominio.

Comprobación: `curl http://localhost:3000/api/v1/health` → `{"status":"UP",...}`.

### 3.1 Servidor local para tomas de inventario (Wi-Fi sin internet)

Una laptop hace de servidor y los celulares de los contadores se conectan a la misma red Wi-Fi:

```bash
npm run start:demo:lan     # demostración en memoria, accesible desde la red (0.0.0.0:4200)
# o, con datos persistentes:
npm run start:api          # API (MongoDB local)
npx nx serve web --host 0.0.0.0 --allowed-hosts
```

- El supervisor abre la toma y usa el botón **«Abrir en otro dispositivo»** (código QR). Si la
  dirección dice `localhost`, cámbiala por la IP de la laptop en la red (p. ej.
  `http://192.168.1.20:4200/…`); el diálogo lo advierte.
- **Cortes de Wi-Fi:** si el servidor no responde, cada conteo queda guardado en el navegador del
  celular («Pendiente de envío») y se reenvía solo al volver la red (cada 15 s y al recuperar la
  conexión). El último conteo de cada ítem es el que vale, así que reenviar no duplica resultados.
- **PWA:** la compilación de producción incluye *service worker* y manifiesto, así que la
  aplicación se puede instalar y abrir sin conexión. Los navegadores solo lo permiten en HTTPS (o
  `localhost`); en la red local hace falta un certificado de una CA local, previsto en el paquete de
  despliegue (F8). La cola de conteos funciona también sin HTTPS. El *service worker* nunca guarda
  respuestas de la API: los datos del cliente no quedan en caché.

## 4. Comandos

| Comando | Qué hace |
|---|---|
| `npm run verify` | lint + guardián de reglas + typecheck + pruebas + build (lo que exige el CI) |
| `npm run e2e` | Playwright en escritorio y móvil; levanta API en memoria y web automáticamente |
| `npm run lint:guard` | Demuestra que cada regla normativa detecta su violación |
| `npm run start:demo` | Demostración en memoria con datos ficticios |
| `MONGO_SMOKE_URI=mongodb://… npx nx run api:test` | Además ejecuta la prueba de humo de persistencia contra un MongoDB real |

Con un Chromium ya instalado: `CHROMIUM_PATH=/ruta/a/chromium npm run e2e`.

## 5. Estructura

```text
apps/
  web/                      Angular 22 + PrimeNG 22 (zoneless, signals, SCSS)
    app.routes.ts           Contextos con su propio router-outlet, todos diferidos (lazy):
                              /auth  → AuthLayout (login, registro)       [guestGuard]
                              /app   → AppLayout (shell)                  [authGuard]
                                /app/projects/:id → ProjectLayout (pestañas del proyecto)
                                /app/chat         → ChatLayout (lista + conversación)
    features/               auth, home, account, projects, chat, reports, inventory
  web-e2e/                  Playwright (auth, proyectos, chat, reportes, inventarios)
  api/src/app/contexts/     Monolito modular hexagonal: iam, projects, chat, reports, inventory
                            (domain / application / infrastructure{memory,mongo} / presentation)
  worker/                   Proceso para colas BullMQ (reservado para varias instancias)
libs/
  shared/kernel/            Nullable, Optional, Result, DomainError, Decimal, Clock, JsonReader/FieldReader…
  shared/contracts/         Contratos de solo tipo compartidos front/back
  shared/ingestion-core/    Lectura de ancho fijo: decodificación, divisorias, sugerencia, reglas,
                            máscaras, conversión de valores, atributos derivados (navegador y API)
  api/platform/             EnvironmentReader, JsonLogger, CorrelationContext
  web/core/                 ApiClient, AuthSession, RealtimeClient (Socket.IO), Notifier, tema, i18n
tools/                      Plugin ESLint propio y guardián de reglas
```

## 6. Reglas del cliente convertidas en verificaciones

Sin `any` (ni `$any()`), sin `undefined`, sin `?:`/parámetros opcionales/`?.`, sin `as` ni `!`
(salvo DTO/esquemas), tipos de retorno y modificadores explícitos, solo controles PrimeNG en
plantillas y SCSS sin colores fijos. `npm run lint:guard` prueba que cada regla falla ante su
violación. Dinero y cantidades: `Decimal` en dominio y cadenas decimales en el transporte.

## 7. Licencia de PrimeNG

PrimeNG 22 usa la **licencia PrimeUI** (Community gratuita para organizaciones pequeñas;
Commercial para el resto). Sin clave aparece el aviso «Invalid PrimeUI License»; la aplicación
funciona igual. La clave va en `apps/web/src/environments/environment.ts` → `PRIMEUI_LICENSE_KEY`
(verificación local, sin internet). **Pendiente de decisión del cliente.**

- El aviso aparece desde **PrimeNG 22** (incluye el verificador `@primeui/license-manager`);
  este proyecto siempre usó 22.1.2, así que no es un cambio reciente del código.
- PrimeNG 21 no trae el verificador, pero exige Angular 21 (habría que bajar Angular, Nx y el tema)
  y su paquete se publica con la misma licencia PrimeUI; las versiones MIT son las 17.x (Angular
  17/18). Bajar de versión no resuelve la licencia, solo oculta el aviso, por lo que **no se
  recomienda**.
- Si la organización es elegible (menos de USD 1 M de ingresos anuales, menos de 5
  desarrolladores, menos de 10 empleados y menos de USD 3 M de financiación externa), la licencia
  **Community es gratuita**: se solicita en https://primeui.dev/licenses/community, se pega la clave
  en `PRIMEUI_LICENSE_KEY` y el aviso desaparece (también en la vista de impresión y los PDF).

## 8. Confidencialidad

Los archivos de muestra del asistente se leen en el navegador y nunca se envían al servidor;
la preconfiguración guarda solo la configuración. Los archivos cargados se guardan en
`STORAGE_DIR` del servidor. Ningún dato real del cliente está en el repositorio: pruebas y
demostración usan datos ficticios.
