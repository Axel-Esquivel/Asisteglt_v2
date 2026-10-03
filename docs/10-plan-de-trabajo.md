# 10 · Plan de trabajo inicial

## 1. Estrategia

1. **Fundaciones primero**: tipado estricto, reglas de lint, *kernel* POO y CI antes de cualquier
   funcionalidad; así las restricciones del cliente se cumplen desde el primer commit.
2. **Plataforma común** (IAM, proyectos, permisos, tiempo real, archivos, chat) antes de los módulos.
3. El **motor de ingestión** se construye una sola vez y lo consumen Reportes e Inventarios.
4. A partir de la ingestión, **dos líneas en paralelo**: Reportes (datos → informes) e Inventarios.
5. Cada fase termina con un entregable desplegable en el entorno de pruebas.

## 2. Cronograma indicativo

Supuesto: sprints de 2 semanas y un equipo de 3–4 desarrolladores full-stack que se divide en dos
líneas a partir de la fase 5. Las fechas son referenciales y se recalculan al cerrar la fase 0.

```mermaid
gantt
    title AsisteGLT v2 — plan indicativo
    dateFormat YYYY-MM-DD
    axisFormat %b %Y

    section Plataforma
    F0 Fundaciones                         :f0, 2026-10-05, 28d
    F1 Identidad y seguridad               :f1, after f0, 28d
    F2 Proyectos, permisos, tiempo real    :f2, after f1, 28d
    F3 Chat                                :f3, after f2, 14d
    M1 Plataforma base                     :milestone, m1, after f3, 0d

    section Datos
    F4 Motor de ingestión                  :f4, after f2, 42d
    M2 Ingestión operativa                 :milestone, m2, after f4, 0d

    section Reportes
    F5 Reportes datos                      :f5, after f4, 42d
    F6 Reportes informes y PDF             :f6, after f5, 56d
    M4 Reportes MVP                        :milestone, m4, after f6, 0d

    section Inventarios
    F7 Inventarios                         :f7, after f4, 42d
    M3 Inventarios MVP                     :milestone, m3, after f7, 0d

    section Salida
    F8 Endurecimiento y despliegue         :f8, after f6, 28d
    M5 Producción                          :milestone, m5, after f8, 0d
```

## 3. Fases, entregables y criterios de aceptación

### F0 · Fundaciones (2 sprints)

| Entregables | Criterios de aceptación |
|---|---|
| Monorepo Nx con `apps/web`, `apps/api`, `apps/worker` y librerías de [02-arquitectura §4](02-arquitectura.md). | `nx affected -t lint typecheck test build` pasa en CI. |
| `tsconfig` y ESLint de [08-convenciones](08-convenciones-tipado-poo.md) + reglas propias (`primeng-controls-only`). | Un PR de prueba con `any`, `undefined`, `?:`, `?.` o `<button>` nativo **falla** el CI. |
| `libs/shared/kernel`: `Entity`, `AggregateRoot`, `ValueObject`, `EntityId`, `Nullable`, `Optional`, `Result`, `DomainError`, `Decimal`, `Money`, `Period`, `Clock`, `ReadonlyDictionary`, `Collections`. | Cobertura ≥ 90 % del kernel. |
| `docker-compose`: MongoDB replica set, Redis 8, Mailpit. | `docker compose up` + `nx serve api/web` levantan todo en local. |
| Configuración tipada (`AppConfig` validado al arrancar), logs JSON con *correlation id*, `DomainErrorFilter`. | La API no arranca con variables faltantes o inválidas. |
| Shell Angular con PrimeNG 22, preset de tema, modo oscuro, localización `es`, `Toast`/`ConfirmDialog` globales. | Lighthouse accesibilidad ≥ 90 en el shell. |
| Pipeline CI (GitHub Actions): lint, typecheck, pruebas, build, `npm audit`. | Obligatorio para fusionar a `main`. |

### F1 · Identidad y seguridad (2 sprints) — RF-AUT-01…07

