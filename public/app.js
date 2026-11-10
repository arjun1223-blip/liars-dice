/* Liar's Dice: browser client. Single player runs locally; multiplayer talks to server.js over WebSockets. */
(function () {
  'use strict';
  const E = window.LiarsEngine, B = window.LiarsBots, C = window.Crew, S = window.Sound;
  const $ = (s) => document.querySelector(s);
  const setHTML = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, area = localStorage) { try { return JSON.parse(area.getItem(k)); } catch { return null; } },
    set(k, v, area = localStorage) { try { area.setItem(k, JSON.stringify(v)); } catch {} },
    del(k, area = localStorage) { try { area.removeItem(k); } catch {} },
  };
  const ss = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const online = location.protocol === 'http:' || location.protocol === 'https:';

  // ---------- dice ----------
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function die(face, cls = '', style = '') {
    if (!face) return `<span class="die hidden ${cls}" style="${style}"></span>`;
    let cells = '';
    for (let i = 0; i < 9; i++) cells += `<i class="${PIPS[face].includes(i) ? 'p' : ''}"></i>`;
    return `<span class="die ${face === 1 ? 'one' : ''} ${cls}" style="${style}">${cells}</span>`;
  }

  // ---------- avatars ----------
  const avCache = {};
  const baseName = (n) => n.replace(/ \(bot\)$/, '');
  const isCrew = (p) => p && p.isBot && !!C.CREW[p.name];
  function avatarSVG(p) {
    const key = (p.isBot ? 'b:' : 'h:') + baseName(p.name);
    return avCache[key] || (avCache[key] = C.avatarSVG(C.lookFor(baseName(p.name), p.isBot && !!C.CREW[p.name])));
  }
  const avatar = (p, cls = '', mood = 'neutral') => `<span class="av ${cls}" data-mood="${mood}">${avatarSVG(p)}</span>`;

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // ---------- app state ----------
  let mode = null;   // 'solo' | 'online' | null
  let view = null;   // { you, game, room }
  const ui = {
    qty: 1, face: 2, turnKey: null, roundKey: null, showOdds: !!store.get('ld_odds'),
    screen: 'home', modeSel: store.get('ld_mode') === 'hard' ? 'hard' : 'standard', modeFor: 'solo',
    prev: null, fx: {}, lossKey: null, pilePending: 0, overTimer: null, overShown: null, rollStart: 0,
  };

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const myName = () => $('#nameInput').value.trim().slice(0, 16) || 'You';

  // ---------- screens ----------
  function show(id) {
    ui.screen = id;
    ['home', 'modes', 'lobby', 'game'].forEach((s) => { $('#' + s).hidden = s !== id; });
    document.querySelector('.sound-btn.floating').hidden = id === 'game';
  }

  function goHome() {
    mode = null; view = null;
    solo.stop();
    hideOver();
    ui.prev = null;
    show('home');
    history.replaceState(null, '', location.pathname);
  }

  function openModes(forWhat) {
    ui.modeFor = forWhat;
    $('#modesSub').textContent = forWhat === 'solo'
      ? 'Ye and three rogues of the crew. Pick how the bidding works.'
      : `Yer crew of ${view.room.players.length} is ready. Pick how the bidding works.`;
    document.querySelectorAll('.mode-card').forEach((c) => c.classList.toggle('sel', c.dataset.mode === ui.modeSel));
    hideOver();
    show('modes');
  }

  // ---------- single player ----------
  const solo = {
    game: null, timer: null, mode: 'standard',
    start(gameMode) {
      this.stop();
      if (gameMode) this.mode = gameMode;
      const name = myName();
      // Fresh crew each game: shuffle properly, and put last game's opponents at the back of the line.
      const last = store.get('ld_last_crew') || [];
      const pool = shuffle(B.BOT_ROSTER.filter((b) => b.name !== name));
      pool.sort((a, b) => (last.includes(a.name) ? 1 : 0) - (last.includes(b.name) ? 1 : 0));
      const roster = pool.slice(0, 3);
      store.set('ld_last_crew', roster.map((b) => b.name));
      const players = [{ id: 'me', name }].concat(roster.map((b, i) => ({ id: 'bot' + i, name: b.name, personality: b.personality, isBot: true })));
      this.game = E.createGame(players, { mode: this.mode });
      this.chat = [];
      mode = 'solo';
      ui.prev = null;
      hideOver();
      show('game');
      this.update();
    },
    stop() { clearTimeout(this.timer); this.timer = null; clearTimeout(ui.overTimer); },
    update() {
      view = { you: 'me', game: E.viewFor(this.game, 'me'), room: null };
      render();
      clearTimeout(this.timer);
      const g = this.game;
      if (g.phase === 'bidding' && g.players[g.turn].isBot) {
        this.timer = setTimeout(() => { E.act(g, g.turn, B.decide(g, g.turn)); this.update(); }, B.thinkMs());
      }
    },
    action(a) {
      const err = E.act(this.game, this.game.players.findIndex((p) => p.id === 'me'), a);
      if (err) return toast(err);
      this.update();
    },
    next() { E.nextRound(this.game); this.update(); },
    // You're out (or the game ended): play out the remaining rounds instantly and show the result.
    finish() {
      clearTimeout(this.timer);
      const g = this.game;
      let guard = 0;
      while (g.phase !== 'gameover' && guard++ < 20000) {
        if (g.phase === 'reveal') E.nextRound(g);
        else E.act(g, g.turn, B.decide(g, g.turn));
      }
      showOver(g, 'me');
    },
    again() { this.start(); },
    chatMsg(text) { this.chat.push({ ts: Date.now(), from: this.game.players[0].name, text }); this.update(); },
  };

  // ---------- multiplayer ----------
  const net = {
    ws: null, queue: [], code: null, token: null, retry: 0, wantRoom: false, clockOffset: 0,
    connect() {
      if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        $('#banner').hidden = true;
        if (this.wantRoom && this.code && this.token) ws.send(JSON.stringify({ t: 'rejoin', code: this.code, token: this.token }));
        this.queue.splice(0).forEach((m) => ws.send(JSON.stringify(m)));
      };
      ws.onmessage = (e) => this.handle(JSON.parse(e.data));
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (this.wantRoom) {
          $('#banner').hidden = false;
          setTimeout(() => this.connect(), Math.min(5000, 800 * ++this.retry));
        }
      };
    },
    send(m) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
      else { this.queue.push(m); this.connect(); }
    },
    handle(m) {
      switch (m.t) {
        case 'joined':
          this.code = m.code; this.token = m.token; this.wantRoom = true;
          store.set('ld_session', { code: m.code, token: m.token }, ss);
          history.replaceState(null, '', '?room=' + m.code);
          mode = 'online';
          break;
        case 'state':
          if (m.serverNow) this.clockOffset = m.serverNow - Date.now();
          view = { you: m.you, game: m.game, room: m.room };
          mode = 'online';
          render();
          break;
        case 'error':
          toast(m.message);
          break;
        case 'kicked':
          this.reset(); goHome();
          toast('The captain removed ye from the room.');
          break;
        case 'rejoinFailed':
          this.reset();
          if (mode === 'online') { goHome(); toast('That room has closed.'); }
          break;
      }
    },
    leave() { this.send({ t: 'leave' }); this.reset(); goHome(); },
    reset() {
      this.wantRoom = false; this.code = null; this.token = null;
      store.del('ld_session', ss);
      $('#banner').hidden = true;
    },
  };

  // Unified controller used by the UI.
  const ctl = {
    action(a) { mode === 'solo' ? solo.action(a) : net.send({ t: 'action', action: a }); },
    next() { mode === 'solo' ? solo.next() : net.send({ t: 'next' }); },
    again() { mode === 'solo' ? solo.again() : net.send({ t: 'lobby' }); },
    rematch() { net.send({ t: 'rematch' }); },
    over() {
      clearTimeout(ui.overTimer);
      if (mode === 'solo') solo.finish();
      else showOver(view.game, view.you);
    },
    leave() {
      if (mode === 'solo') goHome();
      else if (mode === 'online') { if (!view?.room?.inGame || view.game?.phase === 'gameover' || confirm('Leave this game? A bot will take over yer seat.')) net.leave(); }
    },
  };

  // ---------- events: sounds & gestures ----------
  const gameKey = (g) => (g.log[0] ? g.log[0].ts : 0) + ':' + g.players.map((p) => p.id).join(',');
  const rerender = () => { if (view && ui.screen === 'game') renderGame(); };

  function react(g, idx, anim, mood, ms = 2400) {
    const p = g.players[idx];
    if (!p) return;
    const now = Date.now();
    ui.fx[p.id] = { anim, mood, start: now, until: now + ms };
    setTimeout(rerender, ms + 30);
  }
  const later = (ms, fn) => setTimeout(() => { fn(); rerender(); }, ms);

  function yourTurnAlert(ms) {
    setTimeout(() => {
      S.bell();
      try {
        const tapped = !navigator.userActivation || navigator.userActivation.hasBeenActive;
        if (navigator.vibrate && tapped && !S.muted) navigator.vibrate([40, 60, 40]); // Android only
      } catch (e) { /* not supported */ }
    }, ms);
  }

  function processEvents(g, myIdx) {
    const key = gameKey(g);
    const prev = ui.prev && ui.prev.key === key ? ui.prev : null;
    const cur = { key, round: g.round, bids: g.bidHistory.length, phase: g.phase, turn: g.turn };
    ui.prev = cur;
    if (!prev) {
      ui.fx = {}; ui.pilePending = 0; ui.overShown = null;
      if (g.phase !== 'gameover') hideOver(); // a new game (e.g. a rematch) started
      if (g.phase === 'bidding') { S.roundStart(); if (g.turn === myIdx) yourTurnAlert(1000); }
      return;
    }
    const newRound = g.round !== prev.round && g.phase === 'bidding';
    if (newRound) S.roundStart();
    else if (g.phase === 'bidding' && cur.bids > prev.bids) {
      S.bid();
      const b = g.bidHistory[cur.bids - 1];
      react(g, b.player, 'nod', null, 1200);
    }
    if (prev.phase === 'bidding' && g.phase !== 'bidding' && g.lastResult) {
      const r = g.lastResult;
      S.liar();
      react(g, r.caller, 'shout', 'shout', 1700);
      later(1300, () => {
        const loser = r.losers[0];
        react(g, loser, 'slump', 'frown', 2800);
        react(g, loser === r.caller ? r.bidder : r.caller, 'cheer', 'grin', 2600);
      });
      if (g.phase === 'gameover') later(2900, () => react(g, g.winner, 'cheer', 'grin', 5000));
      const meOut = myIdx >= 0 && g.players[myIdx].diceCount === 0;
      if (g.phase === 'gameover' || (mode === 'solo' && meOut)) {
        clearTimeout(ui.overTimer);
        ui.overTimer = setTimeout(() => ctl.over(), 3600);
      }
    }
    if (g.phase === 'bidding' && (g.turn !== prev.turn || newRound)) {
      if (g.turn === myIdx) yourTurnAlert(newRound ? 1000 : 150);
    }
  }

  // ---------- rendering ----------
  function render() {
    if (!view) return show('home');
    if (mode === 'online' && !view.room.inGame) {
      hideOver();
      ui.prev = null;
      renderLobby();
      if (ui.screen !== 'modes') show('lobby');
      return;
    }
    if (ui.screen !== 'game') show('game');
    renderGame();
  }

  function renderLobby() {
    const r = view.room, host = r.hostId === view.you;
    $('#lobbyCode').textContent = r.code;
    $('#playerCount').textContent = `(${r.players.length}/8)`;
    $('#playerList').innerHTML = r.players.map((p) => `
      <li>${avatar(p, 'sm')}<span class="name">${esc(p.name)}${p.id === view.you ? ' <span class="muted">(you)</span>' : ''}${isCrew(p) ? `<small>${esc(C.CREW[p.name].title)}</small>` : ''}</span>
        ${p.id === r.hostId ? '<span class="tag host">CAPTAIN</span>' : ''}
        ${p.isBot ? '<span class="tag">COMPUTER</span>' : ''}
        ${!p.isBot && !p.connected ? '<span class="tag off">AWAY</span>' : ''}
        ${host && p.id !== view.you ? `<button class="kick" data-kick="${p.id}" title="Remove">×</button>` : ''}
      </li>`).join('');
    $('#addBotBtn').hidden = !host;
    $('#addBotBtn').disabled = r.players.length >= 8;
    $('#startBtn').hidden = !host;
    $('#startBtn').disabled = r.players.length < 2;
    $('#startBtn').textContent = r.players.length < 2 ? 'Need 2+ players' : 'Start Game';
    $('#waitHost').hidden = host;
  }

  // Phone layout: compact seats, your own seat lives in the bottom panel, controls in thumb reach.
  const compactMQ = matchMedia('(max-width: 720px), (max-height: 520px)');
  const isCompact = () => compactMQ.matches;
  function seatBox(W) { return isCompact() ? { w: 82, h: 96 } : W < 560 ? { w: 100, h: 112 } : { w: 140, h: 138 }; }

  function renderGame() {
    const g = view.game, room = view.room;
    const myIdx = g.players.findIndex((p) => p.id === view.you);
    const me = g.players[myIdx];
    const isHost = mode === 'solo' || (room && room.hostId === view.you);
    const n = g.players.length;
    const res = g.lastResult;
    const revealing = g.phase !== 'bidding' && res;
    const now = Date.now();

    processEvents(g, myIdx);

    // Top bar
    setHTML($('#tbMode'), `${mode === 'solo' ? 'Solo game' : `Room ${room.code}`} <span class="mode-tag ${g.mode}">${g.mode === 'hard' ? 'Hard Mode' : 'Standard'}</span>`);
    setHTML($('#tbInfo'), `
      <span class="chip">Round <b>${g.round}</b></span>
      <span class="chip"><b>${g.totalDice}</b> dice in play</span>
      ${g.phase === 'bidding' && g.palafico ? '<span class="chip pal">PALAFICO: ones not wild</span>' : '<span class="chip">Ones wild</span>'}`);
    $('#oddsToggle').checked = ui.showOdds; $('#oddsToggle2').checked = ui.showOdds;
    syncSoundButtons();

    const lastBid = {};
    g.bidHistory.forEach((b) => { lastBid[b.player] = b; });

    // Seats
    const wrap = $('#tableWrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const box = seatBox(W);
    const compact = isCompact();
    const base = myIdx >= 0 ? myIdx : 0;
    let seatsHTML = '', bubblesHTML = '';
    g.players.forEach((p, i) => {
      if (compact && p.id === view.you) return; // shown in the bottom panel instead
      const rel = (i - base + n) % n;
      const a = (90 + rel * (360 / n)) * Math.PI / 180;
      const x = W / 2 + (W / 2 - box.w / 2 - 6) * Math.cos(a);
      const y = H / 2 + (H / 2 - box.h / 2 - 4) * Math.sin(a);
      const roomP = room && room.players.find((q) => q.id === p.id);
      const away = roomP ? !roomP.connected && !roomP.isBot : false;
      const isLoser = revealing && res.losers.includes(i);
      let dice, concealed = false;
      if (revealing) {
        const hand = res.hands[i];
        dice = hand.map((d, k) => die(d, (E.matches(d, res.bid.face, res.wild) ? 'hit' : 'dim') + (isLoser && k === hand.length - 1 ? ' gone' : ''))).join('');
      } else if (p.dice && p.id === view.you) {
        dice = p.dice.map((d) => die(d)).join('');
      } else {
        dice = Array.from({ length: p.diceCount }, () => die(0)).join('');
        concealed = true;
      }
      const out = p.diceCount === 0 && !(revealing && res.hands[i].length);
      const badge = isLoser ? '<span class="lose">−1</span>' : g.phase === 'gameover' && g.winner === i ? '<span class="lose good">WINNER</span>' : '';
      const fx = ui.fx[p.id] && ui.fx[p.id].until > now ? ui.fx[p.id] : null;
      const thinking = g.phase === 'bidding' && g.turn === i && p.id !== view.you;
      const anim = fx && fx.anim ? fx.anim : thinking ? 'think' : '';
      const delay = fx && fx.anim ? `animation-delay:-${now - fx.start}ms` : '';
      const mood = fx && fx.mood ? fx.mood : out ? 'frown' : 'neutral';
      const cls = ['seat', p.id === view.you ? 'me' : '', g.phase === 'bidding' && g.turn === i ? 'turn' : '', out ? 'out' : ''].join(' ');
      const label = isCrew(p) ? C.CREW[p.name].title : p.id === view.you ? 'That be you' : away ? 'Away (bot playing)' : 'Pirate';
      const b = lastBid[i];
      const seatBid = compact && b && g.phase === 'bidding'
        ? `<div class="seat-bid ${g.currentBid && g.currentBid.player === i ? 'latest' : ''}">${b.qty} × ${die(b.face)}</div>` : '';
      seatsHTML += `
        <div class="${cls}" data-seat="${i}" style="left:${x}px;top:${y}px">
          ${badge}
          <div class="av-wrap ${anim}" style="${delay}">${avatar(p, '', mood)}</div>
          <div class="plaque">
            <div class="nm" title="${esc(label)}">${esc(p.name)}${room && room.hostId === p.id ? ' <span class="crown">♛</span>' : ''}</div>
            <div class="dice ${concealed ? 'concealed' : ''}">${dice || '<span class="muted small">out</span>'}</div>
            <div class="count">${p.diceCount} ${p.diceCount === 1 ? 'die' : 'dice'}${away ? ' · away' : ''}</div>
            ${seatBid}
          </div>
        </div>`;
      if (b && g.phase === 'bidding' && !compact) {
        const bx = W / 2 + (x - W / 2) * 0.56, by = H / 2 + (y - H / 2) * 0.55;
        const latest = g.currentBid && g.currentBid.player === i;
        bubblesHTML += `<div class="bubble ${latest ? 'latest' : ''}" style="left:${bx}px;top:${by}px">${b.qty} × ${die(b.face)}</div>`;
      }
    });
    setHTML($('#seats'), seatsHTML);
    setHTML($('#bubbles'), bubblesHTML);

    renderCenter(g, room, myIdx, me, isHost);
    renderPile(g);
    renderHand(g, me, myIdx);
    renderControls(g, me, myIdx, room, isHost);
    renderFeed(g, room);

    // Lost-die animation: fly the die from the loser's seat to the pile in the middle.
    if (revealing) {
      const lk = gameKey(g) + ':' + g.round;
      if (ui.lossKey !== lk) {
        ui.lossKey = lk;
        res.losers.forEach((li) => flyDie(li, res.hands[li][res.hands[li].length - 1], g));
      }
    }
  }

  function renderCenter(g, room, myIdx, me, isHost) {
    const center = $('#center');
    const res = g.lastResult;
    if (g.phase === 'bidding') {
      const turnP = g.players[g.turn];
      const yourTurn = g.turn === myIdx;
      const bid = g.currentBid;
      const ones = g.players.filter((p) => p.diceCount === 1);
      const compact = isCompact();
      const pal = g.palafico && compact
        ? `<div class="palafico"><b>Palafico!</b> Ones not wild${bid ? `, ${bid.face}s only` : ''}.</div>`
        : g.palafico
        ? `<div class="palafico"><b>Palafico round!</b> ${esc(g.players[g.palaficoPlayer].name)} opens${ones.length > 1 ? ` (one die: ${ones.map((p) => esc(p.name)).join(', ')})` : ''}.<br>Ones are not wild, and the number can't change${bid ? ` from ${bid.face}s` : ' after the opening bid'}.</div>`
        : '';
      const first = g.round === 1 && !bid && g.firstRoll && !compact
        ? `<div class="by">${esc(g.players[g.firstRoll.winner].name)} rolled a ${g.firstRoll.roll}, the highest, and goes first.</div>`
        : '';
      setHTML(center, pal + first + (bid
        ? `<div class="lbl">Current bid</div>
           <div class="bigbid">${bid.qty} × ${die(bid.face)}</div>
           <div class="by">by ${esc(g.players[bid.player].name)}</div>
           <div class="status ${yourTurn ? 'you' : ''}">${yourTurn ? 'Yer turn: raise or call!' : esc(turnP.name) + ' is thinking…'}</div>`
        : `<div class="lbl">Round ${g.round}</div>
           <div class="status ${yourTurn ? 'you' : ''}">${yourTurn ? 'Yer turn: open the bidding!' : esc(turnP.name) + ' opens the bidding…'}</div>`));
      return;
    }
    if (!res) { setHTML(center, ''); return; }
    const caller = g.players[res.caller].name, bidder = g.players[res.bidder].name;
    const faceWord = res.bid.face + (res.actual === 1 ? '' : 's');
    const loserP = g.players[res.losers[0]];
    let outcome = res.success
      ? `<b>${esc(caller)}</b> was right. ${esc(bidder)} loses a die.`
      : `The bid was good. <b>${esc(caller)}</b> loses a die.`;
    if (res.eliminated.length) outcome += `<br><b>${esc(loserP.name)}</b> is out of dice!`;
    else if (res.palaficoNext && g.phase !== 'gameover') outcome += `<br>Next round is <b>palafico</b>: ${esc(g.players[res.nextStarter].name)} opens.`;
    const footer = isCompact() ? '' : revealFooter(g, room, me, isHost);
    if (isCompact()) {
      const loserName = esc(loserP.name);
      let note = res.eliminated.length ? `<br><b>${loserName}</b> is out!`
        : res.palaficoNext && g.phase !== 'gameover' ? `<br>Palafico next: ${esc(g.players[res.nextStarter].name)} opens.` : '';
      setHTML(center, `
        <div class="stamp">LIAR!</div>
        <div class="result">${esc(caller)} called ${esc(bidder)}'s <b>${res.bid.qty} × ${res.bid.face}s</b>. There ${res.actual === 1 ? 'was' : 'were'} <b>${res.actual}</b>.<br>
          ${res.success ? 'Caught bluffing!' : 'The bid was good.'} <b>${loserName}</b> −1${note}</div>`);
      tickCountdowns();
      return;
    }
    setHTML(center, `
      <div class="stamp">LIAR!</div>
      <div class="result">${esc(caller)} challenged ${esc(bidder)}'s <b>${res.bid.qty} × ${res.bid.face}s</b>.<br>
        There ${res.actual === 1 ? 'was' : 'were'} <b>${res.actual}</b> ${faceWord}${res.wild && res.bid.face !== 1 ? ' (counting 1s)' : ''}.<br>${outcome}</div>
      ${footer}`);
    tickCountdowns();
  }

  // Buttons shown after a "Liar!" call: next round, results, or the auto-advance countdown.
  function revealFooter(g, room, me, isHost) {
    const meOut = me && me.diceCount === 0;
    let footer = '';
    if (g.phase === 'gameover' || (mode === 'solo' && meOut)) {
      footer = `<button class="btn primary" id="overBtn">${g.phase === 'gameover' ? 'See the results' : 'Continue'}</button>`;
    } else {
      footer = isHost ? '<button class="btn primary" id="nextBtn">Next round</button>' : '';
      if (mode === 'online' && room.revealEndsAt) footer += `<div class="countdown" data-ends="${room.revealEndsAt}"></div>`;
    }
    return footer;
  }

  // The pile of lost dice in the middle of the table.
  function pileSlot(k) {
    const a = k * 2.39996, r = 7 * Math.sqrt(k + 1);
    return { x: Math.cos(a) * r * 2.1, y: Math.sin(a) * r * 1.0, rot: (k * 47) % 360, face: 1 + ((k * 7 + 3) % 6) };
  }
  function renderPile(g) {
    const lost = g.players.length * E.DICE_PER_PLAYER - g.totalDice - ui.pilePending;
    let html = '';
    for (let k = 0; k < Math.max(0, lost); k++) {
      const s = pileSlot(k);
      html += die(s.face, 'pile-die', `transform:translate(${s.x}px,${s.y}px) rotate(${s.rot}deg)`);
    }
    $('#pile').innerHTML = html;
  }
  function flyDie(idx, face, g) {
    const wrap = $('#tableWrap');
    const seat = wrap.querySelector(`[data-seat="${idx}"]`);
    const src = seat ? (seat.querySelector('.dice .die.gone') || seat.querySelector('.dice .die:last-child'))
      : g.players[idx].id === view.you ? $('#hand .dice .die:last-child') : null;
    if (!src) return;
    const wr = wrap.getBoundingClientRect(), sr = src.getBoundingClientRect();
    const sx = sr.left - wr.left, sy = sr.top - wr.top;
    const lost = g.players.length * E.DICE_PER_PLAYER - g.totalDice;
    const slot = pileSlot(Math.max(0, lost - 1));
    const tx = wr.width / 2 + slot.x - sr.width / 2, ty = wr.height / 2 + slot.y - sr.height / 2;
    const el = document.createElement('div');
    el.className = 'flyer';
    el.style.left = sx + 'px'; el.style.top = sy + 'px';
    el.style.setProperty('--s', sr.width + 'px');
    el.innerHTML = die(face);
    $('#fxLayer').appendChild(el);
    ui.pilePending++;
    renderPile(g);
    const dx = tx - sx, dy = ty - sy;
    const anim = el.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) rotate(380deg) scale(2)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${720 + slot.rot}deg) scale(.9)`, opacity: 1 },
    ], { duration: 1150, delay: 700, easing: 'cubic-bezier(.3,.6,.35,1)', fill: 'both' });
    S.lostDie(1.75);
    anim.onfinish = () => {
      el.remove();
      ui.pilePending = Math.max(0, ui.pilePending - 1);
      if (view) renderPile(view.game);
    };
  }

  function renderHand(g, me, myIdx) {
    const hand = $('#hand');
    if (!me) { setHTML(hand, '<div class="lbl">Spectating</div>'); return; }
    if (ui.roundKey !== g.round && g.phase === 'bidding') { ui.roundKey = g.round; ui.rollStart = Date.now(); }
    const since = Date.now() - ui.rollStart;
    const animate = g.phase === 'bidding' && since < 1800;
    const res = g.lastResult;
    let dice = g.phase === 'bidding' ? me.dice : res ? res.hands[myIdx] : me.dice;
    dice = dice || [];
    setHTML(hand, `<div class="lbl">Yer dice</div><div class="dice">${
      dice.length
        ? dice.map((d, i) => die(d, animate ? 'rolling' : g.phase !== 'bidding' && res ? (E.matches(d, res.bid.face, res.wild) ? 'hit' : 'dim') : '', animate ? `animation-delay:${700 + i * 70 - since}ms` : '')).join('')
        : '<span class="wait-msg">Ye be out of dice.</span>'
    }</div>`);
  }

  function renderControls(g, me, myIdx, room, isHost) {
    const c = $('#controls');
    const yourTurn = g.phase === 'bidding' && g.turn === myIdx && me && me.diceCount > 0;
    if (isCompact() && g.phase !== 'bidding' && g.lastResult) {
      setHTML(c, `<div class="reveal-actions">${revealFooter(g, room, me, isHost) || '<span class="wait-msg">Next round coming up…</span>'}</div>`);
      tickCountdowns();
      return;
    }
    if (!me || (me.diceCount === 0 && g.phase === 'bidding')) { setHTML(c, ''); return; }
    const total = g.totalDice;

    // Reset the selection when it becomes your turn.
    const turnKey = `${g.round}:${g.bidHistory.length}:${yourTurn}`;
    if (turnKey !== ui.turnKey) {
      ui.turnKey = turnKey;
      if (yourTurn) {
        if (g.currentBid) ui.face = g.currentBid.face;
        else {
          const wild = E.onesWild(g);
          const own = (f) => me.dice.filter((d) => E.matches(d, f, wild)).length;
          ui.face = 0;
          for (let f = 1; f <= 6; f++) if (E.faceAllowed(g, f) && (!ui.face || own(f) > own(ui.face))) ui.face = f;
        }
        ui.qty = E.minQtyForFace(g, ui.face);
        if (ui.qty > total) { ui.face = 6; ui.qty = E.minQtyForFace(g, 6); }
      }
    }
    if (!E.faceAllowed(g, ui.face)) { for (let f = 6; f >= 1; f--) if (E.faceAllowed(g, f)) ui.face = f; }
    const minQ = E.minQtyForFace(g, ui.face);
    if (ui.qty < minQ) ui.qty = minQ;
    if (ui.qty > total) ui.qty = total;

    const err = E.validateBid(g, ui.qty, ui.face);
    let faces = '';
    for (let f = 1; f <= 6; f++) {
      const can = yourTurn && E.faceAllowed(g, f) && E.minQtyForFace(g, f) <= total;
      faces += `<button data-face="${f}" class="${f === ui.face ? 'sel' : ''}" ${can ? '' : 'disabled'} title="${f}s">${die(f)}</button>`;
    }

    let hint = '';
    if (yourTurn) {
      if (err) hint = esc(err);
      else if (ui.showOdds) {
        const pBid = B.estimate(g, myIdx, ui.qty, ui.face);
        hint = `Yer bid holds: <span class="odds">${Math.round(pBid * 100)}%</span>`;
        if (g.currentBid) {
          const pCur = B.estimate(g, myIdx, g.currentBid.qty, g.currentBid.face);
          hint += ` · Current bid is a lie: <span class="odds">${Math.round((1 - pCur) * 100)}%</span>`;
        }
      }
    } else if (g.phase === 'bidding') {
      hint = `<span class="wait-msg">Waiting for ${esc(g.players[g.turn].name)}…</span>`;
    }

    setHTML(c, `
      <div class="bidder">
        <div class="stepper">
          <button data-q="-1" ${yourTurn && ui.qty > minQ ? '' : 'disabled'} aria-label="Fewer">−</button>
          <span class="q">${ui.qty}</span>
          <button data-q="1" ${yourTurn && ui.qty < total ? '' : 'disabled'} aria-label="More">+</button>
        </div>
        <span class="times">×</span>
        <div class="faces">${faces}</div>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="bid" ${yourTurn && !err ? '' : 'disabled'}>Bid</button>
        <button class="btn danger" data-act="liar" ${yourTurn && g.currentBid ? '' : 'disabled'}>Liar!</button>
      </div>
      <div class="hint">${hint}</div>`);
  }

  function renderFeed(g, room) {
    const feed = $('#feed');
    const chat = mode === 'solo' ? solo.chat : room.chat;
    const items = g.log.map((l) => ({ ts: l.ts, html: `<div class="ev">${esc(l.text)}</div>` }))
      .concat(chat.map((c) => ({ ts: c.ts, html: c.from ? `<div class="msg"><b>${esc(c.from)}:</b> ${esc(c.text)}</div>` : `<div class="sys">${esc(c.text)}</div>` })))
      .sort((a, b) => a.ts - b.ts);
    const meP = g.players.find((p) => p.id === view.you);
    const said = chat.filter((c) => c.from && (!meP || c.from !== meP.name)).length;
    if (ui.chatSeen == null || said < ui.chatSeen || $('#game').classList.contains('log-open')) ui.chatSeen = said;
    const unread = said - ui.chatSeen;
    $('#logBadge').hidden = unread <= 0;
    $('#logBadge').textContent = unread > 9 ? '9+' : unread;
    const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
    feed.innerHTML = items.map((i) => i.html).join('');
    if (atBottom) feed.scrollTop = feed.scrollHeight;
  }

  function tickCountdowns() {
    document.querySelectorAll('[data-ends]').forEach((el) => {
      const left = Math.max(0, Math.ceil((+el.dataset.ends - (Date.now() + net.clockOffset)) / 1000));
      el.textContent = `Next round in ${left}s`;
    });
  }
  setInterval(tickCountdowns, 500);

  // ---------- game over ----------
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function showOver(g, youId) {
    const key = gameKey(g);
    if (ui.overShown === key && !$('#overModal').hidden) return;
    ui.overShown = key;
    clearTimeout(ui.overTimer);
    const meIdx = g.players.findIndex((p) => p.id === youId);
    const w = g.players[g.winner];
    const won = g.winner === meIdx;
    const isHost = mode === 'solo' || (view.room && view.room.hostId === view.you);
    const outR = meIdx >= 0 ? g.outRound[meIdx] : null;
    const sub = won
      ? 'Ye outlasted the whole crew. The treasure be yers!'
      : `${outR ? `Ye ran out o' dice in round ${outR}. ` : ''}<b>${esc(w.name)}</b> won the game in round ${g.round}.`;
    const winTitle = isCrew(w) ? C.CREW[w.name].title : null;
    const rows = E.standings(g).map((i, rank) => {
      const p = g.players[i];
      const note = rank === 0 ? 'Winner' : `Out in round ${g.outRound[i]}`;
      return `<li class="${i === meIdx ? 'you' : ''}"><span class="rank">${ordinal(rank + 1)}</span>${avatar(p, 'sm', rank === 0 ? 'grin' : 'frown')}<span class="name">${esc(p.name)}${i === meIdx ? ' (you)' : ''}</span><span class="muted small">${note}</span></li>`;
    }).join('');
    let buttons;
    if (mode === 'solo') {
      buttons = `<button class="btn primary big" id="againBtn">Play again</button>
                 <button class="btn" id="changeModeBtn">Change mode</button>
                 <button class="btn ghost" id="menuBtn">Main menu</button>`;
    } else {
      buttons = (isHost
        ? '<button class="btn primary big" id="rematchBtn">Play again with the same people</button><button class="btn big" id="againBtn">Back to lobby</button>'
        : '<p class="muted">Waiting for the captain to start a rematch or head back to the lobby…</p>')
        + '<div class="over-minor"><button class="btn ghost sm" id="closeOverBtn">View table</button><button class="btn ghost sm" data-leave>Leave room</button></div>';
    }
    $('#overCard').innerHTML = `
      <svg class="over-skull"><use href="#jolly"/></svg>
      <h1 class="${won ? 'win' : ''}">${won ? 'VICTORY!' : 'GAME OVER'}</h1>
      <p class="over-sub">${sub}</p>
      <div class="over-winner">
        ${avatar(w, 'xl', 'grin')}
        <div><div class="muted small">CHAMPION OF THE TABLE</div><div class="over-name">${esc(w.name)}</div>
        ${winTitle ? `<div class="over-title">${esc(winTitle)}</div>` : ''}</div>
      </div>
      <ol class="standings">${rows}</ol>
      <div class="over-actions">${buttons}</div>`;
    $('#overModal').hidden = false;
    won ? S.win() : S.lose();
  }
  function hideOver() { $('#overModal').hidden = true; clearTimeout(ui.overTimer); }

  // ---------- table decorations (built once) ----------
  function buildDecor() {
    const coin = (x, y, size, rot, lift = 0) => `<svg class="coin" style="left:${x}%;top:calc(${y}% - ${lift}px);width:${size}px;height:${size}px;transform:translate(-50%,-50%) rotate(${rot}deg)"><use href="#coin"/></svg>`;
    const stack = (x, y, n, size) => Array.from({ length: n }, (_, k) => coin(x, y, size, k * 37, k * 3)).join('');
    // gold scattered on the deck around the table
    $('#deckDecor').innerHTML = [
      stack(4, 10, 4, 26), coin(8, 16, 20, 30), coin(3, 20, 16, 80),
      stack(95, 88, 5, 26), coin(91, 92, 20, 10), coin(97, 80, 18, 120),
      coin(96, 8, 18, 50), coin(2, 90, 20, 200), coin(6, 84, 15, 15),
    ].join('');
    // a few coins on the felt
    $('#feltDecor').innerHTML = [
      coin(16, 34, 18, 20), coin(19, 39, 15, 70), coin(83, 64, 18, 140), stack(80, 30, 3, 17), coin(28, 74, 14, 10),
    ].join('');
    // brass studs around the rim
    const rim = $('#rim');
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const s = document.createElement('span');
      s.className = 'stud';
      s.style.left = 50 + 49.1 * Math.cos(a) + '%';
      s.style.top = 50 + 48.2 * Math.sin(a) + '%';
      rim.appendChild(s);
    }
  }

  function syncSoundButtons() {
    document.querySelectorAll('[data-sound]').forEach((b) => {
      b.innerHTML = `<svg><use href="#${S.muted ? 'i-mute' : 'i-sound'}"/></svg>`;
      b.classList.toggle('off', S.muted);
    });
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-rules]');
    if (!t) return;
    if (t.matches('.btn') && !t.dataset.act) S.click();
    if (t.matches('[data-rules]')) { $('#rulesModal').hidden = false; return; }
    if (t.matches('[data-sound]')) { S.setMuted(!S.muted); syncSoundButtons(); if (!S.muted) S.click(); return; }
    if (t.matches('[data-leave]')) return ctl.leave();
    if (t.dataset.mode) {
      ui.modeSel = t.dataset.mode; store.set('ld_mode', ui.modeSel);
      document.querySelectorAll('.mode-card').forEach((c) => c.classList.toggle('sel', c.dataset.mode === ui.modeSel));
      S.click();
      return;
    }
    switch (t.id) {
      case 'logBtn': return toggleLog(true);
      case 'logClose': return toggleLog(false);
      case 'nextBtn': return ctl.next();
      case 'overBtn': return ctl.over();
      case 'againBtn': hideOver(); return ctl.again();
      case 'rematchBtn': hideOver(); return ctl.rematch();
      case 'changeModeBtn': hideOver(); return openModes('solo');
      case 'menuBtn': return goHome();
      case 'closeOverBtn': return hideOver();
    }
    if (t.dataset.face) { ui.face = +t.dataset.face; return renderGame(); }
    if (t.dataset.q) { ui.qty += +t.dataset.q; return renderGame(); }
    if (t.dataset.act) {
      if (t.dataset.act === 'bid') ctl.action({ type: 'bid', qty: ui.qty, face: ui.face });
      else ctl.action({ type: t.dataset.act });
      return;
    }
    if (t.dataset.kick) return net.send({ t: 'kick', id: t.dataset.kick });
  });

  $('#rulesClose').onclick = () => { $('#rulesModal').hidden = true; };
  function toggleLog(open) {
    $('#game').classList.toggle('log-open', open);
    if (open) { const f = $('#feed'); f.scrollTop = f.scrollHeight; if (view) renderFeed(view.game, view.room); }
  }
  $('#drawerBackdrop').onclick = () => toggleLog(false);
  $('#rulesModal').onclick = (e) => { if (e.target.id === 'rulesModal') e.currentTarget.hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#rulesModal').hidden = true; });

  $('#oddsToggle').onchange = $('#oddsToggle2').onchange = (e) => { ui.showOdds = e.target.checked; store.set('ld_odds', ui.showOdds); if (view) renderGame(); };

  const nameInput = $('#nameInput');
  nameInput.value = store.get('ld_name') || '';
  nameInput.oninput = () => store.set('ld_name', nameInput.value.trim());

  const STYLE = { bold: 'Plays bold', cautious: 'Plays cautious', balanced: 'Plays balanced' };
  $('#crewPreview').innerHTML = Object.keys(C.CREW).map((name) => {
    const c = C.CREW[name], p = { name, isBot: true };
    const style = (B.BOT_ROSTER.find((b) => b.name === name) || {}).personality;
    return `<span class="crew-face" tabindex="0" aria-label="${esc(name)}: ${esc(c.bio)}">${avatar(p, 'sm')}
      <span class="crew-card" role="tooltip">${avatar(p, 'xl', 'grin')}
        <span class="cc-body"><b class="cc-name">${esc(name)}</b><span class="cc-title">${esc(c.title)}</span>
        <span class="cc-bio">${esc(c.bio)}</span>${style ? `<span class="cc-style">${STYLE[style]}</span>` : ''}</span>
      </span></span>`;
  }).join('');
  document.querySelectorAll('.logo-art .ld').forEach((el) => { el.innerHTML = die(+el.dataset.f); });

  $('#soloBtn').onclick = () => openModes('solo');
  $('#modesBack').onclick = () => (ui.modeFor === 'solo' ? goHome() : show('lobby'));
  $('#modesGo').onclick = () => {
    store.set('ld_mode', ui.modeSel);
    if (ui.modeFor === 'solo') solo.start(ui.modeSel);
    else { net.send({ t: 'start', mode: ui.modeSel }); show('lobby'); }
  };

  const needName = () => {
    if (nameInput.value.trim()) return false;
    toast('Enter yer name first.'); nameInput.focus(); return true;
  };
  $('#createBtn').onclick = () => { if (needName()) return; net.send({ t: 'create', name: myName() }); };
  const join = () => {
    if (needName()) return;
    const code = $('#codeInput').value.trim().toUpperCase();
    if (code.length < 4) return toast('Enter the room code.');
    net.send({ t: 'join', code, name: myName() });
  };
  $('#joinBtn').onclick = join;
  $('#codeInput').onkeydown = (e) => { if (e.key === 'Enter') join(); };
  $('#codeInput').oninput = (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };

  $('#addBotBtn').onclick = () => net.send({ t: 'addBot' });
  $('#startBtn').onclick = () => openModes('online');

  const copy = (text, label) => {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => toast(`${label} copied!`))
      .catch(() => prompt('Copy this:', text));
  };
  $('#copyCodeBtn').onclick = () => copy(view.room.code, 'Room code');
  $('#copyLinkBtn').onclick = () => copy(`${location.origin}${location.pathname}?room=${view.room.code}`, 'Invite link');

  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('#chatInput');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    if (mode === 'solo') solo.chatMsg(text);
    else net.send({ t: 'chat', text });
  };

  window.addEventListener('resize', () => { if (view && ui.screen === 'game') renderGame(); });
  compactMQ.addEventListener('change', () => { if (view && ui.screen === 'game') renderGame(); });

  // ---------- boot ----------
  if ('serviceWorker' in navigator && online) navigator.serviceWorker.register('sw.js').catch(() => {});
  buildDecor();
  syncSoundButtons();
  if (!online) {
    $('#createBtn').disabled = true; $('#joinBtn').disabled = true; $('#codeInput').disabled = true;
    $('#offlineNote').hidden = false;
  } else {
    const params = new URLSearchParams(location.search);
    const roomParam = (params.get('room') || '').toUpperCase();
    const saved = store.get('ld_session', ss);
    if (saved && saved.code && (!roomParam || roomParam === saved.code)) {
      net.code = saved.code; net.token = saved.token; net.wantRoom = true;
      net.connect();
    } else if (roomParam) {
      $('#codeInput').value = roomParam;
      if (!nameInput.value) nameInput.focus();
    }
  }
  show('home');
})();
