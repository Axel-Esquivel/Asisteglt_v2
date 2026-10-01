# 02 · Arquitectura

## 1. Estilo arquitectónico

- **Monolito modular** en el backend (NestJS) con **contextos acotados** (DDD) y **arquitectura
  hexagonal** dentro de cada contexto. Permite empezar con un único despliegue y extraer
  servicios después sin reescribir el dominio.
- **Procesos en segundo plano** separados (`apps/worker`) para trabajos pesados: importaciones,
  consolidaciones, operaciones, auto-asignación y generación de PDF (colas **BullMQ** sobre Redis).
- **SPA Angular** con *feature libraries*; cada feature tiene páginas, componentes de presentación
  PrimeNG, *stores* de estado basados en signals y clientes de API tipados.
- **Contratos compartidos** (`libs/shared/contracts`) entre frontend y backend: DTOs, enumeraciones
  y mapas de eventos de tiempo real. Un cambio de contrato rompe la compilación de ambos lados.
- **Tiempo real** con Socket.IO, escalado con `@socket.io/redis-adapter`; los workers emiten
  eventos mediante `@socket.io/redis-emitter`.

## 2. Diagrama de contexto (C4 nivel 1)

```mermaid
flowchart LR
    visitante(["Visitante"])
    usuario(["Usuario autenticado"])
    inventariador(["Inventariador (móvil)"])
    supervisor(["Supervisor"])

    subgraph asiste["AsisteGLT"]
        sistema["Plataforma AsisteGLT<br/>Reportes · Inventarios · Chat · IAM"]
    end

    dbext[("Bases de datos externas<br/>SQL Server · PostgreSQL · MySQL · MongoDB")]
    smtp["Servidor SMTP"]
    files["Archivos del usuario<br/>.txt · .csv · .xlsx"]

    visitante -->|registro, login, invitaciones| sistema
    usuario -->|informes, chat, proyectos| sistema
    inventariador -->|conteo guiado, evidencias| sistema
    supervisor -->|monitoreo en vivo| sistema
    files -->|carga| sistema
    sistema -->|consultas de solo lectura| dbext
    sistema -->|correos transaccionales| smtp
```

## 3. Diagrama de contenedores (C4 nivel 2)

```mermaid
flowchart TB
    browser["Navegador / móvil<br/>Angular 22 + PrimeNG 22 (SPA)"]

    subgraph edge["Borde"]
        proxy["Nginx / Ingress<br/>TLS · compresión · estáticos"]
    end

    subgraph backend["Backend (NestJS 12)"]
        api["apps/api<br/>REST /api/v1 · Socket.IO gateways<br/>(N réplicas sin estado)"]
        worker["apps/worker<br/>Consumidores BullMQ<br/>(N réplicas)"]
        pdf["Chromium headless (Playwright)<br/>dentro del worker"]
    end

    subgraph data["Datos"]
        mongo[("MongoDB 8<br/>replica set<br/>+ GridFS (archivos)")]
        redis[("Redis 8<br/>caché · sesiones · presencia<br/>rate-limit · colas · pub/sub")]
    end

    ext[("BD externas")]
    smtp["SMTP"]

    browser -->|HTTPS + WSS| proxy
    proxy -->|/api, /socket.io| api
    proxy -->|archivos estáticos del SPA| browser
    api <-->|Mongoose| mongo
    api <-->|ioredis| redis
    worker <-->|Mongoose| mongo
    worker <-->|BullMQ + redis-emitter| redis
    worker --> pdf
    pdf -->|ruta de impresión del SPA| proxy
    worker -->|drivers de solo lectura| ext
    worker --> smtp
```

## 4. Estructura del monorepo (Nx)