| Entregables | Criterios de aceptación |
|---|---|
| Registro, verificación de correo, login, logout, recuperación de contraseña. | E2E Playwright del flujo completo con Mailpit. |
| Access/refresh tokens con rotación y detección de reutilización. | Reutilizar un refresh token revoca la sesión (prueba de integración). |
| 2FA TOTP con códigos de recuperación. | Login con 2FA; recuperación con código de respaldo. |
| Perfil, avatar, sesiones activas, cierre remoto. | Cerrar una sesión invalida su access token en < 1 s. |
| Throttling, bloqueo progresivo, auditoría, alertas de nuevo dispositivo. | 6.º intento fallido bloquea; queda registro en `audit_logs`. |

### F2 · Proyectos, permisos, tiempo real y archivos (2 sprints) — RF-PRY-01…05

| Entregables | Criterios de aceptación |
|---|---|
| CRUD de proyectos por módulo; miembros; roles predefinidos y personalizados. | Matrices de [09-seguridad](09-seguridad-permisos.md) cubiertas por pruebas de autorización. |
| CASL en backend (guards + gateways) y reglas empaquetadas en el SPA (`*appCan`). | Un usuario sin permiso recibe 403 y no ve la acción en la UI. |
| Vínculos para compartir e invitaciones por correo. | Vínculo expirado o agotado es rechazado; invitación a correo sin cuenta funciona tras el registro. |
| Infraestructura Socket.IO (auth de *handshake*, salas, Redis adapter, eventos tipados). | Dos réplicas de la API entregan eventos a clientes conectados a cualquiera de ellas. |
| `FileStorage` (GridFS) con URLs firmadas; notificaciones in-app y correo. | Descarga sin firma válida → 403. |

### F3 · Chat (1 sprint) — RF-CHT-01…04

| Entregables | Criterios de aceptación |
|---|---|
| Canal global, directos 1:1, canal por proyecto. | Mensaje visible para el destinatario en < 1 s. |
| Presencia, "escribiendo…", leídos, contadores de no leídos, historial paginado por cursor. | 10 000 mensajes se navegan con *scroll* virtual fluido. |

### F4 · Motor de ingestión (3 sprints) — RF-REP-02…05, RF-REP-18, RF-REP-19, RF-REP-20, RF-INV-01

