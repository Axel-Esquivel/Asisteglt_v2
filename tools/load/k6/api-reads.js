// k6: lecturas HTTP concurrentes con los datos de demostración (FICTICIOS).
// Uso: k6 run -e BASE_URL=https://servidor -e PERIOD=2026-08 tools/load/k6/api-reads.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = `${__ENV.BASE_URL || 'http://127.0.0.1:3000'}/api/v1`;
const PERIOD = __ENV.PERIOD || '2026-08';

export const options = {
  scenarios: {
    lecturas: { executor: 'ramping-vus', stages: [{ duration: '30s', target: 50 }, { duration: '2m', target: 50 }, { duration: '15s', target: 0 }] },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{tipo:informe}': ['p(95)<2000'],
    'http_req_duration{tipo:lectura}': ['p(95)<500'],
  },
};

export function setup() {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: 'admin@demo.asisteglt.local', password: __ENV.DEMO_PASSWORD || 'DemoAsiste2026' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = login.json('accessToken');
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const project = http.get(`${BASE}/projects`, auth).json().find((p) => p.moduleType === 'REPORTS');
  const reports = http.get(`${BASE}/projects/${project.id}/report-definitions`, auth).json();
  return { token, projectId: project.id, reportIds: reports.map((r) => r.id) };
}

export default function (data) {
  const auth = { headers: { Authorization: `Bearer ${data.token}` } };
  const reads = ['/auth/me', '/projects', '/chat/conversations', `/projects/${data.projectId}/imports`];
  const path = reads[Math.floor(Math.random() * reads.length)];
  check(http.get(`${BASE}${path}`, { ...auth, tags: { tipo: 'lectura' } }), { 'lectura 200': (r) => r.status === 200 });
  for (const id of data.reportIds) {
    const report = http.get(`${BASE}/projects/${data.projectId}/report-definitions/${id}/run?period=${PERIOD}`, {
      ...auth,
      tags: { tipo: 'informe' },
    });
    check(report, { 'informe 200': (r) => r.status === 200 });
  }
  sleep(1);
}
