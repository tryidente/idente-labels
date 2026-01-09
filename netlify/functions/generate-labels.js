// netlify/functions/generate-labels.js
// Uses pdf-lib for PDF generation (pure JS, no external dependencies)
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const nodemailer = require('nodemailer');

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
            concentration: bundleData.main.profile.actualConcentration + '%',
            harmonie: bundleData.main.harmonie,
            match: bundleData.main.match,
            formula: bundleData.main.profile.notes,
            family: bundleData.main.profile.family,
            description: bundleData.main.profile.description,
            tags: bundleData.main.profile.tags
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
            concentration: bundleData.rec1.profile.baseConcentration + '%',
            harmonie: bundleData.rec1.harmonie,
            match: bundleData.rec1.match,
            formula: bundleData.rec1.profile.notes,
            family: bundleData.rec1.profile.family,
            description: bundleData.rec1.profile.description,
            tags: bundleData.rec1.profile.tags
          };

          const pdf = await generateLabelPDF(quizData);
          labels.push({
            filename: `IDENTE-${quizData.profile.replace(/\s/g, '-')}-${props._quiz_batch}.pdf`,
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
            concentration: bundleData.rec2.profile.baseConcentration + '%',
            harmonie: bundleData.rec2.harmonie,
            match: bundleData.rec2.match,
            formula: bundleData.rec2.profile.notes,
            family: bundleData.rec2.profile.family,
            description: bundleData.rec2.profile.description,
            tags: bundleData.rec2.profile.tags
          };

          const pdf = await generateLabelPDF(quizData);
          labels.push({
            filename: `IDENTE-${quizData.profile.replace(/\s/g, '-')}-${props._quiz_batch}.pdf`,
            content: pdf
          });
        }
      } else {
        // Single product
        console.log('📄 Single product - generating 1 label');
        const quizData = {
          batch: props._quiz_batch,
          name: props._quiz_name,
          date: props._quiz_date,
          profile: props._quiz_profile,
          concentration: props._quiz_concentration,
          harmonie: props._quiz_harmonie || '95',
          match: props._quiz_match || '92',
          formula: JSON.parse(props._quiz_formula || '{}')
        };

        const pdf = await generateLabelPDF(quizData);
        labels.push({
          filename: `IDENTE-${quizData.profile.replace(/\s/g, '-')}-${quizData.batch}.pdf`,
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
  console.log(`🎨 Generating PDF for ${data.profile}`);

  // Create A6 size PDF (105mm x 148mm = 297.64 x 419.53 points)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([297.64, 419.53]);
  
  // Embed fonts
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const { width, height } = page.getSize();
  
  // Colors
  const brandGreen = rgb(0.039, 0.239, 0.173); // #0A3D2C
  const gold = rgb(0.773, 0.627, 0.349); // #C5A059
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.6, 0.6, 0.6);
  const darkText = rgb(0.2, 0.2, 0.2);
  
  let y = height - 40;
  
  // Header - IDENTÉ
  page.drawText('IDENTE', {
    x: width / 2 - helveticaBold.widthOfTextAtSize('IDENTE', 28) / 2,
    y: y,
    size: 28,
    font: helveticaBold,
    color: brandGreen,
  });
  
  y -= 25;
  
  // Profile name
  const profileName = data.profile || 'Personalisiert';
  page.drawText(profileName, {
    x: width / 2 - helveticaBold.widthOfTextAtSize(profileName, 18) / 2,
    y: y,
    size: 18,
    font: helveticaBold,
    color: brandGreen,
  });
  
  y -= 18;
  
  // Subtitle
  const subtitle = 'INDIVIDUAL SCENT FORMULA';
  page.drawText(subtitle, {
    x: width / 2 - helvetica.widthOfTextAtSize(subtitle, 8) / 2,
    y: y,
    size: 8,
    font: helvetica,
    color: gray,
  });
  
  y -= 15;
  
  // Divider line
  page.drawLine({
    start: { x: 28, y: y },
    end: { x: width - 28, y: y },
    thickness: 2,
    color: brandGreen,
  });
  
  y -= 25;
  
  // Info section background
  page.drawRectangle({
    x: 28,
    y: y - 55,
    width: width - 56,
    height: 60,
    color: rgb(0.976, 0.98, 0.984),
  });
  
  // Info grid
  const leftCol = 38;
  const rightCol = 155;
  
  // Batch
  page.drawText('Batch', { x: leftCol, y: y - 10, size: 8, font: helveticaBold, color: gray });
  page.drawText(data.batch || 'N/A', { x: leftCol, y: y - 22, size: 10, font: helveticaBold, color: brandGreen });
  
  // Datum
  page.drawText('Datum', { x: rightCol, y: y - 10, size: 8, font: helveticaBold, color: gray });
  page.drawText(data.date || 'N/A', { x: rightCol, y: y - 22, size: 10, font: helveticaBold, color: brandGreen });
  
  // Erstellt fuer
  page.drawText('Erstellt fuer', { x: leftCol, y: y - 37, size: 8, font: helveticaBold, color: gray });
  page.drawText(data.name || 'N/A', { x: leftCol, y: y - 49, size: 10, font: helveticaBold, color: brandGreen });
  
  // Konzentration
  page.drawText('Konzentration', { x: rightCol, y: y - 37, size: 8, font: helveticaBold, color: gray });
  page.drawText(data.concentration || 'N/A', { x: rightCol, y: y - 49, size: 10, font: helveticaBold, color: brandGreen });
  
  y -= 75;
  
  // Score boxes
  const boxWidth = 75;
  const boxHeight = 42;
  const boxGap = 8;
  const boxStartX = 28;
  const lightGold = rgb(0.996, 0.953, 0.78); // #FEF3C7
  
  // Helper function to draw score box
  const drawScoreBox = (x, label, value) => {
    // Background
    page.drawRectangle({
      x: x,
      y: y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      color: lightGold,
      borderColor: gold,
      borderWidth: 1.5,
    });
    
    // Label
    page.drawText(label, {
      x: x + boxWidth / 2 - helveticaBold.widthOfTextAtSize(label, 7) / 2,
      y: y - 12,
      size: 7,
      font: helveticaBold,
      color: rgb(0.47, 0.21, 0.06),
    });
    
    // Value
    page.drawText(value, {
      x: x + boxWidth / 2 - helveticaBold.widthOfTextAtSize(value, 14) / 2,
      y: y - 32,
      size: 14,
      font: helveticaBold,
      color: brandGreen,
    });
  };
  
  drawScoreBox(boxStartX, 'HARMONIE', `${data.harmonie}/100`);
  drawScoreBox(boxStartX + boxWidth + boxGap, 'MATCH', `${data.match}%`);
  drawScoreBox(boxStartX + (boxWidth + boxGap) * 2, 'QUALITAT', 'A+');
  
  y -= boxHeight + 20;
  
  // Formula section header
  page.drawText('FORMEL-KOMPOSITION', {
    x: 28,
    y: y,
    size: 9,
    font: helveticaBold,
    color: brandGreen,
  });
  
  y -= 8;
  
  // Formula divider
  page.drawLine({
    start: { x: 28, y: y },
    end: { x: width - 28, y: y },
    thickness: 1.5,
    color: brandGreen,
  });
  
  y -= 15;
  
  // Notes
  const topNotes = data.formula?.top || [];
  const heartNotes = data.formula?.heart || [];
  const baseNotes = data.formula?.base || [];
  
  const drawNoteGroup = (title, notes) => {
    if (notes.length === 0) return;
    
    page.drawText(title.toUpperCase(), {
      x: 28,
      y: y,
      size: 8,
      font: helveticaBold,
      color: gold,
    });
    
    y -= 12;
    
    notes.forEach(note => {
      page.drawText(note.name, {
        x: 28,
        y: y,
        size: 8,
        font: helvetica,
        color: darkText,
      });
      
      const weightText = `${note.weight.toFixed(3)}g`;
      page.drawText(weightText, {
        x: width - 28 - helveticaBold.widthOfTextAtSize(weightText, 8),
        y: y,
        size: 8,
        font: helveticaBold,
        color: gray,
      });
      
      y -= 11;
    });
    
    y -= 5;
  };
  
  drawNoteGroup('Kopfnoten', topNotes);
  drawNoteGroup('Herznoten', heartNotes);
  drawNoteGroup('Basisnoten', baseNotes);
  
  // Footer
  const footerY = 35;
  const footerText1 = 'Handcrafted in Germany - 100% Vegan - Cruelty Free';
  const footerText2 = 'tryidente.com';
  
  page.drawText(footerText1, {
    x: width / 2 - helvetica.widthOfTextAtSize(footerText1, 7) / 2,
    y: footerY,
    size: 7,
    font: helvetica,
    color: lightGray,
  });
  
  page.drawText(footerText2, {
    x: width / 2 - helvetica.widthOfTextAtSize(footerText2, 7) / 2,
    y: footerY - 10,
    size: 7,
    font: helvetica,
    color: lightGray,
  });
  
  const pdfBytes = await pdfDoc.save();
  console.log(`✅ PDF generated for ${data.profile}`);
  
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
      <p><small>Etiketten sind als PDF angehaengt.</small></p>
    `,
    attachments: labels
  });
}
