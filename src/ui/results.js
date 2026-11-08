// Az eredmények: a mérőszámok sora és a kulcsok panelje.
const Results = (() => {
  const { $, t, pct, app, step, reached, sampleShown, isLast, riseIn } = UI;

  /* ---------- Mérőszámok ---------- */

  function setMetric(id, value, cls = '') {
    const box = $(id);
    const dd = box.querySelector('dd');
    box.className = `metric ${cls}`;
    if (dd.textContent === String(value)) return;
    dd.textContent = value;
    riseIn(dd, 240);
  }

  function renderMetrics() {
    const { res, cfg } = app;
    const s = step();
    const hasQber = sampleShown() && res.qber !== null;
    const over = hasQber && res.qber > cfg.threshold;
    const finalLen = (s.phase === 'pa' || s.phase === 'done') && res.pa?.alice ? res.pa.length : null;
    const failed = isLast() && res.abort;
    const scale = 0.5;
    setMetric('m-sent', `${s.sent - (app.flying ? 1 : 0)} / ${cfg.n}`);
    setMetric('m-match', reached('announce') ? res.sifted.length : '–');
    setMetric('m-err', hasQber ? `${res.sampleErrors} / ${res.sample.length}` : '–', over ? 'bad' : '');
    setMetric('m-qber', hasQber ? pct(res.qber) : '–', over ? 'bad' : '');
    setMetric('m-key', finalLen ? t().bits(finalLen) : (failed ? t().none : '–'), finalLen ? 'good' : (failed ? 'bad' : ''));
    $('qber-label').textContent = t().mQber(pct(cfg.threshold, 0));
    $('meter').classList.toggle('over', over);
    $('meter-fill').style.transform = `scaleX(${hasQber ? Math.min(1, res.qber / scale) : 0})`;
    $('meter-mark').style.left = `${(cfg.threshold / scale) * 100}%`;
  }

  /* ---------- Kulcsok ---------- */

  function bitsHtml(bits, reference) {
    return bits.map((b, i) => {
      if (b === null) return '<span class="unk">·</span>';
      return reference && b !== reference[i] ? `<span class="diff">${b}</span>` : `${b}`;
    }).join('');
  }

  function keyRow(cls, name, bits, reference, note = '') {
    return `<div class="key-row ${cls}"><b>${name}</b><div class="key-bits">${bitsHtml(bits, reference)}</div><span class="key-note">${note}</span></div>`;
  }

  // A végső kulcs, vagy előtte az eddigi közös bitek; az eltéréseket kiemeli.
  function renderKeys(entering) {
    const { res, cfg } = app;
    const s = step();
    const box = $('keys');
    if (!reached('sift')) {
      box.hidden = true;
      return;
    }
    if (box.hidden || entering) riseIn(box, 380);
    box.hidden = false;
    const q = res.qubits;
    const final = (s.phase === 'pa' || s.phase === 'done') && res.pa?.alice;
    const inKeyStage = sampleShown() && res.keyIdx.length > 0;
    const idx = inKeyStage ? res.keyIdx : res.sifted;
    const aBits = idx.map((i) => q[i].aBit);
    const m = t();
    let title = inKeyStage ? m.keysSampled : m.keysSift;
    if (reached('ec') && res.ec) title = m.keysEc;
    let rows;

    if (final) {
      title = m.keysFinal(res.pa.length);
      rows = [keyRow('a', m.who.alice, res.pa.alice), keyRow('b', m.who.bob, res.pa.bob, res.pa.alice)];
      if (cfg.eveEnabled) rows.push(keyRow('e', m.who.eve, res.pa.eve, res.pa.alice, m.agreement(pct(res.pa.eveAgreeAfter, 0))));
    } else {
      const fixed = Ledger.fixedSoFar();
      const bBits = idx.map((i, k) => (inKeyStage && fixed.has(k) ? q[i].bobBit ^ 1 : q[i].bobBit));
      const errors = bBits.filter((b, i) => b !== aBits[i]).length;
      rows = [keyRow('a', m.who.alice, aBits, null, m.bits(idx.length)),
        keyRow('b', m.who.bob, bBits, aBits, m.mismatches(errors))];
      if (cfg.eveEnabled) {
        const eBits = idx.map((i) => q[i].eveBit);
        const known = eBits.filter((b, i) => b === aBits[i]).length;
        rows.push(keyRow('e', m.who.eve, eBits, aBits, m.hits(known)));
      }
    }
    const note = final ? '' : m.keysNote;
    box.classList.toggle('done', Boolean(final) && s.phase === 'done');
    box.innerHTML = `<h2 class="panel-head">${title}${note}</h2><div class="panel-body">${rows.join('')}</div>`;
  }

  return { renderMetrics, renderKeys };
})();
