// Test suite for netlify/functions/generate-labels.js
// Run: node test/run-tests.js
// No test framework needed; nodemailer is monkey-patched before the module
// loads so no real email is ever sent. PDFs are written to test/out/ for
// visual inspection.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Intercept email before the function module captures nodemailer
const nodemailer = require('nodemailer');
const sentEmails = [];
nodemailer.createTransport = () => ({
  sendMail: async (opts) => { sentEmails.push(opts); return { messageId: 'test' }; }
});

const fn = require('../netlify/functions/generate-labels.js');
const T = fn._test;

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✘ ${name}${extra ? ' — ' + extra : ''}`); }
}
function isPdf(buf) { return Buffer.isBuffer(buf) && buf.slice(0, 5).toString() === '%PDF-'; }
function decodeQrUrl(url) {
  const encoded = new URL(url).searchParams.get('d');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

const FORMULA_50 = {
  top: [{ name: 'Bergamot', weight: 0.8 }, { name: 'Ginger', weight: 0.6 }, { name: 'Pink Pepper', weight: 0.8 }],
  heart: [{ name: 'Rose', weight: 1.4 }, { name: 'Iris', weight: 1.2 }, { name: 'Lavender', weight: 1.25 }],
  base: [{ name: 'Sandalwood', weight: 1.8 }, { name: 'Musk', weight: 1.5 }, { name: 'Ambroxan', weight: 1.65 }]
};

function formulaFor(concentration) {
  const factor = concentration / 22;
  return Object.fromEntries(Object.entries(FORMULA_50).map(([stage, notes]) => [
    stage,
    notes.map(note => ({ ...note, weight: note.weight * factor }))
  ]));
}

const TYPE_VARIANTS = {
  single: 52223237783893,
  bundle: 52223237914965,
  duo: 54803580125525,
  probe: 54803580158293
};

function makeOrder(lineItems, orderNumber = 4711) {
  return {
    order_number: orderNumber,
    financial_status: 'paid',
    customer: { first_name: 'Test', last_name: 'Kunde <b>x</b>' },
    line_items: lineItems.map(item => {
      const typeProperty = (item.properties || []).find(property => property.name === '_quiz_type');
      const type = typeProperty ? typeProperty.value : 'single';
      return { variant_id: TYPE_VARIANTS[type], ...item };
    })
  };
}
function props(obj) {
  return Object.entries(obj).map(([name, value]) => ({ name, value }));
}
function event(order) {
  return { body: JSON.stringify(order), headers: { 'x-shopify-webhook-id': 'test-' + Math.random() } };
}
function signedShopifyEvent(order, topic = 'orders/paid', secret = 'shhh') {
  const body = JSON.stringify(order);
  return {
    body,
    headers: {
      'x-shopify-webhook-id': 'test-' + Math.random(),
      'x-shopify-topic': topic,
      'x-shopify-hmac-sha256': crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
    }
  };
}

async function main() {
  // ── unit helpers ──────────────────────────────────────────────────────────
  console.log('helpers:');
  check('offsetBatch numeric', T.offsetBatch('12345678', 2) === '12345680');
  check('offsetBatch zero', T.offsetBatch('12345678', 0) === '12345678');
  check('offsetBatch non-numeric no NaN', T.offsetBatch('A1234', 1) === 'A1234-2');
  check('toScoreString NaN fallback', T.toScoreString('abc', '95') === '95');
  check('toScoreString numeric', T.toScoreString('91', '95') === '91');
  check('reducedScore NaN-safe', !T.reducedScore('abc', 2).includes('NaN'));
  check('fileSafeName strips bad chars', T.fileSafeName('A/b\\c:d*e') === 'A-b-c-d-e');
  check('fileSafeName empty fallback', T.fileSafeName('///') === 'Customer');
  check('print label transliterates unsupported Latin letters', T.printableLabelName('Şule Łukasz') === 'Sule Lukasz');
  let rejectedEmptyPrintName = false;
  try { T.printableLabelName('Мария'); } catch { rejectedEmptyPrintName = true; }
  check('print label rejects an empty unsupported rendering', rejectedEmptyPrintName);
  check('escapeHtml', T.escapeHtml('<b>&"\'') === '&lt;b&gt;&amp;&quot;&#39;');
  check('email kind is based on products, not attachment count',
    T.describeProductionKinds(['single', 'single'], 2) === '2 Etiketten');
  const unicodeQr = decodeQrUrl(T.generateQRUrl({
    batch: '12345678', name: 'Şule Ünal-Özdemir 🌸', date: '31.8.2026',
    concentration: 22, harmonie: '91', match: '95',
    profile: 'IDENTÉ Date', type: 'single', volume: '50 ml'
  }));
  check('QR keeps Unicode exactly', unicodeQr.n === 'Şule Ünal-Özdemir 🌸', unicodeQr.n);
  check('QR carries profile/type/volume', unicodeQr.p === 'IDENTÉ Date' && unicodeQr.t === 'single' && unicodeQr.v === '50 ml');

  // A supplied malformed formula is a production error, not a silent fallback.
  const bad = JSON.stringify({ top: [{ name: 'X', weight: -5 }], heart: [], base: [] });
  let rejectedBadFormula = false;
  try { T.resolveFormula(bad, { positive: ['fresh'], exclude: [] }, 22, 0); } catch { rejectedBadFormula = true; }
  check('resolveFormula rejects negative/arbitrary materials', rejectedBadFormula);
  const good = T.resolveFormula(JSON.stringify(FORMULA_50), {}, 22, 0);
  check('resolveFormula accepts valid formula', good.top[0].name === 'Bergamot' && Math.abs(good.oilTotal - 11) < 1e-9);
  let rejectedMismatch = false;
  try { T.resolveFormula(JSON.stringify(FORMULA_50), {}, 28, 0); } catch { rejectedMismatch = true; }
  check('resolveFormula rejects concentration/weight mismatch', rejectedMismatch);
  check('usableFormula accepts localized theme material', !!T.usableFormula({
    top: [{ name: 'Bergamotte', weight: 2 }],
    heart: [{ name: 'Jasmin', weight: 4 }],
    base: [{ name: 'Sandelholz', weight: 5 }]
  }, 11));
  let rejectedMissing = false;
  try { T.resolveFormula('', {}, 22, 0); } catch (error) { rejectedMissing = error.message === 'Missing quiz formula'; }
  check('resolveFormula rejects a missing production formula', rejectedMissing);
  check('material aliases preserve semantics across locales',
    T.canonicalMaterialName('Nelke') === 'Clove' &&
    T.canonicalMaterialName('Carnation') === 'Clove' &&
    T.canonicalMaterialName('Birke') === 'Birch Tar' &&
    T.canonicalMaterialName('Guaiac Wood') === 'Guaiacwood' &&
    T.canonicalMaterialName('Tee') === 'Tea');
  check('paid order is production-ready', T.assertProductionReadyOrder({ financial_status: 'paid' }) === undefined);
  for (const financialStatus of ['pending', 'authorized', 'partially_paid', '']) {
    let rejectedUnpaid = false;
    try { T.assertProductionReadyOrder({ financial_status: financialStatus }); } catch { rejectedUnpaid = true; }
    check(`production rejects ${financialStatus || 'missing'} financial status`, rejectedUnpaid);
  }
  const approvedDigest = T.formulaDigest(T.usableFormula(FORMULA_50, 11));
  process.env.IDENTE_REQUIRE_FORMULA_APPROVAL = 'true';
  delete process.env.IDENTE_APPROVED_FORMULA_HASHES;
  let rejectedUnapproved = false;
  try { T.resolveFormula(JSON.stringify(FORMULA_50), {}, 22, 0); } catch (error) { rejectedUnapproved = error.message.startsWith('Unapproved quiz formula'); }
  check('production approval gate rejects an unapproved formula', rejectedUnapproved);
  process.env.IDENTE_APPROVED_FORMULA_HASHES = approvedDigest;
  check('production approval gate accepts an explicit server-side hash',
    T.resolveFormula(JSON.stringify(FORMULA_50), {}, 22, 0).top[0].name === 'Bergamot');
  delete process.env.IDENTE_REQUIRE_FORMULA_APPROVAL;
  delete process.env.IDENTE_APPROVED_FORMULA_HASHES;

  const registryRecord = {
    batch: '12345678', order: 4711, orderId: 99, type: 'single', qty: 1,
    profile: 'IDENTÉ Alltag', volume: '50 ml', name: 'Ada', date: '1.9.2026',
    concentration: 22, formulaHash: approvedDigest, formulaVersion: 'quiz-v6-backend-v2',
    materialLibraryVersion: 'legacy-60-2026-09'
  };
  check('registry replay requires all production metadata',
    T.registryRecordMatches({ ...registryRecord }, registryRecord) &&
    !T.registryRecordMatches({ ...registryRecord, profile: 'IDENTÉ Date' }, registryRecord));
  let registryCollision = false;
  try {
    await T.writeRegistryEntry({
      setJSON: async () => ({ modified: false }),
      get: async () => ({ ...registryRecord, name: 'Mallory' })
    }, 'batch-12345678', registryRecord);
  } catch (error) { registryCollision = error.message === 'Batch collision 12345678'; }
  check('registry fake store rejects same-order metadata collision', registryCollision);

  // ── HMAC ──────────────────────────────────────────────────────────────────
  console.log('hmac:');
  delete process.env.SHOPIFY_WEBHOOK_SECRET;
  delete process.env.SHOPIFY_WEBHOOK_SECRET_PREVIOUS;
  check('missing secret fails closed', T.verifyShopifyHmac({ headers: {}, body: 'x' }).reason === 'missing_secret');
  sentEmails.length = 0;
  const unconfigured = await fn.handler({ body: '{}', headers: {} }, {});
  check('handler refuses work without secret', unconfigured.statusCode === 503 && sentEmails.length === 0);
  process.env.SHOPIFY_WEBHOOK_SECRET = 'shhh';
  const body = JSON.stringify({ a: 1 });
  const sig = crypto.createHmac('sha256', 'shhh').update(body, 'utf8').digest('base64');
  check('valid signature accepted', T.verifyShopifyHmac({ headers: { 'x-shopify-hmac-sha256': sig }, body }).ok === true);
  process.env.SHOPIFY_WEBHOOK_SECRET_PREVIOUS = 'old-shhh';
  const previousSig = crypto.createHmac('sha256', 'old-shhh').update(body, 'utf8').digest('base64');
  check('previous rotation signature accepted during overlap', T.verifyShopifyHmac({ headers: { 'x-shopify-hmac-sha256': previousSig }, body }).ok === true);
  check('primary signature remains accepted during overlap', T.verifyShopifyHmac({ headers: { 'x-shopify-hmac-sha256': sig }, body }).ok === true);
  check('invalid signature rejected', T.verifyShopifyHmac({ headers: { 'x-shopify-hmac-sha256': 'AAAA' + sig.slice(4) }, body }).ok === false);
  check('missing header rejected', T.verifyShopifyHmac({ headers: {}, body }).ok === false);
  const b64 = { headers: { 'x-shopify-hmac-sha256': sig }, body: Buffer.from(body, 'utf8').toString('base64'), isBase64Encoded: true };
  check('base64 body verified', T.verifyShopifyHmac(b64).ok === true);
  sentEmails.length = 0;
  const paidEnvelopeOrder = makeOrder([], 4700);
  check('orders/paid + paid payload is production webhook',
    T.validateProductionWebhook(signedShopifyEvent(paidEnvelopeOrder)).ok === true);
  let envelopeResult = await fn.handler(signedShopifyEvent(paidEnvelopeOrder), {});
  check('handler accepts signed paid topic before normal processing',
    envelopeResult.statusCode === 200 && sentEmails.length === 0, envelopeResult.body);
  envelopeResult = await fn.handler(signedShopifyEvent(paidEnvelopeOrder, 'orders/create'), {});
  check('handler rejects legacy orders/create before production side effects',
    envelopeResult.statusCode === 400 && sentEmails.length === 0, envelopeResult.body);
  const pendingEnvelopeOrder = { ...paidEnvelopeOrder, financial_status: 'pending' };
  envelopeResult = await fn.handler(signedShopifyEvent(pendingEnvelopeOrder), {});
  check('handler rejects unpaid orders/paid payload before production side effects',
    envelopeResult.statusCode === 422 && sentEmails.length === 0, envelopeResult.body);
  envelopeResult = await fn.handler(signedShopifyEvent(paidEnvelopeOrder, ''), {});
  check('handler rejects missing topic before production side effects',
    envelopeResult.statusCode === 400 && sentEmails.length === 0, envelopeResult.body);
  sentEmails.length = 0;
  const rejected = await fn.handler({
    body,
    headers: { 'x-shopify-hmac-sha256': 'invalid' }
  }, {});
  check('handler rejects invalid HMAC before side effects', rejected.statusCode === 401 && sentEmails.length === 0);
  delete process.env.SHOPIFY_WEBHOOK_SECRET;
  check('previous-only configuration fails closed', T.verifyShopifyHmac({ headers: { 'x-shopify-hmac-sha256': previousSig }, body }).reason === 'missing_secret');
  delete process.env.SHOPIFY_WEBHOOK_SECRET_PREVIOUS;

  // ── idempotency lease state machine ─────────────────────────────────────
  console.log('idempotency:');
  check('fresh lease acquired', await T.acquireLease({
    set: async () => ({ modified: true })
  }, 'fresh') === 'acquired');
  check('completed webhook ignored', await T.acquireLease({
    set: async () => ({ modified: false }),
    getWithMetadata: async () => ({ data: { status: 'done', at: Date.now() }, etag: 'done' })
  }, 'done') === 'done');
  check('active lease reports in-progress', await T.acquireLease({
    set: async () => ({ modified: false }),
    getWithMetadata: async () => ({ data: { status: 'processing', at: Date.now() }, etag: 'active' })
  }, 'active') === 'in-progress');
  let takeoverEtag = null;
  check('stale lease is atomically taken over', await T.acquireLease({
    set: async (_key, _value, opts) => {
      if (opts.onlyIfNew) return { modified: false };
      takeoverEtag = opts.onlyIfMatch;
      return { modified: true };
    },
    getWithMetadata: async () => ({ data: { status: 'processing', at: Date.now() - 20 * 60 * 1000 }, etag: 'stale-etag' })
  }, 'stale') === 'acquired' && takeoverEtag === 'stale-etag');

  // ── single order ──────────────────────────────────────────────────────────
  console.log('single:');
  sentEmails.length = 0;
  let res = await T.processWebhook(event(makeOrder([{
    name: 'Dein Persönlicher Duft - Date', quantity: 1,
    properties: props({
      _quiz_batch: '96991840', _quiz_name: 'Şule Ünal-Özdemir 🌸', _quiz_date: '26.8.2026',
      _quiz_profile: 'IDENTÉ Date', _quiz_concentration: '28', _quiz_harmonie: '91', _quiz_match: '95',
      _quiz_formula: JSON.stringify(formulaFor(28)),
      _quiz_tags: JSON.stringify({ positive: ['sensual'], exclude: [] })
    })
  }])));
  check('single: 200', res.statusCode === 200, res.body);
  check('single: one email', sentEmails.length === 1);
  check('single: one attachment', sentEmails[0].attachments.length === 1);
  check('single: attachment is PDF', isPdf(sentEmails[0].attachments[0].content));
  check('single: unicode-safe filename', /^IDENTE-[A-Za-z0-9_-]+-96991840\.pdf$/.test(sentEmails[0].attachments[0].filename), sentEmails[0].attachments[0].filename);
  check('single: html escaped', !sentEmails[0].html.includes('<b>x</b>'));
  fs.writeFileSync(path.join(OUT, 'single.pdf'), sentEmails[0].attachments[0].content);

  // ── trio bundle ───────────────────────────────────────────────────────────
  console.log('trio:');
  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    name: 'Trio Bundle', quantity: 1,
    properties: props({
      _quiz_type: 'bundle', _quiz_batch: '43684962', _quiz_name: 'Lena', _quiz_date: '19.1.2026',
      _quiz_concentration: '25', _quiz_harmonie: '93', _quiz_match: '94',
      _quiz_main_profile: 'IDENTÉ Alltag', _quiz_main_formula: JSON.stringify(formulaFor(25)),
      _quiz_rec1_profile: 'IDENTÉ Date', _quiz_rec1_formula: JSON.stringify(formulaFor(25)),
      _quiz_rec2_profile: 'IDENTÉ Business', _quiz_rec2_formula: JSON.stringify(formulaFor(25)),
      _quiz_tags: JSON.stringify({ positive: ['elegant'], exclude: [] })
    })
  }])));
  check('trio: 200', res.statusCode === 200, res.body);
  check('trio: 3 attachments', sentEmails[0].attachments.length === 3);
  check('trio: batches base/+1/+2',
    sentEmails[0].attachments[0].filename.includes('43684962') &&
    sentEmails[0].attachments[1].filename.includes('43684963') &&
    sentEmails[0].attachments[2].filename.includes('43684964'));
  check('trio: subject says TRIO', sentEmails[0].subject.includes('TRIO'));

  // ── trio with non-numeric batch (NaN regression) ──────────────────────────
  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    name: 'Trio Bundle', quantity: 1,
    properties: props({
      _quiz_type: 'bundle', _quiz_batch: 'X99Z', _quiz_name: 'Nan Test',
      _quiz_harmonie: 'zz', _quiz_match: 'zz',
      _quiz_main_formula: JSON.stringify(FORMULA_50),
      _quiz_rec1_formula: JSON.stringify(FORMULA_50),
      _quiz_rec2_formula: JSON.stringify(FORMULA_50),
      _quiz_tags: JSON.stringify({ positive: ['fresh'], exclude: [] })
    })
  }])));
  check('trio non-numeric batch: 200', res.statusCode === 200, res.body);
  check('trio non-numeric batch: no NaN in filenames', sentEmails[0].attachments.every(a => !a.filename.includes('NaN')),
    sentEmails[0].attachments.map(a => a.filename).join(','));

  // ── duo ───────────────────────────────────────────────────────────────────
  console.log('duo:');
  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    name: 'Duo Bundle', quantity: 1,
    properties: props({
      _quiz_type: 'duo', _quiz_batch: '55550001', _quiz_name: 'Mara', _quiz_date: '31.8.2026',
      _quiz_concentration: '22', _quiz_harmonie: '92', _quiz_match: '90',
      _quiz_main_profile: 'IDENTÉ Alltag', _quiz_main_formula: JSON.stringify(FORMULA_50),
      _quiz_rec1_profile: 'IDENTÉ Date', _quiz_rec1_formula: JSON.stringify(FORMULA_50),
      _quiz_tags: JSON.stringify({ positive: ['warm'], exclude: [] })
    })
  }])));
  check('duo: 200', res.statusCode === 200, res.body);
  check('duo: 2 attachments', sentEmails[0].attachments.length === 2, String(sentEmails[0] && sentEmails[0].attachments.length));
  check('duo: subject says DUO', sentEmails[0].subject.includes('DUO'), sentEmails[0].subject);
  check('duo: MAIN + REC1', sentEmails[0].attachments[0].filename.includes('MAIN') && sentEmails[0].attachments[1].filename.includes('REC1'));
  fs.writeFileSync(path.join(OUT, 'duo-main.pdf'), sentEmails[0].attachments[0].content);

  // ── probe (2ml sample) ────────────────────────────────────────────────────
  console.log('probe:');
  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    name: 'Probe 2 ml', quantity: 1,
    properties: props({
      _quiz_type: 'probe', _quiz_batch: '77770001', _quiz_name: 'Jonas', _quiz_date: '31.8.2026',
      _quiz_profile: 'IDENTÉ Business', _quiz_concentration: '22', _quiz_harmonie: '90', _quiz_match: '93',
      _quiz_formula: JSON.stringify(FORMULA_50),
      _quiz_tags: JSON.stringify({ positive: ['confident'], exclude: [] })
    })
  }])));
  check('probe: 200', res.statusCode === 200, res.body);
  check('probe: 1 attachment', sentEmails[0].attachments.length === 1);
  check('probe: PROBE filename', sentEmails[0].attachments[0].filename.startsWith('IDENTE-PROBE-'));
  check('probe: subject says PROBE', sentEmails[0].subject.includes('PROBE'), sentEmails[0].subject);
  check('probe: production note in email', sentEmails[0].html.includes('PROBE 2 ml'));
  check('probe: is PDF', isPdf(sentEmails[0].attachments[0].content));
  fs.writeFileSync(path.join(OUT, 'probe-sheet.pdf'), sentEmails[0].attachments[0].content);

  // ── quantity handling ─────────────────────────────────────────────────────
  console.log('quantity:');
  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    name: 'Dein Persönlicher Duft - Alltag', quantity: 2,
    properties: props({
      _quiz_batch: '88880001', _quiz_name: 'Kim', _quiz_profile: 'IDENTÉ Alltag',
      _quiz_formula: JSON.stringify(FORMULA_50),
      _quiz_tags: JSON.stringify({ positive: ['fresh'], exclude: [] })
    })
  }])));
  check('qty: 200', res.statusCode === 200, res.body);
  check('qty: note in email', sentEmails[0].html.includes('Menge 2'), sentEmails[0].html.slice(0, 400));
  check('qty: marked in file list', sentEmails[0].html.includes('× 2'));

  // ── legacy order without properties ───────────────────────────────────────
  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{ name: 'Irgendwas', quantity: 1, properties: [] }])));
  check('no-props: 200 without email', res.statusCode === 200 && sentEmails.length === 0);

  // ── mixed order: trio + single (like real order #1017) ────────────────────
  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([
    {
      name: 'Trio Bundle', quantity: 1,
      properties: props({
        _quiz_type: 'bundle', _quiz_batch: '10000001', _quiz_name: 'Alex',
        _quiz_main_formula: JSON.stringify(FORMULA_50),
        _quiz_rec1_formula: JSON.stringify(FORMULA_50),
        _quiz_rec2_formula: JSON.stringify(FORMULA_50),
        _quiz_tags: JSON.stringify({ positive: ['woody'], exclude: [] })
      })
    },
    {
      name: 'Dein Persönlicher Duft - Business', quantity: 1,
      properties: props({
        _quiz_batch: '10000009', _quiz_name: 'Alex', _quiz_profile: 'IDENTÉ Business',
        _quiz_formula: JSON.stringify(FORMULA_50),
        _quiz_tags: JSON.stringify({ positive: ['woody'], exclude: [] })
      })
    }
  ])));
  check('mixed: 200', res.statusCode === 200, res.body);
  check('mixed: 4 attachments', sentEmails[0].attachments.length === 4, String(sentEmails[0].attachments.length));
  check('mixed: subject is not mislabeled as bundle', sentEmails[0].subject.includes('MIXED ORDER'), sentEmails[0].subject);

  // ── adversarial production-contract checks ───────────────────────────────
  console.log('contract hardening:');
  sentEmails.length = 0;
  const unpaidOrder = makeOrder([{
    name: 'Single pending payment', quantity: 1,
    properties: props({
      _quiz_batch: '11110001', _quiz_name: 'Pending', _quiz_profile: 'IDENTÉ Alltag',
      _quiz_concentration: '22', _quiz_formula: JSON.stringify(FORMULA_50)
    })
  }], 4800);
  unpaidOrder.financial_status = 'pending';
  res = await T.processWebhook(event(unpaidOrder));
  check('unpaid order is rejected before artifact/email side effects',
    res.statusCode === 500 && sentEmails.length === 0 && res.body.includes('Order is not paid'), res.body);

  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    variant_id: TYPE_VARIANTS.probe,
    name: 'Manipulated sample', quantity: 1,
    properties: props({
      _quiz_batch: '22220001', _quiz_name: 'Mallory', _quiz_profile: 'IDENTÉ Alltag',
      _quiz_concentration: '22', _quiz_formula: JSON.stringify(FORMULA_50)
    })
  }], 4801)));
  check('variant/type mismatch is rejected before email', res.statusCode === 500 && sentEmails.length === 0, res.body);

  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    name: 'Single A', quantity: 1,
    properties: props({
      _quiz_batch: '33330001', _quiz_name: 'Ada', _quiz_profile: 'IDENTÉ Alltag',
      _quiz_concentration: '22', _quiz_formula: JSON.stringify(FORMULA_50)
    })
  }, {
    name: 'Single B', quantity: 1,
    properties: props({
      _quiz_batch: '33330001', _quiz_name: 'Ada', _quiz_profile: 'IDENTÉ Date',
      _quiz_concentration: '22', _quiz_formula: JSON.stringify(FORMULA_50)
    })
  }], 4802)));
  check('duplicate batch inside one order is rejected before email', res.statusCode === 500 && sentEmails.length === 0, res.body);

  sentEmails.length = 0;
  res = await T.processWebhook(event(makeOrder([{
    variant_id: 999999999,
    name: 'Unknown quiz product', quantity: 1,
    properties: props({ _quiz_batch: '44440001', _quiz_name: 'Eve' })
  }], 4803)));
  check('unknown quiz variant is rejected before email', res.statusCode === 500 && sentEmails.length === 0, res.body);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
