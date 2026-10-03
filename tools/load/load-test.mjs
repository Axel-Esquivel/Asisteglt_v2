// Prueba de carga de AsisteGLT contra una API en marcha con los datos de demostración (FICTICIOS).
// Mide: importación de un archivo grande (RNF-06), informes (< 2 s), lecturas HTTP concurrentes y
// latencia de eventos en tiempo real (RNF-07, p95 < 1 s).
//
// Uso:
//   BASE_URL=http://127.0.0.1:3000 METRICS_TOKEN=... node tools/load/load-test.mjs \
//     [--lineas 1000000] [--usuarios 50] [--segundos 30] [--sockets 100] [--mensajes 50] [--salida r.json]
//     [--escenarios importacion,informes,http,tiempo-real]
import { openAsBlob } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';
import { generateBalance } from './balance-generator.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const API = `${BASE}/api/v1`;
const METRICS_TOKEN = process.env.METRICS_TOKEN ?? '';
const ADMIN = { email: 'admin@demo.asisteglt.local', password: process.env.DEMO_PASSWORD ?? 'DemoAsiste2026' };

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const config = {
  lines: Number(option('lineas', '1000000')),
  users: Number(option('usuarios', '50')),
  seconds: Number(option('segundos', '30')),
  sockets: Number(option('sockets', '100')),
  messages: Number(option('mensajes', '50')),
  output: option('salida', ''),
  // importacion,informes,http,tiempo-real (todas por defecto)
  scenarios: option('escenarios', 'importacion,informes,http,tiempo-real').split(','),
};

/** Percentil sobre muestras en milisegundos. */
function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function stats(samples) {
  return {
    n: samples.length,
    p50: Math.round(percentile(samples, 50)),
    p95: Math.round(percentile(samples, 95)),
    p99: Math.round(percentile(samples, 99)),
    max: Math.round(Math.max(0, ...samples)),
  };
}

class Client {
  constructor(token) {
    this.token = token;
  }

