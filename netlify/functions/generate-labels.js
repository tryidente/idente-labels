// netlify/functions/generate-labels.js
// Minimalist 2-Page Label Design - 50ml calculation
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

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
      item.properties.forEach(p => {
        props[p.name] = p.value;
      });

      if (props._quiz_type === 'bundle') {
        console.log('📦 Bundle detected - generating 3 labels');
        const bundleData = JSON.parse(props._quiz_data);

        if (bundleData.main) {
          const quizData = {
            batch: props._quiz_batch,
            name: props._quiz_name,
            date: props._quiz_date,
            profile: bundleData.main.profile.name,
            concentration: bundleData.main.profile.actualConcentration,
            harmonie: bundleData.main.harmonie,
            match: bundleData.main.match,
            formula: bundleData.main.profile.notes
          };
          const pdf = await generateLabelPDF(quizData);
          labels.push({
            filename: `IDENTE-${quizData.profile.replace(/\s/g, '-')}-${props._quiz_batch}.pdf`,
            content: pdf
          });
        }

        if (bundleData.rec1) {
          const quizData = {
            batch: props._quiz_batch,
            name: props._quiz_name,
            date: props._quiz_date,
            profile: bundleData.rec1.profile.name,
            concentration: bundleData.rec1.profile.baseConcentration || bundleData.rec1.profile.actualConcentration,
            harmonie: bundleData.rec1.harmonie,
            match: bundleData.rec1.match,
            formula: bundleData.rec1.profile.notes
          };
          const pdf = await generateLabelPDF(quizData);
          labels.push({
            filename: `IDENTE-${quizData.profile.replace(/\s/g, '-')}-${props._quiz_batch}-rec1.pdf`,
            content: pdf
          });
        }

        if (bundleData.rec2) {
          const quizData = {
            batch: props._quiz_batch,
            name: props._quiz_name,
            date: props._quiz_date,
            profile: bundleData.rec2.profile.name,
            concentration: bundleData.rec2.profile.baseConcentration || bundleData.rec2.profile.actualConcentration,
            harmonie: bundleData.rec2.harmonie,
            match: bundleData.rec2.match,
            formula: bundleData.rec2.profile.notes
          };
          const pdf = await generateLabelPDF(quizData);
          labels.push({
            filename: `IDENTE-${quizData.profile.replace(/\s/g, '-')}-${props._quiz_batch}-rec2.pdf`,
            content: pdf
          });
        }
      } else {
        console.log('📄 Single product - generating 1 label');
        
        let formula = {};
        try {
          formula = JSON.parse(props._quiz_formula || '{}');
        } catch (e) {
          console.log('⚠️ Could not parse formula');
        }

        const quizData = {
          batch: props._quiz_batch,
          name: props._quiz_name,
          date: props._quiz_date,
          profile: props._quiz_profile,
          concentration: parseInt(props._quiz_concentration) || 22,
          harmonie: props._quiz_harmonie || '95',
          match: props._quiz_match || '92',
          formula: formula
        };

        const pdf = await generateLabelPDF(quizData);
        labels.push({
          filename: `IDENTE-${(quizData.profile || 'Custom').replace(/\s/g, '-')}-${quizData.batch}.pdf`,
          content: pdf
        });
      }
    }

    if (labels.length > 0) {
      console.log(`📧 Sending ${labels.length} labels via email`);
      await sendEmail(order, labels);
      console.log('✅ Success!');
    } else {
      console.log('⚠️ No labels generated');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Labels generated', count: labels.length })
    };

  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Generate QR URL exactly like the quiz does
function generateQRUrl(data) {
  const qd = {
    b: data.batch,
    n: data.name,
    d: data.date,
    c: data.concentration,
    h: data.harmonie,
    m: data.match
  };
  const json = JSON.stringify(qd);
  const encoded = encodeURIComponent(json);
  const replaced = encoded.replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16)));
  const b64 = Buffer.from(replaced).toString('base64');
  return 'https://tryidente.com/pages/verify?d=' + b64;
}

// Extract short profile name (Date, Freizeit, Alltag, Business)
function getShortProfileName(profile) {
  if (!profile) return '';
  // Remove "IDENTÉ " or "IDENTE " prefix if present
  const cleaned = profile.replace(/^IDENT[EÉ]\s*/i, '');
  return cleaned;
}

