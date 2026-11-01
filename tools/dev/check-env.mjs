// Diagnóstico del entorno de desarrollo: qué archivos .env carga Nx para `npm run start:api`, con
// qué valores queda cada variable (los secretos se enmascaran), si la API los aceptaría, y si
// MongoDB responde y los puertos están libres. Funciona igual en Windows, Linux y macOS.
// Usa las mismas funciones de Nx que arrancan la tarea, así que muestra lo que recibe la API.
// Uso: npm run dev:check
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getEnvPathsForTask } = require('nx/src/devkit-internals');
const { loadAndExpandDotEnvFile, unloadDotEnvFile } = require('nx/src/tasks-runner/task-env');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PROJECT = 'apps/api';
const TARGET = 'serve';
const CONFIGURATION = 'development';
const SECRETS = new Set(['JWT_SECRET', 'METRICS_TOKEN', 'BACKUP_PASSPHRASE']);
// Mismos marcadores que PublicTestSecrets (libs/api/platform/src/lib/config/public-test-secrets.ts).
const PUBLIC_MARKERS = ['solo-desarrollo', 'cambia-este-secreto', 'solo-para-la-demostracion', 'secreto-e2e', 'secreto-de-pruebas'];
const VARIABLES = [
  'NODE_ENV', 'LOG_LEVEL', 'APP_VERSION', 'API_PORT', 'API_CORS_ORIGINS', 'DATA_STORE', 'MONGODB_URI', 'REDIS_URL',
  'JWT_SECRET', 'SECURE_COOKIES', 'AUTH_RATE_LIMIT_PER_MINUTE', 'TRUST_PROXY', 'STORAGE_DIR',
  'IMPORT_REJECT_THRESHOLD_PERCENT', 'DEMO_SEED', 'METRICS_TOKEN', 'WORKER_CONCURRENCY',
];

const problems = [];
const warnings = [];
const out = (line) => process.stdout.write(`${line}\n`);
const isPublic = (value) => PUBLIC_MARKERS.some((marker) => value.toLowerCase().includes(marker));

/** Como EnvironmentReader.raw: se recorta y un valor vacío cuenta como no definido. */
function raw(env, name) {
  const value = env[name];
  return value === undefined || value.trim() === '' ? null : value.trim();
}

/** Nunca muestra un secreto completo: ni los de SECRETS ni usuario/contraseña dentro de una URL. */
function mask(name, value) {
  if (SECRETS.has(name)) {
    const prefix = value.length >= 16 ? `${value.slice(0, 4)}…` : '••••';
    return `${prefix} (${value.length} caracteres, ${isPublic(value) ? 'valor de prueba' : 'propio'})`;
  }
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^@/?#]*)@/i, (_all, scheme, credentials) =>
    `${scheme}${credentials.includes(':') ? '***:***' : '***'}@`,
  );
}

