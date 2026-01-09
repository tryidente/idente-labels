// netlify/functions/generate-labels.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
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
  
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
  
  const page = await browser.newPage();
  await page.setContent(getLabelHTML(data), { waitUntil: 'networkidle0' });
  
  const pdf = await page.pdf({
    format: 'A6',
    printBackground: true,
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
  });
  
  await browser.close();
  console.log(`✅ PDF generated for ${data.profile}`);
  
  return pdf;
}

function getLabelHTML(data) {
  const topNotes = data.formula?.top || [];
  const heartNotes = data.formula?.heart || [];
  const baseNotes = data.formula?.base || [];
  
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 20px;
    background: white;
  }
  .label-container {
    max-width: 100%;
    background: white;
  }
  .header {
    text-align: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 3px solid #0A3D2C;
  }
  .brand {
    font-size: 36px;
    font-weight: 900;
    color: #0A3D2C;
    letter-spacing: 3px;
    margin-bottom: 5px;
  }
  .profile-name {
    font-size: 24px;
    font-weight: 700;
    color: #0A3D2C;
    margin-bottom: 10px;
  }
  .subtitle {
    font-size: 11px;
    color: #666;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .info-section {
    background: #f9fafb;
    padding: 15px;
    border-radius: 10px;
    margin-bottom: 15px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .info-item {
    font-size: 11px;
  }
  .info-label {
    color: #666;
    font-weight: 600;
    margin-bottom: 3px;
  }
  .info-value {
    color: #0A3D2C;
    font-weight: 700;
    font-size: 13px;
  }
  .formula-section {
    margin-bottom: 15px;
  }
  .formula-title {
    font-size: 12px;
    font-weight: 700;
    color: #0A3D2C;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 10px;
    padding-bottom: 5px;
    border-bottom: 2px solid #0A3D2C;
  }
  .notes-group {
    margin-bottom: 10px;
  }
  .notes-group-title {
    font-size: 10px;
    font-weight: 700;
    color: #C5A059;
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .note-item {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #333;
    padding: 3px 0;
    border-bottom: 1px solid #f0f0f0;
  }
  .note-weight {
    font-weight: 600;
    color: #666;
  }
  .footer {
    text-align: center;
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid #e5e7eb;
  }
  .footer-text {
    font-size: 9px;
    color: #999;
    line-height: 1.4;
  }
  .scores {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 15px;
  }
  .score-box {
    background: #FEF3C7;
    padding: 10px;
    border-radius: 8px;
    text-align: center;
    border: 2px solid #C5A059;
  }
  .score-label {
    font-size: 9px;
    color: #78350f;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .score-value {
    font-size: 20px;
    font-weight: 900;
    color: #0A3D2C;
  }
</style>
</head>
<body>
<div class="label-container">
  <div class="header">
    <div class="brand">IDENTÉ</div>
    <div class="profile-name">${data.profile || 'Personalisiert'}</div>
    <div class="subtitle">Individual Scent Formula</div>
  </div>
  
  <div class="info-section">
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Batch</div>
        <div class="info-value">${data.batch}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Datum</div>
        <div class="info-value">${data.date}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Erstellt für</div>
        <div class="info-value">${data.name}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Konzentration</div>
        <div class="info-value">${data.concentration}</div>
      </div>
    </div>
  </div>
  
  <div class="scores">
    <div class="score-box">
      <div class="score-label">Harmonie</div>
      <div class="score-value">${data.harmonie}/100</div>
    </div>
    <div class="score-box">
      <div class="score-label">Match</div>
      <div class="score-value">${data.match}%</div>
    </div>
    <div class="score-box">
      <div class="score-label">Qualität</div>
      <div class="score-value">A+</div>
    </div>
  </div>
  
  <div class="formula-section">
    <div class="formula-title">Formel-Komposition</div>
    
    ${topNotes.length > 0 ? `
    <div class="notes-group">
      <div class="notes-group-title">Kopfnoten</div>
      ${topNotes.map(n => `
        <div class="note-item">
          <span>${n.name}</span>
          <span class="note-weight">${n.weight.toFixed(3)}g</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    ${heartNotes.length > 0 ? `
    <div class="notes-group">
      <div class="notes-group-title">Herznoten</div>
      ${heartNotes.map(n => `
        <div class="note-item">
          <span>${n.name}</span>
          <span class="note-weight">${n.weight.toFixed(3)}g</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    ${baseNotes.length > 0 ? `
    <div class="notes-group">
      <div class="notes-group-title">Basisnoten</div>
      ${baseNotes.map(n => `
        <div class="note-item">
          <span>${n.name}</span>
          <span class="note-weight">${n.weight.toFixed(3)}g</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
  </div>
  
  <div class="footer">
    <div class="footer-text">
      Handcrafted in Germany · 100% Vegan · Cruelty Free<br>
      tryidente.com
    </div>
  </div>
</div>
</body>
</html>
  `;
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
    subject: `📦 IDENTÉ Order #${order.order_number} - ${labels.length} Etiketten`,
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
