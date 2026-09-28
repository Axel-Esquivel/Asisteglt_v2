# 03 · Diagramas de funcionalidad y casos de uso

## 1. Mapa funcional (descomposición)

```mermaid
mindmap
  root((AsisteGLT))
    Funciones globales
      Identidad
        Registro y verificación
        Inicio de sesión y 2FA
        Tokens y sesiones
        Recuperar contraseña
        Perfil
      Seguridad
        Bloqueo progresivo
        Rate limiting
        Auditoría
      Proyectos
        Crear por módulo
        Compartir por vínculo
        Invitar por correo
        Roles y permisos granulares
      Chat
        Global
        Directo
        Por proyecto
        Presencia y leídos
      Notificaciones
    Reportes
      Estructura organizacional
        Organización
        Países y monedas
        Compañías
        Empresas
        Sucursales
      Ingestión
        Perfiles de importación
        Asistente ancho fijo
        Asistente tabular
        Cargas por período y alcance
        Validación y rechazos
      Datos
        Colecciones complementarias
        Clasificaciones
        Consolidación
        Operaciones y acumulados
      Informes
        Plantillas multipágina
        Tablas matriciales
        Tablas dinámicas
        Gráficos
        Fórmulas y KPI
        Formato y encabezados
        Previsualización en vivo
        Exportar PDF
    Inventarios
      Fuentes y perfiles
      Tomas de inventario
        Parámetros
        Carga de productos
        Participantes y visibilidad
      Asignación
        Manual por rangos
        Automática por zonas
        Reasignación dinámica
      Conteo guiado
        Cantidad y novedades
        Comentarios y fotos
      Supervisión en vivo
      Rondas de reconteo
      Cierre y resultados
```

## 2. Casos de uso — Funciones globales

```mermaid
flowchart LR
    visitante(["👤 Visitante"])
    usuario(["👤 Usuario"])
    propietario(["👤 Propietario / Admin"])
    sistema(["⚙️ Sistema"])

    subgraph iam["Identidad y seguridad"]
        uc01(["CU-01 Registrarse"])
        uc02(["CU-02 Verificar correo"])
        uc03(["CU-03 Iniciar sesión"])
        uc04(["CU-04 Validar 2FA"])
        uc05(["CU-05 Renovar sesión (refresh)"])
        uc06(["CU-06 Recuperar contraseña"])
        uc07(["CU-07 Gestionar perfil"])
        uc08(["CU-08 Gestionar sesiones activas"])
        uc09(["CU-09 Activar 2FA"])
    end

    subgraph prj["Proyectos y acceso"]
        uc10(["CU-10 Crear proyecto"])
        uc11(["CU-11 Compartir por vínculo"])
        uc12(["CU-12 Invitar por correo"])
        uc13(["CU-13 Aceptar invitación"])
        uc14(["CU-14 Gestionar roles y permisos"])
        uc15(["CU-15 Gestionar miembros"])
    end

    subgraph chat["Chat"]
        uc16(["CU-16 Chatear en canal global"])
        uc17(["CU-17 Chatear 1:1"])
        uc18(["CU-18 Chatear en canal de proyecto"])
    end

    visitante --- uc01
    visitante --- uc03
    visitante --- uc06
    visitante --- uc13
    uc01 -. include .-> uc02
    uc04 -. extend .-> uc03
    usuario --- uc07
    usuario --- uc08
    usuario --- uc09
    usuario --- uc10
    usuario --- uc16
    usuario --- uc17
    usuario --- uc18
    propietario --- uc11
    propietario --- uc12
    propietario --- uc14
    propietario --- uc15
    sistema --- uc05
```

## 3. Casos de uso — Módulo de Reportes

```mermaid
flowchart LR
    analista(["👤 Analista de datos"])
    disenador(["👤 Diseñador de informes"])
    lector(["👤 Lector"])
    worker(["⚙️ Worker"])

    subgraph cfg["Configuración del área de trabajo"]
        r01(["CU-20 Definir estructura organizacional"])
        r02(["CU-21 Crear perfil de importación"])
        r03(["CU-22 Asistente de ancho fijo"])
        r04(["CU-23 Asistente tabular"])
        r05(["CU-24 Registrar conexión a BD"])
    end

    subgraph datos["Gestión de datos"]
        r06(["CU-25 Cargar datos"])
        r07(["CU-26 Revisar rechazos"])
        r08(["CU-27 Gestionar colección complementaria"])
        r09(["CU-28 Definir clasificación"])
        r10(["CU-29 Definir consolidación"])
        r11(["CU-30 Definir pipeline de operaciones"])
        r12(["CU-31 Ejecutar consolidación / pipeline"])
    end

    subgraph inf["Informes"]
        r13(["CU-32 Diseñar plantilla"])
        r14(["CU-33 Configurar tabla matricial"])
        r15(["CU-34 Insertar gráfico / tabla dinámica"])
        r16(["CU-35 Escribir fórmula"])
        r17(["CU-36 Previsualizar informe"])
        r18(["CU-37 Exportar PDF"])
        r19(["CU-38 Cambiar parámetros (período / alcance)"])
    end

    analista --- r01
    analista --- r02
    analista --- r05
    analista --- r06
    analista --- r07
    analista --- r08
    analista --- r09
    analista --- r10
    analista --- r11
    analista --- r12
    r03 -. extend .-> r02
    r04 -. extend .-> r02
    r05 -. extend .-> r02
    r06 -. include .-> r07
    disenador --- r13
    r13 -. include .-> r14
    r13 -. include .-> r15
    r16 -. extend .-> r14
    disenador --- r17
    lector --- r17
    lector --- r18
    lector --- r19
    worker --- r12
    worker --- r18
```

