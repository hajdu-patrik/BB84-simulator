// A csatorna ábrája és animációi. Széles nézetben vízszintes, keskenyen
// függőleges; a fotont és a csomagot mindkét esetben ugyanaz a pályaszám (s)
// írja le: a foton 180-tól 820-ig, a csomag 95-től 905-ig halad.
const Bench = (() => {
  const { $, t, app, step, label, narrowScreen, motionOn, animate, fadeIn, sleep, tween } = UI;

  // A két elrendezés geometriája. A dobozsorok a név, majd a két érték alapvonala.
  function geometry(narrow, eve) {
    if (!narrow) {
      return {
        viewBox: '0 0 1000 225',
        boxSize: [170, 120],
        lines: [18, 34, 68, 98],
        boxes: { 'alice-box': [10, 20], 'eve-box': [415, 20], 'bob-box': [820, 20] },
        beam: 'M180 80H820',
        classical: 'M95 140V185H905V140',
        tap: 'M500 140V185',
        beamLabel: [500, 64, 'middle'],
        publicLabel: [500, 214, null],
        packet: [-56, 112],
      };
    }
    const bobY = eve ? 308 : 154;
    return {
      viewBox: `0 0 300 ${bobY + 86}`,
      boxSize: [174, 83],
      lines: [12, 24, 47, 69],
      boxes: { 'alice-box': [1, 1], 'eve-box': [1, 155], 'bob-box': [1, bobY + 1] },
      beam: `M88 84V${bobY}`,
      classical: `M175 42H252V${bobY + 42}H175`,
      tap: 'M175 196H252',
      beamLabel: [98, 122, 'start'],
      publicLabel: [0, 0, `translate(274 ${(bobY + 84) / 2}) rotate(90)`],
      packet: [-44, 88],
    };
  }

  function channelPoint(s) {
    if (!narrowScreen.matches) return [s, 80];
    const stops = app.cfg.eveEnabled ? [[180, 84], [415, 154], [585, 238], [820, 308]] : [[180, 84], [820, 154]];
    const end = stops.findIndex(([at]) => s <= at);
    const [s1, y1] = stops[Math.max(0, end - 1)];
    const [s2, y2] = stops[Math.max(1, end)];
    return [88, y1 + ((y2 - y1) * (s - s1)) / (s2 - s1)];
  }

  function publicPoint(s) {
    if (!narrowScreen.matches) return [s, 185];
    const last = app.cfg.eveEnabled ? 350 : 196;
    return [252, 42 + ((last - 42) * (s - 95)) / 810];
  }

  function placeBox(id, [x, y], [width, height], lines) {
    const box = $(id);
    box.setAttribute('transform', `translate(${x} ${y})`);
    box.querySelector('rect').setAttribute('width', width);
    box.querySelector('rect').setAttribute('height', height);
    [...box.querySelectorAll('text')].forEach((text, i) => {
      text.setAttribute('x', lines[0]);
      text.setAttribute('y', lines[i + 1]);
    });
  }

  function layout() {
    const narrow = narrowScreen.matches;
    const g = geometry(narrow, app.cfg.eveEnabled);
    const bench = $('bench');
    bench.classList.toggle('tall', narrow);
    bench.classList.toggle('has-eve', app.cfg.eveEnabled);
    bench.setAttribute('viewBox', g.viewBox);
    Object.entries(g.boxes).forEach(([id, at]) => placeBox(id, at, g.boxSize, g.lines));
    $('beam').setAttribute('d', g.beam);
    $('classical').setAttribute('d', g.classical);
    $('tap').setAttribute('d', g.tap);

    const [bx, by, anchor] = g.beamLabel;
    $('beam-label').setAttribute('x', bx);
    $('beam-label').setAttribute('y', by);
    $('beam-label').setAttribute('text-anchor', anchor);
    const [px, py, rotate] = g.publicLabel;
    const pub = $('public-label');
    pub.setAttribute('x', px);
    pub.setAttribute('y', py);
    if (rotate) pub.setAttribute('transform', rotate);
    else pub.removeAttribute('transform');
    pub.textContent = narrow ? t().publicShort : t().publicChannel;

    $('packet-box').setAttribute('x', g.packet[0]);
    $('packet-box').setAttribute('width', g.packet[1]);
  }

  function render(showResult = true) {
    const { res } = app;
    const s = step();
    const m = t();
    layout();
    $('bench').classList.remove('flying');

    const q = s.i !== undefined ? res.qubits[s.i] : null;
    const measuring = q && q.eveBit !== null;
    $('a-bit').textContent = `${m.bit}: ${q ? q.aBit : '–'}`;
    $('a-basis').textContent = `${m.basis}: ${q ? label(q.aBasis) : '–'}`;
    $('b-basis').textContent = `${m.basis}: ${q ? label(q.bobBasis) : '–'}`;
    $('b-bit').textContent = `${m.measured}: ${q && showResult ? q.bobBit : '–'}`;
    $('e-basis').textContent = q && !measuring ? m.noMeasure : `${m.basis}: ${measuring ? label(q.eveBasis) : '–'}`;
    $('e-bit').textContent = `${m.measured}: ${measuring && showResult ? q.eveBit : '–'}`;
    $('photon').setAttribute('visibility', 'hidden');
    $('packet').setAttribute('visibility', 'hidden');
  }

  /* ---------- Animáció ---------- */

  function placePhoton(at, psi, tampered) {
    const photon = $('photon');
    const [x, y] = channelPoint(at);
    const path = (from, to) => `M${channelPoint(from).join(' ')}L${channelPoint(to).join(' ')}`;
    photon.setAttribute('visibility', 'visible');
    photon.setAttribute('transform', `translate(${x} ${y})`);
    photon.classList.toggle('tampered', tampered);
    $('photon-pol').setAttribute('transform', `rotate(${-Quantum.polarization(psi)})`);
    $('trail-a').setAttribute('d', path(180, tampered ? 415 : at));
    $('trail-b').setAttribute('d', path(585, tampered ? at : 585));
  }

  // A foton Alice-tól Bobig repül; Évánál eltűnik a dobozában, és ha mér, piros
  // fotonként jön ki. Bob eredménye csak az érkezés után jelenik meg.
  async function animateQubit(q, token) {
    const pace = 480;
    const hop = (from, to, psi, tampered, ms) => tween(from, to, ms, token, (s) => placePhoton(s, psi, tampered));
    const atEve = q.eveBit !== null;
    render(false);
    placePhoton(180, q.sent, false);
    $('bench').classList.add('flying');

    if (app.cfg.eveEnabled) {
      if (!await hop(180, 415, q.sent, false, pace)) return;
      $('photon').setAttribute('visibility', 'hidden');
      if (atEve) {
        animate($('eve-box').querySelector('rect'), [
          { strokeWidth: 2 }, { strokeWidth: 7 }, { strokeWidth: 2 }], { duration: 520 });
        await sleep(pace * 0.45);
        if (token !== app.animToken) return;
        $('e-bit').textContent = `${t().measured}: ${q.eveBit}`;
        fadeIn($('e-bit'));
      }
      await sleep(pace * 0.35);
      if (token !== app.animToken) return;
      if (!await hop(585, 820, q.afterEve, atEve, pace)) return;
    } else if (!await hop(180, 820, q.sent, false, pace * 1.6)) return;

    await animate($('photon'), [{ opacity: 1 }, { opacity: 0 }], { duration: 160 })?.finished;
    if (token !== app.animToken) return;
    render(true);
    fadeIn($('b-bit'));
  }

  async function animatePacket(text, from, to, token) {
    const packet = $('packet');
    $('packet-label').textContent = text;
    packet.setAttribute('visibility', 'visible');
    await tween(from, to, 720, token, (s) => packet.setAttribute('transform', `translate(${publicPoint(s).join(' ')})`));
    if (token === app.animToken) packet.setAttribute('visibility', 'hidden');
  }

  // Ami az adott lépésben a csatornán történik: foton vagy nyilvános üzenet.
  async function animateStep(token) {
    const s = step();
    const packet = t().packet;
    const toBob = (text) => animatePacket(text, 95, 905, token);
    if (!motionOn()) return;
    if (s.phase === 'transmit') await animateQubit(app.res.qubits[s.i], token);
    if (s.phase === 'announce') {
      await animatePacket(packet.bases, 905, 95, token);
      if (token === app.animToken) await toBob(packet.matches);
    }
    if (s.phase === 'sample' && s.kind === 'reveal') await toBob(packet.sample);
    if (s.phase === 'ec' && s.kind !== 'verify') await toBob(packet.parities);
    if (s.phase === 'pa') await toBob(packet.hash);
  }

  return { render, animateStep };
})();
