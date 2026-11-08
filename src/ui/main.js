// A felület összefogása: a futás újraszámolása, a teljes kirajzolás, a léptetés,
// a nyelv és a téma, valamint az eseménykezelők.
(() => {
  const { $, t, getLang, setLang, store, narrowScreen, motionOn, app, step, isLast, riseIn, fadeIn } = UI;

  function recompute() {
    app.res = BB84.runProtocol(app.plan, app.cfg);
    app.steps = BB84.buildTimeline(app.res);
    app.cursor = 0;
    app.shown = 0;
    app.flying = false;
    app.animToken++;
    render();
  }

  function replan() {
    app.plan = BB84.createPlan(app.cfg);
    recompute();
  }

  function syncControls() {
    const { cfg } = app;
    $('in-n').value = cfg.n;
    $('in-eve').checked = cfg.eveEnabled;
    $('in-rate').value = cfg.eveRate;
    $('rate-field').hidden = !cfg.eveEnabled;
  }

  // A táblázat celláinak kattintása, csak az első lépésnél.
  function toggleCell(row, i) {
    const { plan } = app;
    const flip = (basis) => (basis === 'Z' ? 'X' : 'Z');
    if (row === 'aBit') plan.aliceBits[i] ^= 1;
    if (row === 'aBasis') plan.aliceBases[i] = flip(plan.aliceBases[i]);
    if (row === 'bobBasis') plan.bobBases[i] = flip(plan.bobBases[i]);
    if (row === 'eveBasis') {
      const order = ['-', 'Z', 'X'];
      plan.eveBases[i] = order[(order.indexOf(plan.eveBases[i]) + 1) % order.length];
    }
    recompute();
    document.querySelector(`[data-row="${row}"][data-i="${i}"]`).focus();
  }

  /* ---------- Kirajzolás ---------- */

  function renderTransport() {
    const atStart = app.cursor === 0;
    const atEnd = isLast();
    const focused = document.activeElement;
    $('btn-reset').disabled = atStart;
    $('btn-back').disabled = atStart;
    $('btn-next').disabled = atEnd;
    $('btn-phase').disabled = atEnd;
    if (focused.disabled) (atEnd ? $('btn-back') : $('btn-next')).focus();
    $('progress').textContent = t().progress(app.cursor + 1, app.steps.length);
  }

  function renderNarration() {
    const n = Narration.narrate();
    const box = $('narration');
    const changed = $('narr-title').textContent !== n.title;
    box.className = `narration ${n.cls ?? ''}`;
    $('narr-title').textContent = n.title;
    if (app.narrBody !== n.body) {
      app.narrBody = n.body;
      $('narr-body').innerHTML = n.body;
    }
    box.setAttribute('aria-busy', app.flying);
    if (changed) riseIn(box);
  }

  function render() {
    const previous = app.steps[app.shown];
    const entering = app.cursor > app.shown && previous.phase !== step().phase;
    renderNarration();
    Rail.render();
    Bench.render();
    Results.renderMetrics();
    Ledger.render(entering);
    Results.renderKeys(entering);
    renderTransport();
    app.shown = app.cursor;
  }

  // Megszakít minden futó animációt, és a lépés végleges állapotát rajzolja ki.
  function settle() {
    app.animToken++;
    app.flying = false;
    render();
  }

  /* ---------- Léptetés ---------- */

  async function goNext() {
    if (isLast()) return;
    app.cursor++;
    // Repülés közben még nem látszik, mit mért Éva és Bob.
    app.flying = step().phase === 'transmit' && motionOn();
    render();
    const token = ++app.animToken;
    await Bench.animateStep(token);
    if (app.flying && token === app.animToken) {
      app.flying = false;
      render();
      fadeIn($('narr-body'));
    }
  }

  function goTo(index) {
    app.cursor = Math.max(0, Math.min(app.steps.length - 1, index));
    settle();
  }

  function goBack() {
    if (app.cursor) goTo(app.cursor - 1);
  }

  function nextPhase() {
    const { phase } = step();
    const offset = app.steps.slice(app.cursor).findIndex((s) => s.phase !== phase);
    if (offset > 0) goTo(app.cursor + offset);
  }

  /* ---------- Nyelv és téma ---------- */

  function applyLanguage() {
    const m = t();
    document.documentElement.lang = getLang();
    document.title = m.title;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = m[el.dataset.t]; });
    document.querySelectorAll('[data-t-aria]').forEach((el) => { el.setAttribute('aria-label', m.aria[el.dataset.tAria]); });
    document.querySelectorAll('[data-lang]').forEach((el) => { el.setAttribute('aria-pressed', el.dataset.lang === getLang()); });
    $('name-alice').textContent = m.who.alice;
    $('name-eve').textContent = m.who.eve;
    $('name-bob').textContent = m.who.bob;
    syncTheme();
  }

  function syncTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const toggle = $('btn-theme');
    toggle.setAttribute('aria-pressed', dark);
    toggle.setAttribute('aria-label', dark ? t().toLight : t().toDark);
    toggle.title = toggle.getAttribute('aria-label');
  }

  /* ---------- Események ---------- */

  function bindSettings() {
    document.querySelectorAll('[data-lang]').forEach((button) => {
      button.addEventListener('click', () => {
        setLang(button.dataset.lang);
        applyLanguage();
        settle();
      });
    });
    $('btn-theme').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store.set('bb84-theme', next);
      syncTheme();
    });
    narrowScreen.addEventListener('change', settle);

    $('in-n').addEventListener('change', (e) => {
      app.cfg.n = Number(e.target.value);
      replan();
    });
    $('in-eve').addEventListener('change', (e) => {
      app.cfg.eveEnabled = e.target.checked;
      app.fadeEve = e.target.checked;
      syncControls();
      if (e.target.checked) riseIn($('rate-field'));
      recompute();
    });
    $('in-rate').addEventListener('change', (e) => {
      app.cfg.eveRate = Number(e.target.value);
      app.plan.eveBases = BB84.drawEveBases(app.cfg);
      recompute();
    });
    $('in-motion').addEventListener('change', (e) => {
      document.documentElement.classList.toggle('no-motion', !e.target.checked);
      settle();
    });
    $('btn-reroll').addEventListener('click', () => {
      app.cfg.seed = crypto.getRandomValues(new Uint32Array(1))[0];
      replan();
    });
  }

  function bindStepping() {
    $('ledger').addEventListener('click', (e) => {
      const cell = e.target.closest('button[data-row]');
      if (cell) toggleCell(cell.dataset.row, Number(cell.dataset.i));
    });
    $('rail').addEventListener('click', (e) => {
      const button = e.target.closest('[data-phase]');
      if (button) goTo(app.steps.findIndex((s) => s.phase === button.dataset.phase));
    });

    $('btn-next').addEventListener('click', goNext);
    $('btn-back').addEventListener('click', goBack);
    $('btn-reset').addEventListener('click', () => goTo(0));
    $('btn-phase').addEventListener('click', nextPhase);

    const keys = {
      ArrowRight: goNext,
      ArrowLeft: goBack,
      Home: () => goTo(0),
      End: () => goTo(app.steps.length - 1),
    };
    document.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('select, #ledger-scroll:focus')) return;
      if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
    });
  }

  Rail.build();
  applyLanguage();
  syncControls();
  bindSettings();
  bindStepping();
  replan();
})();
