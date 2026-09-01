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

// Shopify variant IDs are the server-side authority for the physical product.
// Line-item properties are customer-controlled and may describe the quiz, but
// they must never be able to turn a 2 ml sample into a 50 ml bottle (or vice
// versa). Keep this map in sync with the store before adding a new offer.
const VARIANT_TYPE = new Map([
  ['52223237783893', 'single'], // Alltag
  ['52223237816661', 'single'], // Date
  ['52223237849429', 'single'], // Business
  ['52223237882197', 'single'], // Freizeit
  ['52223237914965', 'bundle'], // Trio
  ['54803580125525', 'duo'],
  ['54803580158293', 'probe']
]);

const ALLOWED_CONCENTRATIONS = new Set([18, 20, 22, 25, 28]);

// The storefront may serialize DE or EN display names. Production records use
// one canonical legacy material name so locale cannot change the substance.
const CANONICAL_MATERIALS = new Set(
  Object.values(NOTES_DATABASE).flat().map(note => note.name)
);
const MATERIAL_ALIASES = new Map(Object.entries({
  Bergamotte: 'Bergamot', Zitrone: 'Lemon', Orange: 'Sweet Orange', Mandarine: 'Mandarin',
  Minze: 'Mint', 'Grüner Apfel': 'Green Apple', Blackcurrant: 'Cassis',
  'Rosa Pfeffer': 'Pink Pepper', Kardamom: 'Cardamom', Basilikum: 'Basil',
  Meerwasser: 'Sea Water', Ingwer: 'Ginger', Jasmin: 'Jasmine',
  Maiglöckchen: 'Lily of the Valley', Freesie: 'Freesia', Pfingstrose: 'Peony',
  Lavendel: 'Lavender', Geranie: 'Geranium', Orangenblüte: 'Orange Blossom',
  Nelke: 'Clove', Carnation: 'Clove', Zimt: 'Cinnamon', Muskatnuss: 'Nutmeg',
  Safran: 'Saffron', Tonkabohne: 'Tonka Bean', Pfirsich: 'Peach', Pflaume: 'Plum',
  'Rote Beeren': 'Red Berries', Schokolade: 'Chocolate', Kaffee: 'Coffee',
  Tabak: 'Tobacco', Tee: 'Tea', Sandelholz: 'Sandalwood', Zedernholz: 'Cedarwood',
  Guajakholz: 'Guaiacwood', 'Guaiac Wood': 'Guaiacwood', Eichenmoos: 'Oakmoss',
  Moschus: 'Musk', Vanille: 'Vanilla', Benzoe: 'Benzoin', Weihrauch: 'Frankincense',
  Leder: 'Leather', Birke: 'Birch Tar', Birch: 'Birch Tar', Wildleder: 'Suede'
}));

function canonicalMaterialName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const canonical = MATERIAL_ALIASES.get(trimmed) || trimmed;
  return CANONICAL_MATERIALS.has(canonical) ? canonical : null;
}

function formulaApprovalRequired() {
  return process.env.CONTEXT === 'production' || process.env.IDENTE_REQUIRE_FORMULA_APPROVAL === 'true';
}

function approvedFormulaHashes() {
  return new Set(String(process.env.IDENTE_APPROVED_FORMULA_HASHES || '')
    .split(/[\s,]+/)
    .map(value => value.trim().toLowerCase())
    .filter(value => /^[a-f0-9]{64}$/.test(value)));
}

function assertFormulaApproved(formula) {
  if (!formulaApprovalRequired()) return;
  const digest = formulaDigest(formula);
  if (!approvedFormulaHashes().has(digest)) {
    throw new Error(`Unapproved quiz formula ${digest}`);
  }
}

