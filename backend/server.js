const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { downloadDevicePDF } = require('./frigga');

const app = express();
const PORT = process.env.PORT || 3000;

// Temporary downloads folder
const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Endpoint para descargar UN solo código (devuelve JSON, guarda el PDF en disco)
app.post('/api/download-one', async (req, res) => {
  try {
    let { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'No code provided' });
    }

    code = code.trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: 'Código vacío' });
    }

    console.log(`[${new Date().toISOString()}] Single download: ${code}`);

    const pdfPath = await downloadDevicePDF(code, DOWNLOADS_DIR);
    const filename = path.basename(pdfPath);

    // No borramos el archivo todavía (se borrará cuando se cree el ZIP)
    res.json({
      success: true,
      code,
      filename,
      path: pdfPath
    });

  } catch (err) {
    console.error(`  ✗ ${req.body?.code || '?'} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Error al descargar' });
  }
});

// Endpoint para crear el ZIP final con los PDFs exitosos
app.post('/api/create-zip', async (req, res) => {
  try {
    const { files } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const zipName = `frigga_${Date.now()}.zip`;
    const zipPath = path.join(DOWNLOADS_DIR, zipName);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    for (const filename of files) {
      const fullPath = path.join(DOWNLOADS_DIR, filename);
      if (fs.existsSync(fullPath)) {
        archive.file(fullPath, { name: filename });
      }
    }

    await archive.finalize();

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    res.download(zipPath, zipName, (err) => {
      // Limpiar todo después de enviar el ZIP
      setTimeout(() => {
        try {
          fs.unlinkSync(zipPath);
          files.forEach(f => {
            try { fs.unlinkSync(path.join(DOWNLOADS_DIR, f)); } catch (e) {}
          });
        } catch (e) {}
      }, 10000);
    });

  } catch (err) {
    console.error('ZIP error:', err);
    res.status(500).json({ error: err.message || 'Error al crear ZIP' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ready' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Kuai Temperature running at http://localhost:${PORT}`);
  console.log(`   Open this URL in your browser to use the app.\n`);
});