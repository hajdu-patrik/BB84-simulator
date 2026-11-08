// A BB84 protokoll motorja. A futás teljes egészében előre kiszámolódik egy
// mag alapján; a felület ebből a jegyzőkönyvből fedi fel lépésről lépésre, amit
// az adott ponton már tudni lehet. Így a visszalépés is determinisztikus.
const BB84 = (() => {
  const Q = typeof Quantum !== 'undefined' ? Quantum : require('./quantum.js');
  const { mulberry32, randBit, randBasis, shuffled } = typeof Random !== 'undefined' ? Random : require('./random.js');
  const { h2, reconcile, toeplitzHash } = typeof Postprocess !== 'undefined' ? Postprocess : require('./postprocess.js');

  const DEFAULTS = {
    n: 64,
    seed: 19,
    eveEnabled: false,
    eveRate: 1,
    sampleFrac: 0.25,
    threshold: 0.11,
    safety: 2,
    ecPasses: 4,
    verifyBits: 6,
  };

  const PHASES = ['setup', 'prepare', 'transmit', 'announce', 'sift', 'sample', 'ec', 'pa', 'done'].map((id) => ({ id }));

  function drawEveBases(cfg) {
    const rng = mulberry32(cfg.seed ^ 0x5e5e5e);
    return Array.from({ length: cfg.n }, () => {
      const intercepted = rng() < cfg.eveRate;
      const basis = randBasis(rng);
      return intercepted ? basis : '-';
    });
  }

  function createPlan(cfg) {
    const rng = mulberry32(cfg.seed);
    const draw = (fn) => Array.from({ length: cfg.n }, () => fn(rng));
    return {
      aliceBits: draw(randBit),
      aliceBases: draw(randBasis),
      bobBases: draw(randBasis),
      eveBases: drawEveBases(cfg),
    };
  }

  // Egy qubit útja: Alice -> (Éva) -> Bob.
  function sendQubit(i, plan, cfg, rng) {
    const q = {
      i,
      aBit: plan.aliceBits[i],
      aBasis: plan.aliceBases[i],
      bobBasis: plan.bobBases[i],
      eveBasis: cfg.eveEnabled ? plan.eveBases[i] : '-',
      eveBit: null,
    };
    q.sent = Q.prepare(q.aBit, q.aBasis);

    let psi = q.sent;
    if (q.eveBasis !== '-') {
      const m = Q.measure(psi, q.eveBasis, rng);
      q.eveBit = m.outcome;
      psi = m.state;
    } else {
      // Mérés nélkül is fogy egy szám, így Éva egy cellája más qubitre nem hat.
      rng();
    }
    q.afterEve = psi;
    q.eveGuess = randBit(rng);

    const bob = Q.measure(psi, q.bobBasis, rng);
    q.bobBit = bob.outcome;
    q.bobPZero = bob.p0;
    q.match = q.aBasis === q.bobBasis;
    q.error = q.match && q.aBit !== q.bobBit;
    q.role = q.match ? 'key' : 'discard';
    return q;
  }

  function runProtocol(plan, cfg) {
    const rng = mulberry32((cfg.seed ^ 0xa5a5a5) >>> 0);
    const qubits = Array.from({ length: cfg.n }, (_, i) => sendQubit(i, plan, cfg, rng));

    const sifted = qubits.filter((q) => q.match).map((q) => q.i);
    const sampleSize = sifted.length
      ? Math.min(sifted.length, Math.max(1, Math.round(cfg.sampleFrac * sifted.length)))
      : 0;
    const sample = shuffled(sifted, rng).slice(0, sampleSize).sort((a, b) => a - b);
    sample.forEach((i) => { qubits[i].role = 'sample'; });
    const keyIdx = sifted.filter((i) => qubits[i].role === 'key');

    const countErrors = (list) => list.filter((i) => qubits[i].error).length;
    const sampleErrors = countErrors(sample);
    const res = {
      cfg,
      qubits,
      sifted,
      sample,
      keyIdx,
      sampleErrors,
      qber: sampleSize ? sampleErrors / sampleSize : null,
      trueQber: sifted.length ? countErrors(sifted) / sifted.length : null,
      intercepted: qubits.filter((q) => q.eveBit !== null).length,
      abort: null,
      ec: null,
      pa: null,
    };

    if (!sampleSize) { res.abort = 'no-sifted'; return res; }
    if (res.qber > cfg.threshold) { res.abort = 'qber'; return res; }
    if (!keyIdx.length) { res.abort = 'no-key'; return res; }

    const aliceKey = keyIdx.map((i) => qubits[i].aBit);
    const bobKey = keyIdx.map((i) => qubits[i].bobBit);
    const eveKey = keyIdx.map((i) => qubits[i].eveBit ?? qubits[i].eveGuess);
    // Kis mintánál a 0 becslés nem jelent hibátlan kulcsot, ezért a blokkméretet
    // egy minta alapján még reális felső becsléshez igazítjuk.
    const ecRate = Math.max(res.qber, 1 / (sampleSize + 1));
    res.ec = reconcile(aliceKey, bobKey, ecRate, cfg, rng);
    if (!res.ec.verified) { res.abort = 'ec'; return res; }

    const n = aliceKey.length;
    const finalLen = Math.floor(n * (1 - h2(res.qber)) - res.ec.leak - cfg.safety);
    const paBase = {
      n,
      leak: res.ec.leak,
      entropy: n * (1 - h2(res.qber)),
      safety: cfg.safety,
      length: Math.max(0, finalLen),
    };
    if (finalLen <= 0) { res.pa = paBase; res.abort = 'no-secret'; return res; }

    const seedBits = Array.from({ length: n + finalLen - 1 }, () => randBit(rng));
    const alice = toeplitzHash(aliceKey, finalLen, seedBits);
    const bob = toeplitzHash(res.ec.bob, finalLen, seedBits);
    const eve = toeplitzHash(eveKey, finalLen, seedBits);
    const agreement = (a, b) => a.filter((bit, i) => bit === b[i]).length / a.length;
    res.pa = {
      ...paBase,
      alice,
      bob,
      eve,
      eveAgreeBefore: agreement(aliceKey, eveKey),
      eveAgreeAfter: agreement(alice, eve),
      keysMatch: alice.every((bit, i) => bit === bob[i]),
    };
    return res;
  }

  // A jegyzőkönyvből felépített lépéssor; a felület ezen léptet oda-vissza.
  function buildTimeline(res) {
    const n = res.cfg.n;
    const steps = [{ phase: 'setup', sent: 0 }, { phase: 'prepare', sent: 0 }];
    for (let i = 0; i < n; i++) steps.push({ phase: 'transmit', i, sent: i + 1 });
    const later = (phase, extra = {}) => steps.push({ phase, sent: n, ...extra });

    later('announce');
    later('sift');
    if (res.abort === 'no-sifted') {
      later('done');
      return steps;
    }
    later('sample', { kind: 'reveal' });
    later('sample', { kind: 'decision' });
    if (res.ec) {
      res.ec.passes.forEach((pass, p) => later('ec', { pass: p }));
      later('ec', { kind: 'verify' });
    }
    if (res.pa?.alice) later('pa');
    later('done');
    return steps;
  }

  const phaseIndex = (id) => PHASES.findIndex((p) => p.id === id);

  return {
    DEFAULTS, PHASES, createPlan, drawEveBases, runProtocol, buildTimeline, phaseIndex,
  };
})();

if (typeof module !== 'undefined') module.exports = BB84;