function resolveVariantType(item, props) {
  const variantId = String(item && (item.variant_id || item.variantId) || '');
  const expected = VARIANT_TYPE.get(variantId);
  if (!expected) throw new Error(`Unsupported quiz variant ${variantId || '(missing)'}`);
  const claimed = props._quiz_type || 'single';
  if (claimed !== expected) {
    throw new Error(`Quiz product/type mismatch for variant ${variantId}: expected ${expected}, got ${claimed}`);
  }
  return expected;
}

function parseConcentration(value) {
  const concentration = Number(value == null || value === '' ? 22 : value);
  if (!Number.isInteger(concentration) || !ALLOWED_CONCENTRATIONS.has(concentration)) {
    throw new Error(`Unsupported quiz concentration ${String(value)}`);
  }
  return concentration;
}

function validateBatch(value) {
  const batch = String(value || '').trim();
  if (!/^[A-Za-z0-9-]{4,24}$/.test(batch)) throw new Error('Missing or invalid quiz batch');
  return batch;
}

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

// Batch numbers from the theme are numeric strings; a non-numeric base must
// not turn into "NaN" on bundle labels 2/3, so fall back to a suffix.
function offsetBatch(baseBatch, offset) {
  if (offset === 0) return String(baseBatch);
  if (/^\d+$/.test(String(baseBatch))) return String(parseInt(baseBatch, 10) + offset);
  return `${baseBatch}-${offset + 1}`;
}

// Harmonie/Match arrive as strings from line-item properties; a non-numeric
// value must never print as "NaN" on the label or in the QR payload.
function toScoreString(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? String(n) : fallback;
}

function reducedScore(scoreStr, delta) {
  const n = parseInt(scoreStr, 10);
  return String(Math.max(80, (Number.isFinite(n) ? n : 90) - delta));
}

function fileSafeName(name) {
  return String(name).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'Customer';
}

function resolveFormula(rawFormulaJson, quizTags, concentration, seed) {
  if (!rawFormulaJson) throw new Error('Missing quiz formula');
  let parsed;
  try {
    parsed = JSON.parse(rawFormulaJson);
  } catch {
    throw new Error('Invalid quiz formula JSON');
  }
  const usable = usableFormula(parsed, 50 * (concentration / 100));
  if (!usable) throw new Error('Invalid quiz formula');
  assertFormulaApproved(usable);
  const totalOil = 50 * (concentration / 100);
  return {
    top: usable.top, heart: usable.heart, base: usable.base,
    oilTotal: totalOil, alcoholTotal: 50 - totalOil, grandTotal: 50
  };
}

