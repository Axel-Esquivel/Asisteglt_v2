// k6: latencia de eventos en tiempo real (RNF-07: p95 < 1 s) con Socket.IO sobre WebSocket.
// Cada VU abre un socket, escucha `chat:message` y mide desde que el emisor publicó el mensaje.
// Uso: k6 run -e BASE_URL=https://servidor -e WS_URL=wss://servidor tools/load/k6/realtime.js
import http from 'k6/http';
import ws from 'k6/ws';
import { Trend } from 'k6/metrics';
import { check } from 'k6';

const BASE = `${__ENV.BASE_URL || 'http://127.0.0.1:3000'}/api/v1`;
const WS = `${__ENV.WS_URL || 'ws://127.0.0.1:3000'}/api/v1/realtime/?EIO=4&transport=websocket`;
const latency = new Trend('latencia_evento', true);

export const options = {
  scenarios: {
    oyentes: { executor: 'constant-vus', vus: 100, duration: '1m', exec: 'listen' },
    emisor: { executor: 'constant-arrival-rate', rate: 5, timeUnit: '1s', duration: '50s', preAllocatedVUs: 2, exec: 'speak', startTime: '5s' },
  },
  thresholds: { latencia_evento: ['p(95)<1000'] },
};

export function setup() {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: 'admin@demo.asisteglt.local', password: __ENV.DEMO_PASSWORD || 'DemoAsiste2026' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = login.json('accessToken');
  const conversations = http.get(`${BASE}/chat/conversations`, { headers: { Authorization: `Bearer ${token}` } }).json();
  return { token, conversationId: conversations.find((c) => c.type === 'GLOBAL').id };
}

export function listen(data) {
  const response = ws.connect(WS, {}, (socket) => {
    socket.on('message', (raw) => {
      if (raw === '2') return socket.send('3');
      if (raw.startsWith('0')) return socket.send(`40${JSON.stringify({ token: data.token })}`);
      if (raw.startsWith('42')) {
        const [event, message] = JSON.parse(raw.slice(2));
        const sentAt = Number((/@(\d+)$/.exec(message.text) || [])[1]);
        if (event === 'chat:message' && sentAt > 0) latency.add(Date.now() - sentAt);
      }
    });
    socket.setTimeout(() => socket.close(), 55000);
  });
  check(response, { 'socket 101': (r) => r && r.status === 101 });
}

export function speak(data) {
  http.post(
    `${BASE}/chat/conversations/${data.conversationId}/messages`,
    JSON.stringify({ text: `carga k6 @${Date.now()}` }),
    { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' } },
  );
}
