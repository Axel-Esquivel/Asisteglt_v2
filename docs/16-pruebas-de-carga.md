# 16 · Pruebas de carga

Resultados de la fase F8c contra los requisitos [RNF-06 y RNF-07](01-analisis-requerimientos.md).
Todos los datos son **ficticios**, generados por `tools/load/balance-generator.mjs`.

## 1. Herramientas

| Herramienta | Uso |
|---|---|
| `tools/load/load-test.mjs` | Arnés en Node contra una API en marcha con los datos de demostración: importación de un archivo grande, informes, lecturas HTTP concurrentes y latencia de eventos Socket.IO. `--escenarios importacion,informes,http,tiempo-real`, `--lineas`, `--usuarios`, `--segundos`, `--sockets`, `--mensajes`, `--salida`. |
| `tools/load/balance-generator.mjs` | Balance «impreso a archivo» con el diseño del de demostración (encabezado por página, montos con paréntesis). |
| `tools/load/k6/api-reads.js` · `tools/load/k6/realtime.js` | Los mismos escenarios en k6 con umbrales (`p(95)<2000` informes, `p(95)<500` lecturas, `latencia_evento p(95)<1000`), para repetir en el servidor del cliente. |

```bash
BASE_URL=https://servidor METRICS_TOKEN=… node tools/load/load-test.mjs --lineas 1000000 --salida resultado.json
k6 run -e BASE_URL=https://servidor tools/load/k6/api-reads.js
k6 run -e BASE_URL=https://servidor -e WS_URL=wss://servidor tools/load/k6/realtime.js
```

## 2. Entorno de medición

4 vCPU, 16 GB, Node 22, API compilada en modo producción (una instancia). El entorno de
desarrollo no tiene acceso a los binarios de MongoDB, así que se usó:

- **MongoDB (protocolo) con FerretDB 1.24 sobre SQLite** para la importación de extremo a extremo
  (memoria de la API, subida y escritura real por lotes). FerretDB es varias veces más lento que
  MongoDB y **no usa índices** en los filtros, por eso no sirve para medir informes.
- **Almacén en memoria** (`DATA_STORE=memory`) para medir el costo propio de la aplicación
  (motor de informes, HTTP, tiempo real) sin la base de datos.

Las cifras de MongoDB real deben ser iguales o mejores; conviene repetirlas en el servidor del
cliente con los scripts de §1.

## 3. Resultados

### 3.1 Importación de 1 000 000 de líneas (RNF-06)

| Medida | FerretDB/SQLite | En memoria |
|---|---|---|
| Archivo | 76,4 MB · 1 000 001 líneas | igual |
| Resultado | Publicado: 951 611 datos, 48 390 ignoradas (encabezados), 0 rechazadas | igual |
| Subida (HTTP) | 0,6 s | — |
| Total hasta «Publicado» | **162,8 s** (≈ 6 100 líneas/s; el cuello de botella es FerretDB, 125 % de CPU frente a 28 % de la API) | 31,9 s (≈ 31 000 líneas/s) |
| Memoria residente de la API | 218 MB en reposo → **451 MB de pico** | — (el almacén en memoria guarda los datos) |

El archivo **nunca se carga completo en memoria**: la subida se escribe en disco
(`STORAGE_DIR/.uploads`), se guarda por bloques calculando tamaño y SHA-256, y el procesador hace
dos pasadas por bloques de 1 MB (validar y luego publicar en lotes). El montículo de V8 oscila entre
150 y 375 MB durante la carga sin crecer con el número de líneas. Antes de esta fase el límite era
50 MB por archivo y se leía entero; ahora es 200 MB por archivo.

### 3.2 Informes (RNF-06: típicos < 2 s)

| Caso | p50 | p95 |
|---|---|---|
| Informe del período de demostración (consulta típica) | 3 ms | 8 ms |
| Mismo informe con 951 611 registros de otro período en el almacén (recorrido completo en memoria) | 38 ms | 49 ms |
| Informe sobre el período de 951 611 registros (el motor procesa todos) | 1 029 ms | 1 048 ms |

Con MongoDB el índice `projectId · period · profileId · companyId` limita la lectura a los
registros del período.

### 3.3 Lecturas HTTP concurrentes

50 usuarios virtuales en bucle continuo durante 30 s sobre `auth/me`, `projects`,
`chat/conversations`, `imports` y la ejecución de un informe:

| Datos en el almacén | Peticiones/s | p50 | p95 | p99 | Errores |
|---|---|---|---|---|---|
| Demostración | **1 323** | 34 ms | **60 ms** | 79 ms | 0 |
| Con 951 611 registros extra (cada informe los recorre en memoria) | 129 | 367 ms | 627 ms | 857 ms | 0 |

### 3.4 Tiempo real (RNF-07: p95 < 1 s)

100 sockets conectados, 50 mensajes publicados (5 por segundo): **5 000 de 5 000 eventos
entregados**, latencia p50 5 ms, **p95 7 ms**, p99 12 ms.

### 3.5 Carga inicial del SPA (RNF-06: < 3 s en 4G)

Compilación de producción servida con gzip y la CSP de nginx, caché vacía, hasta ver el
formulario de inicio de sesión (3 repeticiones):

| Perfil de red | Tiempo | Transferido |
|---|---|---|
| 4G (4 Mbps, 20 ms) | **0,9 s** | 272 KB |
| 4G lento (1,6 Mbps, 150 ms) y CPU ×4 (perfil móvil de Lighthouse) | 3,3 s | 272 KB |

En visitas siguientes el *service worker* sirve la aplicación desde el dispositivo. Durante la
medición se activó gzip y la caché inmutable de archivos con hash en nginx (antes se enviaban sin
comprimir, ~0,7 MB). Mejora pendiente: el paquete inicial (713 KB sin comprimir) supera el
presupuesto de 500 KB; dividir más rutas en carga diferida bajaría el perfil lento de 3 s.

## 4. Conclusión

| Requisito | Resultado |
|---|---|
| RNF-06 Importación de ≥ 1 000 000 de líneas sin cargar el archivo en memoria | **Cumple** (memoria acotada; 2,7 min con FerretDB) |
| RNF-06 Informes típicos < 2 s | **Cumple** (ms; ≈ 1 s incluso procesando 951 611 registros) |
| RNF-06 Carga inicial del SPA < 3 s en 4G | **Cumple** en 4G (0,9 s); 3,3 s en el perfil 4G lento con CPU ×4 |
| RNF-07 Latencia de eventos < 1 s p95 | **Cumple** (7 ms con 100 sockets) |
| RNF-07 Escalado horizontal con Redis adapter | Pendiente: hoy una instancia (ver [15 §1 #9](15-revision-seguridad.md)) |
