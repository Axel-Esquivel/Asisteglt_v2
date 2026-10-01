# 01 · Análisis de requerimientos

> Documento base del proyecto **AsisteGLT v2**. Traduce la especificación original a requerimientos
> identificables (RF / RNF), actores, glosario, supuestos y preguntas abiertas. Todos los demás
> documentos (`docs/02…10`) referencian los identificadores definidos aquí.

## 1. Visión del producto

AsisteGLT es una plataforma web colaborativa y en tiempo real con dos módulos de negocio
**multiproyecto**:

| Módulo | Propósito |
|---|---|
| **Reportes** | Importar datos de **cualquier tipo de reporte** (contable, ventas directas, cobranza, producción…) desde archivos o bases de datos sin formato estándar, describir sus columnas con el **catálogo de encabezados** del proyecto, normalizarlos, clasificarlos, consolidarlos, transformarlos y diseñar informes multipágina (tablas, gráficos, tablas dinámicas, KPI) exportables a PDF, usando siempre los encabezados **por su nombre** (p. ej. *Debe*, *Haber*, *Saldo*, *Monto de venta*). |
| **Inventarios** | Importar listados de productos desde fuentes dinámicas, organizar tomas físicas de inventario con asignación inteligente de zonas por usuario, conteo guiado en tiempo real, evidencias fotográficas, supervisión en vivo y rondas de reconteo sobre diferencias. |

Sobre ambos módulos se apoyan **funciones globales**: autenticación, registro, perfil, manejo de
tokens y sesiones, seguridad por usuario, permisos granulares, compartición por vínculo o correo y
chat global / entre usuarios.

## 2. Stack tecnológico obligatorio

| Capa | Tecnología | Versión objetivo (sept. 2026) |
|---|---|---|
| Frontend | Angular (standalone, signals, zoneless) | 22.x |
| UI | **PrimeNG exclusivamente** + PrimeIcons + `@primeuix/themes` | 22.x |
| Backend | NestJS (REST + WebSockets) | 12.x |
| Base de datos | MongoDB (replica set, necesario para transacciones y change streams) | 8.x |
| ODM | Mongoose + `@nestjs/mongoose` | 9.x / 12.x |
| Caché / mensajería | Redis (caché, sesiones, presencia, rate-limit, colas BullMQ, adapter Socket.IO) | 8.x |
| Tiempo real | Socket.IO + `@socket.io/redis-adapter` | 4.8.x |
| Lenguaje | TypeScript en modo estricto (Angular 22 exige `>=6.0 <6.1`) | 6.0.x |
| Monorepo | Nx | 23.x |
| Runtime | Node.js LTS | 24 LTS (mínimo 22) |

## 3. Restricciones de diseño impuestas por el cliente

| ID | Restricción | Cómo se garantiza (detalle en [08-convenciones](08-convenciones-tipado-poo.md)) |
|---|---|---|
| **RC-01** | Programación Orientada a Objetos en todo el sistema. | Entidades, value objects, casos de uso, repositorios, estrategias, stores y mappers se modelan como **clases**; dependencias por abstracciones (clases abstractas como tokens de DI). |
| **RC-02** | Prohibido `any`. | `noImplicitAny`, `@typescript-eslint/no-explicit-any` y reglas `no-unsafe-*` como **error** en CI. |
| **RC-03** | Prohibido `undefined`. | Sin propiedades/parámetros opcionales (`?`), sin tipo `undefined`, sin `?.`; la ausencia se modela con `Nullable<T>` (`T \| null`), *Null Object* u `Optional<T>`. Las APIs de terceros que devuelven `undefined` se aíslan en adaptadores. |
| **RC-04** | Todo tipado. | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, tipos de retorno explícitos, contratos compartidos front/back, validación en fronteras (`unknown` → clase validada). |
| **RC-05** | UI solo con componentes PrimeNG. | Ninguna otra librería de componentes (ni Material, ni Bootstrap, ni CDK visual). Los componentes compuestos propios se construyen **a partir de** componentes y directivas PrimeNG. |

## 4. Actores

