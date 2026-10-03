#!/usr/bin/env sh
# Crea una CA local y el certificado HTTPS del servidor para una IP de la red.
# Uso: ./generate-certs.sh 192.168.1.20 [asisteglt.local]
# Instala certs/ca.crt en cada celular (una vez) para que confíe en el servidor.
set -eu

IP="${1:?Indica la IP de la laptop servidor, p. ej. 192.168.1.20}"
NAME="${2:-asisteglt.local}"
DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
cd "$DIR"

if [ ! -f ca.key ]; then
  openssl genrsa -out ca.key 4096
  openssl req -x509 -new -key ca.key -sha256 -days 1825 -out ca.crt -subj "/CN=AsisteGLT CA local"
fi

openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=$NAME"
cat > server.ext <<EXT
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:$IP,DNS:$NAME,DNS:localhost
EXT
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -sha256 -extfile server.ext
rm -f server.csr server.ext
chmod 600 ca.key server.key

echo "Listo: $DIR/server.crt (IP $IP, $NAME). Instala $DIR/ca.crt en los celulares."
