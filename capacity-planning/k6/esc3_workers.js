// Escenario 3B reutiliza los mismos archivos y admisión de la entrega 2.
import { cargaDirecta as upload, setup as prepare, observar } from './esc2_carga_directa.js';
import { INSECURE_TLS } from './lib/config.js';
import { sleep } from 'k6';
export { observar };
export function cargaDirecta(data) { upload(data); sleep(Number(__ENV.UPLOAD_PAUSE_SEC || 20)); }
export function setup() { return prepare(); }
export const options = {
  insecureSkipTLSVerify: INSECURE_TLS,
  scenarios: {
    demand: { executor: 'ramping-vus', exec: 'cargaDirecta', startVUs: 1,
      stages: [{ duration: '1m', target: 1 }, { duration: '2m', target: Number(__ENV.PEAK_VUS || 2) }, { duration: '10m', target: Number(__ENV.PEAK_VUS || 2) }, { duration: '1m', target: 0 }], gracefulRampDown: '1m' },
    observation: { executor: 'constant-vus', exec: 'observar', vus: 1, duration: '40m' },
  },
  thresholds: { functional_error_rate: ['rate<0.01'], http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '3m' }] },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};
