const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadDevicePDF(deviceId, downloadDir, maxRetries = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`    (intento ${attempt}/${maxRetries})`);
    
    try {
      const result = await tryDownload(deviceId, downloadDir, attempt);
      return result;
    } catch (err) {
      lastError = err;
      console.log(`    intento ${attempt} falló: ${err.message}`);

      // Si es un código inválido, NO reintentar
      if (err.message === 'INVALID_DEVICE_ID') {
        const invalid = new Error('Código inválido (The device ID is not correct)');
        invalid.code = 'INVALID_DEVICE_ID';
        throw invalid;
      }
      
      if (attempt < maxRetries) {
        const waitTime = 5000 + (attempt * 3000);
        console.log(`    reintentando en ${Math.round(waitTime/1000)}s...`);
        await delay(waitTime);
      }
    }
  }

  throw lastError || new Error('All retries failed');
}

async function tryDownload(deviceId, downloadDir, attempt) {
  const browser = await puppeteer.launch({
    // GitHub's Ubuntu runners come with Google Chrome installed; CHROME_PATH points to it.
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1400,900',
      '--disable-blink-features=AutomationControlled'
    ],
    defaultViewport: { width: 1400, height: 900 }
  });

  try {
    const page = await browser.newPage();
    
    // User-Agent real de Chrome en Windows
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
    
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
    });

    await page.goto('https://cloud.friggatech.com/#/user/login', {
      waitUntil: 'networkidle2',
      timeout: 90000
    });

    await delay(4000);

    // Si no aparece el input, recargar
    let inputReady = await page.evaluate(() => !!document.getElementById('terNo'));
    
    if (!inputReady) {
      console.log('    página no lista, recargando...');
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      await delay(4500);
    }

    // Esperar el input con más tiempo
    await page.waitForFunction(() => {
      return !!document.getElementById('terNo');
    }, { timeout: 45000 });

    await delay(1000);

    // Escribir Device ID (compatible con React)
    await page.evaluate((id) => {
      const input = document.getElementById('terNo');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(input, id);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, deviceId);

    await delay(800);

    // Click Search
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Search');
      if (btn) btn.click();
      else throw new Error('Search button not found');
    });

    // Esperar resultado: o aparece Export Data, o aparece el mensaje de error
    await page.waitForFunction(() => {
      const hasExport = Array.from(document.querySelectorAll('button'))
        .some(b => b.textContent.includes('Export Data'));
      
      const bodyText = document.body.innerText;
      const isInvalid = bodyText.includes('The device ID is not correct') ||
                        bodyText.includes('device ID is not correct') ||
                        bodyText.includes('please check again');

      return hasExport || isInvalid;
    }, { timeout: 45000 });

    // Verificar si el código es inválido
    const isInvalidCode = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return bodyText.includes('The device ID is not correct') ||
             bodyText.includes('device ID is not correct') ||
             bodyText.includes('please check again');
    });

    if (isInvalidCode) {
      throw new Error('INVALID_DEVICE_ID'); // Código no válido → no reintentar
    }

    await delay(2000);

    // Click Export Data
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Export Data'));
      if (btn) btn.click();
      else throw new Error('Export Data button not found');
    });

    // Esperar modal OK
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('button'))
        .some(b => b.textContent.trim() === 'OK');
    }, { timeout: 20000 });

    await delay(1000);

    // Seleccionar "Complete data"
    await page.evaluate(() => {
      const radio = document.querySelector('input[value="complete"]');
      if (radio) radio.click();
      else {
        const label = Array.from(document.querySelectorAll('label'))
          .find(l => l.textContent.includes('Complete data'));
        if (label) label.click();
      }
    });

    await delay(600);

    // Click OK
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'OK');
      if (btn) btn.click();
      else throw new Error('OK button not found');
    });

    // Esperar mensaje de éxito (hasta 2 minutos)
    await page.waitForFunction(() => {
      return document.body.innerText.includes('click the download link') ||
             document.body.innerText.includes('Generating report succeed');
    }, { timeout: 120000 });

    await delay(2000);

    const downloadPromise = waitForDownload(downloadDir, 90000);

    // Click en el link de descarga
    await page.evaluate(() => {
      const link = document.querySelector('a.sign-right') ||
                   Array.from(document.querySelectorAll('a'))
                     .find(a => a.textContent.toLowerCase().includes('download'));
      if (link) link.click();
      else throw new Error('Download link not found');
    });

    const pdfPath = await downloadPromise;

    const finalName = `${deviceId}_${Date.now()}.pdf`;
    const finalPath = path.join(downloadDir, finalName);

    if (pdfPath !== finalPath) {
      fs.renameSync(pdfPath, finalPath);
    }

    return finalPath;

  } finally {
    await browser.close();
  }
}

function waitForDownload(dir, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const existing = new Set(fs.readdirSync(dir));

    const interval = setInterval(() => {
      try {
        const files = fs.readdirSync(dir);
        const newFiles = files.filter(f => 
          !existing.has(f) && 
          f.toLowerCase().endsWith('.pdf') &&
          !f.endsWith('.crdownload') &&
          !f.endsWith('.tmp') &&
          !f.startsWith('.')
        );

        if (newFiles.length > 0) {
          clearInterval(interval);
          setTimeout(() => resolve(path.join(dir, newFiles[0])), 1000);
          return;
        }

        if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject(new Error('Timeout waiting for PDF download'));
        }
      } catch (e) {}
    }, 500);
  });
}

module.exports = { downloadDevicePDF };