  static async login() {
    const response = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ADMIN),
    });
    if (!response.ok) throw new Error(`No se pudo iniciar sesión (${response.status})`);
    return new Client((await response.json()).accessToken);
  }

  async get(path) {
    const response = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
    return response.json();
  }

  async timedGet(path) {
    const started = performance.now();
    const response = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${this.token}` } });
    await response.arrayBuffer();
    return { ms: performance.now() - started, ok: response.ok };
  }

  async post(path, body) {
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`POST ${path} → ${response.status}: ${await response.text()}`);
    return response.json();
  }
}

async function residentMemory() {
  if (METRICS_TOKEN === '') return null;
  const response = await fetch(`${API}/metrics`, { headers: { authorization: `Bearer ${METRICS_TOKEN}` } });
  if (!response.ok) return null;
  const match = /^asisteglt_process_resident_memory_bytes (\d+)/m.exec(await response.text());
  return match === null ? null : Number(match[1]);
}

/** Contexto de demostración: proyecto de reportes, preconfiguración, alcance e informes. */
async function demoContext(client) {
  const projects = await client.get('/projects');
  const project = projects.find((p) => p.moduleType === 'REPORTS');
  if (project === undefined) throw new Error('No hay proyecto de reportes de demostración (DEMO_SEED=true)');
  const profiles = await client.get(`/projects/${project.id}/profiles`);
  const profile = profiles.find((p) => p.status === 'ACTIVE') ?? profiles[0];
  const org = await client.get(`/projects/${project.id}/org-structure`);
  const units = org.units ?? org;
  const byLevel = (level) => units.filter((u) => u.level === level);
  const reports = await client.get(`/projects/${project.id}/report-definitions`);
  return {
    projectId: project.id,
    profileId: profile.id,
    organizationId: byLevel('ORGANIZATION')[0].id,
    countryId: byLevel('COUNTRY')[0].id,
    companyId: byLevel('COMPANY')[0].id,
    reportIds: reports.map((r) => r.id),
  };
}

async function importScenario(client, context) {
  const directory = await mkdtemp(join(tmpdir(), 'asisteglt-carga-'));
  const file = join(directory, 'balance_carga_2026_09.txt');
  try {
    const written = await generateBalance(file, config.lines, '09');
    const size = (await stat(file)).size;
    const form = new FormData();
    form.append(
      'manifest',
      JSON.stringify({
        items: [
          {
            fileName: 'balance_carga_2026_09.txt',
            profileId: context.profileId,
            period: '2026-09',
            organizationId: context.organizationId,
            countryId: context.countryId,
            currency: 'GTQ',
            companyId: context.companyId,
            enterpriseId: null,
            branchId: null,
          },
        ],
      }),
    );
    form.append('files', await openAsBlob(file), 'balance_carga_2026_09.txt');
    let peak = (await residentMemory()) ?? 0;
    const baseline = peak;
    const started = performance.now();
    const upload = await fetch(`${API}/projects/${context.projectId}/imports`, {
      method: 'POST',
      headers: { authorization: `Bearer ${client.token}` },
      body: form,
    });
    if (!upload.ok) throw new Error(`Subida rechazada (${upload.status}): ${await upload.text()}`);
    const uploadedMs = performance.now() - started;
    const batch = await upload.json();
    let item = batch.items[0];
    while (item.status === 'QUEUED' || item.status === 'PROCESSING') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      peak = Math.max(peak, (await residentMemory()) ?? 0);
      item = (await client.get(`/projects/${context.projectId}/imports/${batch.id}`)).items[0];
    }
    const totalMs = performance.now() - started;
    return {
      lines: written,
      megabytes: Math.round((size / 1024 / 1024) * 10) / 10,
      status: item.status,
      data: item.data,
      rejected: item.rejected,
      ignored: item.ignored,
      uploadSeconds: Math.round(uploadedMs / 100) / 10,
      totalSeconds: Math.round(totalMs / 100) / 10,
      linesPerSecond: Math.round(written / (totalMs / 1000)),
      baselineRssMb: Math.round(baseline / 1024 / 1024),
      peakRssMb: Math.round(peak / 1024 / 1024),
      error: item.error ?? null,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function reportScenario(client, context, period, runs) {
  const samples = [];
  for (const id of context.reportIds) {
    for (let run = 0; run < runs; run += 1) {
      const { ms, ok } = await client.timedGet(`/projects/${context.projectId}/report-definitions/${id}/run?period=${period}`);
      if (!ok) throw new Error(`El informe ${id} falló`);
      samples.push(ms);
    }
  }
  return stats(samples);
}

async function httpScenario(client, context) {
  const paths = [
    '/auth/me',
    '/projects',
    '/chat/conversations',
    `/projects/${context.projectId}/imports`,
    ...context.reportIds.map((id) => `/projects/${context.projectId}/report-definitions/${id}/run?period=2026-08`),
  ];
  const samples = [];
  let errors = 0;
  const deadline = performance.now() + config.seconds * 1000;
  const user = async (offset) => {
    for (let i = offset; performance.now() < deadline; i += 1) {
      const { ms, ok } = await client.timedGet(paths[i % paths.length]);
      samples.push(ms);
      if (!ok) errors += 1;
    }
  };
  const started = performance.now();
  await Promise.all(Array.from({ length: config.users }, (_, index) => user(index)));
  const elapsed = (performance.now() - started) / 1000;
  return { ...stats(samples), users: config.users, rps: Math.round(samples.length / elapsed), errors };
}

async function realtimeScenario(client) {
  const conversations = await client.get('/chat/conversations');
  const global = conversations.find((c) => c.type === 'GLOBAL');
  if (global === undefined) throw new Error('No hay conversación global');
  const sent = new Map();
  const latencies = [];
  const sockets = await Promise.all(
    Array.from(
      { length: config.sockets },
      () =>
        new Promise((resolve, reject) => {
          const socket = io(BASE, { path: '/api/v1/realtime', auth: { token: client.token }, transports: ['websocket'] });
          socket.on('connect', () => resolve(socket));
          socket.on('connect_error', reject);
          socket.on('chat:message', (message) => {
            const at = sent.get(message.text);
            if (at !== undefined) latencies.push(performance.now() - at);
          });
        }),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (let index = 0; index < config.messages; index += 1) {
    const body = `mensaje de carga ${index} ${Date.now()}`;
    sent.set(body, performance.now());
    await client.post(`/chat/conversations/${global.id}/messages`, { text: body });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  sockets.forEach((socket) => socket.close());
  const expected = config.sockets * config.messages;
  return { ...stats(latencies), sockets: config.sockets, messages: config.messages, delivered: latencies.length, expected };
}

const client = await Client.login();
const context = await demoContext(client);
const results = { date: new Date().toISOString(), base: BASE, config };
const enabled = (name) => config.scenarios.includes(name);
const log = (label, value) => process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
if (enabled('importacion')) {
  process.stdout.write(`Importación de ${config.lines} líneas ficticias…\n`);
  results.import = await importScenario(client, context);
  log('importación', results.import);
}
if (enabled('informes')) {
  results.reportsTypical = await reportScenario(client, context, '2026-08', 10);
  log('informes (período típico)', results.reportsTypical);
  if (enabled('importacion')) {
    results.reportsLarge = await reportScenario(client, context, '2026-09', 2);
    log('informes (período de la carga grande)', results.reportsLarge);
  }
}
if (enabled('http')) {
  results.http = await httpScenario(client, context);
  log('lecturas HTTP', results.http);
}
if (enabled('tiempo-real')) {
  results.realtime = await realtimeScenario(client);
  log('tiempo real', results.realtime);
}
if (config.output !== '') await writeFile(config.output, `${JSON.stringify(results, null, 2)}\n`);
