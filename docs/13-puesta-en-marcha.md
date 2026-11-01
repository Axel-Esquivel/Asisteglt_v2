# 13 · Puesta en marcha

Estado: **fase de pruebas** — identidad, proyectos, chat, Reportes (importación, clasificaciones
e informes) e Inventarios (tomas con rondas) funcionando de punta a punta. Guía de pruebas:
[14-guia-de-pruebas.md](14-guia-de-pruebas.md).

## 1. Requisitos

| Herramienta | Versión |
|---|---|
| Git | 2.40 o superior (en Windows, Git para Windows) |
| Node.js | 22 LTS (la misma de CI y de las imágenes Docker) |
| npm | 10 o superior |
| Docker | Docker Desktop (Windows/macOS) o Docker Engine con Compose v2; solo para el modo persistente (MongoDB 8 en replica set, Redis y Mailpit con `npm run services:up`) |
| Navegador | Chromium/Chrome; para las pruebas e2e, el Chromium de Playwright |

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

## 3. Desarrollo con MongoDB (configuración por variables de entorno)

La configuración de desarrollo está en **`.env.development`**, versionado en la raíz con
**valores de prueba** (secretos que dicen `solo-desarrollo`, base `asisteglt_dev`, archivos en
`var/storage-dev`, datos ficticios al arrancar). Nx lo carga solo en la configuración
`development`, así que no hay que copiar nada:

```bash
npm ci
npm run services:up      # MongoDB 8 (replica set rs0), Redis y Mailpit en Docker
npm run dev:check        # qué .env se cargan, valores en uso (secretos enmascarados), MongoDB y puertos
npm run start:dev        # API http://localhost:3000/api/v1 + web http://localhost:4200 (proxy /api y WebSocket)
```

La primera vez se crean los usuarios de demostración de la tabla de §2 (contraseña
`DemoAsiste2026`) con sus proyectos; al reiniciar no se duplican. `npm run start:api`,
`start:web` y `start:worker` arrancan cada aplicación por separado.

**Cambiar valores solo en tu equipo.** Crea `.env.development.local` (no se versiona) con las
líneas a reemplazar, por ejemplo `DATA_STORE=memory` para trabajar sin Docker o `LOG_LEVEL=info`.
Orden de prioridad (el primero que define una variable gana):

| Prioridad | Origen |
|---|---|
| 1 | Variables del sistema o de la terminal |
| 2 | `apps/api/.env.serve.development.local`, `apps/api/.env.serve.development`, `apps/api/.env.development(.local)`, … (por proyecto) |
| 3 | `.env.serve.development(.local)`, **`.env.development.local`**, **`.env.development`** (raíz) |
| 4 | `.env.serve`, `.env.local`, `.env` (raíz) |

Por eso un `.env` antiguo en la raíz ya no cambia nada que defina `.env.development`: pasa esos
valores a `.env.development.local` y borra o renombra el `.env` (`npm run dev:check` lo avisa).
Dos detalles de Nx: si una variable de la terminal tiene el mismo valor que en ese `.env` antiguo,
Nx la descarta; y una variable de la terminal **vacía** no anula el valor de los archivos. Los valores de prueba **no sirven en producción**: con
`NODE_ENV=production` la API no arranca si `JWT_SECRET` o `METRICS_TOKEN` son valores publicados
en el repositorio o si `DEMO_SEED=true`, y `backup.js` rechaza una `BACKUP_PASSPHRASE` de prueba
(ver `.env.example` y [18-manual-de-operacion](18-manual-de-operacion.md)). Las pruebas e2e usan
su propia configuración (`apps/api/.env.serve.e2e`) y no leen `.env.development`.

Otras variables: la referencia completa con comentarios está en `.env.example`.

- `STORAGE_DIR` guarda los archivos cargados (fuera del repositorio: `var/` no se versiona). En
  producción son datos del cliente y se respaldan junto con la base.
- `IMPORT_REJECT_THRESHOLD_PERCENT` (20 por defecto): por encima de ese porcentaje de líneas
  rechazadas, una carga queda «Con errores» y no se publica.
- `AUTH_RATE_LIMIT_PER_MINUTE` (10 por defecto, 30 en desarrollo): intentos de inicio de sesión
  por IP y minuto; al superarlos la API responde 429 con `Retry-After`. El registro admite los
  mismos por 10 minutos.
- `TRUST_PROXY` (`none` por defecto): detrás de nginx u otro proxy indica cuántos saltos son de
  confianza (`loopback`, `1`, `2`) para que el límite y la auditoría usen la IP real del cliente.
  Nunca lo actives si la API está expuesta directamente: el cliente podría falsear la IP.
- Para el **servidor local sin internet** basta un equipo con Node.js y MongoDB: la cola de
  importación y la presencia del chat funcionan en proceso (no requieren Redis). Con varias
  instancias de API se reemplazan por BullMQ/Redis sin cambiar el dominio.
- `backup.js` no pasa por Nx: con los valores de desarrollo,
  `node --env-file=.env.development dist/apps/api/backup.js crear var/respaldo-dev.agbk`
  (después de `npx nx build api`).

Comprobación: `curl http://localhost:3000/api/v1/health/ready` → `{"status":"UP",...}` (en Windows
`curl.exe …` o `Invoke-RestMethod http://localhost:3000/api/v1/health/ready`).

### 3.0 En Windows (PowerShell)

