import { handleVerify, _test } from '../netlify/functions/verify-batch.mjs';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const allowedOrigin = 'https://tryidente.com';
const record = {
  batch: '12345678',
  order: 4711,
  type: 'probe',
  qty: 1,
  profile: 'IDENTÉ Business',
  volume: '2 ml',
  name: 'Private Name',
  date: '01.09.2026',
  concentration: 22,
  formula: { top: [{ name: 'Secret', weight: 1 }] },
  createdAt: '2026-09-01T12:00:00.000Z'
};

function deps(value = record) {
  return {
    getStore: () => ({ get: async () => value })
  };
}

const ok = await handleVerify(
  new Request('https://example.test/verify-batch?batch=12345678', {
    headers: { Origin: allowedOrigin }
  }),
  deps()
);
const okBody = await ok.json();
check('registered batch returns 200', ok.status === 200);
check('registered batch is confirmed', okBody.confirmed === true);
check('public response carries product metadata', okBody.type === 'probe' && okBody.volume === '2 ml');
check('public response omits customer, order and formula',
  !('name' in okBody) && !('order' in okBody) && !('formula' in okBody));
check('allowed origin receives CORS header', ok.headers.get('access-control-allow-origin') === allowedOrigin);

const missing = await handleVerify(
  new Request('https://example.test/verify-batch?batch=99999999', {
    headers: { Origin: allowedOrigin }
  }),
  deps(null)
);
check('unknown batch is not confirmed', missing.status === 404 && (await missing.json()).confirmed === false);

const invalid = await handleVerify(
  new Request('https://example.test/verify-batch?batch=../../private', {
    headers: { Origin: allowedOrigin }
  }),
  deps()
);
check('invalid batch is rejected before storage', invalid.status === 400);

const forbidden = await handleVerify(
  new Request('https://example.test/verify-batch?batch=12345678', {
    headers: { Origin: 'https://attacker.example' }
  }),
  deps()
);
check('untrusted browser origin is rejected', forbidden.status === 403);
check('untrusted origin gets no CORS grant', !forbidden.headers.get('access-control-allow-origin'));

const options = await handleVerify(
  new Request('https://example.test/verify-batch', {
    method: 'OPTIONS', headers: { Origin: allowedOrigin }
  }),
  deps()
);
check('preflight succeeds for storefront', options.status === 204);

const hidden = _test.publicRecord(record, '12345678');
check('publicRecord never leaks protected fields',
  !('name' in hidden) && !('formula' in hidden) && !('order' in hidden));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
