import { getStore } from '@netlify/blobs';

const REGISTRY_STORE = 'batch-registry';
const ALLOWED_ORIGINS = new Set([
  'https://tryidente.com',
  'https://www.tryidente.com',
  'https://tryidente.myshopify.com'
]);
const PREVIEW_HOST_SUFFIX = '--sprightly-empanada-8e68ab.netlify.app';

function previewTokenMatches(request) {
  const configured = String(process.env.IDENTE_E2E_PREVIEW_TOKEN || '');
  const given = String(request.headers.get('x-idente-preview-token') || '');
  if (configured.length < 24 || configured.length !== given.length) return false;
  let mismatch = 0;
  for (let index = 0; index < configured.length; index += 1) {
    mismatch |= configured.charCodeAt(index) ^ given.charCodeAt(index);
  }
  return mismatch === 0;
}

function isPreviewHost(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  return host.endsWith(PREVIEW_HOST_SUFFIX) && host !== PREVIEW_HOST_SUFFIX.slice(2);
}

function registryStoreName(request) {
  const previewToken = request.headers.get('x-idente-preview-token');
  if (!isPreviewHost(request)) {
    if (previewToken) throw new Error('Invalid preview test target');
    return REGISTRY_STORE;
  }
  if (!previewTokenMatches(request)) throw new Error('Invalid preview test target');
  const namespace = String(process.env.IDENTE_STORE_NAMESPACE || '').trim();
  if (!namespace) throw new Error('A non-production persistence namespace is required');
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(namespace)) {
    throw new Error('Invalid non-production persistence namespace');
  }
  return `${REGISTRY_STORE}-${namespace}`;
}

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
  const previewAttempt = request.headers.get('x-idente-preview-token');
  const previewHost = isPreviewHost(request);

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(403, { confirmed: false, reason: 'origin_not_allowed' }, origin);
  }
  if ((previewHost || previewAttempt) && !(previewHost && previewTokenMatches(request))) {
    return json(403, { confirmed: false, reason: 'preview_token_invalid' }, origin);
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
    const store = getStoreFn({ name: registryStoreName(request) });
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

export const _test = { ALLOWED_ORIGINS, publicRecord, responseHeaders, registryStoreName, previewTokenMatches, isPreviewHost };