Con Git para Windows, Node.js 22 y Docker Desktop abiertos. En Windows PowerShell 5.1 (la de
Win+X) los comandos `npm`/`npx` están bloqueados por la directiva de ejecución hasta permitirlos
una vez para tu usuario (PowerShell 7 y cmd no lo necesitan):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # una sola vez por usuario
git clone https://github.com/Axel-Esquivel/Asisteglt_v2.git D:\Proyectos\GLT\AsisteGLTV2
cd D:\Proyectos\GLT\AsisteGLTV2
npm ci
npm run services:up
npm run dev:check
npm run start:dev
```

- `.gitattributes` fija finales de línea LF: los scripts `.sh` y las configuraciones de nginx
  funcionan aunque Git para Windows convierta a CRLF por defecto. Vale para clones nuevos; en un
  clon anterior a este cambio, con todo confirmado, rehaz la copia de trabajo una vez:
  `git rm --cached -r . ; git reset --hard`.
- Variables desde la terminal: PowerShell `$env:DATA_STORE='memory'; npm run start:api` o cmd
  `set "DATA_STORE=memory" && npm run start:api`. En ambos casos **quedan definidas en esa
  ventana** y ganan a los archivos hasta quitarlas (`Remove-Item Env:DATA_STORE` en PowerShell,
  `set DATA_STORE=` en cmd). Para algo permanente usa `.env.development.local`.
- `curl` en Windows PowerShell 5.1 es otro comando (`Invoke-WebRequest`): escribe `curl.exe`.
- Copiar archivos: PowerShell `Copy-Item origen destino` (cmd: `copy origen destino`).
- Los scripts `.sh` (certificados del servidor local) se ejecutan desde Git Bash o WSL:
  `bash docker/local-server/generate-certs.sh 192.168.1.20`.
- Si `npm run dev:check` dice que MongoDB no responde: abre Docker Desktop, espera a que
  `docker compose -f docker/docker-compose.yml ps` muestre `mongo` como *healthy* y repite.

### 3.1 Servidor local para tomas de inventario (Wi-Fi sin internet)

Una laptop hace de servidor y los celulares de los contadores se conectan a la misma red Wi-Fi:

```bash
npm run start:demo:lan     # demostración en memoria con datos ficticios, accesible desde la red (0.0.0.0:4200)
```

Para una toma **con datos reales** usa el paquete Docker de §3.2: corre en modo producción, exige
secretos propios y sirve HTTPS. No expongas en la red la configuración de desarrollo
(`npm run start:api` / `start:dev`): `.env.development` usa un `JWT_SECRET` publicado en el
repositorio y crea usuarios de demostración, así que cualquiera en la Wi-Fi podría entrar.

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
| `npm run e2e` | Playwright en escritorio y móvil; levanta API en memoria y web automáticamente. Antes, una vez por equipo: `npx playwright install chromium`; y detén `start:api`/`start:dev`/`start:demo` (la API de e2e necesita el puerto 3000) |
| `npm run dev` | `services:up` + `dev:check` + `start:dev`: levanta los servicios de Docker, valida el entorno y arranca API y web |
| `npm start` | Igual que `npm run start:dev` |
| `npm run dev:check` | Diagnóstico del entorno de desarrollo (variables en uso, MongoDB y puertos) |
| `npm run lint:guard` | Demuestra que cada regla normativa detecta su violación |
| `npm run start:demo` | Demostración en memoria con datos ficticios |
| `MONGO_SMOKE_URI=mongodb://… npx nx run api:test` | Además ejecuta la prueba de humo de persistencia contra un MongoDB real (PowerShell: `$env:MONGO_SMOKE_URI='mongodb://…'; npx nx run api:test`) |

Con un Chromium ya instalado: `CHROMIUM_PATH=/ruta/a/chromium npm run e2e` (PowerShell:
`$env:CHROMIUM_PATH='C:\ruta\chrome.exe'; npm run e2e`).

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

## 10. Respaldos y restauración

`backup.js` se compila junto a la API (`dist/apps/api/backup.js`) y viaja en su imagen Docker.
Respalda **la base completa** (todas las colecciones, con sus índices) y **el directorio de
archivos** (`STORAGE_DIR`: cargas y fotos) en un solo archivo:

- Líneas EJSON canónicas (conserva `ObjectId`, fechas y `Decimal128`) comprimidas con gzip.
- Cifrado AES-256-GCM con llave derivada de `BACKUP_PASSPHRASE` (scrypt). El respaldo contiene
  datos confidenciales del cliente: sin frase de paso no se crea, salvo con `--sin-cifrar`
  explícito.
- Cierre con conteos y SHA-256 de todo el contenido: un archivo truncado, alterado o con la frase
  incorrecta se rechaza **antes** de escribir nada.

```bash
# Paquete Docker local (el contenedor de la API ya tiene MONGODB_URI y STORAGE_DIR):
docker compose exec -e BACKUP_PASSPHRASE='frase-larga-y-secreta' api node backup.js crear /tmp/respaldo.agbk
docker compose cp api:/tmp/respaldo.agbk ./respaldos/respaldo-$(date +%F).agbk
docker compose exec api rm /tmp/respaldo.agbk

# Comprobar un respaldo sin restaurarlo:
node dist/apps/api/backup.js verificar respaldo.agbk

# Restaurar (con la API detenida). Se niega si el destino ya tiene datos; --reemplazar los sustituye.
node dist/apps/api/backup.js restaurar respaldo.agbk [--reemplazar]
```

Recomendaciones de operación: respaldo diario con rotación (7 diarios, 4 semanales, 12 mensuales),
copia fuera del servidor, la frase de paso guardada aparte del respaldo y una **restauración de
prueba** mensual en un entorno separado (`verificar` + `restaurar` en otra base). Prueba realizada
en F8c: respaldo cifrado de los datos de demostración y restauración en otra base con comparación
documento por documento e índice por índice (0 diferencias) e inicio de sesión sobre la base
restaurada.

