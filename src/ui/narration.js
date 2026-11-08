// A lépésenkénti magyarázat: az aktuális lépés címe és szövege a futás adataiból.
const Narration = (() => {
  const { t, pct, label, app, step } = UI;

  function narrateQubit(q) {
    const n = t().narr;
    const parts = [n.aliceSends(q.aBit, label(q.aBasis), Quantum.ketLabel(q.sent))];
    // Repülés közben még nem derül ki, mit mért Éva és Bob.
    if (!app.flying) {
      if (q.eveBit !== null) parts.push(n.eveMeasures(label(q.eveBasis), q.eveBasis === q.aBasis, q.eveBit, Quantum.ketLabel(q.afterEve)));
      else if (app.cfg.eveEnabled) parts.push(n.eveSkips);
      parts.push(n.bobMeasures(label(q.bobBasis), pct(q.bobPZero, 0), q.bobBit));
    }
    return parts.map((p) => `<p>${p}</p>`).join('');
  }

  // Teljes lehallgatásnál egy mintabit 1/4 eséllyel hibás; ennyi eséllyel lépi túl
  // a m bites minta a küszöböt.
  function catchChance(m, threshold) {
    let term = 0.75 ** m;
    let total = 0;
    for (let k = 0; k <= m; k++) {
      if (k / m > threshold) total += term;
      term *= ((m - k) / (k + 1)) * (1 / 3);
    }
    return total;
  }

  function abortText(r) {
    const text = t().abort[r.abort];
    if (r.abort === 'qber') return text(pct(r.qber), pct(r.cfg.threshold, 0));
    if (r.abort === 'no-secret') return text(r.pa.n, r.pa.leak, r.cfg.eveEnabled);
    return text;
  }

  const aborted = (title) => ({ title, cls: 'abort', body: `<p>${abortText(app.res)}</p>` });

  function narrate() {
    const { res, cfg } = app;
    const n = t().narr;
    const s = step();
    const q = s.i !== undefined ? res.qubits[s.i] : null;
    switch (s.phase) {
      case 'setup':
        return { title: n.setupTitle, body: n.setup(cfg.n) };
      case 'prepare':
        return { title: n.prepareTitle, body: n.prepare };
      case 'transmit':
        return { title: n.qubitTitle(q.i + 1), body: narrateQubit(q) };
      case 'announce': {
        const same = res.sifted.length;
        return { title: n.announceTitle, body: n.announce(same, pct(same / cfg.n, 0)) + (cfg.eveEnabled ? n.announceEve : '') };
      }
      case 'sift':
        return { title: n.siftTitle, body: n.sift(res.sifted.length) };
      case 'sample':
        if (s.kind === 'reveal') {
          return { title: n.sampleTitle, body: n.sample(res.sample.length, res.sampleErrors, pct(res.qber)) };
        }
        if (res.abort === 'qber') return aborted(n.tooManyTitle);
        if (res.abort === 'no-key') return aborted(n.noKeyTitle);
        return {
          title: n.goTitle,
          body: n.go(pct(res.qber), pct(cfg.threshold, 0), res.sample.length, pct(catchChance(res.sample.length, cfg.threshold), 0)),
        };
      case 'ec': {
        if (s.kind === 'verify') {
          return res.ec.verified
            ? { title: n.verifyTitle, body: n.verifyOk(res.ec.verifyBits, res.ec.leak) }
            : { title: n.verifyTitle, cls: 'abort', body: n.verifyFail };
        }
        const pass = res.ec.passes[s.pass];
        return { title: n.passTitle(s.pass + 1), body: n.pass(pass.size, pass.fixed.length) };
      }
      case 'pa':
        return {
          title: n.paTitle,
          body: n.pa(res.pa.n, res.pa.length) + (cfg.eveEnabled ? n.paEve(pct(res.pa.eveAgreeBefore, 0), pct(res.pa.eveAgreeAfter, 0)) : ''),
        };
      default:
        if (res.abort) return aborted(n.abortTitle);
        if (!res.pa.keysMatch) return { title: n.hiddenTitle, cls: 'abort', body: n.hidden };
        return {
          title: n.doneTitle,
          cls: 'success',
          body: n.done(res.pa.length) + (res.intercepted ? n.doneEve(res.intercepted) : ''),
        };
    }
  }

  return { narrate };
})();
