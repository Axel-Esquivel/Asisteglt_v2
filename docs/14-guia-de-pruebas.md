# 14 · Guía de pruebas de funcionamiento

Recorridos sugeridos para la fase de pruebas. Arranque: `npm run start:demo` (datos ficticios,
ver [13 §2](13-puesta-en-marcha.md#2-arranque-rápido-de-demostración-sin-base-de-datos)) o con
MongoDB para probar persistencia. Para ver el tiempo real, usa dos navegadores (o una ventana
privada) con usuarios distintos.

## 1. Identidad y sesiones

| # | Paso | Resultado esperado |
|---|---|---|
| 1.1 | Registrarse en `/auth/register` | Entra a `/app`; al recargar la página la sesión sigue activa |
| 1.2 | Cinco contraseñas incorrectas | La cuenta se bloquea temporalmente («Cuenta bloqueada») |
| 1.3 | Mi cuenta → cambiar contraseña | Se cierran las demás sesiones; aparecen en «Sesiones activas» |
| 1.4 | Cerrar sesión y abrir `/app` | Redirige a `/auth/login` |

## 2. Proyectos, miembros y compartir

| # | Paso | Resultado esperado |
|---|---|---|
| 2.1 | Crear un proyecto de Reportes y otro de Inventarios | Cada uno muestra pestañas según el módulo y tu rol |
| 2.2 | Compartir → generar vínculo (rol, días, usos) | El vínculo se muestra una sola vez; otra persona se une con ese rol |
| 2.3 | Miembros → cambiar rol / quitar / salir | Las pestañas visibles cambian según los permisos |

## 3. Chat

| # | Paso | Resultado esperado |
|---|---|---|
| 3.1 | Chat → nueva conversación con otra persona | Los mensajes llegan en vivo; en la lista aparece el contador de no leídos |
| 3.2 | Editar o eliminar un mensaje propio | Los demás ven «(editado)» o «Mensaje eliminado» |
| 3.3 | Pestaña Chat de un proyecto | Solo participan sus miembros |

## 4. Reportes: configuración e importación

Proyecto de demostración: **Demo · Balance ficticio** (o crea uno nuevo).

| # | Paso | Resultado esperado |
|---|---|---|
| 4.1 | Estructura: organización › país (monedas) › compañía | Árbol con monedas por país |
| 4.2 | Encabezados: «Desde plantilla» o «Nuevo encabezado» | Nombres libres y únicos (sin distinguir mayúsculas ni tildes); una tasa no permite «Suma» |
| 4.3 | Renombrar un encabezado (p. ej. *Debe* → *Cargos*) | Preconfiguraciones, datos e informes muestran el nombre nuevo sin cambiar nada más |
| 4.4 | Preconfiguraciones → Nueva: elegir un archivo de texto de muestra | El archivo se lee en el navegador; se ven líneas, ancho y codificación (detecta Windows-1252) |
| 4.5 | Divisorias: «Sugerir columnas», clic para agregar, arrastrar, doble clic o Supr para quitar, ← → y Enter con el teclado, deshacer/rehacer | Las franjas se ven en el lienzo; una divisoria roja indica que corta valores |
| 4.6 | Líneas: seleccionar en la canaleta las líneas del encabezado → «Ignorar como encabezado de página» | Se ignoran todas sus repeticiones aunque cambien fecha, hora o página |
| 4.7 | Encabezados: asignar un encabezado del catálogo a cada franja; máscara para el código (✨ la propone) | Las líneas que no cumplen la máscara aparecen rechazadas con el motivo |
| 4.8 | Vista previa → «Guardar y activar» | Se ven los valores convertidos (montos, negativos con `-`, paréntesis o `CR`, vacío = 0) |
| 4.9 | Cargar datos: arrastrar varios archivos | La preconfiguración se elige por extensión/patrón, el período sale del nombre (`…_2026_08.txt`) y la estructura se completa si hay una sola opción |
| 4.10 | «Cargar N archivos» | El estado pasa a «Procesando» y «Publicado» en vivo; con muchos rechazos queda «Con errores» con las líneas y motivos |
| 4.11 | Volver a cargar el mismo período y alcance | La carga anterior queda «Reemplazado» y los datos se sustituyen |
| 4.12 | Datos | Tabla paginada con los encabezados por su nombre y filtros por período, preconfiguración y compañía |

## 5. Reportes: clasificaciones e informes

| # | Paso | Resultado esperado |
|---|---|---|
| 5.1 | Clasificaciones → nueva, «Clasificar por» *Código de cuenta*, nodos con patrones (`1.*`, `1.001.*`) | El patrón más específico gana |
| 5.2 | Informes → nuevo: filas por clasificación, columnas *Saldo anterior*, *Debe*, *Haber* | Subtotales por nodo superior, fila «Sin clasificar» y total |
| 5.3 | Activar «Solo registros donde… *Es cuenta de detalle*» | Los totales ya no duplican las cuentas de mayor |
| 5.4 | Cambiar el período y exportar CSV | El CSV abre en hojas de cálculo (separador `;`, UTF-8) |
| 5.5 | Operaciones → Agregar paso «Campo calculado», «Nuevo encabezado…» *Saldo final* (Decimal, Monto), fórmula `=[Saldo anterior] + [Debe] - [Haber]` | La fórmula se valida al escribir («Resultado: Monto»); una mezcla de texto y número se rechaza |
| 5.6 | Guardar y abrir Datos | Aparece la columna *Saldo final* calculada en cada registro |
| 5.7 | Paso «Acumulado del año» sobre *Debe* (destino Monto) con cargas de dos meses del mismo año | El acumulado suma el mes y los meses anteriores del mismo identificador |
| 5.8 | Usar *Saldo final* como columna de un informe; intentar desactivar el encabezado | El informe lo totaliza; la desactivación avisa «se usa en: Operación 1» |
| 5.9 | Colecciones → nueva *Tipo de cambio* con campos *Moneda* (Texto) y *Tasa de cierre* (Decimal, Tasa); filas `GTQ` / `7.75` (sin período) y `GTQ` / `8` (un período) | Una tasa vacía, negativa o con coma decimal se rechaza al guardar |
| 5.10 | Operaciones → «Conversión de moneda» de *Saldo final* a *Saldo final USD* con la colección, cotización «moneda del registro por 1 de destino» y destino `USD` | En Datos, *Saldo final USD* = saldo ÷ tasa del período (o la vigente más reciente) |
| 5.11 | Cargar el mismo período para una compañía en `USD` e informe con *Saldo final* | La celda queda vacía con el aviso «tiene montos en varias monedas»; *Saldo final USD* sí se suma |
| 5.12 | Diseño del informe → «Agregar columna calculada» `=SUMA([Debe]) - SUMA([Haber])` | Se valida al escribir («Resultado: Monto») y se calcula por fila y en el total |

## 6. Inventarios

Proyecto de demostración: **Demo · Bodega ficticia** (toma ya iniciada; entra como
`contador1@…` y `contador2@…` en otras ventanas).

| # | Paso | Resultado esperado |
|---|---|---|
| 6.1 | Tomas → Nueva toma (tolerancia y rondas) | Estado «En preparación» |
| 6.2 | Configuración: archivo CSV con títulos (SKU, Descripción, Unidad, Ubicación, Existencia, Costo) | Las columnas se proponen solas; se pueden reasignar |
| 6.3 | Participantes → Iniciar toma | Zonas completas (A, B, C…) repartidas entre contadores |
| 6.4 | Como contador: Mi conteo | Solo ve sus ítems, sin la existencia esperada (conteo a ciegas); funciona en el celular |
| 6.5 | Como supervisor: Supervisión | Avance por contador, diferencias y valor de la diferencia en vivo |
| 6.6 | Cerrar ronda → «Recontar diferencias» | Ronda 2 solo con ítems fuera de tolerancia, asignados a otro contador |
| 6.7 | Cerrar toma | Estado «Cerrada»; conteos definitivos |

## 7. Pendiente después de esta fase

- Diseñador de informes multipágina con fórmulas (`[Nombre]`), gráficos, KPI y PDF (docs/04 §10-11).
- Consolidación entre compañías con eliminaciones, importación de colecciones desde archivo y `COLECCION()` en fórmulas.
- Otros tipos de fuente (delimitado, hoja de cálculo, BD), metadatos de archivo y validaciones de cuadre.
- Inventarios: evidencias fotográficas, mapeo desde un conjunto de datos de Reportes, visibilidad por rol.
- 2FA, invitación por correo, colas BullMQ/Redis para varias instancias y la decisión de licencia PrimeUI.
