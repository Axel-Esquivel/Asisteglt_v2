# 05 · Flujos (secuencia y actividad) y máquinas de estado

## 1. Secuencias

### 1.1 Inicio de sesión con 2FA y emisión de tokens

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant W as Angular (AuthStore)
    participant C as AuthController
    participant T as ThrottlerGuard (Redis)
    participant A as AuthenticationService
    participant R as UserRepository
    participant H as PasswordHasher
    participant S as SessionRepository
    participant L as SecurityAuditLogger

    U->>W: correo + contraseña
    W->>C: POST /api/v1/auth/login
    C->>T: verificar límite IP / cuenta
    T-->>C: permitido
    C->>A: login(LoginCommand)
    A->>R: findByEmail(email)
    R-->>A: Optional~User~
    A->>H: verify(plain, hash)
    H-->>A: true
    alt usuario con 2FA
        A-->>C: TwoFactorRequired(challenge)
        C-->>W: 200 { status: TWO_FACTOR_REQUIRED, challenge }
        U->>W: código TOTP
        W->>C: POST /api/v1/auth/2fa
        C->>A: completeTwoFactor(challenge, code)
    end
    A->>S: crear Session + familia de refresh tokens
    A->>L: LOGIN_SUCCEEDED
    A-->>C: AuthenticatedLogin(accessToken, refreshToken)
    C-->>W: 200 { accessToken } + Set-Cookie refresh (HttpOnly, Secure, SameSite=Strict)
    W->>W: guardar accessToken solo en memoria (signal)
```

### 1.2 Rotación de *refresh token* con detección de reutilización

```mermaid
sequenceDiagram
    autonumber
    participant W as Angular (AuthInterceptor)
    participant C as AuthController
    participant RT as RefreshTokenService
    participant DB as MongoDB
    participant RD as Redis

    W->>C: petición con access token vencido
    C-->>W: 401 TOKEN_EXPIRED
    W->>C: POST /api/v1/auth/refresh (cookie)
    C->>RT: rotate(rawToken)
    RT->>DB: buscar por hash(rawToken)
    alt token vigente y no usado
        RT->>DB: marcar usado + crear sucesor (misma familia)
        RT-->>C: nuevo par de tokens
        C-->>W: 200 { accessToken } + nueva cookie
        W->>W: reintentar petición original
    else token ya usado (robo probable)
        RT->>DB: revocar toda la familia y la sesión
        RT->>RD: denegar jti activos de la sesión
        RT-->>C: TOKEN_REUSE_DETECTED
        C-->>W: 401 + borrar cookie
        W->>W: cerrar sesión local y redirigir a login
    end
```

### 1.3 Importación de datos (Reportes)

```mermaid
sequenceDiagram
    autonumber
    actor A as Analista
    participant W as Angular (ImportWizard)
    participant API as DataLoadsController
    participant UC as StartImportUseCase
    participant FS as FileStorage (GridFS)
    participant Q as BullMQ (ingestion)
    participant WK as Worker (ImportPipeline)
    participant DB as MongoDB
    participant RT as RealtimeEventPublisher

    A->>W: elige perfil, período y alcance, sube archivo
    W->>API: POST /projects/:id/data-loads (multipart)
    API->>UC: execute(StartImportCommand)
    UC->>UC: validar permisos, EntityScope y perfil
    UC->>FS: guardar archivo
    UC->>DB: crear ImportJob(QUEUED) y DataLoad(STAGED)
    UC->>Q: encolar jobId = importJobId
    API-->>W: 202 { importJobId }
    Q->>WK: procesar
    loop streaming por lotes de 5 000
        WK->>WK: RecordReader → RowRule → RecordMapper
        WK->>DB: insertMany(registros STAGED)
        WK->>RT: job.progress
        RT-->>W: progreso en vivo (p-progressbar)
    end
    alt rechazos bajo el umbral
        WK->>DB: transacción: publicar nueva versión, anterior SUPERSEDED
        WK->>RT: load.completed
        WK->>Q: encolar recálculo de clasificaciones
    else rechazos sobre el umbral
        WK->>DB: ImportJob FAILED + incidencias
        WK->>RT: job.progress (estado FAILED)
    end
