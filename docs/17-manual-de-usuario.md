# 17 · Manual de usuario

AsisteGLT reúne en un solo lugar la **carga y análisis de reportes contables** y las **tomas
físicas de inventario**, con chat en vivo entre los participantes. Se usa desde el navegador de la
computadora o del celular; no requiere instalar nada (opcionalmente se puede «instalar» como
aplicación desde el menú del navegador).

> Todos los ejemplos de este manual usan datos ficticios.

## 1. Acceso y cuenta

| Tarea | Cómo |
|---|---|
| Crear cuenta | En la pantalla de inicio, **Registrarse**: nombre, correo y contraseña (mínimo 12 caracteres, con letras y números). |
| Iniciar sesión | Correo y contraseña. La sesión se mantiene al recargar la página. |
| Cerrar sesión | Menú de usuario → **Cerrar sesión**. |
| Cambiar contraseña | **Mi cuenta** → Cambiar contraseña. Las demás sesiones abiertas se cierran por seguridad. |
| Ver dónde está abierta la sesión | **Mi cuenta** → Sesiones activas (dispositivo y fecha). |
| Modo oscuro | Botón de luna en la barra superior. |

**Mensajes de seguridad.** Después de 5 contraseñas incorrectas la cuenta se **bloquea
temporalmente** (15 minutos, el doble si se repite). Si desde una misma red se hacen demasiados
intentos seguidos aparece «Demasiados intentos; vuelve a intentarlo en N s»: espera ese tiempo.

## 2. Proyectos

Cada proyecto es de **Reportes** o de **Inventarios** y tiene sus propios miembros, datos y chat.

1. **Proyectos → Nuevo proyecto**: elige el tipo y el nombre. Quien lo crea es *Propietario*.
2. **Compartir → Generar vínculo**: elige el rol, los días de vigencia y el número de usos. El
   vínculo se muestra **una sola vez**; quien lo abre (con su cuenta) entra con ese rol.
3. **Miembros**: cambiar el rol de alguien, quitarlo o salir del proyecto.

| Tipo | Roles que se pueden asignar | Qué puede hacer cada uno |
|---|---|---|
| Reportes | Administrador · Analista · Diseñador · Lector | El *Administrador* gestiona miembros y todo el proyecto; el *Analista* configura y carga datos, operaciones, clasificaciones e informes; el *Diseñador* crea plantillas; el *Lector* consulta informes. |
| Inventarios | Administrador · Supervisor · Contador · Auditor | El *Supervisor* asigna, reasigna, sigue el avance y cierra rondas; el *Contador* cuenta lo que tiene asignado (a ciegas); el *Auditor* consulta resultados. |

Las pestañas visibles de un proyecto dependen del rol.

## 3. Chat

- **Chat → Nueva conversación** con otra persona, o la conversación general.
- La pestaña **Chat** de un proyecto es solo para sus miembros.
- Los mensajes llegan en vivo; la lista muestra los no leídos. Un mensaje propio se puede editar
  («(editado)») o eliminar («Mensaje eliminado»).

## 4. Reportes

El flujo es: **estructura → encabezados → preconfiguración → carga → (operaciones) →
clasificaciones → informes → plantillas**.

### 4.1 Estructura organizacional

**Estructura**: organización › país (con sus monedas) › compañía (› empresa › sucursal). Cada
carga de datos se asocia a un punto de esta estructura y a un período `AAAA-MM`.

### 4.2 Encabezados (catálogo)

Son los nombres de los datos (*Código de cuenta*, *Debe*, *Haber*…). Se crean **desde una
plantilla** o uno por uno, con su tipo (texto, decimal, fecha…) y, en los decimales, su naturaleza
(monto, cantidad, tasa). Renombrar un encabezado actualiza preconfiguraciones, datos e informes sin
tener que cambiar nada más. Un encabezado en uso no se puede desactivar: el sistema dice dónde se
usa.

### 4.3 Preconfiguraciones (cómo leer un archivo)

Para reportes de texto «impresos a archivo» (ancho fijo):