```text
asisteglt/
├── apps/
│   ├── web/                     # Angular 22 + PrimeNG 22 (SPA, zoneless)
│   ├── api/                     # NestJS 12: REST + WebSockets
│   └── worker/                  # NestJS 12 (application context): colas BullMQ
├── libs/
│   ├── shared/
│   │   ├── kernel/              # Entity, AggregateRoot, ValueObject, Nullable, Optional, Result,
│   │   │                        # DomainError, Decimal/Money, Period, EntityId, Clock
│   │   ├── contracts/           # DTOs, enums, eventos de tiempo real, códigos de error
│   │   ├── field-catalog/       # FieldKey, FieldLabel, CatalogField, DataType, NumericNature,
│   │   │                        # FieldRole, FieldOperation, Aggregation, OperationCompatibility
│   │   │                        # y FieldResolver (abstracta). TypeScript puro, usado por web,
│   │   │                        # api, worker y formula-engine
│   │   ├── ingestion-core/      # Lectores, reglas de fila y validación de importación (puro)
│   │   └── formula-engine/      # Lexer, parser, AST, evaluador, TypeChecker (TypeScript puro)
│   ├── api/                     # Contextos acotados del backend
│   │   ├── iam/                 # usuarios, sesiones, tokens, 2FA, auditoría
│   │   ├── access-control/      # roles, permisos, membresías, vínculos, invitaciones (CASL)
│   │   ├── projects/            # proyectos por módulo
│   │   ├── chat/                # conversaciones, mensajes, presencia
│   │   ├── notifications/       # notificaciones in-app y correo
│   │   ├── files/               # almacenamiento de archivos (GridFS → S3 compatible)
│   │   ├── realtime/            # gateways, publicador de eventos, autenticación de sockets
│   │   ├── data-ingestion/      # perfiles, lectores, conectores, validación (compartido)
│   │   ├── reports/
│   │   │   ├── org-structure/
│   │   │   ├── datasets/
│   │   │   ├── collections/
│   │   │   ├── classifications/
│   │   │   ├── consolidation/
│   │   │   ├── transformations/
│   │   │   ├── templates/
│   │   │   └── rendering/
│   │   └── inventory/
│   └── web/                     # Librerías del frontend
│       ├── core/                # shell, auth, interceptores, guards, cliente realtime, i18n
│       ├── ui/                  # componentes compuestos construidos con PrimeNG
│       ├── feature-auth/
│       ├── feature-profile/
│       ├── feature-chat/
│       ├── feature-projects/
│       ├── feature-reports/
│       └── feature-inventory/
├── tools/eslint-rules/          # reglas propias (p. ej. prohibir imports de UI no PrimeNG)
├── docker/                      # docker-compose: mongo (rs), redis, mailpit
└── docs/
```

Las etiquetas Nx (`scope:web`, `scope:api`, `scope:shared`, `type:domain`, `type:feature`…) y la
regla `@nx/enforce-module-boundaries` impiden, por ejemplo, que `libs/web/*` importe código de
`libs/api/*` o que un dominio dependa de infraestructura. `libs/shared/formula-engine` depende
solo de `kernel` y `field-catalog`.

### 4.1 Encabezados dinámicos: una sola fuente de verdad

Los encabezados (*Debe*, *Haber*, *Saldo*, *Monto de venta* o cualquier otro nombre que defina el
usuario) viven en el `FieldCatalog` del proyecto (colección `field_catalogs`). Cada uno tiene un
nombre único entre los activos (`FieldLabel`, comparación normalizada) y una clave interna generada
(`FieldKey`, p. ej. `f_6Pw4`) invisible para el usuario. Las consecuencias arquitectónicas son:

- **Referencias por clave**: toda definición guardada (preconfiguraciones, pasos de operaciones,
  consolidaciones, clasificaciones, colecciones, elementos de informe, fórmulas, mapeos de
  inventario y claves de `data_records`) usa `FieldKey`, nunca el nombre. Renombrar es una sola
  actualización del catálogo: no se migra nada ni se republican plantillas.
- **Uso por nombre**: los selectores muestran el nombre vigente y las fórmulas se escriben con
  `[Nombre]`; el `FieldResolver` traduce nombre ↔ `FieldKey` y las fórmulas se persisten en forma
  canónica (`=[#f_6Pw4] - [#f_2Lm5]`).
- **Compatibilidad única**: `OperationCompatibility` (en `libs/shared/field-catalog`) decide qué
  operación admite cada encabezado según rol, tipo y naturaleza; la usan la interfaz, el dominio
  (API y worker) y el `TypeChecker` del motor de fórmulas.
