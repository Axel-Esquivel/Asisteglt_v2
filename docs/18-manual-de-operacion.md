# 18 · Manual de operación

Instalación, actualización, respaldos, monitoreo y seguridad del servidor de producción. Para el
servidor local de bodega (Wi-Fi sin internet) ver [13-puesta-en-marcha §3.2](13-puesta-en-marcha.md).

## 1. Arquitectura del despliegue

```
Usuarios ──HTTPS──▶ web (nginx: SPA, TLS, CSP, /api → api) ──▶ api (NestJS) ──▶ mongo (MongoDB 8)
                                                                  │
                                       volumen «storage» (cargas y fotos) ◀── backup (diario, cifrado) ──▶ ./backups
```

Todo vive en `docker/production/`: `docker-compose.yml`, `deploy.sh`, `.env` (secretos, no se
versiona), `certs/` (certificado TLS) y `backups/`. Las imágenes `asisteglt-api` y `asisteglt-web`
se publican en GitHub Container Registry desde `.github/workflows/release.yml`.

## 2. Requisitos del servidor

| Recurso | Mínimo | Recomendado |
|---|---|---|
| Sistema | Linux x86-64 con Docker 24+ y Docker Compose v2 | Igual, con actualizaciones automáticas de seguridad |
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB (MongoDB usa la RAM libre como caché) |
| Disco | 40 GB SSD | 100 GB SSD + espacio para 14 respaldos |
| Red | Puertos 80 y 443 abiertos; el resto cerrado | Nombre de dominio con registro DNS |

Referencia de consumo medida en [16-pruebas-de-carga](16-pruebas-de-carga.md).

## 3. Instalación inicial

1. Copiar `docker/production/` al servidor (p. ej. `/opt/asisteglt`) y entrar a esa carpeta.
2. `cp .env.example .env` y completar los secretos (ver §5). Con `openssl rand -hex 24` las
   contraseñas no necesitan escaparse en la URL de MongoDB.
3. Certificado TLS del dominio en `certs/server.crt` (cadena completa) y `certs/server.key`. Con
   Let's Encrypt:
   ```bash
   sudo certbot certonly --standalone -d asisteglt.example.com      # con el puerto 80 libre
   sudo cp /etc/letsencrypt/live/asisteglt.example.com/fullchain.pem certs/server.crt
   sudo cp /etc/letsencrypt/live/asisteglt.example.com/privkey.pem certs/server.key
   ```
   Renovación: un *deploy hook* de certbot que copie de nuevo ambos archivos y ejecute
   `docker compose exec web nginx -s reload`.
4. `mkdir -p backups && sudo chown 1000:1000 backups` (el contenedor escribe como usuario `node`).
5. Iniciar sesión en el registro si el paquete es privado:
   `echo <token con read:packages> | docker login ghcr.io -u <usuario> --password-stdin`.
6. `./deploy.sh 1.0.0`. Al terminar, abrir `PUBLIC_URL` y **registrar la primera cuenta**: será la
   del administrador que crea los proyectos. `DEMO_SEED` nunca se activa en producción.

## 4. Publicar y actualizar versiones

| Paso | Detalle |
|---|---|
| 1. Etiquetar | `git tag v1.2.0 && git push origin v1.2.0` sobre un commit de `main` con CI en verde. |
| 2. Verificar y publicar | `release.yml` repite lint, typecheck, pruebas, build y e2e; construye las dos imágenes con SBOM y procedencia firmada y las publica como `1.2.0`, `1.2` y `sha-…`. |
| 3. Desplegar | El job `deploy` usa el entorno **production** de GitHub (con aprobación manual) y ejecuta `./deploy.sh 1.2.0` por SSH. Secretos del entorno: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (salida de `ssh-keyscan`) y `DEPLOY_PATH`. |
| Manual | En el servidor: `./deploy.sh 1.2.0`. |

`deploy.sh` hace un **respaldo previo** (`backups/pre-<versión>-…agbk`), descarga las imágenes,
reinicia y espera a que `GET /api/v1/health/ready` responda; si la versión nueva no queda
preparada en ~3 minutos, **vuelve sola a la versión anterior** y muestra el log de la API.
Volver atrás a mano: `./deploy.sh <versión anterior>`. Si una versión hubiera cambiado datos de
forma incompatible, restaurar además el respaldo previo (§6.3).

## 5. Configuración (`.env`)