1. **Preconfiguraciones → Nueva** y elige un archivo de muestra. Se lee **solo en el navegador**
   (no se sube) y se detecta la codificación.
2. **Divisorias**: «Sugerir columnas» o clic sobre el lienzo para agregar; arrastrar para mover;
   doble clic o Supr para quitar; deshacer/rehacer. Una divisoria roja corta texto: revísala.
3. **Líneas**: selecciona las líneas del encabezado de página y marca **Ignorar como encabezado de
   página**; se ignoran todas sus repeticiones aunque cambien fecha, hora o número de página.
4. **Encabezados**: asigna a cada franja un encabezado del catálogo. Para el código, usa una
   **máscara** (✨ la propone, p. ej. `9.999.999.9999`): las líneas que no la cumplen se rechazan
   con el motivo.
5. **Vista previa** → **Guardar y activar**. Los montos aceptan negativos con `-`, paréntesis o
   `CR`; un monto vacío vale 0.

**Validaciones de cuadre** (opcional): por ejemplo `=SUMA([Debe])` contra `=SUMA([Haber])` con
tolerancia `0.01`. Con «Rechazar el archivo si no cuadra» una carga que no cuadra no se publica y
los datos anteriores del período siguen vigentes; sin esa opción se publica con el aviso.

### 4.4 Cargar datos

1. **Cargar datos** y arrastra uno o varios archivos (hasta 20, de hasta 200 MB cada uno).
2. Para cada archivo se propone la preconfiguración (por extensión o patrón de nombre) y el período
   si el nombre lo trae (`…_2026_08.txt`); completa la estructura si falta.
3. **Cargar N archivos**. El estado cambia en vivo:

| Estado | Significado |
|---|---|
| En cola / Procesando | El servidor está leyendo el archivo. Archivos de un millón de líneas tardan unos minutos. |
| Publicado | Los datos ya se usan en informes. |
| Con errores | Demasiadas líneas rechazadas (más del 20 % por defecto) o un cuadre obligatorio no cumplido; se muestran las primeras líneas con su motivo. |
| Reemplazado | Se volvió a cargar el mismo período y alcance; vale la carga nueva. |

**Datos** muestra los registros publicados, con filtros por período, preconfiguración y compañía.

### 4.5 Operaciones y colecciones

- **Operaciones**: pasos que se aplican a los datos al consultarlos.
  - *Campo calculado*: fórmula sobre encabezados, p. ej. `=[Saldo anterior] + [Debe] - [Haber]`.
    La fórmula se valida mientras se escribe.
  - *Acumulado del año*: suma el mes con los anteriores del mismo año.
  - *Conversión de moneda*: usa una colección de tipos de cambio.
- **Colecciones**: tablas propias (p. ej. *Tipo de cambio*: moneda y tasa, con o sin período).

Un informe **no suma montos de monedas distintas**: la celda queda vacía con el aviso «tiene
montos en varias monedas». Convierte a una moneda común con una operación.

### 4.6 Clasificaciones e informes

- **Clasificaciones**: árbol de nodos con patrones sobre un encabezado (p. ej. `1.*` = Activo,
  `1.001.*` = Caja y bancos). El patrón más específico gana.
- **Informes**: filas por clasificación y columnas con encabezados o **columnas calculadas**
  (`=SUMA([Debe]) - SUMA([Haber])`). Muestran subtotales, «Sin clasificar» y total. Con «Solo
  registros donde… *Es cuenta de detalle*» se evita duplicar las cuentas de mayor.
- Elige el período y **Exportar CSV** (separador `;`, UTF-8; abre en hojas de cálculo).

### 4.7 Plantillas e impresión en PDF

1. **Plantillas → Nueva plantilla**: página Carta vertical con encabezado `{proyecto}` y pie
   `Página {pagina} de {paginas}` (también `{periodo}`, `{mes}`, `{año}`, `{fecha}`).
