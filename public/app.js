const codesEl = document.getElementById('codes');
const btnDownload = document.getElementById('btnDownload');
const btnClear = document.getElementById('btnClear');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const btnText = btnDownload.querySelector('.btn-text');
const spinner = btnDownload.querySelector('.spinner');

function setStatus(type, message) {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
  statusEl.classList.remove('hidden');
}

function addLog(msg) {
  logEl.classList.remove('hidden');
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() {
  logEl.textContent = '';
  logEl.classList.add('hidden');
}

function setLoading(loading) {
  btnDownload.disabled = loading;
  if (loading) {
    btnText.textContent = 'Procesando...';
    spinner.classList.remove('hidden');
  } else {
    btnText.textContent = 'Descargar PDFs';
    spinner.classList.add('hidden');
  }
}

btnClear.addEventListener('click', () => {
  codesEl.value = '';
  statusEl.classList.add('hidden');
  clearLog();
  codesEl.focus();
});

btnDownload.addEventListener('click', async () => {
  const raw = codesEl.value.trim();
  if (!raw) {
    setStatus('error', 'Por favor ingresa al menos un código.');
    return;
  }

  const codes = raw
    .split(/[\n,;\s]+/)
    .map(c => c.trim().toUpperCase())
    .filter(c => c.length > 0);

  if (codes.length === 0) {
    setStatus('error', 'No se encontraron códigos válidos.');
    return;
  }

  if (codes.length > 30) {
    setStatus('error', 'Máximo 30 códigos por solicitud.');
    return;
  }

  setLoading(true);
  clearLog();
  setStatus('info', `Procesando 0 de ${codes.length}...`);
  addLog(`Iniciando descarga de ${codes.length} dispositivo(s)...\n`);

  let successCount = 0;
  let failCount = 0;
  const successfulFiles = []; // guardamos los nombres de los PDFs exitosos

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const current = i + 1;

    setStatus('info', `Procesando ${current} de ${codes.length}... (Descargados: ${successCount})`);
    addLog(`→ [${current}/${codes.length}] ${code}...`);

    try {
      const response = await fetch('/api/download-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error ${response.status}`);
      }

      successCount++;
      successfulFiles.push(data.filename);
      addLog(`  ✓ ${code} listo`);
      setStatus('info', `Procesando ${current} de ${codes.length}... (Descargados: ${successCount})`);

    } catch (err) {
      failCount++;
      addLog(`  ✗ ${code} falló: ${err.message}`);
    }
  }

  // ===== Crear el ZIP final =====
  if (successCount === 0) {
    setStatus('error', `Ningún PDF se pudo descargar (${failCount} fallaron)`);
    addLog(`\n===== RESUMEN =====`);
    addLog(`Total: ${codes.length} | Exitosos: 0 | Fallidos: ${failCount}`);
    setLoading(false);
    return;
  }

  setStatus('info', `Creando ZIP con ${successCount} PDF(s)...`);
  addLog(`\nCreando archivo ZIP...`);

  try {
    const zipResponse = await fetch('/api/create-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: successfulFiles })
    });

    if (!zipResponse.ok) {
      const err = await zipResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Error al crear el ZIP');
    }

    const disposition = zipResponse.headers.get('Content-Disposition') || '';
    let zipName = `frigga_${Date.now()}.zip`;
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) zipName = match[1];

    const blob = await zipResponse.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const totalMsg = `Listo. Se descargaron ${successCount} de ${codes.length}` +
                     (failCount > 0 ? ` (${failCount} fallaron)` : '');
    setStatus('success', totalMsg);
    addLog(`✓ ZIP descargado → ${zipName}`);
    addLog(`\n===== RESUMEN =====`);
    addLog(`Total procesados: ${codes.length}`);
    addLog(`Descargados correctamente: ${successCount}`);
    addLog(`Fallidos: ${failCount}`);

  } catch (err) {
    setStatus('error', `Error al crear ZIP: ${err.message}`);
    addLog(`✗ Error ZIP: ${err.message}`);
  }

  setLoading(false);
});

codesEl.focus();