## 4. Casos de uso — Módulo de Inventarios

```mermaid
flowchart LR
    admin(["👤 Propietario / Admin"])
    supervisor(["👤 Supervisor"])
    contador(["👤 Inventariador"])
    worker(["⚙️ Worker"])

    subgraph prep["Preparación"]
        i01(["CU-40 Crear perfil de fuente"])
        i02(["CU-41 Crear toma de inventario"])
        i03(["CU-42 Cargar listado de productos"])
        i04(["CU-43 Configurar participantes"])
        i05(["CU-44 Configurar visibilidad de campos"])
        i06(["CU-45 Asignar rangos manualmente"])
        i07(["CU-46 Auto-asignar por zonas"])
    end

    subgraph ejec["Ejecución"]
        i08(["CU-47 Iniciar ronda"])
        i09(["CU-48 Contar siguiente producto"])
        i10(["CU-49 Reportar novedad con evidencia"])
        i11(["CU-50 Monitorear progreso en vivo"])
        i12(["CU-51 Revisar evidencias"])
        i13(["CU-52 Reasignar productos"])
    end

    subgraph cierre["Cierre"]
        i14(["CU-53 Cerrar ronda"])
        i15(["CU-54 Abrir ronda de reconteo"])
        i16(["CU-55 Cerrar toma y exportar resultados"])
    end

    admin --- i01
    admin --- i02
    admin --- i03
    admin --- i04
    admin --- i05
    admin --- i06
    admin --- i07
    supervisor --- i08
    supervisor --- i11
    supervisor --- i12
    supervisor --- i13
    supervisor --- i14
    supervisor --- i15
    supervisor --- i16
    contador --- i09
    i10 -. extend .-> i09
    i15 -. include .-> i07
    worker --- i07
    worker --- i13
```

> Notación UML: `include` apunta del caso base al caso incluido (siempre se ejecuta); `extend`
> apunta del caso extensor al caso base (comportamiento opcional bajo una condición).

## 5. Especificación de casos de uso críticos

### CU-03 · Iniciar sesión

| Campo | Detalle |
|---|---|
| Actor | Visitante |
| Precondición | Cuenta `ACTIVE` con correo verificado. |
| Flujo principal | 1. Ingresa correo y contraseña. 2. El sistema aplica *rate limit* por IP y por cuenta. 3. Verifica la contraseña (argon2id). 4. Si el usuario tiene 2FA, responde `TWO_FACTOR_REQUIRED` con un *challenge token* de 5 min (CU-04). 5. Crea `Session` y familia de refresh tokens. 6. Devuelve *access token* (15 min) en el cuerpo y *refresh token* en cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. 7. Registra auditoría `LOGIN_SUCCEEDED`. |
| Flujos alternos | 3a. Contraseña inválida → incrementa contador; al 5.º intento bloqueo de 15 min, duplicándose en cada bloqueo; auditoría `LOGIN_FAILED`. 5a. Dispositivo nuevo → correo de alerta. |
| Postcondición | Sesión activa visible en CU-08. |

### CU-22 · Asistente de ancho fijo

| Campo | Detalle |
|---|---|
| Actor | Analista de datos |
| Precondición | Proyecto de reportes con permiso `create:DataSourceProfile`. |
| Flujo principal | 1. Selecciona tipo *Texto de ancho fijo*, extensión y codificación (UTF-8, Windows-1252, ISO-8859-1). 2. Sube un archivo de muestra. 3. El sistema muestra las primeras 200 líneas en fuente monoespaciada con una regla de caracteres. 4. El analista marca cortes (clic en la regla o edición de inicio/longitud en tabla). 5. Por cada columna define nombre, **tipo de dato**, **rol** (código, nombre, id, valor, debe, haber, saldo, atributo, fecha), si es **requerida** y si se **omite**. 6. Define reglas de fila: omitir líneas en blanco, saltos de página (`\f`), líneas que contengan un patrón (p. ej. "Página", "Total"), primeras N líneas. 7. El sistema previsualiza el resultado tipado marcando en rojo las filas que se rechazarían y el motivo. 8. Guarda el perfil. |
| Reglas | Toda columna con rol identificador es **requerida** automáticamente. Las columnas no pueden superponerse. Los números admiten separador decimal/miles configurable y negativos con signo inicial, final, paréntesis o sufijo `CR`. |
| Postcondición | Perfil versionado disponible para CU-25. |