- **Usos**: el puerto `FieldUsageIndex` (colección `field_usages`) permite desactivar o reemplazar un
  encabezado mostrando dónde se usa.
- **Propagación**: cada cambio incrementa `FieldCatalog.version` (`catalogVersion`) y publica
  `catalog.changed`, que refresca selectores, editores de fórmulas e informes abiertos e invalida la
  caché de resultados.

El detalle está en [04 · Modelo de dominio](04-modelo-de-dominio.md) y en
[12 · Preconfiguraciones y carga múltiple](12-preconfiguraciones-y-carga-multiple.md).

## 5. Capas dentro de cada contexto del backend

```mermaid
flowchart LR
    subgraph presentation["presentation"]
        ctrl["Controllers REST"]
        gw["Gateways WebSocket"]
        reqdto["DTOs de entrada<br/>(class-validator)"]
    end
    subgraph application["application"]
        uc["Casos de uso<br/>(clases con execute)"]
        qry["Consultas"]
        ports["Puertos de salida<br/>(clases abstractas)"]
    end
    subgraph domain["domain"]
        agg["Agregados y entidades"]
        vo["Value objects"]
        dsvc["Servicios de dominio"]
        repo["Repositorios<br/>(clases abstractas)"]
        evt["Eventos de dominio"]
    end
    subgraph infrastructure["infrastructure"]
        schema["Schemas Mongoose"]
        repoimpl["Repositorios Mongo"]
        mapper["Mappers documento ↔ dominio"]
        adapters["Adaptadores: Redis, SMTP,<br/>GridFS, conectores BD, BullMQ"]
    end

    ctrl --> uc
    gw --> uc
    reqdto --> ctrl
    uc --> agg
    uc --> repo
    uc --> ports
    qry --> repo
    repoimpl -. implementa .-> repo
    adapters -. implementa .-> ports
    repoimpl --> schema
    repoimpl --> mapper
    mapper --> agg
```

Regla de dependencias: `presentation → application → domain ← infrastructure`. El dominio no
conoce NestJS, Mongoose ni Redis. La inyección de dependencias usa **clases abstractas como
tokens** (`{ provide: UserRepository, useClass: MongoUserRepository }`), lo que mantiene el diseño
orientado a objetos sin recurrir a *tokens* de texto.

## 6. Flujo de datos del módulo de Reportes

```mermaid
flowchart LR
    subgraph fuentes["Fuentes"]
        txt["Texto ancho fijo"]
        csv["Delimitado"]
        xls["Hoja de cálculo"]
        db["Consulta a BD"]
    end

    catalogo["Catálogo de encabezados<br/>(FieldCatalog: nombre ↔ FieldKey)"]
    perfil["Perfil de importación<br/>(DataSourceProfile)"]
    lector["Lectores (Strategy)<br/>+ reglas de fila"]
    valid["Mapeo y validación<br/>por columna"]
    raw[("Etapa 1<br/>Datos cargados<br/>(RAW)")]
    cons[("Etapa 2<br/>Datos consolidados<br/>(CONSOLIDATED)")]
    trans[("Etapa 3<br/>Datos transformados<br/>(TRANSFORMED)")]
    clas["Clasificaciones<br/>(membresías materializadas)"]
    col["Colecciones<br/>complementarias"]
    motor["Motor de consultas<br/>+ motor de fórmulas"]
    tpl["Plantilla de informe"]
    out["Previsualización<br/>y PDF"]

    txt --> perfil
    csv --> perfil
    xls --> perfil
    db --> perfil
    perfil --> lector --> valid --> raw
    raw --> cons
    raw --> trans
    cons --> trans
    raw --> clas
    cons --> clas
    trans --> clas
    raw --> motor
    cons --> motor
    trans --> motor
    clas --> motor
    col --> motor
    col --> trans
    tpl --> motor --> out
    catalogo -.->|encabezados por clave| perfil
    catalogo -.->|"[Nombre] y selectores"| trans
    catalogo -.->|nombres vigentes| motor
```

Todas las etapas guardan y leen los encabezados por `FieldKey`; el usuario los elige y escribe por
su nombre vigente, y los nombres se resuelven con el catálogo al mostrar (títulos de filas y
columnas, leyendas, fórmulas).