2. Agrega **Texto**, **Tabla** (un informe), **Indicador** (fórmula agregada) y **Gráfico**. Se
   arrastran y redimensionan con el ratón o el dedo, o se mueven con las flechas (1 mm; con Mayús,
   10 mm).
3. Cambia tamaño (Carta, Oficio, Legal, A4 o personalizado), orientación y formato numérico.
4. **Guardar → Vista previa**, elige el período y **Imprimir / Guardar PDF** (en el diálogo del
   navegador, «Guardar como PDF»).

## 5. Inventarios

### 5.1 Preparar la toma

1. **Tomas → Nueva toma**: nombre, tolerancia de diferencia y número de rondas.
2. **Configuración → Ítems**: un archivo CSV con títulos (SKU, Descripción, Unidad, Ubicación,
   Existencia, Costo; opcionalmente X/Y) — las columnas se proponen solas — o **Datos cargados**
   de un proyecto de Reportes, eligiendo el período y qué encabezado es cada campo (la existencia
   debe ser una *Cantidad*).
3. **Participantes**: agrega a los contadores.
4. **Iniciar toma** con una estrategia:

| Estrategia | Reparto |
|---|---|
| Por zonas | Pasillos o zonas completas repartidas en partes parecidas. |
| Por rangos | Tú indicas desde/hasta (ubicaciones) para cada contador; no se permiten rangos solapados ni ítems fuera de rango. |
| Por cercanía | Con coordenadas X/Y, cada contador recibe un bloque contiguo. |

**Abrir en otro dispositivo** muestra un código QR para abrir la toma en el celular (en el
servidor local usa la IP de la computadora, no `localhost`).

### 5.2 Contar (contador)

- **Mi conteo** muestra solo los ítems asignados, **sin la existencia esperada** (conteo a ciegas).
- Registra la cantidad; marca **No está** o **Dañado** y agrega un comentario si aplica.
- **Agregar foto** adjunta evidencias (imágenes de hasta 5 MB, 5 por ítem).
- **Sin conexión**: si se cae la red, los conteos quedan con la etiqueta «Pendiente de envío» y se
  envían solos al volver la conexión. No cierres sesión mientras haya pendientes.

### 5.3 Supervisar

- **Supervisión** muestra en vivo el avance por contador, las diferencias, las novedades (no está,
  dañado, comentarios) y el valor esperado · contado · sin contar.
- **Reasignar pendientes** pasa los ítems sin contar de un contador a otro.
- **Cerrar ronda → Recontar diferencias**: la ronda nueva incluye los ítems fuera de tolerancia,
  no encontrados y dañados, asignados a otro contador.
- **Ver fotos** abre la galería de evidencias de cada ítem.

### 5.4 Cerrar y exportar

- **Cerrar toma**: los conteos quedan definitivos.
- **Exportar resultados (CSV)** para hojas de cálculo.
- **Exportar paquete** / **Importar paquete**: lleva una toma completa a otro proyecto o servidor
  (por ejemplo, del servidor local de la bodega al servidor central); se crea «… (importada)»
  cerrada con los mismos resultados.

## 6. Preguntas frecuentes

| Situación | Qué hacer |
|---|---|
| «Cuenta bloqueada temporalmente…» | Espera el tiempo indicado o pide al administrador que verifique la cuenta. |
| «Demasiados intentos; vuelve a intentarlo en N s» | Espera los segundos indicados antes de reintentar. |
| Una carga queda «Con errores» | Abre el detalle: muestra las líneas rechazadas y el motivo (divisoria o máscara). Ajusta la preconfiguración y vuelve a cargar. |
| «tiene montos en varias monedas» en un informe | El informe mezcla compañías con monedas distintas; usa la columna convertida a una moneda común. |
| El celular no abre el QR del servidor local | Comprueba que esté en la misma red Wi-Fi y que el enlace use la IP del servidor. |
| Aviso de licencia de PrimeNG en pantalla | Es un aviso del proveedor de componentes; no afecta el funcionamiento (ver [13-puesta-en-marcha §7](13-puesta-en-marcha.md)). |