### CU-25 · Cargar datos

| Campo | Detalle |
|---|---|
| Actor | Analista de datos |
| Flujo principal | 1. Elige perfil. 2. Selecciona período (mes/año) y alcance: organización, país, moneda, compañía (requeridos), empresa y sucursal (si existen). 3. Sube archivo (o ejecuta la consulta configurada). 4. El sistema crea `ImportJob` en cola. 5. El worker lee en *streaming*, aplica reglas de fila, mapea y valida columnas, persiste en lotes de 5 000 registros con estado `STAGED`. 6. Al terminar, publica la carga como nueva **versión** del alcance+período (la anterior pasa a `SUPERSEDED`) en una transacción. 7. Notifica `load.completed`; se encolan recálculos de clasificación. |
| Flujos alternos | 5a. Filas rechazadas → se guardan hasta 1 000 incidencias con línea, columna, código y fragmento; si superan el umbral configurado (p. ej. 5 %) la carga queda `FAILED` y no se publica. |

### CU-33 · Configurar tabla matricial

| Campo | Detalle |
|---|---|
| Actor | Diseñador de informes |
| Flujo principal | 1. Inserta una tabla en una página. 2. Elige etapa de datos (cargados / consolidados / transformados) y medida (debe, haber, saldo, valor). 3. Define **filas**: cada fila es un filtro (nodo de clasificación, compañía, moneda…), una fórmula (`=F3-F5`), un total (`SUMA(F1:F4)`) o una etiqueta. 4. Define **columnas** del mismo modo (p. ej. mes del informe, mes anterior, acumulado anual, compañía A, compañía B). 5. La celda = intersección de filtros fila ∩ columna ∩ parámetros del informe. 6. Aplica formato numérico, colores, bordes y formato condicional (negativos en rojo). 7. La previsualización se actualiza en tiempo real. |
| Reglas | Las fórmulas pueden referenciar celdas de otras tablas y páginas (`Pagina2!Balance!C4`) y colecciones (`COLECCION("TipoCambio"; "USD"; PERIODO())`). Se detectan referencias circulares. |

### CU-46 · Auto-asignar por zonas

| Campo | Detalle |
|---|---|
| Actor | Propietario/Admin o Worker |
| Flujo principal | 1. Selecciona estrategia (*zonas contiguas* o *clúster espacial* si hay coordenadas). 2. El sistema ordena los productos por ubicación natural en recorrido serpenteante (pasillo par ascendente, impar descendente). 3. Divide la secuencia en K bloques contiguos (K = inventariadores) con carga balanceada, prefiriendo cortar en límites de pasillo para que dos usuarios no compartan pasillo. 4. Asigna cada bloque a un inventariador y define su ruta. 5. Publica `item.assigned` a cada usuario. |
| Reasignación | Cuando un usuario termina, toma la mitad final de los pendientes del usuario con más carga restante (el extremo más alejado de ese usuario), manteniendo la contigüidad. |

### CU-48 · Contar siguiente producto

| Campo | Detalle |
|---|---|
| Actor | Inventariador |
| Flujo principal | 1. Abre la toma en el móvil. 2. El sistema entrega el siguiente producto de su ruta y lo bloquea (`inv:lock`). 3. Se muestran **solo** los campos visibles para su rol. 4. Ingresa la cantidad (o marca *no encontrado* / *dañado*). 5. Opcional: comentario y fotos (CU-49). 6. Envía; el servidor valida versión y bloqueo, guarda `CountEntry`, libera el bloqueo y emite `entry.recorded` a supervisores y `progress.updated`. 7. Se muestra el siguiente producto. |
| Flujos alternos | 6a. Sin conexión → el envío se encola localmente y se reintenta; el producto sigue bloqueado mientras el bloqueo se renueva. 6b. Bloqueo expirado y tomado por otro usuario → conflicto `ITEM_REASSIGNED`, se descarta localmente. |

### CU-54 · Abrir ronda de reconteo

| Campo | Detalle |
|---|---|
| Actor | Supervisor |
| Precondición | Ronda N cerrada; número de ronda < máximo configurado. |
| Flujo principal | 1. El sistema calcula diferencias (contado − teórico) y las clasifica según la tolerancia (absoluta o %). 2. Muestra los productos fuera de tolerancia, no encontrados y dañados. 3. El supervisor confirma la selección (puede agregar o quitar productos). 4. Opcionalmente exige inventariadores distintos a los de la ronda anterior por producto. 5. Se crea la ronda N+1 y se ejecuta la asignación (CU-46 o CU-45). |