| Variable | Uso |
|---|---|
| `ASISTEGLT_VERSION` | Versión desplegada (la actualiza `deploy.sh`). |
| `REGISTRY_OWNER` | Dueño del registro de imágenes (`ghcr.io/<dueño>/asisteglt-*`). |
| `PUBLIC_URL` | Dirección pública (origen permitido por CORS). |
| `JWT_SECRET` | Firma de los tokens de acceso (≥ 32 caracteres). Cambiarlo cierra todas las sesiones. |
| `MONGO_ROOT_PASSWORD` / `MONGO_APP_PASSWORD` | Cuenta administradora de MongoDB (solo para mantenimiento) y la de la aplicación (solo lectura/escritura sobre su base; se crea al iniciar el volumen por primera vez). |
| `BACKUP_PASSPHRASE` | Frase de cifrado de los respaldos (≥ 12 caracteres). Guardarla **fuera del servidor**: sin ella no se restaura. |
| `BACKUP_RETENTION_DAYS` | Días que se conservan los respaldos diarios (14). |
| `METRICS_TOKEN` | Token *bearer* de `/api/v1/metrics`; vacío deshabilita las métricas. |
| `AUTH_RATE_LIMIT_PER_MINUTE` | Intentos de inicio de sesión por IP y minuto (10). |
| `IMPORT_REJECT_THRESHOLD_PERCENT` | Porcentaje de líneas rechazadas a partir del cual una carga falla (20). |
| `LOG_LEVEL` | `debug`, `info`, `warn` o `error`. |

La API valida toda la configuración al arrancar y no inicia si falta o es inválida: el motivo
aparece en `docker compose logs api`.

## 6. Respaldos

### 6.1 Automáticos

El servicio `backup` crea cada 24 h `backups/asisteglt-AAAA-MM-DD-HHMM.agbk`: base completa
(colecciones e índices) y archivos cargados, comprimido, **cifrado** (AES-256-GCM) y con suma de
verificación; borra los de más de `BACKUP_RETENTION_DAYS` días. Copiar `backups/` fuera del
servidor (otro equipo o almacenamiento externo) con la herramienta de la organización.

### 6.2 Manuales y comprobación

```bash
docker compose exec backup node backup.js crear /backups/manual-$(date +%F).agbk
docker compose exec backup node backup.js verificar /backups/manual-AAAA-MM-DD.agbk
```

### 6.3 Restaurar

```bash
docker compose stop web api backup
docker compose run --rm restore /backups/asisteglt-AAAA-MM-DD-HHMM.agbk --reemplazar
docker compose up -d
```

La restauración verifica primero todo el archivo (frase, suma y conteos) y no escribe nada si algo
falla. Sin `--reemplazar` se niega a sobrescribir colecciones con datos.

### 6.4 Prueba mensual de restauración

En un equipo aparte con `docker/production/` y el mismo `.env` (otro `PUBLIC_URL`), copiar el
último respaldo a `backups/`, `docker compose up -d mongo`,
`docker compose run --rm restore /backups/<archivo> --reemplazar`, levantar el resto y comprobar
el inicio de sesión, un informe y una toma. Registrar fecha y resultado.

## 7. Monitoreo

| Qué | Dónde |
|---|---|
| Estado | `docker compose ps` (la API reporta *healthy* solo si MongoDB y el almacenamiento responden). |
| Preparación | `GET /api/v1/health/ready` (503 con el detalle de la dependencia caída). |
| Métricas | `GET /api/v1/metrics` con `METRICS_TOKEN`; métricas y alertas sugeridas en [13 §9](13-puesta-en-marcha.md). |
| Logs | `docker compose logs -f api` — JSON con `correlationId`; rotación de 10 × 20 MB por servicio. |
| Auditoría de seguridad | `docker compose logs api \| grep SecurityAudit` (inicios de sesión, bloqueos, límites superados, 403…). |
| Seguir una petición | El `X-Request-Id` que devuelve nginx es el `correlationId` de los logs de la API. |

## 8. Seguridad operativa

- Solo los puertos 80 y 443 abiertos; MongoDB no se publica fuera de la red de Docker.
- Rotar `JWT_SECRET`, `METRICS_TOKEN` y las contraseñas al menos una vez al año o ante cualquier
  sospecha (`JWT_SECRET` cierra todas las sesiones; las contraseñas de MongoDB se cambian también
  dentro de la base con `mongosh`).
- Mantener el sistema operativo y Docker actualizados; las dependencias de la aplicación se
  auditan en cada versión (`npm audit` sin vulnerabilidades, ver
  [15-revision-seguridad](15-revision-seguridad.md)).
- Los respaldos y `backups/` contienen datos confidenciales del cliente: cifrados, con acceso
  restringido y nunca en repositorios ni correos.

## 9. Solución de problemas

| Síntoma | Revisión |
|---|---|
| `deploy.sh` vuelve a la versión anterior | Leer el log que muestra; casi siempre es una variable de `.env` inválida o MongoDB caído. |
| La API no pasa a *healthy* | `docker compose exec api node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then((r) => r.text()).then(console.log)"` indica la dependencia que falla. |
| 502 en el navegador | La API está reiniciando: `docker compose ps` y `docker compose logs api`. |
| Cargas lentas | Revisar `asisteglt_import_duration_seconds` y el disco de MongoDB; un millón de líneas tarda unos minutos ([16](16-pruebas-de-carga.md)). |
| Muchos `http.rate-limited` | Varios usuarios detrás de la misma IP pública: subir `AUTH_RATE_LIMIT_PER_MINUTE`. |
| Certificado vencido | Renovar con certbot, copiar a `certs/` y recargar nginx (§3). |