## 7. Tiempo real

| Namespace Socket.IO | Salas (rooms) | Eventos principales |
|---|---|---|
| `/chat` | `conversation:{id}`, `user:{id}` | `message.created`, `message.updated`, `typing.changed`, `presence.changed`, `read.updated` |
| `/projects` | `project:{id}` | `member.joined`, `member.updated`, `resource.changed`, `job.progress`, `notification.created`, `catalog.changed` |
| `/reports` | `template:{id}`, `dataset:{projectId}` | `template.changed`, `element.locked`, `element.unlocked`, `preview.invalidated`, `load.completed` |
| `/inventory` | `count:{id}`, `count:{id}:supervisors`, `counter:{countId}:{userId}` | `item.assigned`, `item.locked`, `entry.recorded`, `evidence.added`, `progress.updated`, `round.opened`, `round.closed` |

- **Autenticación del socket**: el *access token* viaja en el `handshake.auth`; un
  `SocketAuthMiddleware` lo valida y adjunta un `AuthenticatedPrincipal` tipado al socket.
- **Autorización por evento**: cada `@SubscribeMessage` pasa por el mismo `PolicyEvaluator` que la
  API REST antes de unir al socket a una sala o aceptar un comando.
- **Tipado**: `Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>` con
  los mapas definidos en `libs/shared/contracts/realtime`. El cliente Angular usa los mismos mapas.
- **Origen de los eventos**: los casos de uso publican **eventos de dominio**; un
  `RealtimeEventPublisher` los traduce a eventos de socket. Los workers publican a través de Redis
  (`redis-emitter`) para que cualquier réplica de la API los entregue.
- **Cambios del catálogo de encabezados**: crear, renombrar, desactivar o reemplazar un encabezado
  publica `catalog.changed` (con la nueva `catalogVersion`) en la sala `project:{id}`; el
  `FieldCatalogStore` del SPA se recarga y los selectores, editores de fórmulas e informes abiertos
  muestran el nombre vigente sin recargar la página.

## 8. Uso de Redis

| Uso | Estructura / clave | TTL |
|---|---|---|
| Familias de refresh token revocadas y `jti` de access tokens revocados | `auth:revoked-jti:{jti}` (string) | vida restante del token |
| Limitación de peticiones (`@nestjs/throttler` con almacenamiento Redis) | `rl:{ruta}:{ip}` / `rl:login:{email}` | ventana |
| Bloqueo progresivo de cuentas | `auth:failures:{userId}` (contador) | 15 min |
| Presencia y "escribiendo…" | `presence:user:{id}` (hash), `typing:{conversationId}` (set) | 60 s renovable |
| Caché de permisos (reglas CASL empaquetadas) | `acl:{projectId}:{userId}` | 10 min, invalidación por evento |
| Caché de resultados de informe (`catalogVersion` = `version` del `FieldCatalog` del proyecto) | `rpt:{templateId}:{version}:{paramsHash}:{dataVersion}:{catalogVersion}` | 1 h, invalidación por carga y por cambio del catálogo (`catalog.changed`) |
| Bloqueo de producto en toma | `inv:lock:{roundId}:{itemId}` (`SET NX PX`) | 2 min renovable |
| Progreso en vivo de toma | `inv:progress:{roundId}` (hash por usuario) | duración de la ronda |
| Colas BullMQ | `bull:{queue}:*` | gestionado por BullMQ |
| Adapter Socket.IO | canales pub/sub `socket.io#*` | — |

## 9. Colas de trabajo (BullMQ)

| Cola | Productor | Trabajo | Idempotencia |
|---|---|---|---|
| `ingestion` | API (`StartImportUseCase`) | Leer, validar y persistir una carga | `jobId = importJobId`; reemplazo por versión |
| `consolidation` | API | Ejecutar una definición para un período | `jobId = definitionId:period` |
| `transformation` | API / encadenado | Ejecutar un pipeline | `jobId = pipelineId:period:dataVersion` |
| `classification` | Evento `load.completed` / edición de clasificación | Recalcular membresías | `jobId = classificationId:dataVersion` |
| `report-export` | API | Renderizar PDF con Chromium | `jobId = exportId` |
| `inventory-assignment` | API | Auto-asignación de productos | `jobId = roundId:strategyVersion` |
| `mail` | Cualquier caso de uso | Enviar correo | `jobId = mailId` |