| Actor | Descripción |
|---|---|
| **Visitante** | Usuario no autenticado: se registra, inicia sesión, recupera contraseña, abre vínculos de invitación. |
| **Usuario** | Cualquier usuario autenticado: gestiona su perfil y sesiones, usa el chat, crea proyectos. |
| **Propietario de proyecto** | Creador del proyecto. Tiene todos los permisos y es el único que puede transferir la propiedad o eliminar el proyecto. |
| **Administrador de proyecto** | Rol delegado por el propietario: gestiona miembros, roles y configuración. |
| **Analista de datos** *(Reportes)* | Configura estructura organizacional, perfiles de importación, cargas, colecciones, clasificaciones, consolidaciones y operaciones. |
| **Diseñador de informes** *(Reportes)* | Crea y edita plantillas de informes. |
| **Lector** *(Reportes)* | Visualiza informes, cambia parámetros (período/alcance) y exporta PDF si tiene permiso. |
| **Supervisor** *(Inventarios)* | Monitorea el progreso, revisa conteos y evidencias, abre y cierra rondas. |
| **Inventariador** *(Inventarios)* | Realiza el conteo guiado de los productos asignados. |
| **Sistema (workers)** | Procesos en segundo plano: importaciones, consolidaciones, operaciones, auto-asignación, PDF, correos. |
| **Sistemas externos** | Bases de datos de origen (SQL Server, PostgreSQL, MySQL, Oracle, MongoDB), servidor SMTP. |

> Los roles de proyecto son **plantillas de permisos**; el propietario puede crear roles
> personalizados combinando permisos granulares (ver [09-seguridad-permisos](09-seguridad-permisos.md)).

## 5. Requerimientos funcionales

### 5.1 Funciones globales

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-AUT-01 | Registro con verificación de correo electrónico y política de contraseñas. | Alta |
| RF-AUT-02 | Inicio de sesión con correo + contraseña; segundo factor TOTP opcional por usuario y obligatorio por política de proyecto. | Alta |
| RF-AUT-03 | Manejo de tokens: *access token* JWT de vida corta en memoria + *refresh token* opaco rotativo en cookie `HttpOnly` con detección de reutilización. | Alta |
| RF-AUT-04 | Recuperación y cambio de contraseña con tokens de un solo uso. | Alta |
| RF-AUT-05 | Perfil: nombre, avatar, idioma, zona horaria, preferencias de notificación. | Media |
| RF-AUT-06 | Gestión de sesiones activas por dispositivo; cerrar una o todas. | Alta |
| RF-AUT-07 | Seguridad por usuario: bloqueo progresivo por intentos fallidos, *rate limiting*, alertas de inicio de sesión nuevo, bitácora de auditoría. | Alta |
| RF-CHT-01 | Chat global para todos los usuarios autenticados. | Alta |
| RF-CHT-02 | Chat directo 1:1 entre usuarios. | Alta |
| RF-CHT-03 | Canal de chat por proyecto *(propuesto: facilita la coordinación en tomas de inventario)*. | Media |
| RF-CHT-04 | Presencia (en línea), "escribiendo…", confirmaciones de lectura, contadores de no leídos, historial paginado. | Media |
| RF-PRY-01 | Crear múltiples proyectos por módulo (Reportes / Inventarios); cada módulo permite varios reportes o tipos de inventario configurables. | Alta |
| RF-PRY-02 | Compartir proyecto mediante **vínculo** (rol preasignado, expiración, límite de usos, revocable) o **correo** (invitación). | Alta |
| RF-PRY-03 | Roles predefinidos y personalizados con **permisos granulares** (acción × recurso × condición), a nivel de proyecto y de recurso individual. | Alta |
| RF-PRY-04 | Datos en tiempo real: cambios en chats, inventarios y reportes visibles al instante para los miembros conectados. | Alta |
| RF-PRY-05 | Notificaciones en la aplicación y por correo (invitaciones, importaciones finalizadas, rondas abiertas, menciones). | Media |

