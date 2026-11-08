// A protokoll kilenc lépésének folyamatjelzője.
const Rail = (() => {
  const { PHASES, phaseIndex } = BB84;
  const { $, t, app, phaseNow, isLast, motionOn } = UI;

  const phaseName = (id, aborted) => (aborted && id === 'done' ? t().aborted : t().phases[id]);

  function build() {
    $('rail').innerHTML = PHASES.map((p, i) => `<li><button type="button" data-phase="${p.id}"><b>${i + 1}</b><span></span></button></li>`).join('');
  }

  function render() {
    const cur = phaseNow();
    const lastPhase = phaseIndex(app.steps.at(-1).phase);
    const available = new Set(app.steps.map((s) => s.phase));
    const aborted = Boolean(app.res.abort) && isLast();
    const rail = $('rail');
    rail.style.setProperty('--done', cur / (PHASES.length - 1));
    rail.classList.toggle('aborted', aborted);
    [...rail.children].forEach((li, i) => {
      const p = PHASES[i];
      const button = li.firstElementChild;
      const name = phaseName(p.id, aborted);
      li.className = [i < cur && available.has(p.id) ? 'past' : '', i === cur ? 'current' : '',
        aborted && i === lastPhase ? 'failed' : ''].join(' ');
      button.disabled = !available.has(p.id);
      button.lastElementChild.textContent = name;
      button.setAttribute('aria-label', `${i + 1}. ${name}`);
      if (i === cur) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    const curName = phaseName(PHASES[cur].id, aborted);
    $('rail-label').textContent = `${t().railLabel(cur + 1, PHASES.length, curName)} · ${t().progress(app.cursor + 1, app.steps.length)}`;
    const wrap = rail.parentElement;
    const li = rail.children[cur];
    wrap.scrollTo({ left: li.offsetLeft - (wrap.clientWidth - li.offsetWidth) / 2, behavior: motionOn() ? 'smooth' : 'auto' });
  }

  return { build, render };
})();
