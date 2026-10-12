// Kuai Temperature — page logic. The Frigga automation runs in GitHub Actions
// (.github/workflows/download.yml); this page starts it and follows its progress.
(() => {
  const WORKFLOW = 'download.yml';
  const ARTIFACT = 'kuai-temperature-pdfs';
  const POLL_MS = 4000;
  const K = { token: 'kt.token', repo: 'kt.repo', run: 'kt.run', codes: 'kt.codes' };

  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
    json(k) { try { return JSON.parse(store.get(k)); } catch { return null; } },
  };

  const repo = () => store.get(K.repo) || KT.repoFromLocation(location, 'SebaCanti/Kuai-Temperature');
  const token = () => store.get(K.token) || '';

  // ── GitHub API ──
  async function gh(path, opts = {}) {
    const res = await fetch(`https://api.github.com/repos/${repo()}${path}`, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.status === 401) throw new Error('La clave de GitHub no es válida o venció. Revisa ⚙.');
    if (res.status === 403 || res.status === 404) throw new Error(`GitHub no deja usar ${repo()} con esta clave (${res.status}). Revisa que tenga Actions: Read and write.`);
    if (!res.ok) throw new Error(`GitHub respondió ${res.status}.`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  async function startRun(codes) {
    const requestId = `kt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const body = { ref: 'main', inputs: { codes: codes.join(' '), request_id: requestId }, return_run_details: true };
    const res = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify(body) });
    let runId = res && res.workflow_run_id;
    // Older API: no run id in the answer, so find the run by its name (run-name = request_id).
    for (let i = 0; !runId && i < 20; i++) {
      await sleep(3000);
      const list = await gh(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=20`);
      const run = (list.workflow_runs || []).find(r => r.name === requestId || r.display_title === requestId);
      if (run) runId = run.id;
    }
    if (!runId) throw new Error('GitHub no inició la descarga. Intenta de nuevo.');
    return { runId, requestId, codes, startedAt: Date.now() };
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Board ──
  const LABEL = {
    queued: 'EN COLA', running: 'BUSCANDO', done: '✓ LISTO',
    invalid: 'CÓDIGO INVÁLIDO', failed: '✗ FALLÓ', cancelled: 'CANCELADO',
  };
  let current = store.json(K.run);
  let timer = null;
  let lastStates = [];

  function renderRows(states) {
    lastStates = states;
    const now = Date.now();
    $('rows').innerHTML = states.map(s => {
      const elapsed = s.startedAt ? (s.completedAt || now) - s.startedAt : null;
      return `<div class="b-row ${s.state}"><span class="b-code">${esc(s.code)}</span>` +
        `<span class="b-status">${LABEL[s.state]}${s.state === 'running' ? '<i class="dots"></i>' : ''}</span>` +
        `<span class="b-time">${KT.fmtElapsed(elapsed)}</span></div>`;
    }).join('');
  }

  function renderSummary(states, run) {
    const s = KT.summary(states);
    $('mercury').style.width = `${s.total ? Math.round((s.finished / s.total) * 100) : 0}%`;
    const parts = [`${s.done}/${s.total} DESCARGADOS`];
    if (s.invalid) parts.push(`${s.invalid} INVÁLIDOS`);
    if (s.failed) parts.push(`${s.failed} FALLIDOS`);
    let line = parts.join(' · ');
    if (!run || run.status !== 'completed') line = (s.finished ? 'PROCESANDO · ' : 'INICIANDO · ') + line;
    $('summary').textContent = line;
  }

  function showBoard(on) {
    $('board').hidden = !on;
    $('btnDownload').disabled = on && current && !current.finished;
  }

  async function poll() {
    clearTimeout(timer);
    if (!current) return;
    try {
      const [run, jobs] = await Promise.all([
        gh(`/actions/runs/${current.runId}`),
        gh(`/actions/runs/${current.runId}/jobs?per_page=100`),
      ]);
      const states = KT.codeStates(current.codes, jobs.jobs);
      renderRows(states);
      renderSummary(states, run);
      $('runLink').href = run.html_url;
      if (run.status === 'completed') return finish(run);
    } catch (e) {
      showMsg(e.message, 'bad');
    }
    timer = setTimeout(poll, POLL_MS);
  }

  async function finish(run) {
    current.finished = true;
    $('cancelBtn').hidden = true;
    $('newBtn').hidden = false;
    $('btnDownload').disabled = false;
    $('mercury').style.width = '100%';
    const list = await gh(`/actions/runs/${run.id}/artifacts`).catch(() => null);
    const art = list && (list.artifacts || []).find(a => a.name === ARTIFACT && !a.expired);
    if (art) {
      // Artifact downloads go through github.com (signed in), not the API: the API's redirect has no CORS.
      const url = `https://github.com/${repo()}/actions/runs/${run.id}/artifacts/${art.id}`;
      $('zipBtn').href = url;
      $('zipBtn').hidden = false;
      if (!current.zipOpened) {
        current.zipOpened = true;
        window.open(url, '_blank', 'noopener');
      }
    } else if (run.conclusion !== 'cancelled') {
      $('summary').textContent += ' · SIN PDFs PARA DESCARGAR';
    }
    if (run.conclusion === 'cancelled') $('summary').textContent = 'CANCELADO · ' + $('summary').textContent;
    store.set(K.run, JSON.stringify(current));
  }

  function follow(run) {
    current = run;
    store.set(K.run, JSON.stringify(run));
    $('zipBtn').hidden = true;
    $('newBtn').hidden = !run.finished;
    $('cancelBtn').hidden = !!run.finished;
    $('runLink').href = `https://github.com/${repo()}/actions/runs/${run.runId}`;
    renderRows(KT.codeStates(run.codes, []));
    renderSummary(lastStates, null);
    showBoard(true);
    poll();
  }

  // ── Console ──
  function showMsg(text, kind) {
    $('msg').textContent = text;
    $('msg').className = `msg ${kind || ''}`;
    $('msg').hidden = !text;
  }

  function updateCounter() {
    const { codes, tooMany } = KT.parseCodes($('codes').value);
    $('counter').textContent = `${codes.length}/${KT.MAX_CODES}`;
    $('counter').classList.toggle('over', tooMany);
    store.set(K.codes, $('codes').value);
  }

  $('codes').addEventListener('input', updateCounter);

  $('btnClear').addEventListener('click', () => {
    $('codes').value = '';
    updateCounter();
    showMsg('');
    $('codes').focus();
  });

  $('btnDownload').addEventListener('click', async () => {
    const { codes, rejected, tooMany } = KT.parseCodes($('codes').value);
    if (!codes.length) return showMsg('Pega al menos un código.', 'bad');
    if (tooMany) return showMsg(`Máximo ${KT.MAX_CODES} códigos por vez.`, 'bad');
    if (!token()) { showMsg('Primero agrega tu clave de GitHub.', 'bad'); return openSettings(); }
    if (current && !current.finished && !confirm('Hay una descarga en curso. ¿Empezar otra igual?')) return;
    showMsg(rejected.length ? `Se omiten por formato: ${rejected.join(', ')}` : '');
    $('btnDownload').disabled = true;
    $('btnDownload').textContent = '[ INICIANDO… ]';
    try {
      follow(await startRun(codes));
    } catch (e) {
      showMsg(e.message, 'bad');
    } finally {
      $('btnDownload').textContent = '[ DESCARGAR PDFs ]';
      $('btnDownload').disabled = !!(current && !current.finished);
    }
  });

  $('cancelBtn').addEventListener('click', async () => {
    if (!current || !confirm('¿Cancelar la descarga en curso?')) return;
    try { await gh(`/actions/runs/${current.runId}/cancel`, { method: 'POST' }); poll(); }
    catch (e) { showMsg(e.message, 'bad'); }
  });

  $('newBtn').addEventListener('click', () => {
    clearTimeout(timer);
    current = null;
    store.set(K.run, null);
    showBoard(false);
    $('btnDownload').disabled = false;
    $('codes').focus();
  });

  // ── Settings ──
  function openSettings() {
    $('tokenInput').value = token();
    $('repoInput').value = repo();
    const name = repo().split('/')[1] || 'Kuai-Temperature';
    $('repoName').textContent = name;
    const owner = repo().split('/')[0];
    $('tokenLink').href = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('Kuai Temperature')}` +
      `&description=${encodeURIComponent('Inicia las descargas de Frigga desde la página')}&target_name=${encodeURIComponent(owner)}&expires_in=366&actions=write`;
    $('settings').showModal();
  }
  $('settingsBtn').addEventListener('click', openSettings);
  $('settings').addEventListener('close', () => {
    if ($('settings').returnValue !== 'save') return;
    store.set(K.token, $('tokenInput').value.trim() || null);
    const r = $('repoInput').value.trim();
    store.set(K.repo, /^[\w.-]+\/[\w.-]+$/.test(r) ? r : null);
    showMsg(token() ? 'Clave guardada.' : '');
  });

  // ── Clock ──
  const tick = () => { $('clock').textContent = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
  tick();
  setInterval(tick, 10000);
  // Running timers move every second without hitting the API.
  setInterval(() => { if (current && !current.finished && lastStates.length) renderRows(lastStates); }, 1000);

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ── Start ──
  $('codes').value = store.get(K.codes) || '';
  updateCounter();
  if (current) follow(current);
  if (!token()) showMsg('Primera vez: agrega tu clave de GitHub en ⚙.', '');
})();
