// Kuai Temperature — pure helpers (no DOM, no network) so they can be tested with node --test.
(function (root) {
  const MAX_CODES = 30;
  const CODE_RE = /^[A-Z0-9-]{3,40}$/;

  // Same rules as the workflow's plan job: split, uppercase, drop duplicates and junk, max 30.
  function parseCodes(text) {
    const all = String(text || '').split(/[\s,;]+/).map(c => c.trim().toUpperCase()).filter(Boolean);
    const seen = new Set();
    const codes = [], rejected = [];
    for (const c of all) {
      if (seen.has(c)) continue;
      seen.add(c);
      (CODE_RE.test(c) ? codes : rejected).push(c);
    }
    return { codes: codes.slice(0, MAX_CODES), rejected, tooMany: codes.length > MAX_CODES };
  }

  // GitHub Pages URL → "owner/repo" (https://sebacanti.github.io/Kuai-Temperature/ → SebaCanti/Kuai-Temperature).
  function repoFromLocation(loc, fallback) {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname || '');
    const first = (loc.pathname || '').split('/').filter(Boolean)[0];
    if (m && first) return `${m[1]}/${first}`;
    return fallback;
  }

  // One workflow job ("DL <code>") → what the board shows for that code.
  function jobState(job) {
    if (!job) return 'queued';
    if (job.status !== 'completed') return job.status === 'in_progress' ? 'running' : 'queued';
    const invalidStep = (job.steps || []).find(s => s.name === 'Invalid code');
    if (invalidStep && invalidStep.conclusion === 'success') return 'invalid';
    if (job.conclusion === 'success') return 'done';
    if (job.conclusion === 'cancelled') return 'cancelled';
    return 'failed';
  }

  // Map the run's jobs onto the codes the user asked for.
  function codeStates(codes, jobs) {
    const byCode = new Map();
    for (const j of jobs || []) {
      const m = /^DL (.+)$/.exec(j.name || '');
      if (m) byCode.set(m[1].trim().toUpperCase(), j);
    }
    return codes.map(code => {
      const job = byCode.get(code);
      return {
        code,
        state: jobState(job),
        startedAt: job && job.started_at ? Date.parse(job.started_at) : null,
        completedAt: job && job.completed_at ? Date.parse(job.completed_at) : null,
      };
    });
  }

  function summary(states) {
    const count = s => states.filter(x => x.state === s).length;
    const finished = states.filter(x => !['queued', 'running'].includes(x.state)).length;
    return { total: states.length, done: count('done'), invalid: count('invalid'), failed: count('failed') + count('cancelled'), finished };
  }

  function fmtElapsed(ms) {
    if (ms == null || ms < 0) return '--:--';
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // ISO-8601 week number (weeks start Monday; week 1 holds the year's first Thursday).
  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
    return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
  }

  // Rain right now (not snow): rain or showers falling, or a WMO weather code for drizzle, rain, showers or thunderstorm.
  function isRaining(current) {
    if (!current) return false;
    const code = current.weather_code;
    const rainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
    return rainCode || current.rain > 0 || current.showers > 0;
  }

  const api = { MAX_CODES, parseCodes, repoFromLocation, jobState, codeStates, summary, fmtElapsed, isoWeek, isRaining };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KT = api;
})(typeof self !== 'undefined' ? self : this);
