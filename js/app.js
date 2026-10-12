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
    if (res.status === 401) throw new Error('The GitHub key is invalid or expired. Check ⚙.');
    if (res.status === 403 || res.status === 404) throw new Error(`GitHub won't let this key use ${repo()} (${res.status}). Check it has Actions: Read and write.`);
    if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
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
    if (!runId) throw new Error('GitHub did not start the download. Try again.');
    return { runId, requestId, codes, startedAt: Date.now() };
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Board ──
  const LABEL = {
    queued: 'QUEUED', running: 'SEARCHING', done: '✓ DONE',
    invalid: 'INVALID ID', failed: '✗ FAILED', cancelled: 'CANCELLED',
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
    const parts = [`${s.done}/${s.total} DOWNLOADED`];
    if (s.invalid) parts.push(`${s.invalid} INVALID`);
    if (s.failed) parts.push(`${s.failed} FAILED`);
    let line = parts.join(' · ');
    if (!run || run.status !== 'completed') line = (s.finished ? 'PROCESSING · ' : 'STARTING · ') + line;
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
      $('summary').textContent += ' · NO PDFs TO DOWNLOAD';
    }
    if (run.conclusion === 'cancelled') $('summary').textContent = 'CANCELLED · ' + $('summary').textContent;
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
    if (!codes.length) return showMsg('Paste at least one device ID.', 'bad');
    if (tooMany) return showMsg(`Max ${KT.MAX_CODES} IDs at a time.`, 'bad');
    if (!token()) { showMsg('Add your GitHub key first.', 'bad'); return openSettings(); }
    if (current && !current.finished && !confirm('A download is already running. Start another one anyway?')) return;
    showMsg(rejected.length ? `Skipped (bad format): ${rejected.join(', ')}` : '');
    $('btnDownload').disabled = true;
    $('btnDownload').textContent = '[ STARTING… ]';
    try {
      follow(await startRun(codes));
    } catch (e) {
      showMsg(e.message, 'bad');
    } finally {
      $('btnDownload').textContent = '[ DOWNLOAD PDFs ]';
      $('btnDownload').disabled = !!(current && !current.finished);
    }
  });

  $('cancelBtn').addEventListener('click', async () => {
    if (!current || !confirm('Cancel the running download?')) return;
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
      `&description=${encodeURIComponent('Starts Frigga downloads from the Kuai Temperature page')}&target_name=${encodeURIComponent(owner)}&expires_in=366&actions=write`;
    $('settings').showModal();
  }
  $('settingsBtn').addEventListener('click', openSettings);
  $('settings').addEventListener('close', () => {
    if ($('settings').returnValue !== 'save') return;
    store.set(K.token, $('tokenInput').value.trim() || null);
    const r = $('repoInput').value.trim();
    store.set(K.repo, /^[\w.-]+\/[\w.-]+$/.test(r) ? r : null);
    showMsg(token() ? 'Key saved.' : '');
  });

  // ── Clock ──
  const tick = () => { $('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
  tick();
  setInterval(tick, 10000);

  // ── Bottom ticker (Chinese): week of the year + current temperature in each city ──
  // Open-Meteo: free, no key, allows browser requests.
  const CITIES = [
    { zh: '广州', lat: 23.13, lon: 113.26 },
    { zh: '上海', lat: 31.23, lon: 121.47 },
    { zh: '圣地亚哥（智利）', lat: -33.45, lon: -70.67 },
  ];
  let temps = [];
  const renderTicker = () => {
    const { year, week } = KT.isoWeek(new Date());
    const parts = [`今天我们在第${week}周（${year}年）`];
    CITIES.forEach((c, i) => parts.push(`${c.zh} ${temps[i] != null ? Math.round(temps[i]) + '°C' : '--°C'}`));
    const text = `${parts.join(' ▸ ')} ▸ `;
    $('tickerText').textContent = $('tickerText2').textContent = text.repeat(6);
  };
  const loadTemps = async () => {
    try {
      const q = `latitude=${CITIES.map(c => c.lat)}&longitude=${CITIES.map(c => c.lon)}&current=temperature_2m`;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
      const data = await res.json();
      temps = [].concat(data).map(d => d && d.current ? d.current.temperature_2m : null);
    } catch {}
    renderTicker();
  };
  renderTicker();
  loadTemps();
  setInterval(loadTemps, 30 * 60 * 1000);
  // Running timers move every second without hitting the API.
  setInterval(() => { if (current && !current.finished && lastStates.length) renderRows(lastStates); }, 1000);

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ── Start ──
  $('codes').value = store.get(K.codes) || '';
  updateCounter();
  if (current) follow(current);
  if (!token()) showMsg('First time: add your GitHub key in ⚙.', '');
})();
