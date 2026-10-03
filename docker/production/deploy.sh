#!/usr/bin/env bash
# Despliega (o actualiza) AsisteGLT a la versión indicada: respalda, descarga las imágenes,
# reinicia y espera a que la API esté preparada. Si no lo está, vuelve a la versión anterior.
# Uso: ./deploy.sh 1.2.0
set -euo pipefail

VERSION="${1:?Uso: ./deploy.sh <versión, p. ej. 1.2.0>}"
cd "$(dirname "$0")"
[[ -f .env ]] || { echo 'Falta .env (copia .env.example y complétalo)'; exit 1; }
[[ -f certs/server.crt && -f certs/server.key ]] || { echo 'Faltan certs/server.crt y certs/server.key'; exit 1; }
mkdir -p backups
if [[ "$(stat -c %u backups)" != 1000 ]]; then
  echo 'Aviso: ./backups debe pertenecer al usuario 1000 (node del contenedor): sudo chown 1000:1000 backups' >&2
fi

previous="$(sed -n 's/^ASISTEGLT_VERSION=//p' .env)"
set_version() { sed -i "s/^ASISTEGLT_VERSION=.*/ASISTEGLT_VERSION=$1/" .env; }

wait_ready() {
  local container
  for _ in $(seq 1 40); do
    container="$(docker compose ps -q api)"
    if [[ -n "$container" && "$(docker inspect --format '{{.State.Health.Status}}' "$container")" == healthy ]]; then
      return 0
    fi
    sleep 5
  done
  return 1
}

# Descarga antes de tocar .env: si la versión no existe, todo queda como estaba.
if ! ASISTEGLT_VERSION="$VERSION" docker compose pull --quiet; then
  echo "No se pudo descargar la versión $VERSION; no se cambió nada." >&2
  exit 1
fi

if [[ -n "$(docker compose ps -q api)" ]]; then
  echo "Respaldo previo a la actualización ($previous → $VERSION)…"
  docker compose exec -T backup node backup.js crear "/backups/pre-$VERSION-$(date +%F-%H%M).agbk"
fi

set_version "$VERSION"
docker compose up -d --remove-orphans

if wait_ready; then
  echo "AsisteGLT $VERSION desplegado y preparado."
  docker image prune -f >/dev/null
  exit 0
fi

echo "La versión $VERSION no quedó preparada: se vuelve a $previous." >&2
docker compose logs --tail 100 api >&2 || true
if [[ -n "$previous" && "$previous" != "$VERSION" ]]; then
  set_version "$previous"
  docker compose up -d --remove-orphans
  wait_ready && echo "Restaurada la versión $previous." >&2
fi
exit 1