### 5.2 Módulo de Reportes

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-REP-01 | **Estructura organizacional** del proyecto: Organización (req.) → Países (req.) ↔ Monedas (req., N:M) → Compañías (req.) → Empresas (opcional) → Sucursales (opcional). | Alta |
| RF-REP-02 | **Preconfiguraciones con nombre** (p. ej. `balancetxt`), varias por proyecto y por tipo de archivo, con estado borrador/activa/archivada y versiones, creadas junto con el área de trabajo: tipo de fuente (texto de ancho fijo, delimitado, hoja de cálculo, base de datos), extensión, codificación, delimitador, calificador de texto, filas a omitir, hoja a leer (por nombre o primera hoja), columnas a leer y el encabezado del catálogo que corresponde a cada columna. | Alta |
| RF-REP-03 | **Asistente de ancho fijo con lienzo**: muestra el archivo tal cual con regla de caracteres; el usuario agrega, mueve y elimina líneas divisorias verticales para formar las columnas; reglas para ignorar encabezados de página repetidos (detalle en [11-importacion-ancho-fijo](11-importacion-ancho-fijo.md)). | Alta |
| RF-REP-04 | **Asistente tabular** (CSV, hoja, BD): por cada columna (1.ª, 2.ª, 3.ª…) se elige **por su nombre** un **encabezado del catálogo**, que aporta nombre, rol, tipo de dato y naturaleza, o se marca como omitida; la columna no define nombre ni tipo propios (se muestra siempre con el nombre vigente del encabezado). | Alta |
| RF-REP-05 | **Validación de carga**: las columnas identificadoras deben tener valor; cada columna valida su tipo; se descartan saltos de página, líneas en blanco, encabezados repetidos y totales; reporte de filas rechazadas. | Alta |
| RF-REP-06 | **Carga etiquetada**: cada carga se identifica con período (mes/año), organización, país, moneda, compañía, empresa (si aplica) y sucursal (si aplica); recargar el mismo alcance crea una nueva versión. | Alta |
| RF-REP-18 | **Catálogo de encabezados** por proyecto (lista previa de nombres libres, cada uno con **rol** (`id`, `id_name`, `data`), **tipo de dato** (texto, entero, decimal, fecha, sí/no) y, si es numérico, **naturaleza** (monto, cantidad, tasa, precio unitario, descriptivo) que determina qué operaciones admite; válido para reportes de cualquier tipo, no solo contables; el significado de negocio se asigna en operaciones, informes e inventarios); las columnas de toda preconfiguración se nombran eligiendo un encabezado del catálogo. El **nombre** es libre (1 a 80 caracteres, sin `[` ni `]`; p. ej. *Debe*, *Haber*, *Saldo*, *Cargos*, *Monto de venta*) y **único entre los encabezados activos del proyecto** (se compara sin distinguir mayúsculas ni tildes, recortando espacios extremos y colapsando espacios repetidos). El sistema asigna a cada encabezado una **clave interna** invisible (`FieldKey`); además de los encabezados **importados**, el usuario puede crear encabezados **derivados** como destino de una operación (p. ej. *Saldo* o *Monto de venta (USD)*). Todas las funciones posteriores eligen o escriben el encabezado **por su nombre** (ver RF-REP-20). | Alta |
| RF-REP-19 | **Carga múltiple**: varios archivos a la vez; por cada archivo se eligen preconfiguración (propuesta automáticamente por extensión y patrón de nombre), período, organización, país, moneda, compañía, empresa y sucursal; al presionar *Cargar* la extracción es automática, con progreso por archivo y resumen final (detalle en [12](12-preconfiguraciones-y-carga-multiple.md)). | Alta |
| RF-REP-20 | **Encabezados usados por su nombre en todo lo posterior**: operaciones, consolidaciones, clasificaciones, colecciones, informes (filas, columnas, dimensiones, medidas, series, KPI, filtros), fórmulas e inventarios eligen el encabezado en **selectores por su nombre** (solo se ofrecen los activos, compatibles con la operación y presentes en la fuente) o lo escriben **entre corchetes** en las fórmulas: `=[Debe] - [Haber]`, `=SUMA([Monto de venta])`, `=PROMEDIO.PONDERADO([% de descuento]; [Monto de venta])`. Toda referencia **se guarda por la clave interna** (`FieldKey`; las fórmulas en forma canónica `=[#f_6Pw4] - [#f_2Lm5]`) y **se muestra siempre con el nombre vigente**: renombrar *Debe* → *Cargos* actualiza selectores, fórmulas (`=[Cargos] - [Haber]`) y títulos de informes de inmediato, sin reconfigurar nada ni crear versiones nuevas de plantillas. Un nombre inexistente, un encabezado desactivado o ausente en la fuente, o un uso incompatible con su rol, tipo y naturaleza es un error claro (`UNKNOWN_FIELD`, `FIELD_INACTIVE`, `FIELD_NOT_IN_SOURCE`, errores de tipo; RNF-18). Desactivar un encabezado en uso exige confirmación y lista los usos por nombre; también puede **reemplazarse** por otro compatible, que toma su nombre (casos de uso CU-22, CU-33, CU-35 y CU-39; detalle en [12 §2.8](12-preconfiguraciones-y-carga-multiple.md#28-usar-los-encabezados-por-su-nombre)). | Alta |
| RF-REP-07 | **Colecciones complementarias** (p. ej. tipos de cambio, sueldos): esquema definido por el usuario con campos descritos igual que los encabezados (nombre único dentro de la colección, clave interna, tipo de dato y, si es numérico, naturaleza; p. ej. *Tasa de cierre* = Tasa); captura manual o importación; sin cálculos entre sí, pero referenciables **por su nombre** en fórmulas del informe y en la conversión de moneda (p. ej. `COLECCION("Tipo de cambio"; [Tasa de cierre]; …)` para convertir quetzales a dólares). Se guardan por identificador y clave interna, así que renombrar la colección o sus campos no rompe nada; la conversión solo acepta como factor un campo de naturaleza Tasa. | Alta |
| RF-REP-08 | **Clasificaciones**: múltiples por proyecto, jerárquicas, construidas a partir de los datos importados sobre un encabezado identificador (`id` o `id_name`) elegido **por su nombre** (p. ej. *Código de cuenta*, *Código de producto*), mediante reglas sobre código, nombre o id (igual, inicia con, contiene, termina con, rango, lista, combinaciones Y/O/NO); reporte de elementos sin clasificar o con doble clasificación. | Alta |
| RF-REP-09 | **Consolidación** de datos de una misma moneda y varias compañías; también por empresas y sucursales; el usuario elige por su nombre los encabezados por los que agrupa y los encabezados numéricos que agrega, cada uno según su naturaleza (suma, promedio ponderado; los no agregables no se admiten); definiciones reutilizables. | Alta |
| RF-REP-10 | **Operaciones sobre datos**: acumulados (valor inicial + aumenta − disminuye, o acumulado anual de un encabezado; p. ej. *Saldo* = *Saldo anterior* + *Debe* − *Haber* o *Unidades vendidas* en el año), fórmulas con encabezados por su nombre (p. ej. `=[Debe] - [Haber]`), filtros por texto (contiene / inicia / termina) que aplican una operación o un valor por defecto, columnas calculadas, filas sintéticas (p. ej. *resultado del ejercicio*), validaciones de cuadre definidas por el usuario (p. ej. `SUMA([Debe]) = SUMA([Haber])`), conversión de moneda con colecciones. Cada operación elige sus encabezados de origen por su nombre y escribe su resultado en un encabezado del catálogo, que puede ser un encabezado **derivado** creado desde el propio paso. | Alta |
| RF-REP-11 | **Tres etapas de datos**: *cargados* → *consolidados* → *transformados*; los informes pueden leer de cualquiera. | Alta |
| RF-REP-12 | **Plantillas de informe** multipágina; tamaño por página configurable (Carta, Oficio, Legal, A4, personalizado) y orientación. | Alta |
| RF-REP-13 | **Elementos de página**: tablas matriciales (filas y columnas definidas por filtros de clasificación, organización, país, moneda, compañía, empresa, sucursal, mes, año, movimiento o cualquier encabezado agrupable elegido por su nombre), medidas por encabezado (p. ej. columnas *Saldo anterior*, *Debe*, *Haber*, *Saldo actual* tituladas con su nombre vigente), totales, fórmulas entre celdas y con encabezados por su nombre (KPI, EBITDA, `=[Monto de venta] / [Unidades vendidas]`; ver RF-REP-20), referencias a otras páginas, gráficos, tablas dinámicas, textos, imágenes, formas, encabezados y pies de página. | Alta |
| RF-REP-14 | **Formato**: fuente, colores, bordes, color de valores negativos, formato numérico (decimales, miles, paréntesis, escala), formato condicional, fechas dinámicas según el período del informe. | Alta |
| RF-REP-15 | **Parámetros del informe** (período, alcance) que recalculan dinámicamente todo el informe. | Alta |
| RF-REP-16 | **Previsualización en tiempo real** y **exportación a PDF** fiel a la previsualización. | Alta |
| RF-REP-17 | Presencia y edición colaborativa (bloqueo por elemento) en el diseñador. | Media |

### 5.3 Módulo de Inventarios

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-INV-01 | Extracción dinámica de datos (BD, texto, delimitado, hoja) con **preconfiguración** de campos: producto, código, existencia teórica, cantidad encontrada, ubicación, costo, lote, unidad, etc. (reutiliza el motor de ingestión de Reportes). | Alta |
| RF-INV-02 | **Listado de tomas** de inventario y configuración de parámetros: almacén, fecha, modo (ciego / con existencia visible), tolerancia de diferencia, número máximo de rondas. | Alta |
| RF-INV-03 | Carga del listado de productos a inventariar por toma. | Alta |
| RF-INV-04 | Configurar inventariadores y supervisores; **visibilidad de campos** por rol o por usuario (algunos campos se cargan pero no se muestran al contar). | Alta |
| RF-INV-05 | **Asignación de productos**: manual por rangos y automática; los productos de un usuario quedan cercanos entre sí y las zonas de usuarios distintos quedan separadas; reasignación dinámica cuando alguien termina. | Alta |
| RF-INV-06 | **Toma guiada**: el sistema muestra a cada usuario el siguiente producto de su ruta; registra cantidad, novedad (dañado, no encontrado, otro), comentario y fotografías. | Alta |
| RF-INV-07 | **Sincronización en tiempo real**; bloqueo de producto para evitar doble conteo. | Alta |
| RF-INV-08 | **Supervisión en vivo**: progreso por usuario, conteos, diferencias y evidencias. | Alta |
| RF-INV-09 | **Rondas**: crear la ronda N+1 solo con los productos con diferencia (fuera de tolerancia) de la ronda anterior, opcionalmente con otros inventariadores. | Alta |
| RF-INV-10 | Cierre de la toma con resultados valorizados (diferencia × costo) y exportación. | Media |
| RF-INV-11 | Roles y permisos granulares otorgados por el creador o por quien tenga permiso de conceder. | Alta |

## 6. Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| RNF-01 | Tipado | Cumplimiento de RC-02, RC-03 y RC-04 verificado en CI; el build falla ante cualquier violación. |
| RNF-02 | Diseño | Cumplimiento de RC-01: arquitectura hexagonal por contexto, SOLID, patrones documentados. |
| RNF-03 | UI | Cumplimiento de RC-05; diseño responsive; la toma de inventario es *mobile-first*. |
| RNF-04 | Seguridad | OWASP ASVS nivel 2; OWASP Top 10; cifrado AES-256-GCM de credenciales de BD externas; TLS 1.2+; CSP estricta; auditoría. |
| RNF-05 | Precisión | Montos y cantidades con aritmética **decimal** (`Decimal128` en Mongo, `decimal.js` en TS). Prohibido `number` para dinero. |
| RNF-06 | Rendimiento | Importación en *streaming* (≥ 1 000 000 de líneas sin cargar el archivo en memoria); consultas de informe típicas < 2 s con caché; carga inicial del SPA < 3 s en 4G. |
| RNF-07 | Tiempo real | Latencia de eventos < 1 s p95; escalado horizontal de gateways con Redis adapter. |
| RNF-08 | Escalabilidad | API sin estado; workers independientes; colas con reintentos e idempotencia. |
| RNF-09 | Disponibilidad | Replica set de MongoDB; Redis con persistencia AOF; *health checks*. |
| RNF-10 | Observabilidad | Logs estructurados JSON con *correlation id*, métricas y trazas (OpenTelemetry). |
| RNF-11 | Calidad | Cobertura ≥ 80 % en dominio y aplicación; pruebas e2e de flujos críticos. |
| RNF-12 | Internacionalización | Español por defecto; textos externalizados; formatos regionales (GTQ, USD, fechas). |
| RNF-13 | Mantenibilidad | Monorepo, contratos compartidos front/back, límites de módulo verificados por lint. |
| RNF-14 | Accesibilidad | WCAG 2.1 AA en las pantallas principales (PrimeNG provee soporte ARIA). |
| RNF-15 | Despliegue local | La plataforma completa debe poder instalarse en un PC o laptop que actúe como servidor en una **red interna sin internet**; los móviles se conectan por Wi-Fi local. Sin dependencias de CDN ni servicios externos en tiempo de ejecución. |
| RNF-16 | Estilos | Maquetación y estilos con **SCSS** propio sobre las variables CSS del tema PrimeNG; sin frameworks de utilidades CSS. |
| RNF-18 | Seguridad de tipos en datos | Ninguna operación (consolidación, acumulado, fórmula, total de informe, conversión) puede combinar campos incompatibles; se valida en interfaz, dominio y motor de fórmulas. |
| RNF-17 | Confidencialidad | Los datos importados son sensibles: muestras procesadas en el navegador, archivos eliminados tras la carga, cifrado en reposo y en tránsito, acceso solo por permisos del proyecto. |

## 7. Glosario

| Término | Definición | Identificador en código |
|---|---|---|
| Proyecto | Espacio de trabajo de un módulo (Reportes o Inventarios) con miembros y permisos propios. | `Project` |
| Encabezado | Nombre de columna definido por el usuario, **único entre los encabezados activos del proyecto**, con rol (identificador, nombre del identificador, dato), tipo de dato, naturaleza numérica y origen (importado o derivado). Vive en el catálogo del proyecto; cada uno tiene una clave interna invisible con la que se guardan todas las referencias, y se usa y se muestra siempre por su nombre vigente. | `FieldCatalog`, `CatalogField`, `FieldKey`, `FieldLabel`, `FieldRole`, `NumericNature`, `FieldOrigin` |
| Organización / País / Moneda / Compañía / Empresa / Sucursal | Jerarquía organizacional de un proyecto de reportes. | `Organization`, `Country`, `Currency`, `Company`, `Enterprise`, `Branch` |
| Alcance (scope) | Combinación organización-país-moneda-compañía-empresa-sucursal que etiqueta una carga. | `EntityScope` |
| Período | Mes y año de una carga o de un informe. | `Period` |
| Perfil de importación | Preconfiguración de cómo leer una fuente (archivo o consulta). | `DataSourceProfile` |
| Carga | Ejecución de un perfil sobre un archivo/consulta para un período y alcance. | `DataLoad` |
| Registro | Fila normalizada y tipada producto de una carga. | `DataRecord` |
| Colección complementaria | Datos auxiliares definidos por el usuario (tipos de cambio, sueldos…). | `SupplementaryCollection` |
| Clasificación | Árbol de agrupaciones construido con reglas sobre identificadores de los registros. | `Classification` |
| Consolidación | Agregación de registros de varias entidades de la misma moneda, agrupados por los encabezados elegidos y agregando cada encabezado numérico según su naturaleza (suma, promedio ponderado o no agregable). | `ConsolidationDefinition` |
| Operación / transformación | Paso de un *pipeline* que modifica o deriva datos (acumulado, filtro, fórmula…). | `TransformationStep` |
| Plantilla de informe | Diseño multipágina con elementos vinculados a datos. | `ReportTemplate` |
| Toma de inventario | Evento de conteo físico con participantes, rondas y resultados. | `InventoryCount` |
| Ronda | Iteración de conteo; la ronda N+1 recuenta diferencias de la ronda N. | `CountRound` |
| Inventariador / Supervisor | Participantes de una toma. | `CountParticipant` |
| Evidencia | Fotografía y comentario asociados a un conteo. | `Evidence` |

## 8. Supuestos adoptados

Mientras no se indique lo contrario, el diseño asume:

1. **La estructura organizacional pertenece a cada proyecto de reportes** *(confirmado, P-01)*,
   con opción de copiarla desde otro proyecto al que el usuario tenga acceso.
2. Las **monedas** provienen de un catálogo global ISO 4217; cada país habilita un subconjunto.
3. La **consolidación** v1 agrega, según la naturaleza de cada encabezado, entidades de la misma moneda
   **sin** eliminaciones intercompañía.
4. La **toma de inventario** puede realizarse **sin internet**, en una red interna con un servidor
   local (PC o laptop) *(confirmado, P-04)*. Ver el modo de despliegue local en
   [02-arquitectura §11.1](02-arquitectura.md#111-modo-servidor-local-red-interna-sin-internet).
5. La **ubicación** de un producto es un código jerárquico (bodega‑pasillo‑estante‑nivel‑posición);
   si además hay coordenadas X/Y se usan para agrupar espacialmente.
6. Los usuarios son **globales** a la plataforma; el aislamiento de datos se hace por proyecto.
7. El **código fuente** se escribe en inglés; la interfaz y la documentación, en español.
8. Motores de BD externos v1: **SQL Server, PostgreSQL, MySQL/MariaDB, MongoDB**; Oracle en fase
   posterior (requiere cliente nativo).
9. Hojas de cálculo v1: **.xlsx** y **.csv**; **.xls/.ods** mediante conversión en el worker.

## 9. Preguntas abiertas para el cliente

| # | Pregunta | Impacto |
|---|---|---|
| P-01 | ✔ **Resuelta**: la estructura organizacional es por proyecto. | Modelo de datos de `org-structure`. |
| P-02 | ¿Se requieren eliminaciones intercompañía o ajustes manuales en la consolidación? | Alcance de RF-REP-09. |
| P-03 | ¿Qué volumen esperado de datos por carga (líneas) y cuántas cargas por mes? | Índices, particionado, tamaño de workers. |
| P-04 | ✔ **Resuelta**: sí, sin internet pero con red interna y servidor local en un PC/laptop. | Modo de despliegue local (RNF-15). |
| P-05 | ¿Las ubicaciones tienen coordenadas o solo códigos? | Estrategia de auto-asignación. |
| P-06 | ¿El chat global es para toda la plataforma o por organización cliente? | Modelo de conversaciones y moderación. |
| P-07 | ¿Además de PDF, se requiere exportar informes a Excel? | Alcance del renderizador. |
| P-08 | ✔ **Resuelta**: estilos con SCSS propio (sin Tailwind). | Convenciones de estilos (RNF-16). |
| P-09 | ¿Qué medida de "Oficio" se usa (216 × 330 mm o 216 × 340 mm)? | Preset `PageFormat.OFICIO`. |
| P-10 | ¿Se necesita SSO (Google / Microsoft) además de correo y contraseña? | Alcance de IAM. |
| P-11 | ✔ **Resuelta** (¿se puede nombrar un encabezado como se quiera —*Debe*, *Haber*, *Saldo* u otro— y usarlo siempre por ese nombre para generar informes?): sí; cada encabezado tiene un nombre libre único en el proyecto y se usa por ese nombre en operaciones, consolidación, clasificaciones, fórmulas `[Nombre]`, informes e inventarios; renombrar no rompe nada. | RF-REP-18, RF-REP-20; detalle en [12 §2.8](12-preconfiguraciones-y-carga-multiple.md#28-usar-los-encabezados-por-su-nombre). |