```

### 1.4 Previsualización en vivo y exportación PDF

```mermaid
sequenceDiagram
    autonumber
    actor D as Diseñador / Lector
    participant W as Angular (ReportViewerStore)
    participant API as ReportsController
    participant CS as ReportComputationService
    participant C as Redis (caché)
    participant QE as MongoReportQueryEngine
    participant Q as BullMQ (report-export)
    participant WK as Worker + Chromium
    participant FS as FileStorage

    D->>W: cambia período / edita elemento
    W->>API: POST /templates/:id/compute { params, draftVersion }
    API->>C: buscar rpt:{templateId}:{version}:{paramsHash}:{dataVersion}:{catalogVersion}
    alt en caché
        C-->>API: ComputedReport
    else no está en caché
        API->>CS: compute(template, params)
        CS->>QE: evaluateCells(consultas agrupadas por tabla)
        QE-->>CS: resultados
        CS->>CS: fórmulas en orden topológico
        CS->>C: guardar
    end
    API-->>W: ComputedReport
    W->>W: renderizar páginas (mm) con componentes PrimeNG
    D->>W: Exportar PDF
    W->>API: POST /templates/:id/exports
    API->>Q: encolar exportId
    API-->>W: 202 { exportId }
    Q->>WK: abrir /print/reports/:id?token=… en Chromium
    WK->>WK: esperar renderState = complete
    WK->>FS: guardar PDF
    WK-->>W: export.completed (tiempo real) con URL firmada