async function generateLabelPDF(data) {
  console.log(`🎨 Generating 2-page PDF for ${data.profile}`);

  const pdfDoc = await PDFDocument.create();
  
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  // Page size (adjust as needed)
  const pageWidth = 170;
  const pageHeight = 397;
  
  const black = rgb(0, 0, 0);
  const gray = rgb(0.3, 0.3, 0.3);
  
  // Calculate totals for 50ml
  const topNotes = data.formula?.top || [];
  const heartNotes = data.formula?.heart || [];
  const baseNotes = data.formula?.base || [];
  const allNotes = [...topNotes, ...heartNotes, ...baseNotes];
  const noteCount = allNotes.length;
  const totalOil = allNotes.reduce((sum, n) => sum + (n.weight || 0), 0);
  const totalAlcohol = 50 - totalOil;  // 50ml basis
  const totalWeight = 50;              // 50ml total
  
  const concentration = data.concentration || 22;
  const centerX = pageWidth / 2;
  const profileName = getShortProfileName(data.profile);

  // ============================================================================
  // PAGE 1: FRONT LABEL
  // ============================================================================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 60;

  // IDENTÉ Logo with letter spacing
  const letters = ['I', 'D', 'E', 'N', 'T', 'E'];
  const logoSize = 26;
  const letterSpacing = 5;
  let totalLogoWidth = 0;
  letters.forEach(l => {
    totalLogoWidth += helveticaBold.widthOfTextAtSize(l, logoSize) + letterSpacing;
  });
  totalLogoWidth -= letterSpacing;
  
  let letterX = centerX - totalLogoWidth / 2;
  letters.forEach((letter) => {
    page1.drawText(letter, {
      x: letterX,
      y: y,
      size: logoSize,
      font: helveticaBold,
      color: black,
    });
    letterX += helveticaBold.widthOfTextAtSize(letter, logoSize) + letterSpacing;
  });

  y -= 10;

  // Line under logo
  const lineMargin = 15;
  page1.drawLine({
    start: { x: lineMargin, y: y },
    end: { x: pageWidth - lineMargin, y: y },
    thickness: 1,
    color: black,
  });

  y -= 25;

  // "for [Name]"
  const forText = `for ${data.name || 'Customer'}`;
  page1.drawText(forText, {
    x: centerX - helvetica.widthOfTextAtSize(forText, 14) / 2,
    y: y,
    size: 14,
    font: helvetica,
    color: black,
  });

  // Bottom section of page 1
  y = 110;

  // Profile name (Date, Freizeit, Alltag, Business) ABOVE "PARFUM"
  if (profileName) {
    page1.drawText(profileName, {
      x: centerX - helveticaBold.widthOfTextAtSize(profileName, 12) / 2,
      y: y,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    y -= 20;
  }

  // "PARFUM" with letter spacing
  const parfumText = 'PARFUM';
  const parfumSize = 12;
  const parfumLetters = parfumText.split('');
  const parfumSpacing = 4;
  let parfumWidth = 0;
  parfumLetters.forEach(l => {
    parfumWidth += helveticaBold.widthOfTextAtSize(l, parfumSize) + parfumSpacing;
  });
  parfumWidth -= parfumSpacing;
  
  let parfumX = centerX - parfumWidth / 2;
  parfumLetters.forEach(letter => {
    page1.drawText(letter, {
      x: parfumX,
      y: y,
      size: parfumSize,
      font: helveticaBold,
      color: black,
    });
    parfumX += helveticaBold.widthOfTextAtSize(letter, parfumSize) + parfumSpacing;
  });

  y -= 22;

  // "[X] NOTES • [Y]%"
  const specsText = `${noteCount} NOTES \u2022 ${concentration}%`;
  page1.drawText(specsText, {
    x: centerX - helvetica.widthOfTextAtSize(specsText, 10) / 2,
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 30;

  // "id." at bottom
  const idText = 'id.';
  page1.drawText(idText, {
    x: centerX - helvetica.widthOfTextAtSize(idText, 10) / 2,
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  // ============================================================================
  // PAGE 2: FORMULA SHEET
  // ============================================================================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  y = pageHeight - 30;

  const leftMargin = 12;
  const rightMargin = pageWidth - 12;

  // "FORMULA" title
  const formulaText = 'FORMULA';
  const formulaSize = 22;
  page2.drawText(formulaText, {
    x: centerX - helveticaBold.widthOfTextAtSize(formulaText, formulaSize) / 2,
    y: y,
    size: formulaSize,
    font: helveticaBold,
    color: black,
  });

  y -= 8;

  // Line under FORMULA
  page2.drawLine({
    start: { x: leftMargin, y: y },
    end: { x: rightMargin, y: y },
    thickness: 1.5,
    color: black,
  });

  y -= 18;

  // Helper to draw note groups - 3 decimal places
  const drawNoteGroup = (title, notes) => {
    if (!notes || notes.length === 0) return;

    page2.drawText(title, {
      x: leftMargin,
      y: y,
      size: 10,
      font: helveticaBold,
      color: black,
    });
    y -= 14;

    notes.forEach(note => {
      page2.drawText(note.name || 'Unknown', {
        x: leftMargin + 8,
        y: y,
        size: 9,
        font: helvetica,
        color: black,
      });

      // 3 decimal places
      const weightText = `${(note.weight || 0).toFixed(3)}g`;
      page2.drawText(weightText, {
        x: rightMargin - helvetica.widthOfTextAtSize(weightText, 9),
        y: y,
        size: 9,
        font: helvetica,
        color: black,
      });

      y -= 12;
    });

    y -= 6;
  };

  drawNoteGroup('TOP NOTES', topNotes);
  drawNoteGroup('HEART NOTES', heartNotes);
  drawNoteGroup('BASE NOTES', baseNotes);

  // Line before totals
  y -= 3;
  page2.drawLine({
    start: { x: leftMargin, y: y },
    end: { x: rightMargin, y: y },
    thickness: 1,
    color: black,
  });

  y -= 15;

  // Perfume oil - 3 decimal places
  page2.drawText('Perfume oil', {
    x: leftMargin,
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });
  const oilText = `${totalOil.toFixed(3)}g`;
  page2.drawText(oilText, {
    x: rightMargin - helvetica.widthOfTextAtSize(oilText, 10),
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 14;

  // Alcohol - 3 decimal places
  page2.drawText('Alcohol', {
    x: leftMargin,
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });
  const alcText = `${totalAlcohol.toFixed(3)}g`;
  page2.drawText(alcText, {
    x: rightMargin - helvetica.widthOfTextAtSize(alcText, 10),
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 12;

  // Line before total
  page2.drawLine({
    start: { x: leftMargin, y: y },
    end: { x: rightMargin, y: y },
    thickness: 1,
    color: black,
  });

  y -= 15;

  // Total - 3 decimal places
  page2.drawText('Total', {
    x: leftMargin,
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  const totalText = `${totalWeight.toFixed(3)}g`;
  page2.drawText(totalText, {
    x: rightMargin - helveticaBold.widthOfTextAtSize(totalText, 10),
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });

  y -= 10;

  // Thick line after total
  page2.drawLine({
    start: { x: leftMargin, y: y },
    end: { x: rightMargin, y: y },
    thickness: 1.5,
    color: black,
  });

  y -= 22;

  // BATCH section with QR code
  const batchSectionY = y;
  
  page2.drawText('BATCH', {
    x: leftMargin,
    y: batchSectionY,
    size: 10,
    font: helveticaBold,
    color: black,
  });

  page2.drawText(data.batch || 'N/A', {
    x: leftMargin,
    y: batchSectionY - 14,
    size: 9,
    font: helvetica,
    color: black,
  });

  page2.drawText(data.date || 'N/A', {
    x: leftMargin,
    y: batchSectionY - 26,
    size: 9,
    font: helvetica,
    color: black,
  });

  // 50ml
  const mlText = '50ml';
  page2.drawText(mlText, {
    x: leftMargin + 50,
    y: batchSectionY - 14,
    size: 9,
    font: helvetica,
    color: black,
  });

  // QR Code on the right
  try {
    const qrUrl = generateQRUrl(data);
    console.log('📱 QR URL:', qrUrl);
    
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 200,
      margin: 0,
      errorCorrectionLevel: 'L',
      color: { dark: '#000000', light: '#ffffff' }
    });
    
    const qrImageData = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrImage = await pdfDoc.embedPng(Buffer.from(qrImageData, 'base64'));
    
    const qrSize = 45;
    const qrX = rightMargin - qrSize;
    const qrY = batchSectionY - 32;
    
    page2.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });
  } catch (qrError) {
    console.log('⚠️ QR generation failed:', qrError.message);
  }

  const pdfBytes = await pdfDoc.save();
  console.log(`✅ 2-page PDF generated for ${data.profile}`);
  
  return Buffer.from(pdfBytes);
}

async function sendEmail(order, labels) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const customerName = order.customer?.first_name || 'Customer';

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.LABEL_EMAIL || process.env.EMAIL_USER,
    subject: `IDENTE Order #${order.order_number} - ${labels.length} Etikett${labels.length > 1 ? 'en' : ''}`,
    html: `
      <h2>Neue Order erhalten!</h2>
      <p><strong>Order:</strong> #${order.order_number}</p>
      <p><strong>Kunde:</strong> ${customerName} ${order.customer?.last_name || ''}</p>
      <p><strong>Email:</strong> ${order.customer?.email || 'N/A'}</p>
      <p><strong>Anzahl Etiketten:</strong> ${labels.length}</p>
      <hr>
      <p>Jedes PDF hat 2 Seiten: Flaschenetikett + Formelblatt</p>
    `,
    attachments: labels
  });
}
