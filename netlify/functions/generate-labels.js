// netlify/functions/generate-labels.js
// Uses PDFKit for PDF generation (no Chromium needed)
const PDFDocument = require('pdfkit');
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

  return new Promise((resolve, reject) => {
    try {
      // A6 size in points (105mm x 148mm)
      const doc = new PDFDocument({
        size: [297.64, 419.53], // A6 in points
        margins: { top: 28, bottom: 28, left: 28, right: 28 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        console.log(`✅ PDF generated for ${data.profile}`);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Colors
      const brandGreen = '#0A3D2C';
      const gold = '#C5A059';
      const lightGold = '#FEF3C7';
      const gray = '#666666';
      const lightGray = '#f9fafb';

      // Header
      doc.fontSize(28)
         .fillColor(brandGreen)
         .font('Helvetica-Bold')
         .text('IDENTÉ', { align: 'center' });

      doc.moveDown(0.3);
      doc.fontSize(18)
         .fillColor(brandGreen)
         .font('Helvetica-Bold')
         .text(data.profile || 'Personalisiert', { align: 'center' });

      doc.moveDown(0.2);
      doc.fontSize(8)
         .fillColor(gray)
         .font('Helvetica')
         .text('INDIVIDUAL SCENT FORMULA', { align: 'center' });

      // Divider line
      doc.moveDown(0.5);
      const lineY = doc.y;
      doc.strokeColor(brandGreen)
         .lineWidth(2)
         .moveTo(28, lineY)
         .lineTo(269, lineY)
         .stroke();

      // Info section
      doc.moveDown(0.8);
      
      // Info box background
      const infoBoxY = doc.y;
      doc.rect(28, infoBoxY, 241, 60)
         .fill(lightGray);

      doc.fillColor('#333333');
      
      // Left column
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor(gray)
         .text('Batch', 38, infoBoxY + 8);
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text(data.batch || 'N/A', 38, infoBoxY + 18);

      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor(gray)
         .text('Erstellt für', 38, infoBoxY + 35);
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text(data.name || 'N/A', 38, infoBoxY + 45);

      // Right column
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor(gray)
         .text('Datum', 155, infoBoxY + 8);
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text(data.date || 'N/A', 155, infoBoxY + 18);

      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor(gray)
         .text('Konzentration', 155, infoBoxY + 35);
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text(data.concentration || 'N/A', 155, infoBoxY + 45);

      // Score boxes
      doc.y = infoBoxY + 70;
      const scoreY = doc.y;
      const scoreBoxWidth = 75;
      const scoreBoxHeight = 45;
      const scoreStartX = 28;
      const scoreGap = 8;

      // Harmonie box
      doc.rect(scoreStartX, scoreY, scoreBoxWidth, scoreBoxHeight)
         .fillAndStroke(lightGold, gold);
      doc.fontSize(7)
         .font('Helvetica-Bold')
         .fillColor('#78350f')
         .text('HARMONIE', scoreStartX, scoreY + 8, { width: scoreBoxWidth, align: 'center' });
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text(`${data.harmonie}/100`, scoreStartX, scoreY + 22, { width: scoreBoxWidth, align: 'center' });

      // Match box
      const matchX = scoreStartX + scoreBoxWidth + scoreGap;
      doc.rect(matchX, scoreY, scoreBoxWidth, scoreBoxHeight)
         .fillAndStroke(lightGold, gold);
      doc.fontSize(7)
         .font('Helvetica-Bold')
         .fillColor('#78350f')
         .text('MATCH', matchX, scoreY + 8, { width: scoreBoxWidth, align: 'center' });
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text(`${data.match}%`, matchX, scoreY + 22, { width: scoreBoxWidth, align: 'center' });

      // Quality box
      const qualityX = matchX + scoreBoxWidth + scoreGap;
      doc.rect(qualityX, scoreY, scoreBoxWidth, scoreBoxHeight)
         .fillAndStroke(lightGold, gold);
      doc.fontSize(7)
         .font('Helvetica-Bold')
         .fillColor('#78350f')
         .text('QUALITÄT', qualityX, scoreY + 8, { width: scoreBoxWidth, align: 'center' });
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text('A+', qualityX, scoreY + 22, { width: scoreBoxWidth, align: 'center' });

      // Formula section
      doc.y = scoreY + scoreBoxHeight + 15;
      
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor(brandGreen)
         .text('FORMEL-KOMPOSITION', 28);
      
      doc.moveDown(0.3);
      const formulaLineY = doc.y;
      doc.strokeColor(brandGreen)
         .lineWidth(1.5)
         .moveTo(28, formulaLineY)
         .lineTo(269, formulaLineY)
         .stroke();

      doc.moveDown(0.5);

      // Notes
      const topNotes = data.formula?.top || [];
      const heartNotes = data.formula?.heart || [];
      const baseNotes = data.formula?.base || [];

      const drawNoteGroup = (title, notes) => {
        if (notes.length === 0) return;
        
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor(gold)
           .text(title.toUpperCase(), 28);
        
        doc.moveDown(0.2);
        
        notes.forEach(note => {
          const noteY = doc.y;
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#333333')
             .text(note.name, 28, noteY);
          doc.fontSize(8)
             .font('Helvetica-Bold')
             .fillColor(gray)
             .text(`${note.weight.toFixed(3)}g`, 200, noteY, { width: 69, align: 'right' });
          doc.moveDown(0.3);
        });
        
        doc.moveDown(0.3);
      };

      drawNoteGroup('Kopfnoten', topNotes);
      drawNoteGroup('Herznoten', heartNotes);
      drawNoteGroup('Basisnoten', baseNotes);

      // Footer
      doc.fontSize(7)
         .font('Helvetica')
         .fillColor('#999999')
         .text('Handcrafted in Germany · 100% Vegan · Cruelty Free', 28, 385, { align: 'center', width: 241 });
      doc.text('tryidente.com', { align: 'center', width: 241 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
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
    subject: `📦 IDENTÉ Order #${order.order_number} - ${labels.length} Etikett${labels.length > 1 ? 'en' : ''}`,
    html: `
      <h2>Neue Order erhalten!</h2>
      <p><strong>Order:</strong> #${order.order_number}</p>
      <p><strong>Kunde:</strong> ${customerName} ${order.customer?.last_name || ''}</p>
      <p><strong>Email:</strong> ${order.customer?.email || 'N/A'}</p>
      <p><strong>Anzahl Etiketten:</strong> ${labels.length}</p>
      <hr>
      <p><small>Etiketten sind als PDF angehängt.</small></p>
    `,
    attachments: labels
  });
}