/** Primer host:puerto de una URI mongodb:// (varios hosts, IPv6, credenciales); null con +srv. */
function firstMongoHost(uri) {
  const match = /^mongodb:\/\/([^/?#]*)/i.exec(uri);
  if (match === null) return null;
  const authority = match[1].slice(match[1].lastIndexOf('@') + 1);
  const host = authority.split(',')[0];
  const ipv6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(host);
  if (ipv6 !== null) return { host: ipv6[1], port: Number(ipv6[2] ?? '27017') };
  const [name, port] = host.split(':');
  return name === '' ? null : { host: name, port: Number(port ?? '27017') };
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 1500 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

/** Ocupado si algo responde en IPv4 o IPv6 local (enlazar el comodín no basta en Windows/macOS). */
async function isBusy(port) {
  return (await canConnect('127.0.0.1', port)) || (await canConnect('::1', port));
}

// --- Herramientas
const major = Number(process.versions.node.split('.')[0]);
out(`Node ${process.versions.node}${major === 22 ? '' : '  (se recomienda Node 22: la versión de CI y de las imágenes)'}`);
if (major < 22) problems.push('Node 22 o superior es obligatorio.');
const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
out(`Docker Compose: ${docker.status === 0 ? docker.stdout.trim() : 'no disponible (MongoDB local requiere Docker Desktop o una instalación propia)'}`);

// --- Variables: misma secuencia que Nx (getTaskSpecificEnv) para api:serve:development
const files = getEnvPathsForTask(PROJECT, TARGET, CONFIGURATION, undefined);
const env = { ...process.env };
for (const file of ['.env', '.local.env', '.env.local']) unloadDotEnvFile(join(ROOT, file), env);
const fromSystem = new Set(Object.keys(env).filter((name) => (env[name] ?? '') !== ''));
loadAndExpandDotEnvFile(files.map((file) => join(ROOT, file)), env);

const origin = new Map();
for (const file of files) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  const parsed = {};
  loadAndExpandDotEnvFile(path, parsed);
  for (const name of Object.keys(parsed)) {
    if (!origin.has(name) && !fromSystem.has(name)) origin.set(name, file);
  }
}
for (const name of fromSystem) origin.set(name, 'variable del sistema');

out(`\nArchivos .env para ${PROJECT}:${TARGET}:${CONFIGURATION} (prioridad de arriba hacia abajo):`);
for (const file of files) if (existsSync(join(ROOT, file))) out(`  ✔ ${file}`);
if (existsSync(join(ROOT, '.env'))) {
  warnings.push(
    'Hay un .env antiguo en la raíz: .env.development ya define casi todo y, si una variable de la terminal ' +
      'coincide con un valor de ese .env, Nx la descarta. Pasa tus cambios a .env.development.local y borra o renombra .env.',
  );
}

out('\nValores en uso:');
for (const name of VARIABLES) {
  const value = raw(env, name);
  const source = value === null ? '' : `  ← ${origin.get(name) ?? '?'}`;
  out(`  ${name.padEnd(32)} ${value === null ? '(sin definir: valor por defecto)' : mask(name, value)}${source}`);
  if (process.platform === 'win32') {
    const variants = Object.keys(process.env).filter((key) => key !== name && key.toUpperCase() === name);
    if (variants.length > 0) warnings.push(`En la terminal está ${variants.join(', ')}: escribe la variable como ${name} (Nx distingue mayúsculas).`);
  }
}

// --- Mismas reglas que AppConfigLoader
const production = raw(env, 'NODE_ENV') === 'production';
for (const name of ['MONGODB_URI', 'REDIS_URL', 'JWT_SECRET']) {
  if (raw(env, name) === null) problems.push(`${name} es obligatoria.`);
}
const jwt = raw(env, 'JWT_SECRET') ?? '';
if (jwt !== '' && jwt.length < 32) problems.push('JWT_SECRET debe tener al menos 32 caracteres.');
const metrics = raw(env, 'METRICS_TOKEN') ?? '';
if (metrics !== '' && metrics.length < 24) problems.push('METRICS_TOKEN debe tener al menos 24 caracteres.');
const apiPort = Number(raw(env, 'API_PORT') ?? '3000');
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) problems.push('API_PORT debe ser un puerto entre 1 y 65535.');
const store = raw(env, 'DATA_STORE') ?? 'mongo';
if (store !== 'mongo' && store !== 'memory') problems.push('DATA_STORE debe ser mongo o memory.');
if (production) {
  if (isPublic(jwt)) problems.push('Con NODE_ENV=production la API rechaza un JWT_SECRET de prueba.');
  if (isPublic(metrics)) problems.push('Con NODE_ENV=production la API rechaza un METRICS_TOKEN de prueba.');
  if (raw(env, 'DEMO_SEED') === 'true') problems.push('Con NODE_ENV=production la API rechaza DEMO_SEED=true.');
}

// --- Servicios y puertos
out('\nServicios y puertos:');
if (store === 'mongo') {
  const uri = raw(env, 'MONGODB_URI') ?? '';
  const target = firstMongoHost(uri);
  if (/^mongodb\+srv:/i.test(uri)) {
    out('  MongoDB: URI +srv (no se sondea; la resuelve el controlador al arrancar)');
  } else if (target === null) {
    problems.push('MONGODB_URI no tiene un host reconocible.');
  } else {
    const reachable = await canConnect(target.host, target.port);
    out(`  MongoDB ${target.host}:${target.port}  ${reachable ? 'responde' : 'NO responde'}`);
    if (!reachable) problems.push('MongoDB no responde: ejecuta `npm run services:up` (Docker Desktop abierto) o usa DATA_STORE=memory en .env.development.local.');
  }
} else if (store === 'memory') {
  out('  MongoDB: no se usa (DATA_STORE=memory, los datos se pierden al reiniciar)');
}
for (const [label, port] of [['API', apiPort], ['Web', 4200]]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
  const busy = await isBusy(port);
  out(`  Puerto ${port} (${label})  ${busy ? 'ocupado' : 'libre'}`);
  if (busy) warnings.push(`El puerto ${port} está ocupado: ¿ya hay una ${label} en marcha?`);
}

out('');
warnings.forEach((warning) => out(`Aviso: ${warning}`));
problems.forEach((problem) => out(`Problema: ${problem}`));
out(problems.length === 0 ? 'Listo para `npm run start:dev`.' : 'Corrige los problemas antes de arrancar.');
process.exit(problems.length === 0 ? 0 : 1);
