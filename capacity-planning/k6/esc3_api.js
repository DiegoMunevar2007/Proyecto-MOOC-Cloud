// Escenario 3A: aumentar la demanda de login (bcrypt) y observar reducción.
// La tasa es un parámetro del experimento; no modifica la política de CPU.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { abrirDataset } from './lib/corpus.js';
import { BASE_URL, INSECURE_TLS } from './lib/config.js';
const identity = abrirDataset('estudiantes.json');
const served = new Counter('requests_by_instance');
const rate = Number(__ENV.PEAK_RATE || 12);
export const options = {
  insecureSkipTLSVerify: INSECURE_TLS,
  scenarios: {
    demand: { executor: 'ramping-arrival-rate', startRate: 1, timeUnit: '1s', preAllocatedVUs: 30, maxVUs: 150,
      stages: [{ duration: '1m', target: 1 }, { duration: '2m', target: rate }, { duration: '10m', target: rate }, { duration: '1m', target: 1 }, { duration: '20m', target: 1 }] },
  },
  thresholds: { http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '3m' }], checks: ['rate>0.99'] },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};
export default function () {
  if (!__ENV.SEED_PASSWORD) throw new Error('Falta SEED_PASSWORD');
  const users = identity.estudiantes;
  const user = users[(__VU - 1) % users.length];
  const res = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({ username: user.username, password: __ENV.SEED_PASSWORD }), { headers: { 'Content-Type': 'application/json' }, tags: { op: 'login' } });
  let body = {}; try { body = res.json(); } catch (_) { /* se registra como fallo */ }
  check(res, { 'login y token válidos': (r) => r.status === 200 && Boolean(body.token) });
  served.add(1, { instance: res.headers['X-Served-By'] || 'unknown' });
  if (body.token) {
    const session = http.get(`${BASE_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${body.token}` }, tags: { op: 'session' } });
    check(session, { 'sesión conserva identidad': (r) => r.status === 200 && r.json().username === user.username });
    http.post(`${BASE_URL}/api/v1/auth/logout`, null, { headers: { Authorization: `Bearer ${body.token}` }, tags: { op: 'logout' } });
  }
  sleep(0.05);
}