const processWebhook = async (event, context) => {
  try {
    console.log('🔔 Webhook received');
    const order = JSON.parse(getRawBody(event).toString('utf8'));
    console.log(`📦 Order #${order.order_number} from ${order.customer?.first_name || 'Customer'}`);

    const labels = [];
    const registryEntries = [];
    const productionNotes = [];
    const productionKinds = [];
    const orderBatches = new Set();

    for (const item of order.line_items) {
      console.log(`📝 Processing item: ${item.name}`);

      if (!item.properties || item.properties.length === 0) {
        console.log('⚠️ No quiz properties found, skipping');
        continue;
      }

      const props = {};
      item.properties.forEach(p => { props[p.name] = p.value; });

      if (!Object.keys(props).some(key => key.startsWith('_quiz_'))) {
        console.log('⚠️ No quiz properties found, skipping');
        continue;
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const type = resolveVariantType(item, props);
      productionKinds.push(type);
      const baseBatch = validateBatch(props._quiz_batch);
      const customerName = props._quiz_name || order.customer?.first_name || 'Customer';
      const dateStr = props._quiz_date || new Date().toLocaleDateString('de-DE');
      const concentration = parseConcentration(props._quiz_concentration);
      const harmonie = toScoreString(props._quiz_harmonie, '95');
      const match = toScoreString(props._quiz_match, '92');

      let quizTags = { positive: [], exclude: [], intensityModifier: 1.0 };
      try {
        if (props._quiz_tags) quizTags = JSON.parse(props._quiz_tags);
      } catch (e) { console.log('⚠️ Could not parse quiz tags'); }

      if (qty > 1) {
        productionNotes.push(`Position "${item.name}": Menge ${qty} — Etikett je Einheit ${qty}× drucken.`);
      }

      if (type === 'bundle' || type === 'duo') {
        // ═════════════════════════════════════════════════════════════════════
        // BUNDLE (Trio: 3 labels) / DUO (2 labels) — main + recommendations
        // ═════════════════════════════════════════════════════════════════════
        const parts = type === 'bundle'
          ? [
              { key: 'main', suffix: 'MAIN', seed: 0, dH: 0, dM: 0 },
              { key: 'rec1', suffix: 'REC1', seed: 1, dH: 2, dM: 3 },
              { key: 'rec2', suffix: 'REC2', seed: 2, dH: 4, dM: 5 }
            ]
          : [
              { key: 'main', suffix: 'MAIN', seed: 0, dH: 0, dM: 0 },
              { key: 'rec1', suffix: 'REC1', seed: 1, dH: 2, dM: 3 }
            ];
        console.log(`📦 ${type.toUpperCase()} ORDER DETECTED - Generating ${parts.length} labels`);

        for (let pi = 0; pi < parts.length; pi++) {
          const part = parts[pi];
          const formula = resolveFormula(props[`_quiz_${part.key}_formula`], quizTags, concentration, part.seed);
          const data = {
            batch: offsetBatch(baseBatch, pi),
            name: customerName,
            date: dateStr,
            profile: props[`_quiz_${part.key}_profile`] || 'IDENTÉ Custom',
            type,
            volume: '50 ml',
            concentration,
            harmonie: pi === 0 ? harmonie : reducedScore(harmonie, part.dH),
            match: pi === 0 ? match : reducedScore(match, part.dM)
          };
          if (orderBatches.has(data.batch)) throw new Error(`Duplicate batch ${data.batch} in order`);
          orderBatches.add(data.batch);
          const pdf = await generateLabelPDF(data, formula);
          labels.push({
            filename: `IDENTE-${fileSafeName(customerName)}-${data.batch}-${part.suffix}.pdf`,
            content: pdf,
            qty
          });
          registryEntries.push({ batch: data.batch, data, formula, type, qty });
          console.log(`✅ Label ${pi + 1}/${parts.length} generated: ${data.profile}`);
        }

      } else if (type === 'probe') {
        // ═════════════════════════════════════════════════════════════════════
        // PROBE (2 ml sample) — production sheet; the physical sample label
        // layout is pending real bottle/label dimensions and NOT invented here.
        // ═════════════════════════════════════════════════════════════════════
        console.log('🧪 PROBE ORDER DETECTED - Generating 2ml production sheet');

        const data = {
          batch: baseBatch,
          name: customerName,
          date: dateStr,
          profile: props._quiz_profile || 'IDENTÉ Custom',
          type: 'probe',
          volume: '2 ml',
          concentration,
          harmonie,
          match
        };
        if (orderBatches.has(data.batch)) throw new Error(`Duplicate batch ${data.batch} in order`);
        orderBatches.add(data.batch);
        const formula = resolveFormula(props._quiz_formula, quizTags, concentration, 0);
        const pdf = await generateSampleSheetPDF(data, formula);
        labels.push({
          filename: `IDENTE-PROBE-${fileSafeName(customerName)}-${data.batch}.pdf`,
          content: pdf,
          qty
        });
        registryEntries.push({ batch: data.batch, data, formula, type, qty });
        productionNotes.push(`PROBE 2 ml (Batch ${data.batch}): Produktionsblatt im Anhang. Physisches Sample-Etikett: Layout ausstehend (Fläschchen-Maße offen).`);

      } else {
        // ═════════════════════════════════════════════════════════════════════
        // SINGLE PRODUCT ORDER
        // ═════════════════════════════════════════════════════════════════════
        console.log('📝 SINGLE ORDER - Generating 1 label');

        const quizData = {
          batch: baseBatch,
          name: customerName,
          date: dateStr,
          profile: props._quiz_profile || 'IDENTÉ Custom',
          type: 'single',
          volume: '50 ml',
          concentration,
          harmonie,
          match
        };
        if (orderBatches.has(quizData.batch)) throw new Error(`Duplicate batch ${quizData.batch} in order`);
        orderBatches.add(quizData.batch);
        const formula = resolveFormula(props._quiz_formula, quizTags, concentration, 0);
        const pdf = await generateLabelPDF(quizData, formula);
        labels.push({
          filename: `IDENTE-${fileSafeName(quizData.name)}-${quizData.batch}.pdf`,
          content: pdf,
          qty
        });
        registryEntries.push({ batch: quizData.batch, data: quizData, formula, type: 'single', qty });
        console.log(`✅ Single label generated: ${quizData.profile}`);
      }
    }

    if (labels.length > 0) {
      // Reserve batches and archive exact artifacts before the irreversible
      // production-email side effect. Cross-order batch collisions now fail the
      // webhook instead of silently keeping an unrelated historical snapshot.
      await persistArtifacts(event, order, labels, registryEntries);
      console.log(`📧 Sending ${labels.length} labels via email`);
      await sendEmail(order, labels, productionNotes, productionKinds);
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

// Netlify may deliver the body base64-encoded; HMAC must be computed over the
// exact raw bytes Shopify signed, and JSON.parse must see the same bytes.
function getRawBody(event) {
  if (!event || !event.body) return Buffer.alloc(0);
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8');
}

// Shopify webhook HMAC verification is fail-closed. An unsigned compatibility
// mode would make the public function an email/PDF-production endpoint and is
// therefore deliberately not available in deployed code.
function verifyShopifyHmac(event) {
  const primary = String(process.env.SHOPIFY_WEBHOOK_SECRET || '').trim();
  if (!primary) return { ok: false, enforced: true, reason: 'missing_secret' };
  // During a controlled rotation Shopify may still sign with the old secret.
  // Keep this overlap explicit and temporary; remove PREVIOUS after the new
  // signing path has been observed and the old credential has been revoked.
  const previous = String(process.env.SHOPIFY_WEBHOOK_SECRET_PREVIOUS || '').trim();
  const secrets = [...new Set([primary, previous].filter(Boolean))];
  const headers = event.headers || {};
  const given = headers['x-shopify-hmac-sha256'] || headers['X-Shopify-Hmac-Sha256'];
  if (!given) return { ok: false, enforced: true, reason: 'missing_signature' };
  const b = Buffer.from(String(given));
  let ok = false;
  for (const secret of secrets) {
    const digest = crypto.createHmac('sha256', secret).update(getRawBody(event)).digest('base64');
    const a = Buffer.from(digest);
    if (a.length !== b.length) continue;
    try {
      const matches = crypto.timingSafeEqual(a, b);
      ok = matches || ok;
    } catch (e) {
      // Keep checking configured overlap secrets; malformed input remains a
      // uniform invalid-signature result.
    }
  }
  return { ok, enforced: true, reason: ok ? undefined : 'invalid_signature' };
}

function idempotencyKey(event) {
  const headers = event.headers || {};
  const id = headers['x-shopify-webhook-id'] || headers['X-Shopify-Webhook-Id'];
  if (id) return 'wh-' + id;
  // No header (e.g. manual replay): fall back to a digest of the payload
  return 'body-' + crypto.createHash('sha256').update(getRawBody(event)).digest('hex').slice(0, 32);
}

function getIdempotencyStore(event) {
  if (!netlifyBlobs) return null;
  try {
    if (typeof netlifyBlobs.connectLambda === 'function' && event && event.blobs) {
      netlifyBlobs.connectLambda(event);
    }
    // No 'strong' consistency: the Lambda context has no uncachedEdgeURL, so
    // strong reads throw at runtime. Correctness relies on the conditional
    // writes (onlyIfNew / onlyIfMatch), which are evaluated atomically at the
    // origin regardless of read consistency - a stale read can only turn a
    // duplicate's response into a 409 retry, never into a second processing.
    return netlifyBlobs.getStore({ name: IDEMPOTENCY_STORE });
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

  const current = await store.getWithMetadata(key, { type: 'json' });
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
  const hmac = verifyShopifyHmac(event);
  if (!hmac.ok) {
    if (hmac.reason === 'missing_secret') {
      return { statusCode: 503, body: JSON.stringify({ error: 'Webhook verification is not configured' }) };
    }
    console.log('🚫 Webhook HMAC verification failed - rejecting');
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid webhook signature' }) };
  }
  const store = getIdempotencyStore(event);
  if (!store) {
    if (productionPersistenceRequired()) {
      return { statusCode: 503, body: JSON.stringify({ error: 'Idempotency storage unavailable' }) };
    }
    return processWebhook(event, context);
  }

  const key = idempotencyKey(event);
  let state;
  try {
    state = await acquireLease(store, key);
  } catch (e) {
    if (productionPersistenceRequired()) {
      return { statusCode: 503, body: JSON.stringify({ error: 'Idempotency storage unavailable' }) };
    }
    console.log('Idempotency check failed, processing without dedupe in local context:', e.message);
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
  const qd = {
    b: data.batch,
    n: data.name,
    d: data.date,
    c: data.concentration,
    h: data.harmonie,
    m: data.match,
    p: data.profile || undefined,
    t: data.type || undefined,
    v: data.volume || undefined
  };
  // Base64 must contain the original UTF-8 JSON bytes. The previous
  // percent-decode + Buffer path encoded non-ASCII bytes twice, which made
  // names such as "Şule Ünal-Özdemir" appear as mojibake on the verify page.
  const b64 = Buffer.from(JSON.stringify(qd), 'utf8').toString('base64');
  return 'https://tryidente.com/pages/verify?d=' + encodeURIComponent(b64);
}

function productionPersistenceRequired() {
  return process.env.CONTEXT === 'production' || process.env.IDENTE_REQUIRE_PERSISTENCE === 'true';
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
  const latinFallback = {
    'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ð': 'D', 'ð': 'd',
    'Þ': 'Th', 'þ': 'th', 'Æ': 'AE', 'æ': 'ae', 'Ø': 'O', 'ø': 'o'
  };
  const ok = c => {
    const p = c.codePointAt(0);
    return (p >= 0x20 && p <= 0x7E) || (p >= 0xA0 && p <= 0xFF) || WINANSI_EXTRA.includes(c);
  };
  let out = '';
  for (const c of String(str).normalize('NFC')) {
    if (ok(c)) { out += c; continue; }
    if (latinFallback[c]) { out += latinFallback[c]; continue; }
    for (const d of c.normalize('NFKD')) {
      if (ok(d)) { out += d; break; }
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function printableLabelName(name) {
  const printable = sanitizeWinAnsi(name);
  if (!printable) throw new Error('Customer name cannot be rendered on the production label');
  return printable;
}

// Validates a theme-provided formula before it reaches the label: three note
// arrays, an allow-listed material name, every weight a finite positive number,
// 3-20 notes total and (when supplied) an oil total matching the declared
// concentration. Returns a normalized copy or null; callers reject an invalid
// supplied formula instead of silently changing the customer's production data.
function usableFormula(f, expectedOilTotal) {
  if (!f || typeof f !== 'object') return null;
  const norm = {};
  let count = 0;
  let weightTotal = 0;
  for (const key of ['top', 'heart', 'base']) {
    const notes = Array.isArray(f[key]) ? f[key] : [];
    const out = [];
    for (const n of notes) {
      const w = Number(n && n.weight);
      const name = canonicalMaterialName(n && n.name);
      if (!name || !isFinite(w) || w <= 0) return null;
      out.push({ name, weight: w });
      weightTotal += w;
      count++;
    }
    norm[key] = out;
  }
  if (count < 3 || count > 20) return null;
  if (Number.isFinite(expectedOilTotal) && Math.abs(weightTotal - expectedOilTotal) > 0.03) return null;
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
  const dispName = printableLabelName(data.name);
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
// SAMPLE PRODUCTION SHEET (2 ml Probe)
// ═══════════════════════════════════════════════════════════════════════════
// Internal A6 production document for 2ml samples. This is deliberately NOT a
// bottle label: the physical sample label needs the real vial/label dimensions
// (still unknown) and must not be guessed. The sheet states the formula as
// percentages of the oil concentrate plus the reference 50ml weights, and
// leaves the batching decision (concentrate size) to production.

async function generateSampleSheetPDF(data, formula) {
  console.log(`Generating 2ml sample sheet for ${data.name} - ${data.profile}`);

  const pdfDoc = await PDFDocument.create();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const W = 105 * MM, H = 148 * MM;               // A6 portrait
  const black = rgb(0, 0, 0);
  const margin = 8 * MM;
  const page = pdfDoc.addPage([W, H]);

  const dispName = printableLabelName(data.name);
  const dispBatch = sanitizeWinAnsi(String(data.batch));
  const dispDate = sanitizeWinAnsi(String(data.date));
  const profileName = sanitizeWinAnsi(getShortProfileName(data.profile)).toUpperCase();

  let y = H - margin - 10;
  drawTracked(page, 'IDENTÉ', { y, size: 16, font: helveticaBold, tracking: 3, x: margin, color: black });
  y -= 16;
  page.drawText('PROBE 2 ML — PRODUKTIONSBLATT (INTERN)', { x: margin, y, size: 8, font: helveticaBold, color: black });
  y -= 18;

  const line = (label, value, bold) => {
    page.drawText(label, { x: margin, y, size: 7.5, font: courier, color: black });
    page.drawText(String(value), { x: margin + 90, y, size: 7.5, font: bold ? courierBold : courier, color: black });
    y -= 11;
  };
  line('Kunde', dispName, true);
  line('Profil', profileName, true);
  line('Batch', dispBatch, true);
  line('Datum', dispDate);
  line('Konzentration', `${data.concentration}% Parfumoel`);
  line('Fuellmenge', '2 ml');
  y -= 6;

  // Formula as % of oil (mathematically derived from the 50ml reference)
  const groups = [
    { title: 'KOPF', notes: formula.top || [] },
    { title: 'HERZ', notes: formula.heart || [] },
    { title: 'BASIS', notes: formula.base || [] }
  ].filter(g => g.notes.length > 0);
  const oilTotal = groups.reduce((s, g) => s + g.notes.reduce((a, n) => a + (Number(n.weight) || 0), 0), 0) || 1;

  page.drawText('FORMEL (Anteile am Parfumoel · Referenzgewichte je 50 ml)', { x: margin, y, size: 7, font: helveticaBold, color: black });
  y -= 12;
  for (const g of groups) {
    page.drawText(g.title, { x: margin, y, size: 7, font: courierBold, color: black });
    y -= 10;
    for (const n of g.notes) {
      const w = Number(n.weight) || 0;
      const pct = (100 * w / oilTotal).toFixed(1);
      const name = sanitizeWinAnsi(n.name).slice(0, 26);
      page.drawText(`${name.padEnd(28, '.')} ${pct.padStart(5)}%  ${w.toFixed(2).padStart(6)}g`, { x: margin + 6, y, size: 7, font: courier, color: black });
      y -= 9.5;
    }
    y -= 3;
  }
  y -= 4;
  page.drawText('HINWEIS: Probe aus Konzentrat-Ansatz abfuellen. Referenzgewichte', { x: margin, y, size: 6.5, font: helvetica, color: black });
  y -= 9;
  page.drawText('beziehen sich auf den 50-ml-Ansatz und sind NICHT 1:1 fuer 2 ml.', { x: margin, y, size: 6.5, font: helvetica, color: black });
  y -= 9;
  page.drawText('Sample-Etikett: Layout ausstehend (Flaeschchen-Masse offen).', { x: margin, y, size: 6.5, font: helveticaBold, color: black });

  try {
    const qrUrl = generateQRUrl(data);
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 300, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000ff', light: '#ffffffff' } });
    const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    const qrSide = 42;
    page.drawImage(qrImage, { x: W - margin - qrSide, y: H - margin - qrSide - 4, width: qrSide, height: qrSide });
  } catch (e) {
    console.log('QR failed');
  }

  return Buffer.from(await pdfDoc.save());
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE (Netlify Blobs)
// ═══════════════════════════════════════════════════════════════════════════
// Two stores, both written before the production email:
//   labels          order-<n>/<filename>  -> the exact PDF that was emailed
//   batch-registry  batch-<batch>         -> formula snapshot for reorder/verify
// onlyIfNew keeps the first snapshot authoritative. Production fails closed on
// unavailable storage or a cross-order batch collision; local tests may run
// without Netlify credentials.

const LABELS_STORE = 'labels';
const REGISTRY_STORE = 'batch-registry';

function formulaDigest(formula) {
  return crypto.createHash('sha256').update(JSON.stringify(formula)).digest('hex');
}

function registryRecordMatches(existing, record) {
  if (!existing) return false;
  const fields = [
    'batch', 'order', 'orderId', 'type', 'qty', 'profile', 'volume', 'name',
    'date', 'concentration', 'formulaHash', 'formulaVersion', 'materialLibraryVersion'
  ];
  return fields.every(field => String(existing[field] ?? '') === String(record[field] ?? ''));
}

async function writeRegistryEntry(registryStore, key, record) {
  const write = await registryStore.setJSON(key, record, { onlyIfNew: true });
  if (write && write.modified === false) {
    const existing = await registryStore.get(key, { type: 'json' });
    if (!registryRecordMatches(existing, record)) {
      throw new Error(`Batch collision ${record.batch}`);
    }
  }
}

async function persistArtifacts(event, order, labels, registryEntries) {
  const required = productionPersistenceRequired();
  if (!netlifyBlobs) {
    if (required) throw new Error('Persistence library unavailable');
    return;
  }
  let labelStore = null, registryStore = null;
  try {
    if (typeof netlifyBlobs.connectLambda === 'function' && event && event.blobs) {
      netlifyBlobs.connectLambda(event);
    }
    labelStore = netlifyBlobs.getStore({ name: LABELS_STORE });
    registryStore = netlifyBlobs.getStore({ name: REGISTRY_STORE });
  } catch (e) {
    if (required) throw new Error(`Persistence stores unavailable: ${e.message}`);
    console.log('Persistence stores unavailable in local context, skipping archive:', e.message);
    return;
  }

  for (const entry of registryEntries) {
    const key = `batch-${entry.batch}`;
    const formulaHash = formulaDigest(entry.formula);
    const record = {
      batch: entry.batch,
      order: order.order_number,
      orderId: order.id || null,
      type: entry.type,
      qty: entry.qty,
      profile: entry.data.profile,
      volume: entry.data.volume,
      name: entry.data.name,
      date: entry.data.date,
      concentration: entry.data.concentration,
      formula: entry.formula,
      formulaHash,
      formulaVersion: 'quiz-v6-backend-v2',
      materialLibraryVersion: 'legacy-60-2026-09',
      createdAt: new Date().toISOString(),
      source: 'generate-labels-v2'
    };
    try {
      await writeRegistryEntry(registryStore, key, record);
    } catch (e) {
      if (String(e.message).startsWith('Batch collision') || required) throw e;
      console.log(`Registry unavailable for batch ${entry.batch} in local context:`, e.message);
    }
  }

  for (const label of labels) {
    try {
      await labelStore.set(`order-${order.order_number}/${label.filename}`, label.content, { onlyIfNew: true });
    } catch (e) {
      if (required) throw e;
      console.log(`Label archive unavailable for ${label.filename} in local context:`, e.message);
    }
  }
  console.log(`🗄️ Archived ${labels.length} PDFs + ${registryEntries.length} registry entries`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function describeProductionKinds(kinds, labelCount) {
  const unique = [...new Set(kinds || [])];
  if (unique.length !== 1) return `MIXED ORDER (${labelCount} Dateien)`;
  if (unique[0] === 'bundle') return 'TRIO BUNDLE (3 Etiketten)';
  if (unique[0] === 'duo') return 'DUO (2 Etiketten)';
  if (unique[0] === 'probe') return 'PROBE (2-ml-Produktionsblatt)';
  return `${labelCount} Etikett${labelCount > 1 ? 'en' : ''}`;
}

async function sendEmail(order, labels, productionNotes, productionKinds) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  const notes = productionNotes || [];
  const uniqueKinds = [...new Set(productionKinds || [])];
  const isBundle = uniqueKinds.length === 1 && uniqueKinds[0] === 'bundle';
  const isDuo = uniqueKinds.length === 1 && uniqueKinds[0] === 'duo';
  const isProbe = uniqueKinds.length === 1 && uniqueKinds[0] === 'probe';
  const kind = describeProductionKinds(productionKinds, labels.length);
  const subject = `IDENTE Order #${order.order_number} - ${kind}`;

  const fileList = labels
    .map(l => `<li>${escapeHtml(l.filename)}${l.qty > 1 ? ` <strong>(× ${l.qty})</strong>` : ''}</li>`)
    .join('');
  const noteList = notes.length
    ? `<p style="color: #9c6626; font-weight: bold;">${notes.map(escapeHtml).join('<br>')}</p>`
    : '';

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.LABEL_EMAIL || process.env.EMAIL_USER,
    subject: subject,
    html: `
      <h2>Neue ${isBundle ? 'TRIO BUNDLE ' : isDuo ? 'DUO ' : isProbe ? 'PROBE ' : ''}Order!</h2>
      <p><strong>Order:</strong> #${escapeHtml(order.order_number)}</p>
      <p><strong>Kunde:</strong> ${escapeHtml(order.customer?.first_name || '')} ${escapeHtml(order.customer?.last_name || '')}</p>
      <p><strong>Etiketten:</strong> ${labels.length}</p>
      <ul>${fileList}</ul>
      ${noteList}
      ${isBundle ? '<p style="color: #c5a059; font-weight: bold;">⚠️ TRIO BUNDLE - 3 separate Etiketten im Anhang!</p>' : ''}
      <hr>
      <p style="font-size: 12px; color: #666;">Generiert von IDENTÉ Label System</p>
    `,
    attachments: labels.map(l => ({ filename: l.filename, content: l.content }))
  });
}

// Exposed for local testing only - not used by the webhook path
exports._test = { generatePersonalizedFormula, generateLabelPDF, generateSampleSheetPDF, generateQRUrl, sanitizeWinAnsi, printableLabelName, usableFormula, roundPreservingSum, idempotencyKey, acquireLease, processWebhook, verifyShopifyHmac, offsetBatch, toScoreString, reducedScore, fileSafeName, resolveFormula, escapeHtml, describeProductionKinds, resolveVariantType, parseConcentration, validateBatch, formulaDigest, productionPersistenceRequired, canonicalMaterialName, formulaApprovalRequired, approvedFormulaHashes, assertFormulaApproved, registryRecordMatches, writeRegistryEntry };
