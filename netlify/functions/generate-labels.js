// netlify/functions/generate-labels.js
// IDENTÉ Personalized Perfume Label Generator
// Supports single orders AND bundle orders (3 separate labels)

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');

// Optional dependency: when Netlify Blobs is unavailable (local runs, missing
// context) the webhook still processes, just without dedupe (fail-open).
let netlifyBlobs = null;
try { netlifyBlobs = require('@netlify/blobs'); } catch (e) { /* fail-open */ }

// ═══════════════════════════════════════════════════════════════════════════
// FRAGRANCE NOTES DATABASE (60 Notes)
// ═══════════════════════════════════════════════════════════════════════════

const NOTES_DATABASE = {
  top: [
    { name: "Bergamot", tags: ["citrus", "fresh", "light", "unisex", "classic", "elegant", "uplifting"], intensity: 0.7 },
    { name: "Lemon", tags: ["citrus", "fresh", "light", "clean", "energetic", "sharp", "unisex"], intensity: 0.6 },
    { name: "Sweet Orange", tags: ["citrus", "fresh", "sweet", "warm", "friendly", "casual", "unisex"], intensity: 0.6 },
    { name: "Mandarin", tags: ["citrus", "fresh", "sweet", "soft", "gentle", "feminine", "playful"], intensity: 0.5 },
    { name: "Grapefruit", tags: ["citrus", "fresh", "bitter", "energetic", "sporty", "modern", "unisex"], intensity: 0.7 },
    { name: "Neroli", tags: ["floral", "citrus", "elegant", "luxurious", "romantic", "feminine", "classic"], intensity: 0.8 },
    { name: "Mint", tags: ["fresh", "cool", "energetic", "clean", "sporty", "sharp", "masculine"], intensity: 0.8 },
    { name: "Green Apple", tags: ["fresh", "fruity", "sweet", "playful", "youthful", "casual", "unisex"], intensity: 0.5 },
    { name: "Cassis", tags: ["fruity", "sweet", "dark", "mysterious", "feminine", "sensual", "modern"], intensity: 0.7 },
    { name: "Pink Pepper", tags: ["spicy", "fresh", "warm", "elegant", "modern", "unisex", "sophisticated"], intensity: 0.7 },
    { name: "Cardamom", tags: ["spicy", "warm", "exotic", "oriental", "masculine", "sophisticated", "luxurious"], intensity: 0.8 },
    { name: "Basil", tags: ["herbal", "fresh", "green", "aromatic", "unisex", "natural", "modern"], intensity: 0.6 },
    { name: "Galbanum", tags: ["green", "fresh", "sharp", "modern", "artistic", "unisex", "bold"], intensity: 0.8 },
    { name: "Sea Water", tags: ["aquatic", "fresh", "clean", "sporty", "modern", "masculine", "casual"], intensity: 0.5 },
    { name: "Ginger", tags: ["spicy", "warm", "energetic", "exotic", "unisex", "bold", "modern"], intensity: 0.7 }
  ],
  heart: [
    { name: "Rose", tags: ["floral", "romantic", "classic", "feminine", "elegant", "luxurious", "sensual"], intensity: 0.9 },
    { name: "Jasmine", tags: ["floral", "sensual", "exotic", "feminine", "romantic", "intense", "luxurious"], intensity: 0.9 },
    { name: "Iris", tags: ["floral", "powdery", "elegant", "luxurious", "sophisticated", "feminine", "classic"], intensity: 0.8 },
    { name: "Ylang-Ylang", tags: ["floral", "exotic", "sensual", "sweet", "feminine", "romantic", "tropical"], intensity: 0.9 },
    { name: "Tuberose", tags: ["floral", "intense", "sensual", "feminine", "dramatic", "luxurious", "romantic"], intensity: 1.0 },
    { name: "Lily of the Valley", tags: ["floral", "fresh", "light", "feminine", "innocent", "spring", "clean"], intensity: 0.5 },
    { name: "Freesia", tags: ["floral", "fresh", "light", "feminine", "delicate", "modern", "clean"], intensity: 0.5 },
    { name: "Peony", tags: ["floral", "fresh", "feminine", "romantic", "soft", "elegant", "spring"], intensity: 0.6 },
    { name: "Lavender", tags: ["herbal", "fresh", "clean", "calming", "unisex", "classic", "aromatic"], intensity: 0.7 },
    { name: "Geranium", tags: ["floral", "green", "fresh", "unisex", "classic", "balanced", "herbal"], intensity: 0.6 },
    { name: "Orange Blossom", tags: ["floral", "fresh", "romantic", "feminine", "elegant", "spring", "soft"], intensity: 0.7 },
    { name: "Clove", tags: ["spicy", "warm", "intense", "masculine", "bold", "oriental", "classic"], intensity: 0.9 },
    { name: "Cinnamon", tags: ["spicy", "warm", "sweet", "exotic", "sensual", "oriental", "cozy"], intensity: 0.8 },
    { name: "Nutmeg", tags: ["spicy", "warm", "cozy", "masculine", "classic", "oriental", "sophisticated"], intensity: 0.7 },
    { name: "Saffron", tags: ["spicy", "luxurious", "exotic", "oriental", "intense", "unique", "sophisticated"], intensity: 0.9 },
    { name: "Tonka Bean", tags: ["sweet", "warm", "cozy", "gourmand", "sensual", "unisex", "addictive"], intensity: 0.8 },
    { name: "Peach", tags: ["fruity", "sweet", "soft", "feminine", "playful", "romantic", "summer"], intensity: 0.5 },
    { name: "Plum", tags: ["fruity", "sweet", "dark", "sensual", "feminine", "mysterious", "autumn"], intensity: 0.6 },
    { name: "Red Berries", tags: ["fruity", "sweet", "fresh", "playful", "feminine", "youthful", "casual"], intensity: 0.5 },
    { name: "Chocolate", tags: ["gourmand", "sweet", "sensual", "warm", "indulgent", "unisex", "cozy"], intensity: 0.8 },
    { name: "Coffee", tags: ["gourmand", "bitter", "energetic", "modern", "bold", "unisex", "addictive"], intensity: 0.8 },
    { name: "Tobacco", tags: ["smoky", "warm", "masculine", "sophisticated", "classic", "bold", "sensual"], intensity: 0.9 },
    { name: "Tea", tags: ["fresh", "clean", "light", "calming", "unisex", "elegant", "subtle"], intensity: 0.4 }
  ],
  base: [
    { name: "Sandalwood", tags: ["woody", "creamy", "warm", "luxurious", "sensual", "unisex", "classic"], intensity: 0.8 },
    { name: "Cedarwood", tags: ["woody", "dry", "masculine", "classic", "clean", "strong", "confident"], intensity: 0.7 },
    { name: "Vetiver", tags: ["woody", "earthy", "masculine", "sophisticated", "green", "bold", "classic"], intensity: 0.8 },
    { name: "Patchouli", tags: ["woody", "earthy", "intense", "exotic", "sensual", "unisex", "bohemian"], intensity: 0.9 },
    { name: "Oud", tags: ["woody", "luxurious", "intense", "exotic", "oriental", "bold", "masculine"], intensity: 1.0 },
    { name: "Guaiacwood", tags: ["woody", "smoky", "warm", "masculine", "sophisticated", "subtle", "modern"], intensity: 0.7 },
    { name: "Oakmoss", tags: ["woody", "earthy", "classic", "masculine", "elegant", "vintage", "forest"], intensity: 0.8 },
    { name: "Amber", tags: ["warm", "sweet", "sensual", "oriental", "cozy", "unisex", "classic"], intensity: 0.8 },
    { name: "Musk", tags: ["clean", "sensual", "soft", "unisex", "modern", "skin", "intimate"], intensity: 0.6 },
    { name: "Castoreum", tags: ["animalic", "leather", "intense", "masculine", "bold", "vintage", "sensual"], intensity: 0.9 },
    { name: "Vanilla", tags: ["sweet", "warm", "gourmand", "cozy", "sensual", "unisex", "addictive"], intensity: 0.7 },
    { name: "Benzoin", tags: ["sweet", "warm", "balsamic", "cozy", "oriental", "unisex", "soft"], intensity: 0.7 },
    { name: "Frankincense", tags: ["smoky", "spiritual", "elegant", "classic", "unisex", "mysterious", "warm"], intensity: 0.8 },
    { name: "Myrrh", tags: ["smoky", "warm", "exotic", "spiritual", "mysterious", "unisex", "oriental"], intensity: 0.8 },
    { name: "Labdanum", tags: ["warm", "sweet", "animalic", "sensual", "oriental", "unisex", "complex"], intensity: 0.8 },
    { name: "Leather", tags: ["leather", "bold", "masculine", "sophisticated", "intense", "classic", "confident"], intensity: 0.9 },
    { name: "Birch Tar", tags: ["smoky", "leather", "intense", "masculine", "bold", "dark", "unique"], intensity: 1.0 },
    { name: "Suede", tags: ["leather", "soft", "elegant", "sophisticated", "unisex", "modern", "subtle"], intensity: 0.6 },
    { name: "Iso E Super", tags: ["woody", "modern", "subtle", "clean", "unisex", "molecular", "skin"], intensity: 0.5 },
    { name: "Cashmeran", tags: ["woody", "musky", "soft", "cozy", "modern", "unisex", "warm"], intensity: 0.6 },
    { name: "Ambroxan", tags: ["woody", "musky", "modern", "clean", "unisex", "molecular", "radiant"], intensity: 0.7 },
    { name: "Hedione", tags: ["floral", "fresh", "light", "modern", "unisex", "radiant", "transparent"], intensity: 0.4 }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// PERSONALIZED FORMULA ALGORITHM
// ═══════════════════════════════════════════════════════════════════════════

function generatePersonalizedFormula(quizTags, concentration = 22, seed = 0) {
  const positiveTags = quizTags.positive || [];
  const excludeTags = quizTags.exclude || [];
  const intensityMod = quizTags.intensityModifier || 1.0;
  
  function scoreNote(note) {
    for (const tag of excludeTags) {
      if (note.tags.includes(tag)) return -1000;
    }
    let score = 0;
    for (const tag of positiveTags) {
      if (note.tags.includes(tag)) score += 1;
    }
    score += note.intensity * intensityMod * 0.5;
    // Add small random factor based on seed for variety
    score += (seed % 10) * 0.01;
    return score;
  }
  
  const scoredTop = NOTES_DATABASE.top
    .map(n => ({ ...n, score: scoreNote(n) }))
    .filter(n => n.score > -1000)
    .sort((a, b) => b.score - a.score);
    
  const scoredHeart = NOTES_DATABASE.heart
    .map(n => ({ ...n, score: scoreNote(n) }))
    .filter(n => n.score > -1000)
    .sort((a, b) => b.score - a.score);
    
  const scoredBase = NOTES_DATABASE.base
    .map(n => ({ ...n, score: scoreNote(n) }))
    .filter(n => n.score > -1000)
    .sort((a, b) => b.score - a.score);
  
  // Select 4-5 from each based on seed
  const topCount = 4 + (seed % 2);
  const heartCount = 4 + ((seed + 1) % 2);
  const baseCount = 4 + ((seed + 2) % 2);
  
  const selectedTop = scoredTop.slice(0, topCount);
  const selectedHeart = scoredHeart.slice(0, heartCount);
  const selectedBase = scoredBase.slice(0, baseCount);
  
  // Calculate for 50ml
  const totalOil = 50 * (concentration / 100);
  const alcoholAmount = 50 - totalOil;
  
  const topOil = totalOil * 0.20;
  const heartOil = totalOil * 0.35;
  const baseOil = totalOil * 0.45;
  
  function distributeWeights(notes, totalWeight) {
    if (notes.length === 0) return [];
    const totalScore = notes.reduce((sum, n) => sum + Math.max(n.score, 0.1), 0);
    
    let weights = notes.map((note, index) => {
      const positionBoost = 1 + (notes.length - index) * 0.08;
      const weight = (Math.max(note.score, 0.1) / totalScore) * totalWeight * positionBoost;
      return { name: note.name, weight };
    });
    
    const currentTotal = weights.reduce((sum, n) => sum + n.weight, 0);
    const factor = totalWeight / currentTotal;
    return weights.map(n => ({ name: n.name, weight: n.weight * factor }));
  }
  
  return {
    top: distributeWeights(selectedTop, topOil),
    heart: distributeWeights(selectedHeart, heartOil),
    base: distributeWeights(selectedBase, baseOil),
    oilTotal: totalOil,
    alcoholTotal: alcoholAmount,
    grandTotal: 50
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

const processWebhook = async (event, context) => {
  try {
    console.log('🔔 Webhook received');
    const order = JSON.parse(event.body);
    console.log(`📦 Order #${order.order_number} from ${order.customer?.first_name || 'Customer'}`);

    const labels = [];

    for (const item of order.line_items) {
      console.log(`📝 Processing item: ${item.name}`);

      if (!item.properties || item.properties.length === 0) {
        console.log('⚠️ No quiz properties found, skipping');
        continue;
      }

      const props = {};
      item.properties.forEach(p => { props[p.name] = p.value; });

      // ═══════════════════════════════════════════════════════════════════════
      // CHECK IF BUNDLE OR SINGLE PRODUCT
      // ═══════════════════════════════════════════════════════════════════════
      
      if (props._quiz_type === 'bundle') {
        console.log('📦 BUNDLE ORDER DETECTED - Generating 3 labels');
        
        const baseBatch = props._quiz_batch || String(Date.now()).slice(-8);
        const customerName = props._quiz_name || order.customer?.first_name || 'Customer';
        const dateStr = props._quiz_date || new Date().toLocaleDateString('de-DE');
        const concentration = parseInt(props._quiz_concentration) || 22;
        const harmonie = props._quiz_harmonie || '95';
        const match = props._quiz_match || '92';
        
        // Parse quiz tags
        let quizTags = { positive: [], exclude: [], intensityModifier: 1.0 };
        try {
          if (props._quiz_tags) quizTags = JSON.parse(props._quiz_tags);
        } catch (e) { console.log('⚠️ Could not parse quiz tags'); }
        
        // ─────────────────────────────────────────────────────────────────────
        // LABEL 1: Main Perfume
        // ─────────────────────────────────────────────────────────────────────
        let mainFormula;
        try {
          if (props._quiz_main_formula) {
            mainFormula = usableFormula(JSON.parse(props._quiz_main_formula)) || generatePersonalizedFormula(quizTags, concentration, 0);
          } else {
            mainFormula = generatePersonalizedFormula(quizTags, concentration, 0);
          }
        } catch (e) {
          mainFormula = generatePersonalizedFormula(quizTags, concentration, 0);
        }
        
        const mainData = {
          batch: baseBatch,
          name: customerName,
          date: dateStr,
          profile: props._quiz_main_profile || 'IDENTÉ Custom',
          concentration,
          harmonie,
          match
        };
        
        const mainPdf = await generateLabelPDF(mainData, mainFormula);
        labels.push({
          filename: `IDENTE-${customerName.replace(/\s/g, '-')}-${baseBatch}-MAIN.pdf`,
          content: mainPdf
        });
        console.log(`✅ Label 1/3 generated: ${mainData.profile}`);
        
        // ─────────────────────────────────────────────────────────────────────
        // LABEL 2: First Recommendation
        // ─────────────────────────────────────────────────────────────────────
        let rec1Formula;
        try {
          if (props._quiz_rec1_formula) {
            rec1Formula = usableFormula(JSON.parse(props._quiz_rec1_formula)) || generatePersonalizedFormula(quizTags, concentration, 1);
          } else {
            rec1Formula = generatePersonalizedFormula(quizTags, concentration, 1);
          }
        } catch (e) {
          rec1Formula = generatePersonalizedFormula(quizTags, concentration, 1);
        }
        
        const rec1Data = {
          batch: String(parseInt(baseBatch) + 1),
          name: customerName,
          date: dateStr,
          profile: props._quiz_rec1_profile || 'IDENTÉ Custom',
          concentration,
          harmonie: String(Math.max(80, parseInt(harmonie) - 2)),
          match: String(Math.max(80, parseInt(match) - 3))
        };
        
        const rec1Pdf = await generateLabelPDF(rec1Data, rec1Formula);
        labels.push({
          filename: `IDENTE-${customerName.replace(/\s/g, '-')}-${rec1Data.batch}-REC1.pdf`,
          content: rec1Pdf
        });
        console.log(`✅ Label 2/3 generated: ${rec1Data.profile}`);
        
        // ─────────────────────────────────────────────────────────────────────
        // LABEL 3: Second Recommendation
        // ─────────────────────────────────────────────────────────────────────
        let rec2Formula;
        try {
          if (props._quiz_rec2_formula) {
            rec2Formula = usableFormula(JSON.parse(props._quiz_rec2_formula)) || generatePersonalizedFormula(quizTags, concentration, 2);
          } else {
            rec2Formula = generatePersonalizedFormula(quizTags, concentration, 2);
          }
        } catch (e) {
          rec2Formula = generatePersonalizedFormula(quizTags, concentration, 2);
        }
        
        const rec2Data = {
          batch: String(parseInt(baseBatch) + 2),
          name: customerName,
          date: dateStr,
          profile: props._quiz_rec2_profile || 'IDENTÉ Custom',
          concentration,
          harmonie: String(Math.max(80, parseInt(harmonie) - 4)),
          match: String(Math.max(80, parseInt(match) - 5))
        };
        
        const rec2Pdf = await generateLabelPDF(rec2Data, rec2Formula);
        labels.push({
          filename: `IDENTE-${customerName.replace(/\s/g, '-')}-${rec2Data.batch}-REC2.pdf`,
          content: rec2Pdf
        });
        console.log(`✅ Label 3/3 generated: ${rec2Data.profile}`);
        
      } else {
        // ═══════════════════════════════════════════════════════════════════════
        // SINGLE PRODUCT ORDER
        // ═══════════════════════════════════════════════════════════════════════
        console.log('📝 SINGLE ORDER - Generating 1 label');
        
        const quizData = {
          batch: props._quiz_batch || String(Date.now()).slice(-8),
          name: props._quiz_name || order.customer?.first_name || 'Customer',
          date: props._quiz_date || new Date().toLocaleDateString('de-DE'),
          profile: props._quiz_profile || 'IDENTÉ Custom',
          concentration: parseInt(props._quiz_concentration) || 22,
          harmonie: props._quiz_harmonie || '95',
          match: props._quiz_match || '92'
        };

        let quizTags = { positive: [], exclude: [], intensityModifier: 1.0 };
        try {
          if (props._quiz_tags) quizTags = JSON.parse(props._quiz_tags);
        } catch (e) { console.log('⚠️ Could not parse quiz tags'); }

        let formula;
        if (props._quiz_formula) {
          try {
            const usable = usableFormula(JSON.parse(props._quiz_formula));
            if (usable) {
              formula = {
                top: usable.top,
                heart: usable.heart,
                base: usable.base,
                oilTotal: 50 * (quizData.concentration / 100),
                alcoholTotal: 50 - (50 * (quizData.concentration / 100)),
                grandTotal: 50
              };
            } else {
              formula = generatePersonalizedFormula(quizTags, quizData.concentration, 0);
            }
          } catch (e) {
            formula = generatePersonalizedFormula(quizTags, quizData.concentration, 0);
          }
        } else {
          formula = generatePersonalizedFormula(quizTags, quizData.concentration, 0);
        }

        const pdf = await generateLabelPDF(quizData, formula);
        labels.push({
          filename: `IDENTE-${quizData.name.replace(/\s/g, '-')}-${quizData.batch}.pdf`,
          content: pdf
        });
        console.log(`✅ Single label generated: ${quizData.profile}`);
      }
    }

    if (labels.length > 0) {
      console.log(`📧 Sending ${labels.length} labels via email`);
      await sendEmail(order, labels);
      console.log('✅ Success!');
    } else {
      console.log('⚠️ No labels generated');
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'OK', count: labels.length }) };
  } catch (error) {
    console.error('❌ Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK IDEMPOTENCY (Netlify Blobs)
// ═══════════════════════════════════════════════════════════════════════════
// Shopify retries webhooks aggressively (including near-parallel duplicates).
// A persistent lease per X-Shopify-Webhook-Id makes sure each webhook produces
// exactly one production email:
//   - no record            -> acquire lease atomically (onlyIfNew) and process
//   - status "done"        -> 200, no side effects
//   - fresh "processing"   -> 409 so Shopify retries later (covers the case
//                             where the concurrent attempt ends up failing)
//   - stale "processing"   -> take over atomically via etag CAS (onlyIfMatch)
//   - processing failed    -> record is deleted, the next retry runs again
// If Blobs is unreachable we process WITHOUT dedupe: a duplicate email is
// recoverable, a silently dropped order is not.

const LEASE_MS = 10 * 60 * 1000;    // stale takeover after 10 min (fn timeout is far lower)
const IDEMPOTENCY_STORE = 'webhook-idempotency';

function idempotencyKey(event) {
  const headers = event.headers || {};
  const id = headers['x-shopify-webhook-id'] || headers['X-Shopify-Webhook-Id'];
  if (id) return 'wh-' + id;
  // No header (e.g. manual replay): fall back to a digest of the payload
  return 'body-' + crypto.createHash('sha256').update(event.body || '').digest('hex').slice(0, 32);
}

function getIdempotencyStore(event) {
  if (!netlifyBlobs) return null;
  try {
    if (typeof netlifyBlobs.connectLambda === 'function' && event && event.blobs) {
      netlifyBlobs.connectLambda(event);
    }
    return netlifyBlobs.getStore({ name: IDEMPOTENCY_STORE, consistency: 'strong' });
  } catch (e) {
    console.log('Idempotency store unavailable, processing without dedupe:', e.message);
    return null;
  }
}

// Returns 'acquired' | 'done' | 'in-progress'
async function acquireLease(store, key) {
  const lease = JSON.stringify({ status: 'processing', at: Date.now() });
  const fresh = await store.set(key, lease, { onlyIfNew: true });
  if (fresh.modified) return 'acquired';

  const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  if (!current) {
    // Deleted between the two calls (failed attempt cleanup) - try once more
    const retry = await store.set(key, lease, { onlyIfNew: true });
    return retry.modified ? 'acquired' : 'in-progress';
  }
  if (current.data && current.data.status === 'done') return 'done';
  const startedAt = current.data && current.data.at || 0;
  if (Date.now() - startedAt < LEASE_MS) return 'in-progress';
  // Stale lease (crashed attempt): take over, but only if nobody else did
  const takeover = await store.set(key, lease, { onlyIfMatch: current.etag });
  return takeover.modified ? 'acquired' : 'in-progress';
}

exports.handler = async (event, context) => {
  const store = getIdempotencyStore(event);
  if (!store) return processWebhook(event, context);

  const key = idempotencyKey(event);
  let state;
  try {
    state = await acquireLease(store, key);
  } catch (e) {
    console.log('Idempotency check failed, processing without dedupe:', e.message);
    return processWebhook(event, context);
  }

  if (state === 'done') {
    console.log(`Duplicate webhook ${key} ignored (already processed)`);
    return { statusCode: 200, body: JSON.stringify({ message: 'Duplicate webhook ignored', key }) };
  }
  if (state === 'in-progress') {
    console.log(`Webhook ${key} already being processed, asking Shopify to retry`);
    return { statusCode: 409, body: JSON.stringify({ message: 'Webhook is being processed, retry later', key }) };
  }

  const result = await processWebhook(event, context);
  try {
    if (result && result.statusCode === 200) {
      await store.setJSON(key, { status: 'done', at: Date.now() });
    } else {
      await store.delete(key);            // failed attempt: let the retry run
    }
  } catch (e) {
    console.log('Idempotency finalize failed (worst case: one duplicate retry):', e.message);
  }
  return result;
};

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateQRUrl(data) {
  const qd = { b: data.batch, n: data.name, d: data.date, c: data.concentration, h: data.harmonie, m: data.match };
  const json = JSON.stringify(qd);
  const encoded = encodeURIComponent(json);
  const replaced = encoded.replace(/%([0-9A-F]{2})/g, (m, p1) => String.fromCharCode(parseInt(p1, 16)));
  const b64 = Buffer.from(replaced).toString('base64');
  return 'https://tryidente.com/pages/verify?d=' + b64;
}

function getShortProfileName(profile) {
  if (!profile) return '';
  return profile.replace(/^IDENT[EÉ]\s*/i, '');
}

// pdf-lib standard fonts only encode WinAnsi; anything else (Ş, Cyrillic,
// emoji, decomposed accents) throws and kills the whole order. Normalize to
// NFC, keep encodable chars, fold the rest to their base letter, drop leftovers.
const WINANSI_EXTRA = String.fromCharCode(
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
  0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178
);
function sanitizeWinAnsi(str) {
  if (!str) return '';
  const ok = c => {
    const p = c.codePointAt(0);
    return (p >= 0x20 && p <= 0x7E) || (p >= 0xA0 && p <= 0xFF) || WINANSI_EXTRA.includes(c);
  };
  let out = '';
  for (const c of String(str).normalize('NFC')) {
    if (ok(c)) { out += c; continue; }
    for (const d of c.normalize('NFKD')) {
      if (ok(d)) { out += d; break; }
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Validates a theme-provided formula before it reaches the label: three note
// arrays, every weight a finite positive number, 3-20 notes total (more than
// 20 cannot fit the 70mm panel). Returns a normalized copy, or null so the
// caller falls back to generatePersonalizedFormula instead of printing garbage.
function usableFormula(f) {
  if (!f || typeof f !== 'object') return null;
  const norm = {};
  let count = 0;
  for (const key of ['top', 'heart', 'base']) {
    const notes = Array.isArray(f[key]) ? f[key] : [];
    const out = [];
    for (const n of notes) {
      const w = Number(n && n.weight);
      if (!n || typeof n.name !== 'string' || !n.name.trim() || !isFinite(w) || w <= 0) return null;
      out.push({ name: n.name, weight: w });
      count++;
    }
    norm[key] = out;
  }
  if (count < 3 || count > 20) return null;
  return norm;
}

// Draws text with letterspacing (tracking). Standard fonts have no tracking,
// so each glyph is placed individually. Returns nothing; pass centerX to center.
function drawTracked(page, text, { y, size, font, tracking, centerX, x, color }) {
  const chars = [...text];
  let width = 0;
  chars.forEach(c => { width += font.widthOfTextAtSize(c, size) + tracking; });
  width -= tracking;
  let cx = centerX !== undefined ? centerX - width / 2 : x;
  chars.forEach(c => {
    page.drawText(c, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(c, size) + tracking;
  });
}

function trackedWidth(text, font, size, tracking) {
  let width = 0;
  [...text].forEach(c => { width += font.widthOfTextAtSize(c, size) + tracking; });
  return width - tracking;
}

// Rounds weights to 2 decimals so the printed values sum EXACTLY to the
// printed group total (largest-remainder method). 0.01g is also the realistic
// precision of a production scale, so the label stays honest.
function roundPreservingSum(values) {
  const target = Math.round(values.reduce((s, v) => s + v, 0) * 100);
  const floored = values.map(v => Math.floor(v * 100));
  let remainder = target - floored.reduce((s, v) => s + v, 0);
  const order = values
    .map((v, i) => ({ i, frac: v * 100 - Math.floor(v * 100) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    floored[order[k].i] += 1;
  }
  return floored.map(v => v / 100);
}

// ── Physical label spec ──────────────────────────────────────────────────────
// One square 70x70mm metallic-silver label that wraps around the bottle edge.
// The flakon body is 37x37mm, so the fold sits at 37mm: left 37mm panel = front
// face (edge to edge), right 33mm panel wraps onto the second face.
// Printed black only — unprinted areas stay silver (QR light modules are
// transparent for the same reason). Adjust FOLD_MM if the bottle changes.
const MM = 2.83465;
const LABEL_MM = 70;
const FOLD_MM = 37;

async function generateLabelPDF(data, formula) {
  console.log(`Generating PDF for ${data.name} - ${data.profile}`);

  const pdfDoc = await PDFDocument.create();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const pageSize = LABEL_MM * MM;                 // 198.4pt
  const fold = FOLD_MM * MM;                      // 104.9pt
  const black = rgb(0, 0, 0);
  const ellipsis = String.fromCharCode(0x2026);
  // Display copies are WinAnsi-sanitized so drawing can never throw; the QR
  // keeps the raw values so the verify page shows the name exactly as entered.
  const dispName = sanitizeWinAnsi(data.name);
  const dispBatch = sanitizeWinAnsi(String(data.batch));
  const dispDate = sanitizeWinAnsi(String(data.date));
  const profileName = sanitizeWinAnsi(getShortProfileName(data.profile)).toUpperCase();
  const top = formula.top || [];
  const heart = formula.heart || [];
  const base = formula.base || [];
  const noteCount = top.length + heart.length + base.length;

  const page = pdfDoc.addPage([pageSize, pageSize]);

  // ═════════════════════════════════════════════════════════════════════════
  // LEFT PANEL: FRONT
  // ═════════════════════════════════════════════════════════════════════════
  const frontCX = fold / 2;
  const frontMax = fold - 2 * (3.5 * MM);         // keep clear of edge and fold

  // Wordmark — fit incl. tracking
  let logoSize = 18;
  const logoTracking = 3;
  while (logoSize > 10 && trackedWidth('IDENTÉ', helveticaBold, logoSize, logoTracking) > frontMax) logoSize -= 0.5;
  drawTracked(page, 'IDENTÉ', { y: 164, size: logoSize, font: helveticaBold, tracking: logoTracking, centerX: frontCX, color: black });

  // for {Name} — shrink to fit, then hard-truncate so the floor size can
  // never spill across the fold or off the page
  if (dispName) {
    let forText = `for ${dispName}`;
    let forSize = 7.5;
    while (forSize > 4.5 && helvetica.widthOfTextAtSize(forText, forSize) > frontMax) forSize -= 0.25;
    if (helvetica.widthOfTextAtSize(forText, forSize) > frontMax) {
      while (forText.length > 5 && helvetica.widthOfTextAtSize(forText + ellipsis, forSize) > frontMax) forText = forText.slice(0, -1);
      forText += ellipsis;
    }
    page.drawText(forText, { x: frontCX - helvetica.widthOfTextAtSize(forText, forSize) / 2, y: 151, size: forSize, font: helvetica, color: black });
  }

  // Profile name, center of the panel — shrink to fit incl. tracking,
  // then hard-truncate at the floor size
  if (profileName) {
    let profDraw = profileName;
    let profSize = 12;
    const profTracking = 2.5;
    while (profSize > 5.5 && trackedWidth(profDraw, helveticaBold, profSize, profTracking) > frontMax) profSize -= 0.25;
    if (trackedWidth(profDraw, helveticaBold, profSize, profTracking) > frontMax) {
      while (profDraw.length > 2 && trackedWidth(profDraw + ellipsis, helveticaBold, profSize, profTracking) > frontMax) profDraw = profDraw.slice(0, -1);
      profDraw += ellipsis;
    }
    drawTracked(page, profDraw, { y: 102, size: profSize, font: helveticaBold, tracking: profTracking, centerX: frontCX, color: black });
  }

  // Tagline
  drawTracked(page, 'PERSONAL FRAGRANCE', { y: 91, size: 4.2, font: helvetica, tracking: 0.9, centerX: frontCX, color: black });
  drawTracked(page, 'COMPOSED FOR YOU', { y: 84.5, size: 4.2, font: helvetica, tracking: 0.9, centerX: frontCX, color: black });

  // PARFUM + specs
  drawTracked(page, 'PARFUM', { y: 38, size: 9, font: helveticaBold, tracking: 3.5, centerX: frontCX, color: black });
  drawTracked(page, `${noteCount} NOTES - ${data.concentration}%`, { y: 27, size: 5.2, font: helvetica, tracking: 0.7, centerX: frontCX, color: black });

  // ═════════════════════════════════════════════════════════════════════════
  // RIGHT PANEL: FORMULA — lab sheet in Courier with dot leaders
  // ═════════════════════════════════════════════════════════════════════════
  const leftMargin = fold + 2 * MM;               // clear of the fold
  const rightMargin = pageSize - 2.5 * MM;
  const colWidth = rightMargin - leftMargin;

  // Print-rounded weights: per group they sum exactly to the printed subtotal,
  // and the subtotals sum exactly to the printed oil total.
  const groups = [
    { title: 'TOP NOTES', notes: top },
    { title: 'HEART NOTES', notes: heart },
    { title: 'BASE NOTES', notes: base }
  ].filter(g => g.notes.length > 0);

  let oilDisplay = 0;
  groups.forEach(g => {
    const rounded = roundPreservingSum(g.notes.map(n => Number(n.weight) || 0));
    g.display = g.notes.map((n, i) => ({ name: sanitizeWinAnsi(n.name), weight: rounded[i] }));
    oilDisplay += rounded.reduce((s, v) => s + v, 0);
  });
  oilDisplay = Math.round(oilDisplay * 100) / 100;
  const grandTotal = formula.grandTotal || 50;
  const alcoholDisplay = Math.round((grandTotal - oilDisplay) * 100) / 100;

  // Vertical layout: pick the largest row leading that still fits the panel.
  // Mirrors the y-walk below: contentStart - groups - totals must leave the
  // batch block (batchY >= 25) above the bottom edge.
  const contentStart = pageSize - 24;             // first group-header baseline
  const totalsConsumed = 28;                      // rules + oil + alcohol rows
  const minBatchY = 25;                           // BATCH/date/50ml + QR fit below
  let leading = 6.5;
  const groupsConsumed = l => groups.length * (l + 2) + noteCount * l;
  while (leading > 4.6 && contentStart - groupsConsumed(leading) - totalsConsumed < minBatchY) {
    leading = Math.round((leading - 0.1) * 10) / 10;
  }

  // Capped at 4.9 so the column fits 18-char note names next to the usual
  // 5-char weights; longer values shorten the name instead of overflowing
  const noteSize = Math.min(4.9, Math.round(leading * 0.82 * 10) / 10);
  const charW = courier.widthOfTextAtSize('0', noteSize);
  const cols = Math.floor(colWidth / charW);

  const dashedRule = (yy) => {
    page.drawText('-'.repeat(cols), { x: leftMargin, y: yy, size: noteSize, font: courier, color: black });
  };

  // Builds "Name ...... 1.20g" padded to the full column width
  const leaderRow = (name, value) => {
    let n = name;
    const maxName = cols - value.length - 4;      // keep at least 2 dots + 2 spaces
    if (n.length > maxName) n = n.slice(0, maxName);
    const dots = '.'.repeat(Math.max(2, cols - n.length - value.length - 2));
    return `${n} ${dots} ${value}`;
  };

  let y = pageSize - 10;
  drawTracked(page, 'FORMULA', { y, size: 6.5, font: courierBold, tracking: 1.8, x: leftMargin, color: black });
  y -= 5;
  dashedRule(y);
  y -= 9;                                          // y is now contentStart

  groups.forEach(g => {
    page.drawText(g.title, { x: leftMargin, y, size: noteSize + 0.4, font: courierBold, color: black });
    y -= leading;
    g.display.forEach(note => {
      page.drawText(leaderRow(note.name, `${note.weight.toFixed(2)}g`), { x: leftMargin, y, size: noteSize, font: courier, color: black });
      y -= leading;
    });
    y -= 2;
  });

  // Totals — decrements sum to totalsConsumed above
  dashedRule(y);
  y -= 7;
  page.drawText(leaderRow('Perfume oil', `${oilDisplay.toFixed(2)}g`), { x: leftMargin, y, size: noteSize, font: courierBold, color: black });
  y -= 7.5;
  page.drawText(leaderRow('Alcohol', `${alcoholDisplay.toFixed(2)}g`), { x: leftMargin, y, size: noteSize, font: courierBold, color: black });
  y -= 5.5;
  dashedRule(y);
  y -= 8;

  // Batch block: BATCH + date left, QR right, 50ml below
  const batchY = y;
  const qrSide = 26;
  const batchText = `BATCH ${dispBatch}`;
  let batchSize = 5.5;
  while (batchSize > 4 && courierBold.widthOfTextAtSize(batchText, batchSize) > colWidth - qrSide - 4) batchSize -= 0.1;
  page.drawText(batchText, { x: leftMargin, y: batchY, size: batchSize, font: courierBold, color: black });
  page.drawText(dispDate, { x: leftMargin, y: batchY - 8, size: 5.5, font: courierBold, color: black });

  try {
    const qrUrl = generateQRUrl(data);
    // Transparent light modules: unprinted areas stay metallic silver
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 300, margin: 0, errorCorrectionLevel: 'L', color: { dark: '#000000ff', light: '#ffffff00' } });
    const qrImageData = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrImage = await pdfDoc.embedPng(Buffer.from(qrImageData, 'base64'));
    page.drawImage(qrImage, { x: rightMargin - qrSide, y: batchY - qrSide + 6, width: qrSide, height: qrSide });
  } catch (e) {
    console.log('QR failed');
  }

  page.drawText('50ml', { x: leftMargin, y: batchY - 19, size: 6, font: courier, color: black });

  return Buffer.from(await pdfDoc.save());
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL
// ═══════════════════════════════════════════════════════════════════════════

async function sendEmail(order, labels) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  const isBundle = labels.length === 3;
  const subject = isBundle 
    ? `IDENTE Order #${order.order_number} - TRIO BUNDLE (3 Etiketten)`
    : `IDENTE Order #${order.order_number} - ${labels.length} Etikett${labels.length > 1 ? 'en' : ''}`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.LABEL_EMAIL || process.env.EMAIL_USER,
    subject: subject,
    html: `
      <h2>Neue ${isBundle ? 'TRIO BUNDLE ' : ''}Order!</h2>
      <p><strong>Order:</strong> #${order.order_number}</p>
      <p><strong>Kunde:</strong> ${order.customer?.first_name || ''} ${order.customer?.last_name || ''}</p>
      <p><strong>Etiketten:</strong> ${labels.length}</p>
      ${isBundle ? '<p style="color: #c5a059; font-weight: bold;">⚠️ TRIO BUNDLE - 3 separate Etiketten im Anhang!</p>' : ''}
      <hr>
      <p style="font-size: 12px; color: #666;">Generiert von IDENTÉ Label System</p>
    `,
    attachments: labels
  });
}

// Exposed for local testing only - not used by the webhook path
exports._test = { generatePersonalizedFormula, generateLabelPDF, generateQRUrl, sanitizeWinAnsi, usableFormula, roundPreservingSum, idempotencyKey, acquireLease, processWebhook };
