/* Pirate crew: SVG avatars, personalities and bios for the computer players. */
(function () {
  'use strict';

  const SKIN = ['#f3d2b3', '#e6b48f', '#c98f66', '#a86c45', '#7a4a2c', '#5a3520'];
  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * amt)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('');
  };

  // ---------- the crew ----------
  const CREW = {
    'Salty Meg': {
      title: 'Terror of the Tides',
      bio: "Captain of the Crimson Gull. Bids big, bluffs bigger, and has never once backed down from a dare.",
      look: { bg: '#7a2f2a', skin: SKIN[2], hair: '#8a3b1c', hairStyle: 'long', hat: 'bandana', hatColor: '#c0392b', dots: true, earring: true, scar: true, goldTooth: true, coat: '#3b2a1e', shirt: '#e9dcc0' },
    },
    'Old Barnaby': {
      title: 'Sea Dog of Forty Years',
      bio: "Forty years at sea and one good eye. Patient as the tide, and slow to call a liar.",
      look: { bg: '#2f4a5a', skin: SKIN[0], hair: '#d9d4c7', hairStyle: 'bald', beard: 'long', hat: 'tricorn', hatColor: '#2a1f18', patch: 'left', coat: '#1f3a5a', shirt: '#e9dcc0' },
    },
    'Lucky Finn': {
      title: 'Deckhand & Parrot Keeper',
      bio: "A cheerful deckhand who trusts his gut and his parrot, Biscuit, in roughly that order.",
      look: { bg: '#3d6b4a', skin: SKIN[0], hair: '#c2551c', hairStyle: 'fringe', hat: 'knitcap', hatColor: '#24406b', freckles: true, blush: true, stripes: true, parrot: true, coat: '#24406b', shirt: '#f2ede2' },
    },
    'Mad Marisol': {
      title: 'The Cackling Storm',
      bio: "Laughs at storms and at bad odds. Loves a wild raise just to watch the table squirm.",
      look: { bg: '#4a2a5a', skin: SKIN[4], hair: '#1a1210', hairStyle: 'wild', hat: 'bandana', hatColor: '#7d3c98', earring: true, scar: true, coat: '#2a1a2e', shirt: '#c0392b' },
    },
    'Quiet Ivo': {
      title: 'The Silent Lookout',
      bio: "The ship's silent lookout. Says little, misses nothing, and calls liars without blinking.",
      look: { bg: '#2b2b33', skin: SKIN[1], hair: '#2a1d14', hairStyle: 'none', beard: 'full', hat: 'hood', hatColor: '#3a3f47', patch: 'right', coat: '#2b2f36', shirt: '#3a3f47' },
    },
    'Rosa Two-Bones': {
      title: 'Reader of the Bones',
      bio: "Fortune-teller of the fleet. Swears her bone charms tell her when ye're bluffing.",
      look: { bg: '#5a2433', skin: SKIN[3], hair: '#2a1410', hairStyle: 'long', hat: 'bandana', hatColor: '#141414', skullPrint: true, earring: 'bone', lips: true, coat: '#3a1520', shirt: '#e9dcc0' },
    },
    'Gentleman Pike': {
      title: 'Privateer of Good Breeding',
      bio: "A privateer with a monocle and fine manners, right up until he takes yer gold.",
      look: { bg: '#2d4a3a', skin: SKIN[0], hair: '#4a2f1c', hairStyle: 'none', mustache: 'curly', hat: 'cavalier', hatColor: '#1f3326', monocle: true, coat: '#6b1f2a', shirt: '#f2ede2' },
    },
  };

  // ---------- human avatars: a pirate built from the player's name ----------
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function humanLook(name) {
    let h = hash(name || '?');
    const pick = (arr) => { const v = arr[h % arr.length]; h = Math.floor(h / arr.length) + 7919; return v; };
    return {
      bg: pick(['#5a3a22', '#2f4a5a', '#4a2a5a', '#3d6b4a', '#7a2f2a', '#2d4a3a']),
      skin: pick(SKIN),
      hair: pick(['#1a1210', '#4a2f1c', '#8a3b1c', '#c2551c', '#d9c27a']),
      hairStyle: pick(['fringe', 'long', 'none', 'wild']),
      hat: pick(['tricorn', 'bandana', 'knitcap', 'cavalier']),
      hatColor: pick(['#2a1f18', '#c0392b', '#24406b', '#1f3326', '#7d3c98']),
      beard: pick([null, null, 'full']),
      earring: pick([true, false]),
      coat: pick(['#3b2a1e', '#1f3a5a', '#2a1a2e', '#6b1f2a']),
      shirt: '#e9dcc0',
    };
  }

  // ---------- SVG ----------
  let uid = 0;
  function avatarSVG(look) {
    const L = look, id = 'av' + (++uid);
    const skinD = shade(L.skin, 0.82), hairD = shade(L.hair || '#222', 0.7), hatD = shade(L.hatColor, 0.65);
    const p = [];
    p.push(`<circle cx="50" cy="50" r="48" fill="${L.bg}"/>`);
    p.push(`<g clip-path="url(#${id})">`);
    // hair behind
    if (L.hairStyle === 'long') p.push(`<path d="M24 46 Q20 82 28 100 L72 100 Q80 82 76 46 Z" fill="${L.hair}"/>`);
    if (L.hairStyle === 'wild') {
      [[24, 44, 10], [22, 60, 9], [26, 74, 9], [76, 44, 10], [78, 60, 9], [74, 74, 9], [32, 28, 10], [68, 28, 10], [50, 22, 11]]
        .forEach(([x, y, r]) => p.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${L.hair}"/>`));
    }
    // body
    p.push(`<path d="M6 100 Q10 75 50 73 Q90 75 94 100Z" fill="${L.coat}"/>`);
    if (L.stripes) {
      p.push(`<path d="M36 74 L50 96 L64 74Z" fill="${L.shirt}"/>`);
      [79, 85, 91].forEach((y) => p.push(`<path d="M${36 + (y - 74) * 0.64} ${y} L${64 - (y - 74) * 0.64} ${y}" stroke="#24406b" stroke-width="2.2"/>`));
    } else {
      p.push(`<path d="M38 74 L50 94 L62 74Z" fill="${L.shirt}"/>`);
    }
    p.push(`<rect x="43" y="63" width="14" height="14" fill="${skinD}"/>`);
    // ears + earrings
    p.push(`<circle cx="28" cy="52" r="5" fill="${L.skin}"/><circle cx="72" cy="52" r="5" fill="${L.skin}"/>`);
    if (L.earring === 'bone') p.push(`<path d="M27 58 L27 66 M25 66 L29 66 M25 58 L29 58" stroke="#efe6d2" stroke-width="2" stroke-linecap="round"/>`);
    else if (L.earring) p.push(`<circle cx="28" cy="60" r="3.2" fill="none" stroke="#f2c14e" stroke-width="1.7"/>`);
    // head
    p.push(`<ellipse cx="50" cy="50" rx="22" ry="24" fill="${L.skin}"/>`);
    if (L.blush) p.push(`<circle cx="38" cy="59" r="4" fill="#e7836f" opacity=".35"/><circle cx="62" cy="59" r="4" fill="#e7836f" opacity=".35"/>`);
    if (L.freckles) [[37, 55], [40, 57], [35, 58], [63, 55], [60, 57], [65, 58]].forEach(([x, y]) => p.push(`<circle cx="${x}" cy="${y}" r=".8" fill="#a5532a"/>`));
    // beard
    if (L.beard === 'full') p.push(`<path d="M28 52 Q29 80 50 84 Q71 80 72 52 Q66 67 50 67 Q34 67 28 52Z" fill="${L.hair}"/>`);
    if (L.beard === 'long') p.push(`<path d="M28 52 Q28 84 50 98 Q72 84 72 52 Q66 67 50 67 Q34 67 28 52Z" fill="${L.hair}"/><path d="M44 78 Q50 88 56 78" stroke="${hairD}" stroke-width="1" fill="none"/>`);
    // brows, eyes, nose
    p.push(`<g class="brows"><path d="M36 41 L45 39.5" stroke="${hairD}" stroke-width="2.6" stroke-linecap="round"/><path class="brow-r" d="M55 39.5 L64 41" stroke="${hairD}" stroke-width="2.6" stroke-linecap="round"/></g>`);
    p.push(`<g class="eyes"><circle cx="41" cy="48" r="2.9" fill="#1b1410"/><circle cx="59" cy="48" r="2.9" fill="#1b1410"/><circle cx="42" cy="47" r=".9" fill="#fff"/><circle cx="60" cy="47" r=".9" fill="#fff"/></g>`);
    p.push(`<path d="M50 50 Q46.5 57 50 58 Q52.5 58 53 56.5" stroke="${skinD}" fill="none" stroke-width="1.7" stroke-linecap="round"/>`);
    // mouths (one shown at a time, by mood)
    const lip = L.lips ? '#a8243a' : '#5a1f14';
    p.push(`<g class="m m-neutral"><path d="M44 66 Q50 68.5 56 66" stroke="${lip}" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`);
    p.push(`<g class="m m-grin"><path d="M42 64 Q50 74 58 64 Z" fill="${lip}"/><path d="M44 64.6 L56 64.6 L55 66.4 L45 66.4Z" fill="#fff"/>${L.goldTooth ? '<rect x="51" y="64.6" width="2.6" height="1.8" fill="#f2c14e"/>' : ''}</g>`);
    p.push(`<g class="m m-frown"><path d="M44 69 Q50 63.5 56 69" stroke="${lip}" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`);
    p.push(`<g class="m m-shout"><ellipse cx="50" cy="67" rx="4.6" ry="5.2" fill="${lip}"/><ellipse cx="50" cy="69" rx="2.6" ry="1.8" fill="#c0473a"/></g>`);
    // mustache
    if (L.mustache === 'curly') p.push(`<path d="M50 61 Q44 58 39 61 Q36 63 37 59 Q35 62 38 64 Q44 64 50 62 Q56 64 62 64 Q65 62 63 59 Q64 63 61 61 Q56 58 50 61Z" fill="${hairD}"/>`);
    else if (L.beard) p.push(`<path d="M39 62 Q44 58 50 61 Q56 58 61 62 Q56 61.5 50 63.5 Q44 61.5 39 62Z" fill="${hairD}"/>`);
    if (L.scar) p.push(`<path d="M61 53 L67 61 M62.5 57.5 L65 55.5 M64.5 60 L67 58" stroke="#a5534a" stroke-width="1.3" stroke-linecap="round"/>`);
    // eyepatch / monocle
    if (L.patch === 'left') p.push(`<path d="M74 37 L26 51" stroke="#111" stroke-width="1.8"/><ellipse cx="41" cy="48" rx="6.2" ry="5.2" fill="#111"/>`);
    if (L.patch === 'right') p.push(`<path d="M26 37 L74 51" stroke="#111" stroke-width="1.8"/><ellipse cx="59" cy="48" rx="6.2" ry="5.2" fill="#111"/>`);
    if (L.monocle) p.push(`<circle cx="59" cy="48" r="6" fill="#ffffff22" stroke="#e5b453" stroke-width="1.6"/><path d="M65 50 Q71 62 66 76" stroke="#e5b453" stroke-width=".8" fill="none"/>`);
    // front hair
    if (L.hairStyle === 'fringe') p.push(`<path d="M29 41 Q34 48 39 41 Q44 48 50 41 Q56 48 61 41 Q66 48 71 41 L71 36 L29 36Z" fill="${L.hair}"/>`);
    // hats
    if (L.hat === 'tricorn') {
      p.push(`<path d="M28 31 Q50 4 72 31Z" fill="${L.hatColor}"/>`);
      p.push(`<path d="M14 38 Q20 17 50 15 Q80 17 86 38 Q70 29 50 31 Q30 29 14 38Z" fill="${L.hatColor}"/>`);
      p.push(`<path d="M18 36 Q50 24 82 36" stroke="#e5b453" stroke-width="1.8" fill="none"/>`);
      p.push(`<circle cx="50" cy="22" r="3.3" fill="#efe6d2"/><path d="M45 26 L55 30 M55 26 L45 30" stroke="#efe6d2" stroke-width="1.4"/>`);
    }
    if (L.hat === 'bandana') {
      p.push(`<path d="M26 45 Q25 19 50 19 Q75 19 74 45 Q62 36 50 36 Q38 36 26 45Z" fill="${L.hatColor}"/>`);
      p.push(`<path d="M72 37 L86 43 L81 50 L74 42Z" fill="${hatD}"/><path d="M73 39 L88 34 L85 41Z" fill="${L.hatColor}"/>`);
      if (L.dots) [[36, 27], [46, 24], [58, 25], [66, 31], [40, 34], [54, 31]].forEach(([x, y]) => p.push(`<circle cx="${x}" cy="${y}" r="1.6" fill="#f6e7c8" opacity=".85"/>`));
      if (L.skullPrint) p.push(`<circle cx="50" cy="26" r="4" fill="#efe6d2"/><rect x="47.5" y="28.5" width="5" height="3" fill="#efe6d2"/><circle cx="48.4" cy="26" r="1" fill="#141414"/><circle cx="51.6" cy="26" r="1" fill="#141414"/>`);
    }
    if (L.hat === 'knitcap') {
      p.push(`<path d="M27 40 Q27 15 50 14 Q73 15 73 40Z" fill="${L.hatColor}"/>`);
      p.push(`<rect x="25" y="34" width="50" height="9" rx="4.5" fill="${hatD}"/><circle cx="50" cy="13" r="5.5" fill="#c0392b"/>`);
    }
    if (L.hat === 'hood') {
      p.push(`<path d="M16 76 Q12 16 50 12 Q88 16 84 76 Q76 38 50 34 Q24 38 16 76Z" fill="${L.hatColor}"/>`);
      p.push(`<path d="M28 45 Q50 30 72 45 Q50 37 28 45Z" fill="#00000055"/>`);
    }
    if (L.hat === 'cavalier') {
      p.push(`<path d="M32 33 Q33 12 50 11 Q67 12 68 33Z" fill="${L.hatColor}"/>`);
      p.push(`<ellipse cx="50" cy="33" rx="33" ry="7.5" fill="${L.hatColor}"/><path d="M33 29 L67 29" stroke="#e5b453" stroke-width="2.2"/>`);
      p.push(`<path d="M60 28 Q82 2 97 20 Q82 15 66 31Z" fill="#efe9da"/><path d="M64 29 Q80 12 92 18" stroke="#cfc6b0" stroke-width="1" fill="none"/>`);
    }
    // parrot on the shoulder
    if (L.parrot) {
      p.push(`<g class="parrot"><path d="M88 100 L83 86 L92 88Z" fill="#c0392b"/><ellipse cx="82" cy="80" rx="7.5" ry="10.5" fill="#27ae60" transform="rotate(-12 82 80)"/>`);
      p.push(`<path d="M78 76 Q74 86 80 92 Q82 84 80 76Z" fill="#1e8449"/><circle cx="82" cy="66" r="6.5" fill="#2ecc71"/>`);
      p.push(`<path d="M76.5 65 Q72 67 75 71 Q76 68 78 67Z" fill="#f39c12"/><circle cx="81" cy="64.5" r="1.3" fill="#111"/><circle cx="81.4" cy="64.1" r=".4" fill="#fff"/></g>`);
    }
    p.push('</g>');
    p.push(`<circle cx="50" cy="50" r="47" fill="none" stroke="#e5b453" stroke-width="2.5"/>`);
    return `<svg class="face" viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="50" cy="50" r="47"/></clipPath></defs>${p.join('')}</svg>`;
  }

  const lookFor = (name, isBot) => (isBot && CREW[name] ? CREW[name].look : humanLook(name));
  window.Crew = { CREW, avatarSVG, lookFor };
})();
