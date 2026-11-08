// A klasszikus utófeldolgozás: hibajavítás (Cascade) és titkosságerősítés
// (Toeplitz-hash). Ezek már csak biteken dolgoznak, kvantumállapot nélkül.
const Postprocess = (() => {
  const { shuffled } = typeof Random !== 'undefined' ? Random : require('./random.js');

  const parityOf = (bits, positions) => positions.reduce((p, i) => p ^ bits[i], 0);

  // Bináris entrópia: ennyi bitnyi bizonytalanság marad bitenként p hibaaránynál.
  const h2 = (p) => (p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p));

  // Cascade: blokkparitások összevetése, eltérésnél bináris keresés. Bob javít,
  // minden nyilvánosan elhangzó paritás egy szivárgott bit. Egy javítás után a
  // korábbi körök érintett blokkjai is újra eltérhetnek, ezeket is rendbe teszi.
  function reconcile(alice, bobInput, qber, cfg, rng) {
    const bob = bobInput.slice();
    const n = alice.length;
    const passes = [];
    let leak = 0;
    const firstBlock = qber > 0 ? Math.max(2, Math.min(n, Math.ceil(0.73 / qber))) : n;
    const blockOf = [];
    const disclosed = new Set();

    // Egy már elhangzott paritás ismétlése nem árul el új bitet.
    const newParity = (positions) => {
      const id = positions.slice().sort((a, b) => a - b).join();
      if (disclosed.has(id)) return 0;
      disclosed.add(id);
      return 1;
    };

    const correct = (block, pass) => {
      let lo = 0;
      let hi = block.length;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const left = block.slice(lo, mid);
        pass.leak += newParity(left);
        if (parityOf(alice, left) !== parityOf(bob, left)) hi = mid;
        else lo = mid;
      }
      const bit = block[lo];
      bob[bit] ^= 1;
      pass.fixed.push(bit);
      // A korábbi blokkok paritása már elhangzott, az összevetésük nem szivárog.
      blockOf.forEach((map) => {
        const other = map[bit];
        if (other !== block && parityOf(alice, other) !== parityOf(bob, other)) correct(other, pass);
      });
    };

    for (let p = 0; p < cfg.ecPasses; p++) {
      // A teljes kulcs paritása újrakeverve sem ad új információt.
      const size = Math.min(Math.max(1, Math.ceil(n / 2)), firstBlock * 2 ** p);
      const order = shuffled(alice.map((_, i) => i), rng);
      const pass = { size, blocks: 0, leak: 0, fixed: [] };
      const blocks = [];
      const map = [];
      for (let start = 0; start < n; start += size) {
        const block = order.slice(start, start + size);
        blocks.push(block);
        block.forEach((bit) => { map[bit] = block; });
      }
      blockOf.push(map);

      for (const block of blocks) {
        pass.blocks++;
        pass.leak += newParity(block);
        if (parityOf(alice, block) !== parityOf(bob, block)) correct(block, pass);
      }
      leak += pass.leak;
      passes.push(pass);
    }

    // Záró ellenőrzés véletlen részhalmazok paritásával.
    let verified = true;
    for (let t = 0; t < cfg.verifyBits; t++) {
      const subset = alice.map((_, i) => i).filter(() => rng() < 0.5);
      leak += newParity(subset);
      if (parityOf(alice, subset) !== parityOf(bob, subset)) verified = false;
    }
    return { bob, passes, leak, verified, verifyBits: cfg.verifyBits };
  }

  // Univerzális hash: véletlen Toeplitz-mátrix szorzása GF(2) felett.
  function toeplitzHash(key, outLen, seedBits) {
    const n = key.length;
    return Array.from({ length: outLen }, (_, row) => {
      let bit = 0;
      for (let col = 0; col < n; col++) bit ^= seedBits[row - col + n - 1] & key[col];
      return bit;
    });
  }

  return { h2, reconcile, toeplitzHash };
})();

if (typeof module !== 'undefined') module.exports = Postprocess;
