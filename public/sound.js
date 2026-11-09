/* Pirate tavern sound effects, synthesized with the Web Audio API (no audio files needed). */
(function () {
  'use strict';
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('ld_muted') === '1'; } catch {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Browsers only allow audio after a user gesture.
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, ensure, { capture: true }));

  const ready = () => !muted && ensure() && ctx.state === 'running';

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  // Filtered noise burst: clicks, knocks, thuds, rattles.
  function noise(t, { freq = 2000, q = 4, type = 'bandpass', gain = 0.4, attack = 0.002, decay = 0.05 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, gain, attack, decay);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5, attack + decay + 0.05);
  }

  function tone(t, { freq = 440, to = null, type = 'sine', gain = 0.3, attack = 0.005, decay = 0.3, vibrato = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    if (vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + attack + decay + 0.05);
    }
    const g = ctx.createGain();
    env(g, t, gain, attack, decay);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + attack + decay + 0.05);
  }

  // ---------- effects ----------
  const fx = {
    // Dice rattling inside a leather cup.
    shake(t0) {
      const t = t0 || ctx.currentTime;
      noise(t, { freq: 500, q: 1.2, gain: 0.12, attack: 0.05, decay: 0.55 }); // hollow cup rumble
      for (let i = 0; i < 22; i++) {
        const at = t + 0.03 + Math.random() * 0.6;
        noise(at, { freq: 2200 + Math.random() * 2600, q: 6, gain: 0.12 + Math.random() * 0.2, decay: 0.025 + Math.random() * 0.03 });
      }
    },
    // Cup slammed down on the wooden table.
    slam(t0) {
      const t = t0 || ctx.currentTime;
      tone(t, { freq: 140, to: 45, gain: 0.8, attack: 0.003, decay: 0.22 });
      noise(t, { freq: 700, type: 'lowpass', q: 0.8, gain: 0.6, decay: 0.12 });
      noise(t + 0.004, { freq: 260, q: 2, gain: 0.35, decay: 0.18 });
      for (let i = 0; i < 4; i++) noise(t + 0.03 + i * 0.03 + Math.random() * 0.02, { freq: 3200, q: 7, gain: 0.08, decay: 0.02 });
    },
    roundStart() {
      if (!ready()) return;
      const t = ctx.currentTime;
      fx.shake(t);
      fx.slam(t + 0.72);
    },
    // Knuckles rapping the table for a bid.
    bid() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [0, 0.11].forEach((d, i) => {
        noise(t + d, { freq: 900 - i * 120, q: 5, gain: 0.35, decay: 0.07 });
        tone(t + d, { freq: 240 - i * 30, to: 140, gain: 0.25, decay: 0.08 });
      });
    },
    // Cannon boom for "Liar!".
    liar() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: 380, type: 'lowpass', q: 0.7, gain: 0.9, attack: 0.004, decay: 1.1 });
      tone(t, { freq: 75, to: 28, gain: 0.9, attack: 0.004, decay: 0.8 });
      noise(t + 0.02, { freq: 1800, q: 0.8, gain: 0.2, decay: 0.25 });
    },
    // Cups lifting: a wooden scrape.
    reveal() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { freq: 1200, q: 3, gain: 0.12, attack: 0.08, decay: 0.25 });
    },
    // A lost die bouncing across the table.
    lostDie(delay = 0) {
      if (!ready()) return;
      const t = ctx.currentTime + delay;
      [0, 0.16, 0.28, 0.37, 0.43, 0.47].forEach((d, i) => {
        noise(t + d, { freq: 2600 + Math.random() * 800, q: 8, gain: 0.32 * Math.pow(0.78, i), decay: 0.03 });
        tone(t + d, { freq: 1300 + Math.random() * 300, gain: 0.05 * Math.pow(0.78, i), decay: 0.05 });
      });
    },
    coins(delay = 0, n = 10) {
      if (!ready()) return;
      const t = ctx.currentTime + delay;
      for (let i = 0; i < n; i++) {
        const at = t + i * 0.06 + Math.random() * 0.05;
        const f = 2400 + Math.random() * 1800;
        tone(at, { freq: f, type: 'sine', gain: 0.08, decay: 0.25 });
        tone(at, { freq: f * 1.5, type: 'sine', gain: 0.04, decay: 0.18 });
      }
    },
    // Ship's bell for "your turn".
    bell() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [[880, 0.16, 1.4], [880 * 2.76, 0.06, 0.8], [880 * 5.4, 0.03, 0.4]].forEach(([f, g, d]) => tone(t, { freq: f, gain: g, decay: d }));
    },
    // Little sea-shanty fanfare.
    win() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [[587, 0], [740, 0.14], [880, 0.28], [740, 0.42], [880, 0.56], [1175, 0.74]].forEach(([f, d], i) => {
        tone(t + d, { freq: f, type: 'triangle', gain: 0.22, decay: i === 5 ? 0.9 : 0.16, vibrato: i === 5 ? 6 : 0 });
        tone(t + d, { freq: f / 2, type: 'sine', gain: 0.1, decay: i === 5 ? 0.9 : 0.16 });
      });
      fx.coins(0.8, 16);
    },
    // Mournful descending tune.
    lose() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [[440, 0], [392, 0.3], [349, 0.6], [330, 0.9]].forEach(([f, d], i) => tone(t + d, { freq: f, type: 'triangle', gain: 0.2, decay: i === 3 ? 1.2 : 0.3, vibrato: i === 3 ? 5 : 0 }));
      tone(t + 0.9, { freq: 82, to: 41, gain: 0.4, decay: 1.2 });
    },
    click() {
      if (!ready()) return;
      noise(ctx.currentTime, { freq: 1500, q: 4, gain: 0.08, decay: 0.03 });
    },
  };

  window.Sound = {
    ...Object.fromEntries(Object.entries(fx).filter(([k]) => !['shake', 'slam'].includes(k))),
    get muted() { return muted; },
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem('ld_muted', muted ? '1' : '0'); } catch {}
      if (!muted) ensure();
    },
  };
})();
