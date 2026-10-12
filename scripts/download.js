// Downloads one Frigga PDF. Used by .github/workflows/download.yml, one job per device code.
//   node scripts/download.js <DEVICE_ID> <output dir>
// Writes status=ok|invalid|failed to $GITHUB_OUTPUT so the page can show each code's result.
const fs = require('fs');
const path = require('path');
const { downloadDevicePDF } = require('./frigga');

const code = (process.argv[2] || '').trim().toUpperCase();
const outDir = path.resolve(process.argv[3] || 'downloads');

function setOutput(status) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${status}\n`);
}

(async () => {
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) {
    console.error(`Código no válido: "${code}"`);
    setOutput('invalid');
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const pdf = await downloadDevicePDF(code, outDir);
    console.log(`✓ ${code} → ${path.basename(pdf)}`);
    setOutput('ok');
  } catch (err) {
    console.error(`✗ ${code}: ${err.message}`);
    if (err.code === 'INVALID_DEVICE_ID') { setOutput('invalid'); return; }
    setOutput('failed');
    process.exitCode = 1;
  }
})();
