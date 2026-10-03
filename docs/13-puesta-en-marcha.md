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
- `AUTH_RATE_LIMIT_PER_MINUTE` (10 por defecto): intentos de inicio de sesión por IP y minuto; al
  superarlos la API responde 429 con `Retry-After`. El registro admite los mismos por 10 minutos.
- `TRUST_PROXY` (`none` por defecto): detrás de nginx u otro proxy indica cuántos saltos son de
  confianza (`loopback`, `1`, `2`) para que el límite y la auditoría usen la IP real del cliente.
  Nunca lo actives si la API está expuesta directamente: el cliente podría falsear la IP.
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

### 3.2 Paquete de servidor local con HTTPS (Docker)

En `docker/local-server/` está el paquete para una laptop servidor: MongoDB, la API y la web
(nginx) con **HTTPS de una CA local**, necesario para instalar la PWA en los celulares.

1. **Con internet** (una vez), construir y exportar las imágenes:
   ```bash
   docker compose -f docker/local-server/docker-compose.yml build
   docker pull mongo:8.0
   docker save asisteglt-api:local asisteglt-web:local mongo:8.0 -o asisteglt-local.tar
   ```
2. **En la laptop servidor** (sin internet):
   ```bash
   docker load -i asisteglt-local.tar
   docker/local-server/generate-certs.sh 192.168.1.20     # IP de la laptop en el Wi-Fi
   cp docker/local-server/.env.example docker/local-server/.env   # cambia JWT_SECRET y la IP
   docker compose -f docker/local-server/docker-compose.yml up -d
   ```
3. En cada celular, instalar una vez `docker/local-server/certs/ca.crt` como certificado de
   confianza y abrir `https://192.168.1.20` (o el QR de la toma).

- Los certificados y `.env` no se versionan. La CA (`ca.key`) solo se usa en la laptop: si cambia
  la IP, vuelve a ejecutar el script (la CA se reutiliza y no hay que reinstalarla).
- Los datos (MongoDB y archivos cargados) quedan en volúmenes de Docker de la laptop.
- **Llevar los resultados al servidor central:** en la toma, «Exportar paquete» descarga un
  archivo `.toma.json`; en el servidor central, Tomas → «Importar paquete» crea una toma cerrada
  con los mismos ítems, cantidades, novedades y comentarios (quién contó queda en el comentario).
- Se verificó la configuración de Compose, el script de certificados (la CA valida el certificado
  con la IP) y que la API compilada arranca con solo las dependencias de producción; la
  construcción de las imágenes no se pudo probar en este entorno (sin servicio de Docker).

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

## 9. Observabilidad

| Endpoint | Uso |
|---|---|
| `GET /api/v1/health` | Vida: el proceso responde (versión, entorno, tiempo activo). |
| `GET /api/v1/health/ready` | Preparación: 200 si MongoDB responde a `ping` y el directorio de archivos admite escritura; 503 con el detalle de cada dependencia si no. Lo usa el *healthcheck* del paquete Docker. |
| `GET /api/v1/metrics` | Métricas Prometheus. Requiere `Authorization: Bearer <METRICS_TOKEN>` (mínimo 24 caracteres); sin token configurado o con uno incorrecto responde 404. |

**Logs.** Una línea JSON por evento con `timestamp`, `level`, `context`, `correlationId` y `message`.
El identificador de correlación se toma de `X-Correlation-Id`, de `X-Request-Id` (nginx lo agrega
con `$request_id` y lo escribe también en su log de acceso JSON) o del *trace-id* de `traceparent`,
y se devuelve en ambas cabeceras y en cada respuesta de error. Contextos útiles para filtrar:
`HttpAccess` (método, ruta-plantilla, estado y duración de cada petición), `SecurityAudit`
(eventos de [15-revision-seguridad](15-revision-seguridad.md)) e `ImportProcessor`.

**Métricas principales.**

| Métrica | Tipo | Etiquetas |
|---|---|---|
| `asisteglt_http_requests_total` | contador | `method`, `route` (plantilla, p. ej. `/api/v1/projects/:id`), `status` |
| `asisteglt_http_request_duration_seconds` | histograma | `method`, `route` |
| `asisteglt_realtime_connections` | indicador | — |
| `asisteglt_realtime_events_total` / `asisteglt_realtime_rejected_handshakes_total` | contador | `event` / — |
| `asisteglt_imports_total`, `asisteglt_import_duration_seconds` | contador / histograma | `outcome` (`PUBLISHED`, `FAILED`) |
| `asisteglt_import_lines_total` | contador | `kind` (`data`, `rejected`) |
| `asisteglt_process_resident_memory_bytes`, `asisteglt_process_heap_used_bytes`, `asisteglt_event_loop_delay_p99_seconds`, `asisteglt_process_uptime_seconds` | indicador | — |
| `asisteglt_build_info` | indicador (1) | `version`, `environment` |

Ninguna etiqueta lleva ids, correos ni datos importados. Configuración de Prometheus:

```yaml
scrape_configs:
  - job_name: asisteglt-api
    metrics_path: /api/v1/metrics
    authorization: { credentials_file: /etc/prometheus/asisteglt-token }
    static_configs: [{ targets: ['api:3000'] }]
```

Alertas sugeridas: tasa de `status=~"5.."` > 1 % en 5 min; p95 de
`asisteglt_http_request_duration_seconds` > 1 s; `asisteglt_imports_total{outcome="FAILED"}` en
aumento; `asisteglt_event_loop_delay_p99_seconds` > 0.2; `/health/ready` en 503 más de 1 min.