Todos los trabajos reportan progreso (`job.progress`) al proyecto por tiempo real y reintentan con
*backoff* exponencial (3 intentos) antes de marcar el estado `FAILED` con el error tipado.

## 10. Generación de PDF fiel a la previsualización

1. El frontend incluye una ruta de impresión `/print/reports/:templateId` que renderiza **los mismos
   componentes** del visor, sin la interfaz del diseñador.
2. El worker abre esa ruta con Chromium (Playwright) usando un **token de renderizado** firmado, de
   un solo uso y con alcance a esa plantilla y parámetros.
3. La página señala `document.body.dataset['renderState'] = 'complete'` cuando todos los elementos
   terminaron de calcularse; entonces el worker llama `page.pdf()` con el tamaño de página de cada
   `ReportPage` (Carta, Oficio, Legal, A4 o personalizado) mediante CSS `@page`.
4. El PDF se guarda en GridFS y se notifica `export.completed` con el enlace de descarga firmado.

## 11. Despliegue

```mermaid
flowchart TB
    subgraph host["Docker Compose (dev) / Kubernetes (prod)"]
        nginx["nginx<br/>SPA estática + proxy"]
        api1["api #1"]
        api2["api #2"]
        w1["worker #1<br/>(con Chromium)"]
        w2["worker #2"]
        m1[("mongo primario")]
        m2[("mongo secundario")]
        m3[("mongo secundario")]
        r[("redis 8<br/>AOF")]
        mail["mailpit (solo dev)"]
    end

    nginx --> api1
    nginx --> api2
    api1 --> m1
    api2 --> m1
    w1 --> m1
    w2 --> m1
    m1 --- m2
    m1 --- m3
    api1 --> r
    api2 --> r
    w1 --> r
    w2 --> r
    w1 --> mail
```

### 11.1 Modo servidor local (red interna sin internet)

Para tomas de inventario (y, si se desea, reportes) en lugares sin internet, la plataforma se
instala completa en un **PC o laptop** que actúa como servidor de la red interna:

```mermaid
flowchart LR
    subgraph lan["Red interna (Wi-Fi / LAN, sin internet)"]
        subgraph laptop["PC / laptop servidor (Docker Compose)"]
            ng["nginx + TLS<br/>(certificado de CA local)"]
            apil["api"]
            wkl["worker"]
            ml[("MongoDB<br/>replica set de 1 nodo")]
            rl[("Redis")]
        end
        m1["Móvil inventariador 1"]
        m2["Móvil inventariador 2"]
        sup["Laptop supervisor"]
    end
    central[("Servidor central<br/>(cuando hay internet)")]

    m1 -->|https://asisteglt.local| ng
    m2 --> ng
    sup --> ng
    ng --> apil
    apil --> ml
    apil --> rl
    wkl --> ml
    laptop -. paquete de sincronización .-> central
```

| Aspecto | Decisión |
|---|---|
| Instalación | Paquete Docker Compose con imágenes precargadas (instalable sin internet) y script de arranque; requisitos mínimos: 4 núcleos, 8 GB RAM, 20 GB libres. |
| Descubrimiento | Nombre `asisteglt.local` (mDNS) o IP fija; se muestra un código QR con la URL para los móviles. |
| HTTPS en red local | Autoridad certificadora local generada en la instalación; su certificado se instala una vez en cada dispositivo. Es necesario porque la cámara, el service worker y las cookies `Secure` exigen contexto seguro. |
| Sin servicios externos | Fuentes e íconos empaquetados (sin CDN). Sin SMTP: invitaciones por vínculo/QR y restablecimiento de contraseña por un administrador local. |
| Tolerancia a cortes de Wi-Fi | El SPA es una **PWA**: el *shell* queda en caché y los conteos se guardan en IndexedDB (`PendingSubmissionQueue`) y se reenvían al reconectar; el bloqueo de productos tolera la reconexión. |
| Sincronización con el central | v1: **paquete firmado** (exportar/importar) de proyecto de inventario: la toma se prepara en el central, se exporta al servidor local, se ejecuta y los resultados se devuelven al central. Posterior: sincronización automática cuando haya internet. |
| Usuarios | Los usuarios del paquete se crean con credenciales locales temporales; la autenticación funciona sin conexión al central. |
| Respaldo | Respaldo automático local de MongoDB cada hora durante una toma. |