| Entregables | Criterios de aceptación |
|---|---|
| Perfiles: ancho fijo, delimitado, hoja de cálculo (.xlsx; .xls/.ods por conversión), base de datos. | Cada tipo tiene pruebas con archivos reales del cliente (ver §5). |
| `libs/shared/ingestion-core` (corte, reglas, máscaras, conversión) usada por navegador y worker. | La previsualización y la importación real producen los mismos registros (prueba de paridad). |
| `libs/shared/field-catalog` (`FieldKey`, `FieldLabel`, `CatalogField`, `FieldOperation`, `Aggregation`, `OperationCompatibility`, `FieldResolver`) y **catálogo de encabezados** (RF-REP-18, RF-REP-20): nombre libre único entre los activos, clave interna `FieldKey`, origen importado o derivado, índice de usos `field_usages`, desactivar y reemplazar ([12 §2.5–2.8](12-preconfiguraciones-y-carga-multiple.md#28-usar-los-encabezados-por-su-nombre)). | Crear *Debe* y luego *debe* o *DEBE* devuelve `DUPLICATE_FIELD_LABEL`; un nombre con `[` o `]` devuelve `INVALID_FIELD_LABEL`. Renombrar *Debe* → *Cargos* es una sola actualización de `field_catalogs`: preconfiguraciones y datos cargados no cambian y la UI muestra *Cargos* de inmediato (`catalog.changed`). Desactivar un encabezado en uso devuelve `FIELD_IN_USE` con la lista de usos por nombre; tipo y naturaleza no se pueden cambiar si tiene datos cargados o usos. |
| **Preconfiguraciones con nombre** (estados, versiones, duplicar, extensiones y patrón de nombre) cuyas columnas eligen un encabezado del catálogo por su nombre ([12](12-preconfiguraciones-y-carga-multiple.md)). | Dos preconfiguraciones para `.txt` se distinguen por patrón de nombre; cambiar el catálogo no altera cargas de versiones ya activas (instantánea `FieldSnapshot`); asignar un encabezado derivado a una columna devuelve `DERIVED_FIELD_NOT_ASSIGNABLE`; las claves de `data_records` son `FieldKey`, nunca nombres. |
| Asistente de ancho fijo con **lienzo** de divisorias, sugerencia automática, reglas de encabezado de página, máscaras de los identificadores (una opcional por cada `id`), metadatos del archivo y validaciones de cuadre definidas por el usuario ([11](11-importacion-ancho-fijo.md)); asistente tabular. | Con un reporte de balance de saldos de prueba, el analista define el perfil sin editar JSON en < 10 min; ninguna divisoria corta valores. |
| Reglas de fila, *parsers* tipados (decimal configurable, negativos con paréntesis/sufijo, fechas), identificadores obligatorios. | Saltos de página, líneas en blanco y encabezados repetidos se descartan; incidencias con línea y motivo. |
| Conexiones SQL Server, PostgreSQL, MySQL, MongoDB con credenciales cifradas y solo `SELECT`. | Consulta con `UPDATE`/`DELETE` es rechazada; *timeout* respetado. |
| `ImportJob` en BullMQ con progreso en tiempo real y umbral de rechazos. | Archivo de 1 000 000 de líneas se importa sin superar 512 MB de memoria en el worker. |

### F5 · Reportes: datos (3 sprints) — RF-REP-01, 06…11, RF-REP-20

| Entregables | Criterios de aceptación |
|---|---|
| Estructura organizacional con validación de `EntityScope`. | No se puede cargar con moneda no habilitada en el país. |
| Cargas etiquetadas por período y alcance con versionado. | Recargar el mismo alcance y período deja la versión anterior `SUPERSEDED` de forma atómica. |
| **Carga múltiple**: ventana con propiedades por archivo, autocompletado (patrón de nombre, encabezado, últimos valores), validación previa, lotes en segundo plano con progreso por archivo. | 12 archivos de 4 compañías se cargan con un solo clic tras revisar la tabla; un archivo con error no detiene a los demás; el usuario puede cerrar la ventana y recibe el resumen. |
| Colecciones complementarias (plantilla "Tipo de cambio"), con campos nombrados y tipados como encabezados. | Captura manual e importación; búsqueda por clave y período; `=COLECCION("Tipo de cambio"; [Tasa de cierre]; …)` resuelve el campo por su nombre y sigue funcionando tras renombrarlo. |
| Clasificaciones con reglas, árbol drag & drop, cobertura y membresías materializadas. | Reporte de no clasificados y doble clasificación; recálculo automático tras nueva carga. Se configuran una clasificación por *Código de producto* (ventas) y otra por *Código de cuenta* (contable), eligiendo el encabezado por su nombre en «Clasificar por»; el selector no ofrece números ni fechas (por API, `FIELD_NOT_CLASSIFIABLE`) y renombrar el encabezado no altera las membresías. |
| Consolidación misma moneda (compañía / empresa / sucursal), que agrupa por los encabezados elegidos por nombre y agrega cada valor según su naturaleza. | Suma de 3 compañías = suma manual verificada con `Decimal`. Una consolidación de ventas agrupa por *Código de producto* + *Código de tienda*, suma *Monto de venta* y *Unidades vendidas* y pondera *Precio unitario* por *Unidades vendidas*; *Vendedor* no aparece como valor a agregar y agregarlo por API devuelve `FIELD_NOT_AGGREGATABLE`; *% de descuento* solo se ofrece con promedio ponderado por *Monto de venta* (nunca suma). |
| Pipelines: filtros de texto, asignación condicional, campos calculados, acumulados, conversión de moneda, filas sintéticas, cuadre. | Caso contable de referencia (saldo = saldo anterior + debe − haber; resultado del ejercicio) reproduce el resultado esperado; un caso de **ventas directas** (sin debe/haber) se importa, acumula y consolida con la misma configuración genérica. Los destinos de campos calculados y acumulados son encabezados derivados creados desde el paso con «Nuevo encabezado…» (p. ej. *Saldo*, *Precio promedio* o *Unidades del año*) y aparecen por su nombre en los pasos e informes posteriores; un destino de tipo o naturaleza distinta al resultado devuelve `TARGET_TYPE_MISMATCH`. |
| `libs/shared/formula-engine` (lexer, parser, AST con referencias `[Encabezado]`, resolución nombre ↔ `FieldKey` con `FieldResolver`, forma canónica `CompiledFormula`, `FormulaFormatter`, `TypeChecker` con `OperationCompatibility`, evaluador, dependencias, funciones). | Pruebas basadas en propiedades; detección de referencias circulares. `=[Debe] - [Haber]` y `=SUMA([Monto de venta])` compilan y se guardan en forma canónica (`=[#f_6Pw4] - [#f_2Lm5]`). `=[Vendedor] + [Monto de venta]` da «No se puede sumar Texto con Número decimal» y `=SUMA([% de descuento])` da «Una tasa no se puede sumar; use PROMEDIO.PONDERADO». Una fórmula guardada evalúa igual tras renombrar *Debe* → *Cargos* y se muestra como `=[Cargos] - [Haber]`. Un nombre inexistente, desactivado o ausente en la fuente da un error claro (`UNKNOWN_FIELD`, `FIELD_INACTIVE`, `FIELD_NOT_IN_SOURCE`). |

**Estado de F5 en el código** (ver [14 · Guía de pruebas](14-guia-de-pruebas.md) §5):

- Hecho: estructura organizacional y alcances, cargas versionadas, carga múltiple, colecciones
  complementarias con captura manual, clasificaciones por patrones, `formula-engine` (forma
  canónica, nombres vigentes, tipos y naturaleza), operaciones (campos calculados, acumulado del
  año, conversión de moneda con colecciones), columnas calculadas en informes, informes que no
  suman monedas distintas y validaciones de cuadre por preconfiguración (bloqueantes o con aviso).
- Pendiente: `COLECCION()` dentro de fórmulas, importación de colecciones desde archivo,
  definiciones de consolidación con eliminaciones, filtros de texto, asignación condicional y
  filas sintéticas en las operaciones, y pruebas basadas en propiedades del motor de fórmulas.

### F6 · Reportes: informes y PDF (4 sprints) — RF-REP-12…17, RF-REP-20

| Entregables | Criterios de aceptación |
|---|---|
| Modelo de plantilla, páginas (Carta, Oficio, Legal, A4, personalizada), encabezado/pie. | Plantilla de 5 páginas con formatos mixtos. |
| Diseñador: lienzo, paleta, propiedades, deshacer/rehacer, bloqueo por elemento y presencia. | Dos diseñadores editan la misma plantilla sin sobrescribirse. |
| Tabla matricial (filas/columnas por filtros o por cualquier encabezado agrupable, medidas por encabezado, fórmulas, totales, referencias entre páginas). | Balance general y estado de resultados de referencia con EBITDA calculado, **y** un informe de ventas directas, ambos construidos eligiendo encabezados por nombre. El informe de ventas tiene filas por *Código de tienda*, columnas de mes actual y acumulado del año, celdas de *Monto de venta* y una fila de fórmula `=[Monto de venta] / [Unidades vendidas]` (Precio unitario). Renombrar un encabezado actualiza los títulos sin editar la plantilla ni crear una versión nueva. |
| Tabla dinámica (`TreeTable`), gráficos (`Chart`), KPI, textos con fechas dinámicas, imágenes, formas. | Cambiar el período actualiza todos los elementos y textos. Tabla dinámica con filas por *Vendedor*, columnas por mes y subtotales de *Monto de venta*; gráfico con las series *Monto de venta* y *Unidades vendidas*; KPI `=SUMA([Monto de venta])`. El selector de medidas y series no ofrece textos y *% de descuento* solo se subtotaliza con promedio ponderado (nunca se suma). |
| Formato numérico y condicional (negativos en rojo, paréntesis, escala). | Coincidencia visual con el diseño de referencia del cliente. |
| Motor de consultas con caché Redis e invalidación por versión de datos y por versión del catálogo (`catalogVersion`); validación de referencias al publicar y al calcular. | Informe típico (≈ 500 celdas) < 2 s sin caché y < 300 ms con caché. Publicar una plantilla que referencia un encabezado desactivado devuelve `FIELD_INACTIVE` indicando el elemento afectado. |
| Exportación PDF con Chromium sobre la ruta de impresión. | Prueba visual de regresión: PDF vs previsualización. |

**Estado de F6 en el código:** plantillas multipágina (Carta, Oficio, Legal, A4 o personalizada,
vertical u horizontal) con encabezado y pie con marcadores; elementos Texto, Tabla (un informe
matricial), Indicador (fórmula agregada) y Gráfico (barras, líneas o circular sobre columnas de un
informe); diseñador con arrastre y redimensionado en milímetros; formato numérico (decimales,
miles, escala, negativos con paréntesis o en rojo); vista de impresión con `@page` por página para
imprimir o guardar como PDF desde el navegador. Pendiente: tabla dinámica, filas/columnas por
filtros y fórmulas entre celdas y páginas, imágenes y formas, formato condicional, edición
simultánea con bloqueo, deshacer/rehacer, PDF en el servidor y caché Redis.

### F7 · Inventarios (3 sprints, en paralelo con F5–F6) — RF-INV-01…11, RF-REP-20

| Entregables | Criterios de aceptación |
|---|---|
| Tomas: parámetros, carga de productos (motor F4), paso «Mapeo de campos» (SKU, descripción, existencia, costo unitario, unidad, ubicación y coordenadas elegidos por nombre), participantes, visibilidad de campos por nombre. | En modo ciego el inventariador no recibe `expectedQuantity` ni `unitCost` (ni en la respuesta de la API). Mapear como existencia un encabezado que no es Cantidad devuelve `FIELD_NATURE_MISMATCH`; sin costo unitario mapeado, las diferencias no se valorizan. |
| Estrategias: manual por rangos, zonas contiguas, clúster espacial; reasignación dinámica. | Con 4 usuarios y 2 000 productos en 20 pasillos, ningún pasillo queda compartido y la carga difiere < 10 %. |
| Conteo guiado móvil con bloqueo de producto, novedades, comentarios y fotos; cola local de reenvío. | Dos usuarios nunca cuentan el mismo producto en la misma ronda. |
| Monitoreo en vivo del supervisor, evidencias, rondas de reconteo sobre diferencias. | Ronda 2 contiene exactamente los productos fuera de tolerancia + no encontrados + dañados. |
| Cierre con resultados valorizados y exportación. | Totales valorizados cuadran con `Decimal`. |
| **Modo servidor local**: paquete Docker Compose instalable sin internet, CA local, QR de acceso, PWA, exportar/importar paquete de toma. | Toma completa con 3 móviles en una red Wi-Fi sin internet; cortes de Wi-Fi de 2 min sin pérdida de conteos. |

**Estado de F7 en el código (completa):** tomas con ítems desde archivo o desde datos cargados
(mapeo de encabezados por nombre: la existencia debe ser Cantidad y el costo Precio unitario,
`FIELD_NATURE_MISMATCH`), coordenadas opcionales; estrategias por zonas, rangos de ubicación y
cercanía (bloques contiguos con carga equilibrada); conteo a ciegas con novedades, comentarios y
fotos de evidencia; supervisión en vivo, reasignación dinámica, rondas de reconteo (fuera de
tolerancia + no encontrados + dañados), cierre valorizado con `Decimal` y exportación CSV; cola
local de reenvío ante cortes de Wi-Fi, PWA instalable, acceso por QR, paquete Docker de servidor
local con CA propia y exportar/importar paquete de toma.

### F8 · Endurecimiento y despliegue (2 sprints)

| Entregables | Criterios de aceptación |
|---|---|
| Revisión OWASP ASVS L2 y pruebas de penetración básicas. | Sin hallazgos altos abiertos. |
| Pruebas de carga (k6): API, sockets, importaciones, informes. | Cumple RNF-06 y RNF-07. |
| Observabilidad (OpenTelemetry, métricas, alertas), respaldos de MongoDB y Redis. | Restauración de respaldo probada. |
| Despliegue productivo (Kubernetes o Docker Compose) con TLS. | Despliegue repetible desde CI. |
| Manuales de usuario y de operación. | Revisados por el cliente. |

## 4. Definición de terminado (DoD)

- Cumple las reglas de [08-convenciones](08-convenciones-tipado-poo.md) (lint y typecheck en verde).
- Pruebas unitarias y de integración del cambio; cobertura ≥ 80 % en dominio y aplicación.
- Autorización verificada (prueba de 403) para cada endpoint y evento nuevo.
- UI construida solo con PrimeNG, responsive y en español.
- Contratos actualizados en `libs/shared/contracts`; documentación de `docs/` actualizada si cambia
  el modelo.
- Revisión de código aprobada y despliegue en el entorno de pruebas.

## 5. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|:-:|:-:|---|
| R-01 | Complejidad del motor de fórmulas y de la tabla matricial. | Alta | Alto | Librería aislada que solo depende de `kernel` y `field-catalog`; pruebas basadas en propiedades; empezar en F5 antes del diseñador. |
| R-02 | PrimeNG no tiene componente de tabla dinámica ni de diseñador de páginas. | Alta | Medio | Componentes compuestos sobre `TreeTable`, `Table`, `pDraggable`/`pDroppable`; funcionalidades acotadas en v1. |
| R-03 | Fidelidad del PDF frente a la previsualización. | Media | Alto | Misma ruta de renderizado para ambos; pruebas visuales de regresión. |
| R-04 | Volumen de `data_records` degrada consultas. | Media | Alto | Índices compuestos, agregaciones por tabla, caché, datos sintéticos de carga desde F4; plan de *sharding*. |
| R-05 | Archivos de origen muy heterogéneos (codificaciones, formatos de número). | Alta | Medio | **Solicitar al cliente un banco de archivos reales** antes de F4; asistente con previsualización. |
| R-06 | Tomas sin internet (confirmado). | Alta | Alto | Modo servidor local (ADR-11), PWA con cola en IndexedDB, paquetes de sincronización; prueba de campo en F7. |
| R-07 | Tipos `any` en librerías de terceros (PrimeNG, Mongoose, Socket.IO). | Alta | Bajo | Adaptadores y *decoders* en las fronteras; reglas `no-unsafe-*`. |
| R-08 | Seguridad de conexiones a BD externas (SSRF, inyección). | Media | Alto | Solo `SELECT` validado, lista blanca de hosts, credenciales cifradas, usuario de solo lectura. |
| R-09 | Alcance amplio frente a tiempos. | Alta | Alto | MVP por módulo priorizando RF "Alta"; RF "Media" como incremento posterior. |
| R-10 | Errores de redondeo en cálculos contables. | Baja | Alto | `Decimal` extremo a extremo (`Decimal128` en BD), pruebas de cuadre. |

## 6. Próximos pasos inmediatos

1. Revisar este análisis con el cliente y responder las **preguntas abiertas** de
   [01-analisis §9](01-analisis-requerimientos.md#9-preguntas-abiertas-para-el-cliente).
2. Obtener un **banco de archivos de ejemplo** (texto de ancho fijo, CSV, Excel) y, si es posible,
   acceso de solo lectura a una BD de prueba del sistema contable/inventario del cliente.
3. Obtener un **informe de referencia** (p. ej. balance general + estado de resultados + EBITDA)
   para usarlo como criterio de aceptación de F5–F6.
4. Iniciar **F0**: generar el monorepo Nx, configurar TypeScript/ESLint estrictos y el *kernel*.
