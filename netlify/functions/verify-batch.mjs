import { getStore } from '@netlify/blobs';

const REGISTRY_STORE = 'batch-registry';
const ALLOWED_ORIGINS = new Set([
  'https://tryidente.com',
  'https://www.tryidente.com',
  'https://tryidente.myshopify.com'
]);

function responseHeaders(origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin)
  });
}

function publicRecord(record, requestedBatch) {
  const type = ['single', 'duo', 'bundle', 'probe'].includes(record?.type)
    ? record.type
    : 'single';
  return {
    confirmed: true,
    batch: String(record?.batch || requestedBatch),
    profile: typeof record?.profile === 'string' ? record.profile : null,
    type,
    volume: typeof record?.volume === 'string'
      ? record.volume
      : type === 'probe' ? '2 ml' : '50 ml',
    date: typeof record?.date === 'string' ? record.date : null,
    concentration: Number.isFinite(Number(record?.concentration))
      ? Number(record.concentration)
      : null,
    registeredAt: typeof record?.createdAt === 'string' ? record.createdAt : null
  };
}

export async function handleVerify(request, dependencies = {}) {
  const origin = request.headers.get('origin') || '';

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(403, { confirmed: false, reason: 'origin_not_allowed' }, origin);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }
  if (request.method !== 'GET') {
    return json(405, { confirmed: false, reason: 'method_not_allowed' }, origin);
  }

  const batch = new URL(request.url).searchParams.get('batch')?.trim() || '';
  if (!/^[A-Za-z0-9-]{4,64}$/.test(batch)) {
    return json(400, { confirmed: false, reason: 'invalid_batch' }, origin);
  }

  try {
    const getStoreFn = dependencies.getStore || getStore;
    const store = getStoreFn({ name: REGISTRY_STORE });
    const record = await store.get(`batch-${batch}`, { type: 'json' });
    if (!record) {
      return json(404, { confirmed: false, reason: 'not_registered' }, origin);
    }
    return json(200, publicRecord(record, batch), origin);
  } catch (error) {
    console.error('Batch registry lookup failed:', error);
    return json(503, { confirmed: false, reason: 'registry_unavailable' }, origin);
  }
}

export default async (request) => handleVerify(request);

export const _test = { ALLOWED_ORIGINS, publicRecord, responseHeaders };
