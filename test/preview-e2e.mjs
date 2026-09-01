import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PREVIEW_FORMULA } from './preview-fixture.mjs';

const baseUrl = String(process.env.QA_PREVIEW_URL || '').replace(/\/$/, '');
const webhookSecret = String(process.env.QA_WEBHOOK_SECRET || '');
const previewToken = String(process.env.QA_PREVIEW_TOKEN || '');
assert.ok(/^https:\/\//.test(baseUrl), 'QA_PREVIEW_URL must be an HTTPS deploy URL');
const previewHost = new URL(baseUrl).hostname;
assert.ok(
  previewHost.endsWith('--sprightly-empanada-8e68ab.netlify.app') &&
    previewHost !== 'sprightly-empanada-8e68ab.netlify.app',
  'QA_PREVIEW_URL must be an isolated Netlify draft deploy, never Production',
);
assert.ok(webhookSecret.length >= 24, 'QA_WEBHOOK_SECRET must be provided');
assert.ok(previewToken.length >= 24, 'QA_PREVIEW_TOKEN must be provided');

const batch = String(crypto.randomInt(10_000_000, 99_999_999));
const webhookId = `idente-preview-${crypto.randomUUID()}`;
const properties = {
  _quiz_batch: batch,
  _quiz_name: 'Şule Ünal-Özdemir',
  _quiz_date: '01.09.2026',
  _quiz_profile: 'IDENTÉ Alltag',
  _quiz_concentration: '22',
  _quiz_harmonie: '91',
  _quiz_match: '95',
  _quiz_formula: JSON.stringify(PREVIEW_FORMULA),
  _quiz_tags: JSON.stringify({ positive: ['fresh', 'clean'], exclude: [] }),
};
const order = {
  id: `preview-${Date.now()}`,
  order_number: `QA-${batch}`,
  financial_status: 'paid',
  customer: { first_name: 'Şule', last_name: 'Ünal-Özdemir' },
  line_items: [{
    variant_id: 52223237783893,
    title: 'Dein persönlicher Duft',
    quantity: 1,
    properties: Object.entries(properties).map(([name, value]) => ({ name, value })),
  }],
};
const body = JSON.stringify(order);
const signature = crypto.createHmac('sha256', webhookSecret).update(body, 'utf8').digest('base64');
const headers = {
  'content-type': 'application/json',
  'x-shopify-hmac-sha256': signature,
  'x-shopify-topic': 'orders/paid',
  'x-shopify-webhook-id': webhookId,
  'x-idente-preview-token': previewToken,
};
const endpoint = `${baseUrl}/.netlify/functions/generate-labels`;
const verifyEndpoint = `${baseUrl}/.netlify/functions/verify-batch?batch=${encodeURIComponent(batch)}`;

// Read-only trust-boundary proof before the first mutating webhook POST. An
// older atomic Production deploy also matches Netlify's deploy-host suffix,
// but it does not implement these preview guards. It must therefore fail here
// before it can touch Production stores or send Production mail.
const invalidPreviewToken = `invalid-${crypto.randomUUID()}`;
const rejectedPreflight = await fetch(verifyEndpoint, {
  headers: { Origin: 'https://tryidente.com', 'x-idente-preview-token': invalidPreviewToken },
});
const rejectedPreflightBody = await rejectedPreflight.json();
assert.equal(rejectedPreflight.status, 403, JSON.stringify(rejectedPreflightBody));
const isolatedPreflight = await fetch(verifyEndpoint, {
  headers: { Origin: 'https://tryidente.com', 'x-idente-preview-token': previewToken },
});
const isolatedPreflightBody = await isolatedPreflight.json();
assert.equal(isolatedPreflight.status, 404, JSON.stringify(isolatedPreflightBody));
assert.equal(isolatedPreflightBody.confirmed, false);

const first = await fetch(endpoint, { method: 'POST', headers, body });
const firstBody = await first.json();
assert.equal(first.status, 200, JSON.stringify(firstBody));
assert.equal(firstBody.count, 1, JSON.stringify(firstBody));

const duplicate = await fetch(endpoint, { method: 'POST', headers, body });
const duplicateBody = await duplicate.json();
assert.equal(duplicate.status, 200, JSON.stringify(duplicateBody));
assert.equal(duplicateBody.message, 'Duplicate webhook ignored', JSON.stringify(duplicateBody));

const verify = await fetch(verifyEndpoint, {
  headers: { Origin: 'https://tryidente.com', 'x-idente-preview-token': previewToken },
});
const verifyBody = await verify.json();
assert.equal(verify.status, 200, JSON.stringify(verifyBody));
assert.equal(verifyBody.confirmed, true);
assert.equal(verifyBody.batch, batch);
assert.equal(verifyBody.profile, 'IDENTÉ Alltag');
assert.equal(verifyBody.type, 'single');
assert.equal(verifyBody.volume, '50 ml');
assert.ok(!('formula' in verifyBody));
assert.ok(!('customer' in verifyBody));
assert.ok(!('name' in verifyBody));
assert.ok(!('order' in verifyBody));
assert.ok(!('orderId' in verifyBody));
assert.ok(!('formulaHash' in verifyBody));

console.log(JSON.stringify({
  preview: baseUrl,
  batch,
  preflightRejected: rejectedPreflight.status,
  preflightIsolated: isolatedPreflight.status,
  first: firstBody.message,
  duplicate: duplicateBody.message,
  verify: verifyBody.confirmed,
}));
