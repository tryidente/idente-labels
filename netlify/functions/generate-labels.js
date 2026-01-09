// netlify/functions/generate-labels.js
// 2-Page Professional Label Generator matching Quiz Results Design
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

exports.handler = async (event, context) => {
  try {
    console.log('🔔 Webhook received');

    const order = JSON.parse(event.body);
    console.log(`📦 Order #${order.order_number} from ${order.customer?.first_name || 'Customer'}`);

    const labels = [];

    // Process each line item
    for (const item of order.line_items) {
      console.log(`📝 Processing item: ${item.name}`);

      if (!item.properties || item.properties.length === 0) {
        console.log('⚠️ No quiz properties found, skipping');
        continue;
      }

      // Convert properties array to object
      const props = {};
      item.properties.forEach(p => {
        props[p.name] = p.value;
      });

      // Check if bundle
      if (props._quiz_type === 'bundle') {
        console.log('📦 Bundle detected - generating 3 labels (main + 2 recs)');
        const bundleData = JSON.parse(props._quiz_data);

        // Main profile
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

        // Recommendation 1
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

        // Recommendation 2
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
        // Single product
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

async function generateLabelPDF(data) {
  console.log(`🎨 Generating 2-page PDF for ${data.profile}`);

  const pdfDoc = await PDFDocument.create();
  
  // Embed fonts
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  
  // Page dimensions (optimized for label printing - roughly 80mm x 120mm)
  const pageWidth = 226.77; // 80mm in points
  const pageHeight = 340.16; // 120mm in points
  
  // Colors
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  
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
  let y = pageHeight - 25;

  // Batch number top right
  const batchText = `#${data.batch || '00000000'}`;
  const batchWidth = helvetica.widthOfTextAtSize(batchText, 9);
  page1.drawText(batchText, {
    x: pageWidth - 20 - batchWidth,
    y: y,
    size: 9,
    font: helvetica,
    color: black,
  });

  y -= 30;

  // IDENTÉ Logo (large, bold)
  const logoText = 'IDENTE';
  const logoSize = 42;
  const logoWidth = helveticaBold.widthOfTextAtSize(logoText, logoSize);
  page1.drawText(logoText, {
    x: (pageWidth - logoWidth) / 2,
    y: y,
    size: logoSize,
    font: helveticaBold,
    color: black,
  });

  y -= 28;

  // "for [Name]"
  const forText = `for ${data.name || 'Customer'}`;
  const forWidth = helveticaOblique.widthOfTextAtSize(forText, 16);
  page1.drawText(forText, {
    x: (pageWidth - forWidth) / 2,
    y: y,
    size: 16,
    font: helveticaOblique,
    color: black,
  });

  y -= 28;

  // "Eau de Parfum"
  const eauText = 'Eau de Parfum';
  const eauWidth = helveticaOblique.widthOfTextAtSize(eauText, 14);
  page1.drawText(eauText, {
    x: (pageWidth - eauWidth) / 2,
    y: y,
    size: 14,
    font: helveticaOblique,
    color: black,
  });

  y -= 45;

  // Large concentration percentage
  const concText = `${concentration}%`;
  const concSize = 48;
  const concWidth = helveticaBold.widthOfTextAtSize(concText, concSize);
  page1.drawText(concText, {
    x: (pageWidth - concWidth) / 2,
    y: y,
    size: concSize,
    font: helveticaBold,
    color: black,
  });

  y -= 28;

  // Specs line
  const specsText = `${concentration}% - 50ml - ${noteCount} Notes`;
  const specsWidth = helvetica.widthOfTextAtSize(specsText, 11);
  page1.drawText(specsText, {
    x: (pageWidth - specsWidth) / 2,
    y: y,
    size: 11,
    font: helvetica,
    color: black,
  });

  y -= 18;

  // Horizontal line
  page1.drawLine({
    start: { x: 40, y: y },
    end: { x: pageWidth - 40, y: y },
    thickness: 1,
    color: black,
  });

  y -= 22;

  // "Handcrafted in Germany"
  const hcText = 'Handcrafted in Germany';
  const hcWidth = helvetica.widthOfTextAtSize(hcText, 11);
  page1.drawText(hcText, {
    x: (pageWidth - hcWidth) / 2,
    y: y,
    size: 11,
    font: helvetica,
    color: black,
  });

  y -= 16;

  // "100% Vegan · Cruelty Free"
  const veganText = '100% Vegan - Cruelty Free';
  const veganWidth = helvetica.widthOfTextAtSize(veganText, 10);
  page1.drawText(veganText, {
    x: (pageWidth - veganWidth) / 2,
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 30;

  // BATCH INFO section
  const batchInfoX = 25;
  
  page1.drawText('BATCH INFO', {
    x: batchInfoX,
    y: y,
    size: 11,
    font: helveticaBold,
    color: black,
  });

  y -= 16;

  page1.drawText(`Batch: ${data.batch || 'N/A'}`, {
    x: batchInfoX,
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  y -= 14;

  page1.drawText(`Date: ${data.date || 'N/A'}`, {
    x: batchInfoX,
    y: y,
    size: 10,
    font: helvetica,
    color: black,
  });

  // QR Code on the right side
  try {
    const qrData = {
      b: data.batch,
      n: data.name,
      d: data.date,
      c: concentration,
      h: data.harmonie,
      m: data.match
    };
    const qrJson = JSON.stringify(qrData);
    const qrBase64Data = Buffer.from(encodeURIComponent(qrJson)).toString('base64');
    const qrUrl = `https://tryidente.com/pages/verify?d=${qrBase64Data}`;
    
    // Generate QR code as PNG data URL
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 80,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });
    
    // Extract base64 data from data URL
    const qrImageData = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrImage = await pdfDoc.embedPng(Buffer.from(qrImageData, 'base64'));
    
    const qrSize = 70;
    const qrX = pageWidth - 25 - qrSize;
    const qrY = y - 35;
    
    page1.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });

    // "Echtheit" label under QR
    const echtText = 'Echtheit';
    const echtWidth = helvetica.widthOfTextAtSize(echtText, 8);
    page1.drawText(echtText, {
      x: qrX + (qrSize - echtWidth) / 2,
      y: qrY - 12,
      size: 8,
      font: helvetica,
      color: gray,
    });
  } catch (qrError) {
    console.log('⚠️ QR code generation failed:', qrError.message);
  }

  // ============================================================================
  // PAGE 2: FORMULA SHEET
  // ============================================================================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  y = pageHeight - 30;

  // FORMULA title
  const formulaTitle = 'FORMULA';
  const formulaTitleWidth = helveticaBold.widthOfTextAtSize(formulaTitle, 24);
  page2.drawText(formulaTitle, {
    x: (pageWidth - formulaTitleWidth) / 2,
    y: y,
    size: 24,
    font: helveticaBold,
    color: black,
  });

  y -= 20;

  // Batch number
  const batchLine = `Batch ${data.batch || 'N/A'}`;
  const batchLineWidth = helvetica.widthOfTextAtSize(batchLine, 11);
  page2.drawText(batchLine, {
    x: (pageWidth - batchLineWidth) / 2,
    y: y,
    size: 11,
    font: helvetica,
    color: black,
  });

  y -= 16;

  // "for [Name]"
  const forLine = `for ${data.name || 'Customer'}`;
  const forLineWidth = helveticaOblique.widthOfTextAtSize(forLine, 12);
  page2.drawText(forLine, {
    x: (pageWidth - forLineWidth) / 2,
    y: y,
    size: 12,
    font: helveticaOblique,
    color: black,
  });

  y -= 25;

  const leftMargin = 20;
  const rightMargin = pageWidth - 20;

  // Helper function to draw note group
  const drawNoteGroup = (title, notes) => {
    if (!notes || notes.length === 0) return;

    // Group title
    page2.drawText(title, {
      x: leftMargin,
      y: y,
      size: 10,
      font: helveticaBold,
      color: black,
    });
    y -= 14;

    // Notes
    notes.forEach(note => {
      page2.drawText(note.name || 'Unknown', {
        x: leftMargin,
        y: y,
        size: 9,
        font: helvetica,
        color: black,
      });

      const weightText = `${(note.weight || 0).toFixed(3)}g`;
      const weightWidth = helvetica.widthOfTextAtSize(weightText, 9);
      page2.drawText(weightText, {
        x: rightMargin - weightWidth,
        y: y,
        size: 9,
        font: helvetica,
        color: gray,
      });

      y -= 12;
    });

    y -= 8;
  };

  // Draw note groups
  drawNoteGroup('KOPFNOTEN', topNotes);
  drawNoteGroup('HERZNOTEN', heartNotes);
  drawNoteGroup('BASISNOTEN', baseNotes);

  // Totals section
  y -= 5;
  
  // Line above totals
  page2.drawLine({
    start: { x: leftMargin, y: y },
    end: { x: rightMargin, y: y },
    thickness: 1,
    color: black,
  });

  y -= 18;

  // PARFÜMÖL (using PARFUMOL without umlaut for compatibility)
  page2.drawText('PARFUM OL', {
    x: leftMargin,
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  const oilText = `${totalOil.toFixed(3)}g`;
  const oilWidth = helveticaBold.widthOfTextAtSize(oilText, 10);
  page2.drawText(oilText, {
    x: rightMargin - oilWidth,
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });

  y -= 14;

  // ALKOHOL
  page2.drawText('ALKOHOL (96%)', {
    x: leftMargin,
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  const alcText = `${totalAlcohol.toFixed(3)}g`;
  const alcWidth = helveticaBold.widthOfTextAtSize(alcText, 10);
  page2.drawText(alcText, {
    x: rightMargin - alcWidth,
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });

  y -= 14;

  // TOTAL
  page2.drawText('TOTAL', {
    x: leftMargin,
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  const totalText = `${totalWeight.toFixed(3)}g`;
  const totalWidth = helveticaBold.widthOfTextAtSize(totalText, 10);
  page2.drawText(totalText, {
    x: rightMargin - totalWidth,
    y: y,
    size: 10,
    font: helveticaBold,
    color: black,
  });

  // Save PDF
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
      <p><small>Etiketten sind als PDF angehaengt. Jedes PDF hat 2 Seiten:</small></p>
      <ul>
        <li>Seite 1: Flaschenetikett mit QR-Code</li>
        <li>Seite 2: Formelblatt mit allen Duftnoten</li>
      </ul>
    `,
    attachments: labels
  });
}
