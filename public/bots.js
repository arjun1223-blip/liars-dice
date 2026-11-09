// Liar's Dice computer opponents. They only ever look at their own dice plus public info.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.LiarsBots = factory(root.LiarsEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // How each style plays:
  //  callAt      call "Liar!" when the current bid looks less likely than this
  //  margin      also call when calling beats the best raise by more than this (higher = stubborn raiser)
  //  raiseFloor  rather than make a raise this unlikely, call instead
  //  openTarget  how sure the opening bid must be (lower = bigger opening bids)
  //  bluff       chance to bid a number they don't hold at all
  //  jump        chance to jump the quantity past the minimum raise
  const PERSONALITIES = {
    cautious: { callAt: 0.44, margin: 0.0,  raiseFloor: 0.42, openTarget: 0.8,  bluff: 0.0,  jump: 0.0 },
    balanced: { callAt: 0.36, margin: 0.1,  raiseFloor: 0.3,  openTarget: 0.6,  bluff: 0.12, jump: 0.15 },
    bold:     { callAt: 0.24, margin: 0.2,  raiseFloor: 0.0,  openTarget: 0.45, bluff: 0.35, jump: 0.3 },
  };

  const BOT_ROSTER = [
    { name: 'Salty Meg', personality: 'bold' },
    { name: 'Old Barnaby', personality: 'cautious' },
    { name: 'Lucky Finn', personality: 'balanced' },
    { name: 'Mad Marisol', personality: 'bold' },
    { name: 'Quiet Ivo', personality: 'cautious' },
    { name: 'Rosa Two-Bones', personality: 'balanced' },
    { name: 'Gentleman Pike', personality: 'balanced' },
  ];

  function logChoose(n, k) {
    let r = 0;
    for (let i = 1; i <= k; i++) r += Math.log(n - k + i) - Math.log(i);
    return r;
  }
  function pmf(n, p, k) {
    if (k < 0 || k > n) return 0;
    return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }
  function tail(n, p, k) { // P(X >= k)
    if (k <= 0) return 1;
    if (k > n) return 0;
    let s = 0;
    for (let i = k; i <= n; i++) s += pmf(n, p, i);
    return Math.min(1, s);
  }

  // Read on opponents: someone who bid a number probably holds a little of it. Shared by the
  // bots and the odds hint shown to human players, so both judge bids the same way.
  function bidRead(state, idx, f) {
    const bidders = new Set((state.bidHistory || []).filter((b) => b.face === f && b.player !== idx).map((b) => b.player));
    return Math.min(2, Math.round(bidders.size * 0.5));
  }

  function decide(state, idx, rng) {
    rng = rng || Math.random;
    const me = state.players[idx];
    const P = PERSONALITIES[me.personality] || PERSONALITIES.balanced;
    const wild = E.onesWild(state);
    const unknown = E.totalDice(state) - me.dice.length;
    const pFace = (f) => (wild && f !== 1 ? 1 / 3 : 1 / 6);
    const own = (f) => me.dice.filter((d) => E.matches(d, f, wild)).length;

    const hint = (f) => bidRead(state, idx, f);
    const probTrue = (q, f) => tail(unknown, pFace(f), q - own(f) - hint(f));
    const faces = [];
    for (let f = 1; f <= 6; f++) if (E.faceAllowed(state, f)) faces.push(f);
    const total = E.totalDice(state);
    const bid = state.currentBid;

    // Opening bid.
    if (!bid) {
      let face;
      const blank = faces.filter((f) => own(f) === 0);
      if (blank.length && rng() < P.bluff) face = blank[Math.floor(rng() * blank.length)];
      else {
        const best = Math.max(...faces.map(own));
        const top = faces.filter((f) => own(f) === best);
        face = top[Math.floor(rng() * top.length)];
      }
      let qty = 1;
      while (qty + 1 <= total && probTrue(qty + 1, face) >= P.openTarget) qty++;
      if (rng() < 0.3) qty = Math.max(1, qty - 1);
      return { type: 'bid', qty, face };
    }

    const pt = probTrue(bid.qty, bid.face);
    const noise = (rng() - 0.5) * 0.08;

    // Candidate raises: the minimum raise for each number, plus jumps of one or two.
    const cands = [];
    faces.forEach((f) => {
      const q0 = E.minQtyForFace(state, f);
      [0, 1, 2].forEach((j) => {
        const q = q0 + j;
        if (q <= total) cands.push({ qty: q, face: f, jump: j, p: probTrue(q, f) });
      });
    });
    if (!cands.length) return { type: 'liar' };

    let choice = null;
    if (rng() < P.bluff) {
      const bluffs = cands.filter((c) => c.jump === 0 && own(c.face) === 0 && c.p > 0.22);
      if (bluffs.length) choice = bluffs[Math.floor(rng() * bluffs.length)];
    }
    if (!choice && rng() < P.jump) {
      // Jump the quantity to put pressure on the next player.
      const jumps = cands.filter((c) => c.jump > 0 && c.p > 0.3).sort((a, b) => b.p - a.p);
      if (jumps.length) choice = jumps[0];
    }
    if (!choice) {
      cands.forEach((c) => {
        c.score = c.p + own(c.face) * 0.02 + (rng() - 0.5) * 0.1 - (c.jump ? 0.3 * c.jump : 0);
      });
      cands.sort((a, b) => b.score - a.score);
      choice = cands[0];
    }

    // Challenge when the bid looks unlikely, when calling clearly beats raising, or when the
    // only raises left are too risky for this style.
    if (pt < P.callAt + noise) return { type: 'liar' };
    if (1 - pt > choice.p + P.margin) return { type: 'liar' };
    if (choice.p < P.raiseFloor && 1 - pt > 0.25) return { type: 'liar' };
    return { type: 'bid', qty: choice.qty, face: choice.face };
  }

  // Think time so bots feel human.
  const thinkMs = () => 900 + Math.random() * 1400;

  // Odds that a bid is true from one player's point of view: their own dice, plus the same read
  // on other players' bids that the bots use.
  function estimate(state, idx, qty, face) {
    const me = state.players[idx];
    if (!me || !me.dice) return null;
    const wild = E.onesWild(state);
    const unknown = E.totalDice(state) - me.dice.length;
    const own = me.dice.filter((d) => E.matches(d, face, wild)).length;
    return tail(unknown, wild && face !== 1 ? 1 / 3 : 1 / 6, qty - own - bidRead(state, idx, face));
  }

  return { decide, estimate, PERSONALITIES, BOT_ROSTER, thinkMs };
});
