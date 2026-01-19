// netlify/functions/generate-labels.js
// IDENTÉ Personalized Perfume Label Generator
// Supports single orders AND bundle orders (3 separate labels)

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

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

exports.handler = async (event, context) => {
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
            mainFormula = JSON.parse(props._quiz_main_formula);
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
            rec1Formula = JSON.parse(props._quiz_rec1_formula);
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
            rec2Formula = JSON.parse(props._quiz_rec2_formula);
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
            const parsedFormula = JSON.parse(props._quiz_formula);
            if (parsedFormula.top && parsedFormula.top[0] && parsedFormula.top[0].weight) {
              formula = {
                top: parsedFormula.top,
                heart: parsedFormula.heart,
                base: parsedFormula.base,
                oilTotal: parsedFormula.oilTotal || 50 * (quizData.concentration / 100),
                alcoholTotal: parsedFormula.alcoholTotal || 50 - (50 * (quizData.concentration / 100)),
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

async function generateLabelPDF(data, formula) {
  console.log(`🎨 Generating PDF for ${data.name} - ${data.profile}`);

  const pdfDoc = await PDFDocument.create();
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const pageWidth = 170;
  const pageHeight = 425;
  const black = rgb(0, 0, 0);
  const centerX = pageWidth / 2;
  const profileName = getShortProfileName(data.profile);
  const noteCount = formula.top.length + formula.heart.length + formula.base.length;

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: FRONT LABEL
  // ═══════════════════════════════════════════════════════════════════════════
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 70;

  // IDENTÉ Logo
  const letters = ['I', 'D', 'E', 'N', 'T', 'E'];
  const logoSize = 28;
  const letterSpacing = 5;
  let totalLogoWidth = 0;
  letters.forEach(l => { totalLogoWidth += helveticaBold.widthOfTextAtSize(l, logoSize) + letterSpacing; });
  totalLogoWidth -= letterSpacing;
  
  let letterX = centerX - totalLogoWidth / 2;
  letters.forEach(letter => {
    page1.drawText(letter, { x: letterX, y, size: logoSize, font: helveticaBold, color: black });
    letterX += helveticaBold.widthOfTextAtSize(letter, logoSize) + letterSpacing;
  });

  y -= 12;
  page1.drawLine({ start: { x: 18, y }, end: { x: pageWidth - 18, y }, thickness: 1.2, color: black });

  y -= 30;
  const forText = `for ${data.name}`;
  page1.drawText(forText, { x: centerX - helvetica.widthOfTextAtSize(forText, 15) / 2, y, size: 15, font: helvetica, color: black });

  // Bottom section
  y = 115;
  if (profileName) {
    page1.drawText(profileName, { x: centerX - helveticaBold.widthOfTextAtSize(profileName, 13) / 2, y, size: 13, font: helveticaBold, color: black });
    y -= 22;
  }

  // PARFUM
  const parfumText = 'PARFUM';
  const parfumSize = 13;
  const parfumSpacing = 5;
  let parfumWidth = 0;
  parfumText.split('').forEach(l => { parfumWidth += helveticaBold.widthOfTextAtSize(l, parfumSize) + parfumSpacing; });
  parfumWidth -= parfumSpacing;
  let parfumX = centerX - parfumWidth / 2;
  parfumText.split('').forEach(letter => {
    page1.drawText(letter, { x: parfumX, y, size: parfumSize, font: helveticaBold, color: black });
    parfumX += helveticaBold.widthOfTextAtSize(letter, parfumSize) + parfumSpacing;
  });

  y -= 24;
  const specsText = `${noteCount} NOTES \u2022 ${data.concentration}%`;
  page1.drawText(specsText, { x: centerX - helvetica.widthOfTextAtSize(specsText, 11) / 2, y, size: 11, font: helvetica, color: black });

  y -= 35;
  page1.drawText('id.', { x: centerX - helvetica.widthOfTextAtSize('id.', 11) / 2, y, size: 11, font: helvetica, color: black });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: FORMULA
  // ═══════════════════════════════════════════════════════════════════════════
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  y = pageHeight - 35;
  const leftMargin = 14;
  const rightMargin = pageWidth - 14;

  page2.drawText('FORMULA', { x: centerX - helveticaBold.widthOfTextAtSize('FORMULA', 24) / 2, y, size: 24, font: helveticaBold, color: black });
  y -= 10;
  page2.drawLine({ start: { x: leftMargin, y }, end: { x: rightMargin, y }, thickness: 1.5, color: black });
  y -= 20;

  const drawNoteGroup = (title, notes) => {
    if (!notes || notes.length === 0) return;
    page2.drawText(title, { x: leftMargin, y, size: 10, font: helveticaBold, color: black });
    y -= 14;
    notes.forEach(note => {
      page2.drawText(note.name, { x: leftMargin + 6, y, size: 9, font: helvetica, color: black });
      const wt = `${note.weight.toFixed(3)}g`;
      page2.drawText(wt, { x: rightMargin - helvetica.widthOfTextAtSize(wt, 9), y, size: 9, font: helvetica, color: black });
      y -= 12;
    });
    y -= 6;
  };

  drawNoteGroup('TOP NOTES', formula.top);
  drawNoteGroup('HEART NOTES', formula.heart);
  drawNoteGroup('BASE NOTES', formula.base);

  y -= 4;
  page2.drawLine({ start: { x: leftMargin, y }, end: { x: rightMargin, y }, thickness: 1, color: black });
  y -= 16;

  page2.drawText('Perfume oil', { x: leftMargin, y, size: 10, font: helvetica, color: black });
  const oilT = `${formula.oilTotal.toFixed(3)}g`;
  page2.drawText(oilT, { x: rightMargin - helvetica.widthOfTextAtSize(oilT, 10), y, size: 10, font: helvetica, color: black });
  y -= 14;

  page2.drawText('Alcohol', { x: leftMargin, y, size: 10, font: helvetica, color: black });
  const alcT = `${formula.alcoholTotal.toFixed(3)}g`;
  page2.drawText(alcT, { x: rightMargin - helvetica.widthOfTextAtSize(alcT, 10), y, size: 10, font: helvetica, color: black });
  y -= 12;

  page2.drawLine({ start: { x: leftMargin, y }, end: { x: rightMargin, y }, thickness: 1, color: black });
  y -= 16;

  page2.drawText('Total', { x: leftMargin, y, size: 10, font: helveticaBold, color: black });
  const totT = `${formula.grandTotal.toFixed(3)}g`;
  page2.drawText(totT, { x: rightMargin - helveticaBold.widthOfTextAtSize(totT, 10), y, size: 10, font: helveticaBold, color: black });
  y -= 10;
  page2.drawLine({ start: { x: leftMargin, y }, end: { x: rightMargin, y }, thickness: 1.5, color: black });

  y -= 25;
  const batchY = y;
  page2.drawText('BATCH', { x: leftMargin, y: batchY, size: 11, font: helveticaBold, color: black });
  page2.drawText(data.batch, { x: leftMargin, y: batchY - 15, size: 10, font: helvetica, color: black });
  page2.drawText(data.date, { x: leftMargin, y: batchY - 28, size: 10, font: helvetica, color: black });
  page2.drawText('50ml', { x: centerX - helvetica.widthOfTextAtSize('50ml', 10) / 2, y: batchY - 15, size: 10, font: helvetica, color: black });

  try {
    const qrUrl = generateQRUrl(data);
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 200, margin: 0, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } });
    const qrImageData = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrImage = await pdfDoc.embedPng(Buffer.from(qrImageData, 'base64'));
    page2.drawImage(qrImage, { x: rightMargin - 48, y: batchY - 35, width: 48, height: 48 });
  } catch (e) {
    console.log('⚠️ QR failed');
  }

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
