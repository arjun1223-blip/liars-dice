// Liar's Dice game engine — shared by the browser (single player) and the server (multiplayer).
//
// Rules:
//  - Each player has five dice. Everyone rolls one die; the highest roll opens. Play goes to the left.
//  - On your turn you must raise the bid or call "liar" (no passing).
//  - Standard mode: raising the quantity may use any number (even a lower one). Raising the number
//    requires the same or a greater quantity.
//  - Hard mode: the number on the dice can never go down. You may raise the quantity, the number,
//    or both, but never bid a lower number than the current bid.
//  - Ones are wild. Nobody may open a round by bidding ones (outside palafico).
//  - On "liar", every die showing the bid number plus every one is counted. If the total is equal
//    to or greater than the bid, the challenger loses a die; otherwise the bidder loses a die.
//  - The player who lost a die opens the next round. If they are out, the player to their left opens.
//  - Palafico: while any player is down to one die (any number of players, including heads-up), every round
//    is a palafico round. A one-die player opens it; with several one-die players, the opener moves
//    clockwise from the previous round's opener to the next one-die player. In a palafico round ones
//    may be bid to open and are NOT wild, and the number may not change from the opening bid.
//  - The last player with dice wins.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiarsEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DICE_PER_PLAYER = 5;
  const MODES = ['standard', 'hard'];

  const rollDie = (rng) => 1 + Math.floor(rng() * 6);

  function log(state, text) {
    state.log.push({ ts: Date.now(), text });
    if (state.log.length > 80) state.log.shift();
  }

  function totalDice(state) {
    return state.players.reduce((s, p) => s + p.diceCount, 0);
  }

  function aliveCount(state) {
    return state.players.filter((p) => p.diceCount > 0).length;
  }

  function nextAlive(state, i) {
    const n = state.players.length;
    for (let k = 1; k <= n; k++) {
      const j = (i + k) % n;
      if (state.players[j].diceCount > 0) return j;
    }
    return i;
  }

  // Ones are wild except in a palafico round.
  const onesWild = (state) => !state.palafico;

  // Does a die count toward a bid on `face`?
  function matches(die, face, wild) {
    return die === face || (wild && die === 1 && face !== 1);
  }

  // Palafico is in effect while someone is down to one die (including two-player endgames).
  function palaficoActive(state) {
    return aliveCount(state) >= 2 && state.players.some((p) => p.diceCount === 1);
  }

  // Everyone rolls one die; highest goes first. Ties re-roll among the tied players.
  function rollForFirst(state, rng) {
    let contenders = state.players.map((p, i) => i);
    const lines = [];
    for (;;) {
      const rolls = contenders.map((i) => ({ i, r: rollDie(rng) }));
      lines.push(rolls.map((x) => `${state.players[x.i].name} ${x.r}`).join(', '));
      const best = Math.max(...rolls.map((x) => x.r));
      const top = rolls.filter((x) => x.r === best).map((x) => x.i);
      if (top.length === 1) {
        state.firstRoll = { lines, winner: top[0], roll: best };
        return top[0];
      }
      contenders = top;
    }
  }

  function createGame(players, opts, rng) {
    if (typeof opts === 'function') { rng = opts; opts = null; }
    opts = opts || {};
    rng = rng || Math.random;
    const state = {
      mode: MODES.includes(opts.mode) ? opts.mode : 'standard',
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: !!p.isBot,
        personality: p.personality || null,
        diceCount: DICE_PER_PLAYER,
        dice: [],
      })),
      phase: 'bidding',
      round: 0,
      turn: 0,
      lastStarter: 0,
      palafico: false,
      palaficoPlayer: null,
      currentBid: null,
      bidHistory: [],
      lastResult: null,
      winner: null,
      eliminated: [],
      outRound: {},
      firstRoll: null,
      log: [],
    };
    log(state, `New game (${state.mode === 'hard' ? 'Hard' : 'Standard'} mode)! ${state.players.length} players, ${DICE_PER_PLAYER} dice each.`);
    const first = rollForFirst(state, rng);
    state.firstRoll.lines.forEach((l, k) => log(state, `${k ? 'Tie! Re-roll' : 'Roll for first'}: ${l}.`));
    log(state, `${state.players[first].name} rolled highest and goes first.`);
    startRound(state, first, rng, false);
    return state;
  }

  function startRound(state, starter, rng, palafico) {
    rng = rng || Math.random;
    state.round++;
    state.players.forEach((p) => {
      p.dice = Array.from({ length: p.diceCount }, () => rollDie(rng)).sort((a, b) => a - b);
    });
    if (state.players[starter].diceCount === 0) starter = nextAlive(state, starter);
    state.turn = starter;
    state.lastStarter = starter;
    state.palafico = !!palafico && palaficoActive(state);
    state.palaficoPlayer = state.palafico ? starter : null;
    state.currentBid = null;
    state.bidHistory = [];
    state.lastResult = null;
    state.phase = 'bidding';
    log(state, `Round ${state.round}: ${totalDice(state)} dice on the table. ${state.players[starter].name} opens.`);
    if (state.palafico) {
      log(state, `PALAFICO round! ${state.players[starter].name} opens. Ones are not wild, and the number can't change.`);
    }
  }

  // Who opens the next round, and is it palafico?
  function planNext(state, loser) {
    const n = state.players.length;
    if (palaficoActive(state)) {
      for (let k = 1; k <= n; k++) {
        const j = (state.lastStarter + k) % n;
        if (state.players[j].diceCount === 1) return { starter: j, palafico: true };
      }
    }
    let s = loser;
    if (state.players[s].diceCount === 0) s = nextAlive(state, s);
    return { starter: s, palafico: false };
  }

  // Is `face` allowed at all for the next bid?
  function faceAllowed(state, face) {
    const b = state.currentBid;
    if (face < 1 || face > 6) return false;
    if (state.palafico) return !b || face === b.face;
    if (!b) return face !== 1;
    if (state.mode === 'hard' && face < b.face) return false;
    return true;
  }

  // Smallest legal quantity for a given face given the current bid.
  function minQtyForFace(state, face) {
    const b = state.currentBid;
    if (!b) return 1;
    return face > b.face ? b.qty : b.qty + 1;
  }

  function validateBid(state, qty, face) {
    if (!Number.isInteger(qty) || !Number.isInteger(face)) return 'Invalid bid.';
    if (face < 1 || face > 6) return 'The number must be 1–6.';
    if (!faceAllowed(state, face)) {
      if (state.palafico) return `Palafico round: the number must stay at ${state.currentBid.face}s.`;
      if (!state.currentBid) return "You can't open a round by bidding ones.";
      return `Hard mode: the number can't go below ${state.currentBid.face}s.`;
    }
    if (qty < 1) return 'Quantity must be at least 1.';
    if (qty > totalDice(state)) return `There are only ${totalDice(state)} dice in play.`;
    if (qty < minQtyForFace(state, face)) {
      return 'Raise the quantity, or bid a higher number with the same or greater quantity.';
    }
    return null;
  }

  function countFace(state, face) {
    const wild = onesWild(state);
    let c = 0;
    state.players.forEach((p) => p.dice.forEach((d) => { if (matches(d, face, wild)) c++; }));
    return c;
  }

  const plural = (q, f) => `${q} × ${f}${q === 1 ? '' : 's'}`;

  // Apply an action from the player at `idx`. Returns null on success or an error string.
  function act(state, idx, action) {
    if (state.phase !== 'bidding') return 'Not accepting moves right now.';
    if (idx !== state.turn) return "It's not your turn.";
    const me = state.players[idx];
    if (!action || typeof action.type !== 'string') return 'Bad action.';

    if (action.type === 'bid') {
      const qty = Number(action.qty), face = Number(action.face);
      const err = validateBid(state, qty, face);
      if (err) return err;
      state.currentBid = { qty, face, player: idx };
      state.bidHistory.push({ qty, face, player: idx });
      log(state, `${me.name} bids ${plural(qty, face)}.`);
      state.turn = nextAlive(state, idx);
      return null;
    }
    if (action.type === 'liar') {
      if (!state.currentBid) return 'There is no bid to challenge yet.';
      resolve(state, idx);
      return null;
    }
    return 'Unknown action.';
  }

  function resolve(state, caller) {
    const bid = state.currentBid;
    const wild = onesWild(state);
    const actual = countFace(state, bid.face);
    const hands = state.players.map((p) => p.dice.slice());
    const callerName = state.players[caller].name;
    const bidderName = state.players[bid.player].name;

    const success = actual < bid.qty; // the challenger was right
    const loser = success ? bid.player : caller;
    log(state, `${callerName} calls LIAR on ${bidderName}'s ${plural(bid.qty, bid.face)}. There were ${actual}${wild && bid.face !== 1 ? ' (counting ones)' : ''}.`);

    const lp = state.players[loser];
    lp.diceCount--;
    log(state, `${lp.name} loses a die.`);
    const eliminated = [];
    if (lp.diceCount === 0) {
      eliminated.push(loser);
      state.eliminated.push(loser);
      state.outRound[loser] = state.round;
      log(state, `${lp.name} is out of dice!`);
    }

    const done = aliveCount(state) <= 1;
    const plan = done ? { starter: loser, palafico: false } : planNext(state, loser);

    state.lastResult = {
      type: 'liar', caller, bidder: bid.player, bid, actual, hands, wild,
      losers: [loser], eliminated, success,
      nextStarter: plan.starter, palaficoNext: plan.palafico,
    };

    if (done) {
      state.phase = 'gameover';
      state.winner = state.players.findIndex((p) => p.diceCount > 0);
      log(state, `${state.players[state.winner].name} wins the game!`);
    } else {
      state.phase = 'reveal';
    }
  }

  function nextRound(state, rng) {
    if (state.phase !== 'reveal') return 'Not in reveal phase.';
    const r = state.lastResult;
    startRound(state, r.nextStarter, rng, r.palaficoNext);
    return null;
  }

  // Final ranking: winner first, then players in reverse order of elimination.
  function standings(state) {
    if (state.winner == null) return [];
    return [state.winner].concat(state.eliminated.slice().reverse());
  }

  // What a given player is allowed to see: everyone else's dice are hidden during bidding.
  function viewFor(state, playerId) {
    const v = JSON.parse(JSON.stringify(state));
    v.players.forEach((p) => {
      if (state.phase === 'bidding' && p.id !== playerId) p.dice = null;
      delete p.personality;
    });
    v.totalDice = totalDice(state);
    return v;
  }

  return {
    DICE_PER_PLAYER, MODES, createGame, startRound, nextRound, act, viewFor, standings,
    validateBid, faceAllowed, minQtyForFace, onesWild, matches, countFace, totalDice, aliveCount,
    nextAlive, palaficoActive, plural,
  };
});