## 12. Decisiones de arquitectura (ADR resumidos)

| ADR | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| ADR-01 | Monorepo **Nx** con contratos compartidos. | Repos separados. | Un solo cambio de contrato se verifica en front y back a la vez; generadores oficiales para Angular y NestJS; límites de módulos. |
| ADR-02 | **Monolito modular** + workers. | Microservicios desde el inicio. | Menor complejidad operativa; los contextos ya quedan aislados para extraerlos después. |
| ADR-03 | **Socket.IO** + Redis adapter. | WebSocket nativo, SSE. | Salas, reconexión, *acks* y tipado de eventos; escalado horizontal probado. |
| ADR-04 | **CASL** para autorización (backend y frontend). | Guards ad-hoc por rol. | Permisos granulares con condiciones y campos; mismas reglas serializables al SPA para ocultar UI. |
| ADR-05 | **Decimal** en todo cálculo monetario. | `number`. | Evitar errores de punto flotante en saldos y cuadres contables. |
| ADR-06 | **Motor de fórmulas propio** (lexer + parser Pratt + AST + Visitor) con **referencias a encabezados** `[Nombre]`: el lexer emite `FIELD_REF`, el nodo `FieldReference` guarda solo el `FieldKey` resuelto por `FieldResolver` (nombre normalizado, único entre activos); la forma canónica persistida es `=[#f_6Pw4] - [#f_2Lm5]` y `FormulaFormatter` la muestra con los nombres vigentes; en `RecordEvaluationContext` `[X]` es el valor del registro y en `AggregateEvaluationContext` es la agregación por defecto bajo los filtros de la celda (`SUMA([X])` la hace explícita); el `TypeChecker` usa `OperationCompatibility`. | `eval`, librerías genéricas; guardar el nombre en el texto de la fórmula. | Seguridad (sin ejecución de código), tipado total, funciones de dominio (`CLASIF`, `COLECCION`), referencias a celdas y páginas, y fórmulas que sobreviven a renombrar encabezados (*Debe* → *Cargos*). |
| ADR-07 | **PDF con Chromium** sobre la ruta de impresión del SPA. | pdfmake / generación manual. | La previsualización y el PDF usan el mismo código de renderizado. |
| ADR-08 | **GridFS** como almacenamiento inicial detrás de la abstracción `FileStorage`. | S3 desde el inicio. | Mantiene el stack pedido (MongoDB); se puede cambiar a S3/MinIO sin tocar el dominio. |
| ADR-09 | Membresías de clasificación **materializadas** en los registros. | Evaluar reglas en cada consulta. | Las consultas de informes filtran por índice (`memberships.nodeId`). |
| ADR-10 | Asignación de inventario por **Strategy** (manual, zonas contiguas, clúster espacial). | Algoritmo único. | Se adapta a almacenes con o sin coordenadas y permite agregar estrategias sin modificar el dominio. |
| ADR-11 | **Modo servidor local** con Docker Compose, CA local y paquetes de sincronización. | Solo nube; aplicación nativa offline. | Requisito de operar sin internet en red interna (P-04) manteniendo un único código web. |
| ADR-12 | **Encabezados dinámicos** en un `FieldCatalog` por proyecto, referenciados por `FieldKey` y usados por nombre; compatibilidad centralizada en `OperationCompatibility` (`libs/shared/field-catalog`). | Columnas fijas (debe/haber) en el código; referencias por nombre de texto. | El usuario define cualquier nombre (*Debe*, *Haber*, *Saldo*, *Monto de venta*…) y lo usa en todo lo posterior; renombrar no rompe definiciones ni exige migraciones. |
