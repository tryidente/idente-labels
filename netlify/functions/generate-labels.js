// netlify/functions/generate-labels.js
// 2-Page Professional Label Generator - Matching Quiz Design Exactly
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
  
  // Exact same encoding as quiz:
  // btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)))
  const encoded = encodeURIComponent(json);
  const replaced = encoded.replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16)));
  const b64 = Buffer.from(replaced).toString('base64');
  
  return 'https://tryidente.com/pages/verify?d=' + b64;
}

async function generateLabelPDF(data) {
  console.log(`🎨 Generating 2-page PDF for ${data.profile}`);

  const pdfDoc = await PDFDocument.create();
  
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  
  // Taller page to fit everything (105mm x 170mm)
  const pageWidth = 297.64;   // 105mm
  const pageHeight = 481.89;  // 170mm - taller to fit QR + Echtheit
  
  const black = rgb(0, 0, 0);
  const gray = rgb(0.5, 0.5, 0.5);
  
  // Calculate totals
  const topNotes = data.formula?.top || [];
  const heartNotes = data.formula?.heart || [];
  const baseNotes = data.formula?.base || [];
  const allNotes = [...topNotes, ...heartNotes, ...baseNotes];
  const totalOil = allNotes.reduce((sum, n) => sum + (n.weight || 0), 0);
  const totalAlcohol = (50 - totalOil) * 0.96;
  const totalWeight = totalOil + totalAlcohol;
  const noteCount = allNotes.length;
  
  const concentration = data.concentration || 22;

  // ============================================================================
  // PAGE 1: FRONT LABEL
  // ============================================================================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  const centerX = pageWidth / 2;
  let y = pageHeight - 35;

  // Batch number - top right
  const batchNumText = `#${data.batch || '00000000'}`;
  page1.drawText(batchNumText, {
    x: pageWidth - 30 - helvetica.widthOfTextAtSize(batchNumText, 10),
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 50;

  // IDENTÉ Logo
  const logoText = 'IDENTE';
  const logoSize = 52;
  page1.drawText(logoText, {
    x: centerX - helveticaBold.widthOfTextAtSize(logoText, logoSize) / 2,
    y: y,
    size: logoSize,
    font: helveticaBold,
    color: black,
  });

  y -= 45;

  // "for [Name]"
  const forText = `for ${data.name || 'Customer'}`;
  page1.drawText(forText, {
    x: centerX - helveticaOblique.widthOfTextAtSize(forText, 20) / 2,
    y: y,
    size: 20,
    font: helveticaOblique,
    color: black,
  });

  y -= 38;

  // "Eau de Parfum"
  const eauText = 'Eau de Parfum';
  page1.drawText(eauText, {
    x: centerX - helveticaOblique.widthOfTextAtSize(eauText, 16) / 2,
    y: y,
    size: 16,
    font: helveticaOblique,
    color: black,
  });

  y -= 60;

  // Large Concentration
  const concText = `${concentration}%`;
  const concSize = 65;
  page1.drawText(concText, {
    x: centerX - helveticaBold.widthOfTextAtSize(concText, concSize) / 2,
    y: y,
    size: concSize,
    font: helveticaBold,
    color: black,
  });

  y -= 38;

  // Specs line
  const specsText = `${concentration}% \u00B7 50ml \u00B7 ${noteCount} Notes`;
  page1.drawText(specsText, {
    x: centerX - helvetica.widthOfTextAtSize(specsText, 13) / 2,
    y: y,
    size: 13,
    font: helvetica,
    color: black,
  });

  y -= 25;

  // Horizontal line
  const lineMargin = 60;
  page1.drawLine({
    start: { x: lineMargin, y: y },
    end: { x: pageWidth - lineMargin, y: y },
    thickness: 1.5,
    color: black,
  });

  y -= 30;

  // "Handcrafted in Germany"
  const hcText = 'Handcrafted in Germany';
  page1.drawText(hcText, {
    x: centerX - helvetica.widthOfTextAtSize(hcText, 14) / 2,
    y: y,
    size: 14,
    font: helvetica,
    color: black,
  });

  y -= 22;

  // "100% Vegan · Cruelty Free"
  const veganText = '100% Vegan \u00B7 Cruelty Free';
  page1.drawText(veganText, {
    x: centerX - helvetica.widthOfTextAtSize(veganText, 12) / 2,
    y: y,
    size: 12,
    font: helvetica,
    color: black,
  });

  y -= 50;

  // BATCH INFO section (left side)
  const leftX = 35;
  const batchInfoY = y;

  page1.drawText('BATCH INFO', {
    x: leftX,
    y: batchInfoY,
    size: 13,
    font: helveticaBold,
    color: black,
  });

  page1.drawText(`Batch: ${data.batch || 'N/A'}`, {
    x: leftX,
    y: batchInfoY - 22,
    size: 12,
    font: helvetica,
    color: black,
  });

  page1.drawText(`Date: ${data.date || 'N/A'}`, {
    x: leftX,
    y: batchInfoY - 42,
    size: 12,
    font: helvetica,
    color: black,
  });

  // QR Code (right side)
  try {
    const qrUrl = generateQRUrl(data);
    console.log('📱 QR URL:', qrUrl);
    
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'L',
      color: { dark: '#000000', light: '#ffffff' }
    });
    
    const qrImageData = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrImage = await pdfDoc.embedPng(Buffer.from(qrImageData, 'base64'));
    
    const qrSize = 85;
    const qrX = pageWidth - 35 - qrSize;
    const qrY = batchInfoY - 60;
    
    page1.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });

    // "Echtheit" label under QR
    const echtText = 'Echtheit';
    page1.drawText(echtText, {
      x: qrX + (qrSize - helvetica.widthOfTextAtSize(echtText, 10)) / 2,
      y: qrY - 15,
      size: 10,
      font: helvetica,
      color: gray,
    });
  } catch (qrError) {
    console.log('⚠️ QR generation failed:', qrError.message);
  }

  // ============================================================================
  // PAGE 2: FORMULA SHEET (also taller)
  // ============================================================================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  y = pageHeight - 40;

  // FORMULA title
  const formulaTitle = 'FORMULA';
  page2.drawText(formulaTitle, {
    x: centerX - helveticaBold.widthOfTextAtSize(formulaTitle, 28) / 2,
    y: y,
    size: 28,
    font: helveticaBold,
    color: black,
  });

  y -= 30;

  // Batch line
  const batchLine = `Batch ${data.batch || 'N/A'}`;
  page2.drawText(batchLine, {
    x: centerX - helvetica.widthOfTextAtSize(batchLine, 12) / 2,
    y: y,
    size: 12,
    font: helvetica,
    color: black,
  });

  y -= 24;

  // "for [Name]"
  const forLine = `for ${data.name || 'Customer'}`;
  page2.drawText(forLine, {
    x: centerX - helveticaOblique.widthOfTextAtSize(forLine, 14) / 2,
    y: y,
    size: 14,
    font: helveticaOblique,
    color: black,
  });

  y -= 45;

  const leftMargin = 30;
  const rightMargin = pageWidth - 30;

  // Draw note groups
  const drawNoteGroup = (title, notes) => {
    if (!notes || notes.length === 0) return;

    page2.drawText(title, {
      x: leftMargin,
      y: y,
      size: 11,
      font: helveticaBold,
      color: black,
    });
    y -= 20;

    notes.forEach(note => {
      page2.drawText(note.name || 'Unknown', {
        x: leftMargin,
        y: y,
        size: 11,
        font: helvetica,
        color: black,
      });

      const weightText = `${(note.weight || 0).toFixed(3)}g`;
      page2.drawText(weightText, {
        x: rightMargin - helvetica.widthOfTextAtSize(weightText, 11),
        y: y,
        size: 11,
        font: helvetica,
        color: gray,
      });

      y -= 18;
    });

    y -= 15;
  };

  drawNoteGroup('KOPFNOTEN', topNotes);
  drawNoteGroup('HERZNOTEN', heartNotes);
  drawNoteGroup('BASISNOTEN', baseNotes);

  // Divider before totals
  y -= 5;
  page2.drawLine({
    start: { x: leftMargin, y: y },
    end: { x: rightMargin, y: y },
    thickness: 1.5,
    color: black,
  });

  y -= 28;

  // Totals
  const drawTotalRow = (label, value) => {
    page2.drawText(label, {
      x: leftMargin,
      y: y,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    page2.drawText(value, {
      x: rightMargin - helveticaBold.widthOfTextAtSize(value, 12),
      y: y,
      size: 12,
      font: helveticaBold,
      color: black,
    });
    y -= 22;
  };

  drawTotalRow('PARFUM OIL', `${totalOil.toFixed(3)}g`);
  drawTotalRow('ALKOHOL (96%)', `${totalAlcohol.toFixed(3)}g`);
  drawTotalRow('TOTAL', `${totalWeight.toFixed(3)}g`);

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
