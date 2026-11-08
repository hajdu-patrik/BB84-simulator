// A qubitenkénti táblázat. Az első lépésnél a bitek és bázisok cellái gombok,
// ezekkel adható meg a futás.
const Ledger = (() => {
  const { $, t, app, step, reached, sampleShown, label, glyph, motionOn } = UI;

  // A szakaszba lépéskor beúszó táblázatsorok.
  const REVEAL = { prepare: ['sent'], announce: ['match'], sample: ['role', 'error'], ec: ['fixed'] };

  // A hibajavítás eddigi köreiben javított kulcspozíciók.
  function fixedSoFar() {
    const { ec } = app.res;
    const s = step();
    if (!ec || !reached('ec')) return new Set();
    const upto = s.phase === 'ec' && s.kind !== 'verify' ? s.pass + 1 : ec.passes.length;
    return new Set(ec.passes.slice(0, upto).flatMap((p) => p.fixed));
  }

  function cellFor(row, q) {
    const s = step();
    const moved = q.i < s.sent - (app.flying ? 1 : 0);
    const dim = reached('sift') && !q.match ? 'dim' : '';
    switch (row) {
      case 'aBit': return { text: q.aBit, cls: dim };
      case 'aBasis': return { text: label(q.aBasis), cls: dim };
      case 'sent': return reached('prepare') ? { html: glyph(q.sent), cls: dim } : {};
      case 'eveBasis': {
        const basis = app.plan.eveBases[q.i];
        return { text: basis === '-' ? '–' : label(basis), cls: dim };
      }
      case 'eveBit': return moved && q.eveBit !== null ? { text: q.eveBit, cls: dim } : {};
      case 'resent': return moved && q.eveBit !== null ? { html: glyph(q.afterEve), cls: dim } : {};
      case 'bobBasis': return { text: label(q.bobBasis), cls: dim };
      case 'bobBit': return moved ? { text: q.bobBit, cls: dim } : {};
      case 'match':
        if (!reached('announce')) return {};
        return q.match ? { text: '=', cls: 'yes' } : { text: '≠', cls: 'no' };
      case 'role':
        if (!sampleShown() || !q.match) return {};
        return q.role === 'sample' ? { text: t().roleSample, cls: 'sample' } : { text: t().roleKey, cls: 'yes' };
      case 'error':
        if (!sampleShown() || !q.error) return {};
        return { text: '!', cls: q.role === 'sample' ? 'err' : 'err-hidden' };
      case 'fixed': {
        const k = app.res.keyIdx.indexOf(q.i);
        return k >= 0 && fixedSoFar().has(k) ? { text: '✓', cls: 'fixed' } : {};
      }
      default: return {};
    }
  }

  // A megjelenő sorok: kulcs, felirat, Éva-sor-e, szerkeszthető-e.
  function rowsFor() {
    const names = t().rows;
    const eve = app.cfg.eveEnabled ? 'who-e' : null;
    const rows = [
      ['aBit', '', true], ['aBasis', '', true], ['sent', '', false],
      ...(eve ? [['eveBasis', eve, true], ['eveBit', eve, false], ['resent', eve, false]] : []),
      ['bobBasis', '', true], ['bobBit', '', false], ['match', '', false], ['role', '', false], ['error', '', false],
      ...(reached('ec') && app.res.ec ? [['fixed', '', false]] : []),
    ];
    return rows.map(([key, who, canEdit]) => [key, names[key], who, canEdit]);
  }

  function render(entering) {
    const { res, cfg } = app;
    const editable = app.cursor === 0;
    const current = step().i;
    const head = `<thead><tr><th class="row" scope="col">${t().qubit}</th>${res.qubits
      .map((q) => `<th scope="col" class="${q.i === current ? 'cur' : ''}">${q.i + 1}</th>`).join('')}</tr></thead>`;
    const body = rowsFor().map(([key, name, who, canEdit]) => {
      const cells = res.qubits.map((q) => {
        const c = cellFor(key, q);
        const cls = [who, c.cls ?? '', q.i === current ? 'cur' : '', canEdit && editable ? 'edit' : ''].join(' ');
        const content = c.html ?? c.text ?? '';
        const inner = canEdit && editable
          ? `<button type="button" data-row="${key}" data-i="${q.i}" aria-label="${t().cell(name, q.i + 1, content)}">${content}</button>`
          : content;
        return `<td class="${cls}" style="--i:${q.i}">${inner}</td>`;
      }).join('');
      const fresh = (entering && REVEAL[step().phase]?.includes(key)) || (app.fadeEve && who === 'who-e');
      return `<tr class="${fresh ? 'reveal' : ''}"><th class="row ${who}" scope="row">${name}</th>${cells}</tr>`;
    }).join('');
    $('ledger').innerHTML = head + body;
    $('ledger').classList.toggle('sifting', entering && step().phase === 'sift');
    app.fadeEve = false;

    const encoding = `<b>${t().basisLegend('+')}</b> 0 = ${glyph(Quantum.prepare(0, 'Z'))}, 1 = ${glyph(Quantum.prepare(1, 'Z'))}. <b>${t().basisLegend('×')}</b> 0 = ${glyph(Quantum.prepare(0, 'X'))}, 1 = ${glyph(Quantum.prepare(1, 'X'))}.`;
    $('legend').innerHTML = editable ? `${t().legendEdit(cfg.eveEnabled)} ${encoding}` : `${encoding} ${t().legendRun}`;

    if (current !== undefined) {
      const wrap = $('ledger-scroll');
      const cell = $('ledger').querySelector('thead th.cur');
      wrap.scrollTo({ left: Math.max(0, cell.offsetLeft - wrap.clientWidth / 2), behavior: motionOn() ? 'smooth' : 'auto' });
    }
  }

  return { render, fixedSoFar };
})();