```

> **Encabezados en el informe calculado.** `ComputedReport` transporta claves internas de
> encabezado (`FieldKey`), nunca nombres; los títulos de filas, columnas, dimensiones, series y
> leyendas se resuelven con el catálogo vigente (`FieldCatalogStore.labelOf`) al renderizar la
> previsualización y la página de impresión. La clave de caché incluye `catalogVersion`
> (`rpt:{templateId}:{version}:{paramsHash}:{dataVersion}:{catalogVersion}`), de modo que
> renombrar un encabezado (p. ej. *Debe* → *Cargos*) invalida la caché y **no** crea una versión
> nueva de la plantilla: las definiciones guardan claves y las fórmulas su forma canónica
> (`=[#f_6Pw4] - [#f_2Lm5]`). Antes de calcular, `ReportComputationService.compute()` valida cada
> referencia y responde `FIELD_NOT_FOUND`, `FIELD_INACTIVE` o `FIELD_INCOMPATIBLE` indicando el
> elemento afectado.

### 1.5 Conteo guiado en tiempo real (Inventarios)

```mermaid
sequenceDiagram
    autonumber
    actor I as Inventariador (móvil)
    participant W as Angular (CountingStore)
    participant G as InventoryGateway
    participant UC as RecordCountUseCase
    participant L as ItemLockService (Redis)
    participant DB as MongoDB
    participant FS as FileStorage
    actor S as Supervisor

    I->>W: abrir toma
    W->>G: next-item { roundId }
    G->>DB: siguiente de CounterAssignment.route
    G->>L: acquire(roundId, itemId, userId)
    L-->>G: true
    G-->>W: ItemView (solo campos visibles)
    I->>W: cantidad / novedad + comentario
    opt con fotografías
        W->>FS: POST /evidences (multipart)
        FS-->>W: fileIds
    end
    W->>G: record-entry { itemId, quantity, outcome, evidenceIds, revision }
    G->>UC: execute(RecordCountCommand)
    UC->>L: verificar dueño del bloqueo
    UC->>DB: guardar CountEntry + avanzar cursor
    UC->>L: release
    UC-->>G: EntryRecorded
    G-->>S: entry.recorded / progress.updated (sala supervisores)
    G-->>W: ack + siguiente producto
```

### 1.6 Compartir proyecto por vínculo o por correo

```mermaid
sequenceDiagram
    autonumber
    actor P as Propietario
    actor N as Nuevo usuario
    participant W as Angular
    participant API as SharingController
    participant DB as MongoDB
    participant M as Cola mail

    alt por vínculo
        P->>W: crear vínculo (rol, expiración, usos)
        W->>API: POST /projects/:id/share-links
        API->>DB: guardar ShareLink(tokenHash)
        API-->>W: URL con token (se muestra una sola vez)
        N->>W: abre /join/:token (inicia sesión o se registra)
        W->>API: POST /share-links/redeem
        API->>DB: ShareLink.redeem → ProjectMember
    else por correo
        P->>W: invitar correo + rol
        W->>API: POST /projects/:id/invitations
        API->>DB: guardar Invitation(PENDING)
        API->>M: enviar correo con enlace
        N->>W: abre enlace, inicia sesión o se registra
        W->>API: POST /invitations/accept
        API->>DB: Invitation.accept → ProjectMember
    end
    API-->>W: member.joined (tiempo real a miembros)
```

## 2. Actividades

### 2.1 Ciclo de vida de los datos de un proyecto de reportes

```mermaid
flowchart TD
    start([Inicio]) --> org[Definir estructura organizacional]
    org --> cat["Definir catálogo de encabezados: nombre único, rol, tipo, naturaleza y agregación"]
    cat --> prof[Crear perfil de importación]
    prof --> tipo{Tipo de fuente}
    tipo -->|Ancho fijo| fw[Asistente de cortes por posición]
    tipo -->|Delimitado| dl[Delimitador, calificador, encabezado]
    tipo -->|Hoja de cálculo| ss[Hoja por nombre o primera hoja]
    tipo -->|Base de datos| db[Conexión + consulta SELECT]
    fw --> cols["Asignar a cada columna un encabezado del catálogo por su nombre (rol, tipo y naturaleza vienen del catálogo) u omitirla"]
    dl --> cols
    ss --> cols
    db --> cols
    cols --> nuevo{"¿Falta un encabezado?"}
    nuevo -->|Sí| cat
    nuevo -->|No| rules[Definir reglas de fila]
    rules --> prev[Previsualizar resultado tipado]
    prev --> ok{¿Correcto?}
    ok -->|No| cols
    ok -->|Sí| load[Cargar datos: período + alcance]
    load --> val{¿Rechazos bajo umbral?}
    val -->|No| fix[Revisar incidencias y ajustar perfil] --> load
    val -->|Sí| raw[(Etapa RAW publicada)]
    raw --> clas[Recalcular clasificaciones]
    raw --> needc{¿Requiere consolidar?}
    needc -->|Sí| cons[Ejecutar consolidación misma moneda] --> consd[(Etapa CONSOLIDATED)]
    needc -->|No| needt
    consd --> needt{¿Requiere operaciones?}
    needt -->|Sí| pipe[Ejecutar pipeline: acumulados, filtros, fórmulas, conversión, cuadre] --> trans[(Etapa TRANSFORMED)]
    needt -->|No| rep
    trans --> rep[Informes leen RAW / CONSOLIDATED / TRANSFORMED]
    clas --> rep
    rep --> fin([Fin])
```

La obligatoriedad de una columna no se define en el perfil: se deriva del rol del encabezado
(los de rol `id` son obligatorios). La columna guarda solo la `FieldKey` del encabezado y una
instantánea (`FieldSnapshot`) tomada al activar la versión; la interfaz la muestra siempre con el
nombre vigente. Desde ese momento el encabezado se elige por su nombre (por ejemplo *Debe*,
*Haber*, *Saldo* o *Monto de venta*) en clasificaciones, consolidaciones, pipelines, informes y
fórmulas (`=[Debe] - [Haber]`); los encabezados derivados que crean los pasos de operaciones con
«Nuevo encabezado…» quedan disponibles por su nombre en todos los pasos y elementos posteriores.

### 2.2 Toma de inventario con rondas

```mermaid
flowchart TD
    s([Inicio]) --> crear[Crear toma y parámetros]
    crear --> cargar[Cargar listado de productos]
    cargar --> part[Configurar inventariadores, supervisores y visibilidad]
    part --> asig{Modo de asignación}
    asig -->|Manual| man[Definir rangos de ubicación por usuario]
    asig -->|Automática| auto[Estrategia de zonas contiguas o clúster]
    man --> ronda[Abrir ronda N]
    auto --> ronda
    ronda --> contar[Inventariadores cuentan en ruta guiada]
    contar --> nov{¿Novedad?}
    nov -->|Sí| evid[Comentario + fotografías] --> reg
    nov -->|No| reg[Registrar conteo]
    reg --> mas{¿Quedan productos del usuario?}
    mas -->|Sí| contar
    mas -->|No| reb{¿Otros usuarios con pendientes?}
    reb -->|Sí| steal[Reasignación dinámica] --> contar
    reb -->|No| cerrar[Supervisor cierra ronda N]
    cerrar --> dif[Calcular diferencias vs tolerancia]
    dif --> hay{¿Diferencias y N < máximo?}
    hay -->|Sí| rec[Abrir ronda N+1 solo con diferencias] --> asig
    hay -->|No| fin[Cerrar toma y exportar resultados valorizados]
    fin --> e([Fin])
```

### 2.3 Renombrar o desactivar un encabezado

Aplica a encabezados importados y derivados del `FieldCatalog` del proyecto. Todas las
definiciones (preconfiguraciones, pipelines, consolidaciones, clasificaciones, colecciones,
plantillas, mapeos de inventario y claves de `data_records`) guardan `FieldKey`, por lo que
renombrar es una sola actualización del catálogo; desactivar y reemplazar consultan primero el
índice de usos (`FieldUsageIndex`, colección `field_usages`).

```mermaid
flowchart TD
    s([Inicio]) --> acc{Acción sobre el encabezado}
    acc -->|Renombrar| nom["FieldLabel.create(nombre nuevo)"]
    nom --> valn{"¿Nombre válido y único entre activos?"}
    valn -->|No| errn["Mostrar INVALID_FIELD_LABEL o DUPLICATE_FIELD_LABEL"] --> nom
    valn -->|Sí| ren["FieldCatalog.rename + version + 1 (concurrencia optimista)"]
    ren --> evt["Emitir catalog.changed en sala project:{id}"]
    evt --> refr[Selectores, editores de fórmulas e informes abiertos muestran el nombre nuevo]
    refr --> cache["Caché de informes invalidada por catalogVersion, sin nueva versión de plantilla"]
    cache --> fin([Fin])
    acc -->|Desactivar| uses["FieldUsageIndex.usagesOf(key)"]
    uses --> hay{"¿Tiene usos?"}
    hay -->|No| deact["FieldCatalog.deactivate: queda INACTIVE y su nombre queda libre"]
    hay -->|Sí| lista["Mostrar FIELD_IN_USE con la lista de usos por nombre"]
    lista --> dec{Decisión del usuario}
    dec -->|Cancelar| fin
    dec -->|Reemplazar por otro encabezado| ruses
    dec -->|Confirmar desactivación| deact
    acc -->|"Reemplazar (p. ej. para cambiar tipo o naturaleza con datos o usos)"| ruses["FieldUsageIndex.usagesOf(key)"]
    ruses --> repl["FieldCatalog.replace: valida compatibilidad en cada uso (sin usos no hay nada que validar)"]
    repl --> compat{"¿Compatible en todos los usos?"}
    compat -->|No| errc["Mostrar FIELD_INCOMPATIBLE por uso"] --> dec
    compat -->|Sí| newv["El nuevo toma el nombre, el anterior pasa a INACTIVE con supersededBy y se versionan las definiciones afectadas"]
    newv --> evt
    deact --> inval["Las definiciones que lo usan fallan al publicar o calcular con FIELD_INACTIVE"]
    inval --> evt
```

- **Renombrar** nunca altera resultados ni membresías: tras renombrar *Debe* → *Cargos* el editor
  muestra `=[Cargos] - [Haber]` sin intervención, porque la fórmula guardada es
  `=[#f_6Pw4] - [#f_2Lm5]`.
- **Desactivar** libera el nombre; la interfaz muestra las referencias antiguas como
  «Debe (inactivo)». Reutilizar ese nombre en otro encabezado nunca redirige referencias antiguas.
- **Reemplazar** se puede pedir directamente, tenga o no usos (por ejemplo, para cambiar tipo o
  naturaleza de un encabezado con datos cargados, que son inmutables); trata la clave antigua como alias de la nueva al leer períodos anteriores, cuando
  ambas son compatibles.

## 3. Máquinas de estado

### 3.1 `ImportJob`

```mermaid
stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> READING: worker toma el trabajo
    READING --> VALIDATING: lectura en streaming
    VALIDATING --> PERSISTING: lote válido
    PERSISTING --> READING: siguiente lote
    PERSISTING --> COMPLETED: fin del origen y rechazos bajo umbral
    VALIDATING --> FAILED: rechazos sobre umbral
    READING --> FAILED: error de lectura / conexión
    QUEUED --> CANCELLED: usuario cancela
    READING --> CANCELLED: usuario cancela
    COMPLETED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

### 3.2 `Dataset` (cargas, consolidados, transformados)

```mermaid
stateDiagram-v2
    [*] --> STAGED
    STAGED --> PUBLISHED: importación / ejecución exitosa
    STAGED --> FAILED: error o umbral superado
    PUBLISHED --> SUPERSEDED: nueva versión del mismo alcance y período
    FAILED --> [*]
    SUPERSEDED --> [*]
```

### 3.3 `InventoryCount`

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> READY: productos cargados, participantes y asignación definidos
    READY --> DRAFT: cambios de configuración
    READY --> IN_PROGRESS: abrir ronda 1
    IN_PROGRESS --> PAUSED: supervisor pausa
    PAUSED --> IN_PROGRESS: supervisor reanuda
    IN_PROGRESS --> IN_REVIEW: ronda cerrada
    IN_REVIEW --> IN_PROGRESS: abrir ronda de reconteo
    IN_REVIEW --> CLOSED: cerrar toma
    DRAFT --> CANCELLED
    READY --> CANCELLED
    CLOSED --> [*]
    CANCELLED --> [*]
```

### 3.4 `Invitation`

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> ACCEPTED: el invitado acepta
    PENDING --> DECLINED: el invitado rechaza
    PENDING --> EXPIRED: vence el plazo
    PENDING --> REVOKED: el propietario revoca
    ACCEPTED --> [*]
    DECLINED --> [*]
    EXPIRED --> [*]
    REVOKED --> [*]
```

### 3.5 `ReportTemplate`

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PUBLISHED: publicar (versión N)
    PUBLISHED --> DRAFT: editar crea borrador N+1
    PUBLISHED --> ARCHIVED
    DRAFT --> ARCHIVED
    ARCHIVED --> [*]
```

### 3.6 `CatalogField`

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: crear (nombre único entre activos)
    ACTIVE --> ACTIVE: renombrar (DUPLICATE_FIELD_LABEL si el nombre está en uso)
    ACTIVE --> INACTIVE: desactivar (sin usos o confirmado)
    ACTIVE --> INACTIVE: reemplazar (supersededBy = clave nueva)
```

> Tipo y naturaleza de un `CatalogField` son inmutables cuando el encabezado tiene datos cargados
> o usos registrados en `field_usages`; el nombre siempre se puede cambiar. `INACTIVE` es un estado
> final: `FieldCatalog` no define una operación para reactivar; si se necesita de nuevo, se crea
> otro encabezado (con otra clave) o se usa el sucesor. Un encabezado reemplazado conserva
> `supersededBy`.
