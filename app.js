/* ============================================================
   TSMP Tournament Maker
   ============================================================ */
"use strict";

/* ---------- PvP modes (icons sourced from pvphq.com; vanilla = crystal pvp) ---------- */
const MODES = [
  { id: "sword",   name: "Sword",   img: "assets/modes/sword.png" },
  { id: "axe",     name: "Axe",     img: "assets/modes/axe.png" },
  { id: "mace",    name: "Mace",    img: "assets/modes/mace.png" },
  { id: "uhc",     name: "UHC",     img: "assets/modes/uhc.png" },
  { id: "nethpot", name: "NethPot", img: "assets/modes/nethpot.png" },
  { id: "pot",     name: "Pot",     img: "assets/modes/pot.png" },
  { id: "smp",     name: "SMP",     img: "assets/modes/smp.png" },
  { id: "diasmp",  name: "DiaSMP",  img: "assets/modes/diasmp.png" },
  { id: "cart",    name: "Cart",    img: "assets/modes/cart.png" },
  { id: "vanilla", name: "Vanilla", img: "assets/modes/vanilla.png" },
];

const SAMPLE = [
  "Technoblade", "Dream", "Notch", "jeb_", "Grian", "Philza", "Tommyinnit", "Ranboo",
  "Tubbo_", "WilburSoot", "Quackity", "Sapnap", "GeorgeNotFound", "BadBoyHalo", "Skeppy", "Fundy",
  "Nihachu", "Eret", "Punz", "awesamdude", "Foolish_Gamers", "Slimecicle", "JackManifoldTV", "Antfrost",
  "Purpled", "CaptainPuffy", "ClownPierce", "Vitalasy", "ParrotX2", "Sneegsnag", "TapL", "Vikkstar123",
  "Mongraal", "Benex", "Spoke", "itzGlimpse", "f1nn5ter", "Etoiles", "Kubson", "Aztecross",
];

/* ---------- state ---------- */
const LS_KEY = "tsmp_state";
let state = {
  name: "",
  type: "single",           // single | double | roundrobin
  mode: "sword",
  players: [],              // {id, name}
  view: "setup",            // setup | bracket
  scores: {},               // matchId -> { playerId: gamesWon }
  formats: {},              // matchId -> { kind:'BO'|'FT', n }
  swissRounds: null,        // null = auto (ceil(log2 n))
  groupConfig: { numGroups: 2, groupFormat: "roundrobin", advancePerGroup: 2, mainFormat: "single" },
};
const DEFAULT_FORMAT = { kind: "BO", n: 1 };
function fmtLabel(f) { return (f || DEFAULT_FORMAT).kind + (f || DEFAULT_FORMAT).n; }
function winThreshold(f) { f = f || DEFAULT_FORMAT; return f.kind === "FT" ? f.n : Math.floor(f.n / 2) + 1; }
let pidCounter = 1;

/* ---------- persistence ---------- */
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state = Object.assign(state, s);
      // reindex pid counter
      state.players.forEach(p => {
        const n = parseInt(String(p.id).replace(/\D/g, ""), 10);
        if (!isNaN(n) && n >= pidCounter) pidCounter = n + 1;
      });
    }
  } catch (e) {}
}

/* ---------- helpers ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const modeById = id => MODES.find(m => m.id === id) || MODES[0];
const isPlayer = v => v && typeof v === "object" && v.id !== undefined;

function headUrl(name, size) {
  return `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`;
}
function attachHeadFallback(img, name, size) {
  let stage = 0;
  img.onerror = () => {
    stage++;
    if (stage === 1) img.src = `https://minotar.net/helm/${encodeURIComponent(name)}/${size}.png`;
    else if (stage === 2) img.src = `https://mc-heads.net/avatar/MHF_Steve/${size}`;
    else img.onerror = null;
  };
}
function makeHead(name, size, cls) {
  const img = el("img", cls);
  img.width = size; img.height = size;
  img.alt = name;
  attachHeadFallback(img, name, size);
  img.src = headUrl(name, size);
  return img;
}

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return Math.max(2, p); }

/* standard bracket seed order for a power-of-two size */
function seedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next = [];
    for (const s of seeds) { next.push(s); next.push(sum - s); }
    seeds = next;
  }
  return seeds;
}

const src = {
  player: p => ({ t: "player", p }),
  bye:    () => ({ t: "bye" }),
  winner: m => ({ t: "winner", m }),
  loser:  m => ({ t: "loser",  m }),
};

/* ============================================================
   BRACKET GENERATORS  ->  { M, sections, type, meta }
   M: id -> match {id, group, a, b, pick}
   sections: [{ key, title, columns:[{label, matchIds:[]}] }]
   ============================================================ */
let _idc = 0;
const nid = prefix => (prefix || "") + "m" + (_idc++);

/* decide a series from its stored score + format (shared by resolve & Swiss/standings) */
function seriesWinner(scoreObj, format, aId, bId) {
  const th = winThreshold(format);
  const aw = (scoreObj && scoreObj[aId]) || 0, bw = (scoreObj && scoreObj[bId]) || 0;
  if (aw >= th && aw > bw) return aId;
  if (bw >= th && bw > aw) return bId;
  return null;
}

function roundName(idxFromEnd, total, prefix) {
  if (idxFromEnd === 0) return prefix ? prefix + " Final" : "Final";
  if (idxFromEnd === 1) return (prefix ? prefix + " " : "") + "Semifinals";
  if (idxFromEnd === 2) return (prefix ? prefix + " " : "") + "Quarterfinals";
  return (prefix ? prefix + " " : "") + "Round " + (total - idxFromEnd);
}

/* -------- single elimination -------- */
function genSingle(players, opts) {
  const P = (opts && opts.prefix) || "";
  if (!P) _idc = 0;
  const M = {};
  const size = nextPow2(players.length);
  const order = seedOrder(size);
  const slots = order.map(seed => players[seed - 1] || null); // player | null(bye)
  const R = Math.round(Math.log2(size));

  const columns = [];
  let prev = [];
  for (let r = 0; r < R; r++) {
    const col = [];
    const count = size / Math.pow(2, r + 1);
    for (let i = 0; i < count; i++) {
      const id = nid(P);
      let a, b;
      if (r === 0) {
        a = slots[i * 2] ? src.player(slots[i * 2]) : src.bye();
        b = slots[i * 2 + 1] ? src.player(slots[i * 2 + 1]) : src.bye();
      } else {
        a = src.winner(prev[i * 2]);
        b = src.winner(prev[i * 2 + 1]);
      }
      M[id] = { id, group: "W", a, b, pick: null };
      col.push(id);
    }
    columns.push(col);
    prev = col;
  }
  const cols = columns.map((ids, r) => ({ label: roundName(R - 1 - r, R, ""), matchIds: ids }));
  return {
    M, type: "single",
    sections: [{ key: "W", title: "", columns: cols }],
    meta: { finalId: columns[R - 1][0] },
  };
}

/* -------- double elimination -------- */
function genDouble(players, opts) {
  const P = (opts && opts.prefix) || "";
  if (!P) _idc = 0;
  const M = {};
  const size = nextPow2(players.length);
  const order = seedOrder(size);
  const slots = order.map(seed => players[seed - 1] || null);
  const R = Math.round(Math.log2(size));

  // winners bracket
  const wb = [];
  let prev = [];
  for (let r = 0; r < R; r++) {
    const col = [];
    const count = size / Math.pow(2, r + 1);
    for (let i = 0; i < count; i++) {
      const id = nid(P);
      let a, b;
      if (r === 0) {
        a = slots[i * 2] ? src.player(slots[i * 2]) : src.bye();
        b = slots[i * 2 + 1] ? src.player(slots[i * 2 + 1]) : src.bye();
      } else {
        a = src.winner(prev[i * 2]);
        b = src.winner(prev[i * 2 + 1]);
      }
      M[id] = { id, group: "W", a, b, pick: null };
      col.push(id);
    }
    wb.push(col);
    prev = col;
  }

  // losers bracket
  const lb = [];
  let prevLB = [];
  // LB round 1: losers of WB round 0 pair up
  {
    const col = [];
    for (let i = 0; i < Math.floor(wb[0].length / 2); i++) {
      const id = nid(P);
      M[id] = { id, group: "L", a: src.loser(wb[0][i * 2]), b: src.loser(wb[0][i * 2 + 1]), pick: null };
      col.push(id);
    }
    if (col.length) lb.push(col);
    prevLB = col;
  }
  for (let r = 1; r < R; r++) {
    // minor round: prevLB winners vs WB[r] losers (crossed to reduce rematches)
    const minor = [];
    for (let i = 0; i < prevLB.length; i++) {
      const id = nid(P);
      const wbLoser = src.loser(wb[r][prevLB.length - 1 - i]);
      M[id] = { id, group: "L", a: src.winner(prevLB[i]), b: wbLoser, pick: null };
      minor.push(id);
    }
    lb.push(minor);
    prevLB = minor;
    // major round: pair up survivors
    if (prevLB.length > 1) {
      const major = [];
      for (let i = 0; i < prevLB.length / 2; i++) {
        const id = nid(P);
        M[id] = { id, group: "L", a: src.winner(prevLB[i * 2]), b: src.winner(prevLB[i * 2 + 1]), pick: null };
        major.push(id);
      }
      lb.push(major);
      prevLB = major;
    }
  }
  const lbFinal = prevLB.length ? prevLB[0] : null;
  const wbFinal = wb[R - 1][0];

  // grand final (+ reset). With only 2 players there is no losers bracket,
  // so the WB final loser drops straight into the grand final.
  const gf = nid(P);
  M[gf] = { id: gf, group: "GF", a: src.winner(wbFinal), b: lbFinal ? src.winner(lbFinal) : src.loser(wbFinal), pick: null };
  const reset = nid(P);
  M[reset] = { id: reset, group: "GF", a: src.loser(gf), b: src.winner(gf), pick: null, reset: true };

  // layout columns
  const wbCols = wb.map((ids, r) => ({ label: roundName(R - 1 - r, R, "Winners"), matchIds: ids }));
  const lbCols = lb.map((ids, i) => ({ label: i === lb.length - 1 ? "Losers Final" : "Losers Round " + (i + 1), matchIds: ids }));
  const gfCols = [
    { label: "Grand Final", matchIds: [gf] },
    { label: "Bracket Reset", matchIds: [reset] },
  ];

  return {
    M, type: "double",
    sections: [
      { key: "W", title: "Winners Bracket", columns: wbCols },
      { key: "L", title: "Losers Bracket", columns: lbCols },
      { key: "GF", title: "Grand Finals", columns: gfCols },
    ],
    meta: { gf, reset, wbFinal, lbFinal },
  };
}

/* -------- round robin -------- */
function genRoundRobin(players, opts) {
  const P = (opts && opts.prefix) || "";
  if (!P) _idc = 0;
  const M = {};
  let list = players.slice();
  const hasBye = list.length % 2 !== 0;
  if (hasBye) list.push(null); // BYE marker
  const n = list.length;
  const rounds = [];
  const arr = list.slice();
  for (let r = 0; r < Math.max(1, n - 1); r++) {
    const col = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a && b) {
        const id = nid(P);
        M[id] = { id, group: "RR", a: src.player(a), b: src.player(b), pick: null };
        col.push(id);
      }
    }
    if (col.length) rounds.push(col);
    // rotate (fix first)
    arr.splice(1, 0, arr.pop());
  }
  const cols = rounds.map((ids, r) => ({ label: "Round " + (r + 1), matchIds: ids }));
  return { M, type: "roundrobin", sections: [{ key: "RR", title: "", columns: cols }], meta: {} };
}

/* -------- swiss system -------- */
function swissRoundCount(n) { return Math.max(1, Math.ceil(Math.log2(Math.max(2, n)))); }

/* pair a ranked pool avoiding rematches (backtracking); null if impossible */
let _pairSteps = 0;
function pairNoRematch(pool, played) {
  if (pool.length === 0) return [];
  if (_pairSteps++ > 50000) return null;         // safety guard
  const a = pool[0];
  for (let j = 1; j < pool.length; j++) {
    const b = pool[j];
    if (played[a.id].has(b.id)) continue;
    const rest = pool.slice(1, j).concat(pool.slice(j + 1));
    const sub = pairNoRematch(rest, played);
    if (sub) return [[a, b]].concat(sub);
  }
  return null;
}
/* greedy fallback (allows a rematch only when unavoidable) */
function pairGreedy(pool, played) {
  const used = new Set(), pairs = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i]; if (used.has(a.id)) continue;
    let bIdx = -1, fb = -1;
    for (let j = i + 1; j < pool.length; j++) {
      if (used.has(pool[j].id)) continue;
      if (fb === -1) fb = j;
      if (!played[a.id].has(pool[j].id)) { bIdx = j; break; }
    }
    if (bIdx === -1) bIdx = fb;
    if (bIdx === -1) continue;
    used.add(a.id); used.add(pool[bIdx].id);
    pairs.push([a, pool[bIdx]]);
  }
  return pairs;
}

function genSwiss(players, opts) {
  opts = opts || {};
  const P = opts.prefix || "";
  if (!P) _idc = 0;
  const scores = opts.scores || state.scores;
  const formats = opts.formats || state.formats;
  const R = opts.rounds || (state.swissRounds || swissRoundCount(players.length));
  const M = {};
  const cols = [];

  // deterministic per-pairing match id (stable across re-pairing)
  const mkId = (round, x, y) => `${P}sw-r${round}-${x.id < y.id ? x.id + "-" + y.id : y.id + "-" + x.id}`;
  const byeId = (round, x) => `${P}sw-r${round}-bye-${x.id}`;

  // running record from already-generated matches
  const wins = {}, losses = {}, played = {}, oppo = {};
  players.forEach(p => { wins[p.id] = 0; losses[p.id] = 0; played[p.id] = new Set(); oppo[p.id] = []; });

  const recordResult = (aId, bId, mId) => {
    played[aId].add(bId); played[bId].add(aId);
    oppo[aId].push(bId); oppo[bId].push(aId);
    const w = seriesWinner(scores[mId], formats[mId], aId, bId);
    if (w) { const l = w === aId ? bId : aId; wins[w]++; losses[l]++; return true; }
    return false;
  };

  for (let round = 1; round <= R; round++) {
    // order players by score then seed
    const ranked = players.slice().sort((x, y) =>
      (wins[y.id] - losses[y.id]) - (wins[x.id] - losses[x.id]) ||
      wins[y.id] - wins[x.id] ||
      players.indexOf(x) - players.indexOf(y));

    const pool = ranked.slice();
    const col = [];
    let byePlayer = null;
    if (pool.length % 2 === 1) {
      // bye to lowest-ranked player who hasn't had one yet
      for (let i = pool.length - 1; i >= 0; i--) {
        if (!oppo[pool[i].id].includes("BYE")) { byePlayer = pool[i]; break; }
      }
      if (!byePlayer) byePlayer = pool[pool.length - 1];
      pool.splice(pool.indexOf(byePlayer), 1);
    }

    _pairSteps = 0;
    const pairs = pairNoRematch(pool, played) || pairGreedy(pool, played);
    pairs.forEach(([a, b]) => {
      const id = mkId(round, a, b);
      M[id] = { id, group: "SW", a: src.player(a), b: src.player(b), pick: null, _swRound: round };
      col.push(id);
    });

    // bye match (auto-win, shown)
    if (byePlayer) {
      const id = byeId(round, byePlayer);
      M[id] = { id, group: "SW", a: src.player(byePlayer), b: src.bye(), pick: null, _swRound: round, _bye: true };
      col.push(id);
      wins[byePlayer.id]++; oppo[byePlayer.id].push("BYE"); played[byePlayer.id].add("BYE");
    }

    cols.push({ label: "Round " + round, matchIds: col });

    // record results to inform next round; stop if this round isn't fully decided
    let allDecided = true;
    col.forEach(mId => {
      const m = M[mId];
      if (m._bye) return;
      const decided = recordResult(m.a.p.id, m.b.p.id, mId);
      if (!decided) allDecided = false;
    });
    if (!allDecided) break; // next rounds unknown until this one finishes
  }

  return { M, type: "swiss", sections: [{ key: "SW", title: "", columns: cols }], meta: { rounds: R } };
}

function buildGraph() {
  const players = state.players;
  if (state.type === "double") return genDouble(players);
  if (state.type === "roundrobin") return genRoundRobin(players);
  if (state.type === "swiss") return genSwiss(players);
  if (state.type === "groups") return genGroups(players);
  return genSingle(players);
}

const GEN = { single: genSingle, double: genDouble, roundrobin: genRoundRobin, swiss: genSwiss };

/* -------- group stage (composite: groups -> main bracket) -------- */
function snakeGroups(players, numGroups) {
  const groups = Array.from({ length: numGroups }, () => []);
  let g = 0, dir = 1;
  players.forEach(p => {
    groups[g].push(p);
    g += dir;
    if (g === numGroups) { g = numGroups - 1; dir = -1; } else if (g < 0) { g = 0; dir = 1; }
  });
  return groups;
}

/* rank the entrants of a finished (or partial) sub-tournament, best first */
function rankSubGraph(sub, players) {
  if (sub.type === "roundrobin" || sub.type === "swiss") {
    return standingsFor(sub, players).map(r => r.player);
  }
  // elimination: order by how far each player advanced (rounds won), then seed
  const roundsWon = {}; players.forEach(p => roundsWon[p.id] = 0);
  const lostAt = {};
  Object.values(sub.M).forEach(m => {
    if (m._winner) roundsWon[m._winner.id] = (roundsWon[m._winner.id] || 0) + 1;
    if (m._decided && m._loser) lostAt[m._loser.id] = Math.max(lostAt[m._loser.id] || 0, m._winner ? roundsWon[m._winner.id] : 0);
  });
  return players.slice().sort((x, y) =>
    (roundsWon[y.id] || 0) - (roundsWon[x.id] || 0) ||
    players.indexOf(x) - players.indexOf(y));
}

function genGroups(players) {
  _idc = 0;
  const cfg = state.groupConfig;
  const numGroups = Math.max(1, Math.min(cfg.numGroups, Math.floor(players.length / 2) || 1));
  const groupFmt = cfg.groupFormat;
  const adv = Math.max(1, cfg.advancePerGroup);
  const mainFmt = cfg.mainFormat;

  const groups = snakeGroups(players, numGroups);
  const M = {};
  const sections = [];
  const groupInfo = [];
  const letters = "ABCDEFGHIJKLMNOP";

  groups.forEach((gp, gi) => {
    const gen = GEN[groupFmt] || genRoundRobin;
    const sub = resolve(applyStateTo(gen(gp, { prefix: `g${gi}-` })));
    Object.assign(M, sub.M);
    // prefix section titles with the group name
    sub.sections.forEach(s => {
      sections.push({ key: `G${gi}-${s.key}`, title: `Group ${letters[gi]}` + (s.title ? " · " + s.title : ""), columns: s.columns, groupIndex: gi });
    });
    const complete = Object.values(sub.M).every(m => m._decided);
    const ranking = rankSubGraph(sub, gp);
    groupInfo.push({ gi, players: gp, sub, complete, ranking, qualifiers: complete ? ranking.slice(0, adv) : null });
  });

  const allComplete = groupInfo.every(g => g.complete);

  // build main-bracket entrants: real qualifiers if ready, else placeholders
  const entrants = [];
  // seed cross-group: rank 1s first (by group), then rank 2s, ... (standard)
  for (let r = 0; r < adv; r++) {
    groupInfo.forEach(g => {
      if (allComplete) entrants.push(g.qualifiers[r]);
      else entrants.push({ id: `ph-${g.gi}-${r}`, name: `Group ${letters[g.gi]} #${r + 1}`, placeholder: true });
    });
  }

  const mainGen = GEN[mainFmt] || genSingle;
  const mainSub = mainGen(entrants, { prefix: "main-" });
  Object.assign(M, mainSub.M);
  mainSub.sections.forEach(s => {
    sections.push({ key: `MAIN-${s.key}`, title: "Main Bracket" + (s.title ? " · " + s.title : ""), columns: s.columns, main: true });
  });

  return {
    M, type: "groups",
    sections,
    meta: { mainType: mainFmt, mainMeta: mainSub.meta, allComplete, numGroups, adv, groupFmt },
  };
}

/* ============================================================
   RESOLUTION  — fixed-point pass over the match DAG
   ============================================================ */
function resolve(graph) {
  const M = graph.M;
  const ids = Object.keys(M);
  ids.forEach(id => { const m = M[id]; m._a = undefined; m._b = undefined; m._winner = null; m._loser = null; m._decided = false; });

  const playerOf = s => {
    if (!s) return undefined;
    if (s.t === "player") return s.p;
    if (s.t === "bye") return null;
    const from = M[s.m];
    if (!from || !from._decided) return undefined;
    return s.t === "winner" ? from._winner : from._loser;
  };

  for (let iter = 0; iter < ids.length + 2; iter++) {
    let changed = false;
    for (const id of ids) {
      const m = M[id];
      const a = playerOf(m.a), b = playerOf(m.b);
      let w = null, l = null, decided = false;
      const aP = isPlayer(a), bP = isPlayer(b);
      if (aP && bP) {
        // prune stale score entries for players no longer in this match
        const sc = m.score || (m.score = {});
        Object.keys(sc).forEach(pid => { if (pid !== a.id && pid !== b.id) delete sc[pid]; });
        const th = winThreshold(m.format);
        const aw = sc[a.id] || 0, bw = sc[b.id] || 0;
        m._aWins = aw; m._bWins = bw; m._th = th;
        if (aw >= th && aw > bw) { w = a; l = b; decided = true; }
        else if (bw >= th && bw > aw) { w = b; l = a; decided = true; }
      } else if (aP && b === null) { w = a; decided = true; }       // bye
      else if (bP && a === null) { w = b; decided = true; }         // bye
      else if (a === null && b === null) { decided = true; }        // dead branch collapses
      if (m._winner !== w || m._loser !== l || m._decided !== decided || m._a !== a || m._b !== b) changed = true;
      m._a = a; m._b = b; m._winner = w; m._loser = l; m._decided = decided;
    }
    if (!changed) break;
  }
  return graph;
}

/* apply persisted formats + series scores onto a graph's matches */
function applyStateTo(graph) {
  Object.keys(graph.M).forEach(id => {
    const m = graph.M[id];
    m.format = state.formats[id] ? Object.assign({}, state.formats[id]) : Object.assign({}, DEFAULT_FORMAT);
    m.score = state.scores[id] ? Object.assign({}, state.scores[id]) : {};
  });
  return graph;
}

/* champion resolution */
function champion(graph) {
  if (graph.type === "roundrobin" || graph.type === "swiss") {
    const st = standingsFor(graph, state.players);
    const done = Object.values(graph.M).every(m => m._decided);
    return done && st.length ? st[0].player : null;
  }
  if (graph.type === "double") return dblChampion(graph, graph.meta);
  if (graph.type === "single") {
    const f = graph.M[graph.meta.finalId];
    return f && f._winner ? f._winner : null;
  }
  if (graph.type === "groups") {
    if (!graph.meta.allComplete) return null;
    return mainChampion(graph);
  }
  return null;
}
function dblChampion(graph, meta) {
  const gf = graph.M[meta.gf], reset = graph.M[meta.reset];
  if (gf && gf._decided && gf._winner && gf._a && gf._winner.id === gf._a.id) return gf._winner;
  if (reset && reset._decided && reset._winner) return reset._winner;
  return null;
}
/* champion of a group-stage's main bracket */
function mainChampion(graph) {
  const mm = graph.meta.mainMeta, t = graph.meta.mainType;
  if (t === "double") return dblChampion(graph, mm);
  if (t === "single") { const f = graph.M[mm.finalId]; return f && f._winner ? f._winner : null; }
  // roundrobin / swiss main: leader once all main matches decided
  const mainMatches = Object.values(graph.M).filter(m => String(m.id).startsWith("main-"));
  const done = mainMatches.length && mainMatches.every(m => m._decided);
  if (!done) return null;
  const players = uniquePlayers(mainMatches);
  const st = standingsForMatches(mainMatches, players);
  return st.length ? st[0].player : null;
}
function resetNeeded(graph) {
  const meta = graph.type === "groups" ? graph.meta.mainMeta : graph.meta;
  const gf = meta && graph.M[meta.gf];
  return !!(gf && gf._decided && gf._winner && gf._b && gf._winner.id === gf._b.id);
}

function uniquePlayers(matches) {
  const seen = {}, out = [];
  matches.forEach(m => [m._a, m._b, m.a && m.a.p, m.b && m.b.p].forEach(p => {
    if (isPlayer(p) && !seen[p.id]) { seen[p.id] = 1; out.push(p); }
  }));
  return out;
}

/* standings over an explicit set of players (wins/losses/games + Buchholz tiebreak) */
function standingsForMatches(matches, players) {
  const table = {};
  players.forEach(p => { table[p.id] = { player: p, w: 0, l: 0, gp: 0, opp: [] }; });
  matches.forEach(m => {
    if (m._decided && m._winner) {
      const wid = m._winner.id, lid = m._loser && m._loser.id;
      if (table[wid]) { table[wid].w++; table[wid].gp++; }
      if (lid && table[lid]) { table[lid].l++; table[lid].gp++; table[lid].opp.push(wid); table[wid] && table[wid].opp.push(lid); }
    }
  });
  // Buchholz: sum of opponents' wins
  Object.values(table).forEach(r => { r.buch = r.opp.reduce((s, id) => s + (table[id] ? table[id].w : 0), 0); });
  return Object.values(table).sort((x, y) =>
    y.w - x.w || x.l - y.l || y.buch - x.buch || x.player.name.localeCompare(y.player.name));
}
function standingsFor(graph, players) {
  return standingsForMatches(Object.values(graph.M), players);
}
function standings(graph) { return standingsFor(graph, state.players); }

/* ============================================================
   RENDER — setup screen
   ============================================================ */
function renderModes() {
  const grid = $("#modeGrid");
  grid.innerHTML = "";
  MODES.forEach(m => {
    const b = el("button", "mode" + (state.mode === m.id ? " active" : ""));
    b.type = "button";
    b.innerHTML = `<span class="mode-icon"><img src="${m.img}" alt=""></span><span class="mode-name">${m.name}</span>`;
    b.onclick = () => { state.mode = m.id; save(); renderModes(); };
    grid.appendChild(b);
  });
}

/* show/populate the Swiss and Group-Stage option panels for the current type */
function renderConfigPanels() {
  const n = state.players.length;
  $("#swissConfig").classList.toggle("hidden", state.type !== "swiss");
  $("#groupConfig").classList.toggle("hidden", state.type !== "groups");

  // swiss rounds
  $("#swissRoundsVal").textContent = state.swissRounds ? state.swissRounds : `Auto (${swissRoundCount(n || 2)})`;

  // group config (only clamp once there are enough players to matter)
  const gc = state.groupConfig;
  const maxGroups = n >= 4 ? Math.floor(n / 2) : gc.numGroups;
  if (gc.numGroups > maxGroups) gc.numGroups = maxGroups;
  $("#numGroupsVal").textContent = gc.numGroups;
  $("#advVal").textContent = gc.advancePerGroup;
  $("#groupFormat").value = gc.groupFormat;
  $("#mainFormat").value = gc.mainFormat;
  // split note
  if (n >= 2) {
    const base = Math.floor(n / gc.numGroups), rem = n % gc.numGroups;
    const sizes = rem ? `${base}–${base + 1}` : `${base}`;
    const qualifiers = gc.numGroups * gc.advancePerGroup;
    $("#groupSplitNote").textContent = `~${sizes} per group · ${qualifiers} qualify`;
  } else {
    $("#groupSplitNote").textContent = "";
  }
}

function renderPlayers() {
  const listEl = $("#playerList");
  listEl.innerHTML = "";
  if (!state.players.length) {
    listEl.appendChild(el("li", "empty-note", "No players yet. Add some fighters above."));
  } else {
    state.players.forEach((p, i) => {
      const li = el("li", "player-item");
      const seed = el("span", "player-seed", "#" + (i + 1));
      const head = makeHead(p.name, 38, "player-head");
      const name = el("span", "player-name", esc(p.name));
      const rm = el("button", "player-remove", "&times;");
      rm.title = "Remove";
      rm.onclick = () => { state.players.splice(i, 1); save(); renderPlayers(); refreshGenerate(); };
      li.append(seed, head, name, rm);
      listEl.appendChild(li);
    });
  }
  $("#playerCount").textContent = state.players.length;
  // sample availability
  const avail = SAMPLE.filter(n => !state.players.some(p => p.name.toLowerCase() === n.toLowerCase())).length;
  const availEl = $("#sampleAvail");
  if (availEl) availEl.textContent = avail
    ? `${avail} of ${SAMPLE.length} sample players available to add`
    : "All sample players added.";
  const scEl = $("#sampleCount");
  if (scEl) {
    scEl.max = Math.max(1, avail);
    if (parseInt(scEl.value, 10) > avail) scEl.value = Math.max(1, avail);
    scEl.disabled = avail === 0;
  }
  const seedBtn = $("#seedSample");
  if (seedBtn) seedBtn.disabled = avail === 0;
  refreshGenerate();
}

function refreshGenerate() {
  const n = state.players.length;
  const btn = $("#generateBtn");
  const summary = $("#genSummary");
  const mode = modeById(state.mode);
  const typeName = { single: "Single Elimination", double: "Double Elimination", roundrobin: "Round Robin", swiss: "Swiss", groups: "Group Stage" }[state.type];
  renderConfigPanels();
  if (n < 2) {
    btn.disabled = true;
    summary.innerHTML = "Add at least <b>2 players</b> to generate a bracket.";
  } else {
    btn.disabled = false;
    summary.innerHTML = `<b>${typeName}</b> · <b class="mode-inline"><img src="${mode.img}" alt="">${mode.name}</b> · <b>${n}</b> players`;
  }
}

/* live skin-head preview while typing */
function updateAddPreview() {
  const val = $("#playerInput").value.trim();
  const box = $("#addPreview");
  const img = $("#addPreviewImg");
  if (val.length >= 2) {
    box.classList.add("has-img");
    attachHeadFallback(img, val, 46);
    img.src = headUrl(val, 46);
  } else {
    box.classList.remove("has-img");
    img.removeAttribute("src");
  }
}

/* ============================================================
   RENDER — bracket
   ============================================================ */
let currentGraph = null;

function renderBracket() {
  const graph = currentGraph = resolve(buildGraphWithState());
  syncScoresFromGraph(graph);
  const mode = modeById(state.mode);
  const typeLabel = { single: "SINGLE ELIM", double: "DOUBLE ELIM", roundrobin: "ROUND ROBIN", swiss: "SWISS", groups: "GROUP STAGE" }[state.type];
  $("#bracketMode").innerHTML = `<img class="mode-eyebrow-img" src="${mode.img}" alt=""> ${mode.name.toUpperCase()} · ${typeLabel}`;
  $("#bracketName").textContent = state.name || "Untitled Tournament";

  const scroll = $("#bracketScroll");
  scroll.innerHTML = "";

  if (state.type === "roundrobin") {
    renderRoundRobin(scroll, graph);
  } else if (state.type === "swiss") {
    renderSwiss(scroll, graph);
  } else if (state.type === "groups") {
    renderGroups(scroll, graph);
  } else {
    graph.sections.forEach(section => {
      if (section.columns.every(c => !c.matchIds.length)) return; // skip empty (e.g. no losers bracket)
      const block = el("div", "bracket-block");
      if (section.title) block.appendChild(el("div", "bracket-section-label", esc(section.title)));
      const bracket = buildBracketSection(section, graph);
      block.appendChild(bracket);
      scroll.appendChild(block);
    });
    scheduleConnectorDraw();
  }

  // champion badge
  const champ = champion(graph);
  const badge = $("#championBadge");
  if (champ) {
    badge.classList.remove("hidden");
    $("#champName").textContent = champ.name;
    const img = $("#champImg");
    attachHeadFallback(img, champ.name, 34);
    img.src = headUrl(champ.name, 34);
  } else {
    badge.classList.add("hidden");
  }
}

/* rebuild graph fresh, then apply persisted formats + series scores */
function buildGraphWithState() {
  const g = applyStateTo(buildGraph());
  Object.keys(g.M).forEach((id, i) => { g.M[id].no = i + 1; }); // stable display numbers
  return g;
}

/* write pruned scores back to state so persistence stays clean */
function syncScoresFromGraph(graph) {
  const scores = {};
  Object.values(graph.M).forEach(m => {
    if (m.score && Object.keys(m.score).length) scores[m.id] = m.score;
  });
  state.scores = scores;
  save();
}

function buildBracketSection(section, graph) {
  const bracket = el("div", "bracket");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "svg-connectors");
  bracket.appendChild(svg);

  section.columns.forEach(col => {
    if (!col.matchIds.length) return; // empty column
    // hide reset column unless it's needed
    if (col.matchIds.length === 1 && graph.M[col.matchIds[0]].reset && !resetNeeded(graph)) return;
    const round = el("div", "round");
    const inner = el("div", "round-inner");
    round.appendChild(el("div", "round-label", esc(col.label)));
    col.matchIds.forEach((mid, i) => inner.appendChild(renderMatch(graph.M[mid], graph, section, i)));
    round.appendChild(inner);
    bracket.appendChild(round);
  });
  return bracket;
}

function renderMatch(m, graph, section, idxInCol) {
  const done = m._decided && m._winner;
  const card = el("div", "match" + (done ? " done" : ""));
  card.dataset.mid = m.id;

  const head = el("div", "match-num");
  const label = m.reset ? "RESET" : (section && section.key === "GF" ? "GF" : "M" + (m.no || "?"));
  const fmt = m.format || DEFAULT_FORMAT;
  head.innerHTML = `<span>${label}</span><span class="match-fmt" title="Right-click to change format">${fmtLabel(fmt)}</span>`;
  card.appendChild(head);

  card.appendChild(renderSlot(m, "a", graph));
  card.appendChild(renderSlot(m, "b", graph));

  // right-click to set series format (FT / BO)
  card.addEventListener("contextmenu", e => { e.preventDefault(); openFormatMenu(m.id, e.clientX, e.clientY); });
  return card;
}

function renderSlot(m, key, graph) {
  const val = key === "a" ? m._a : m._b;      // player | null(bye) | undefined(TBD)
  const otherDecidedWinner = m._decided && m._winner;
  const slot = el("div", "slot");

  const isPh = isPlayer(val) && val.placeholder;   // group-stage qualifier placeholder
  let name, isBye = false, isTBD = false;
  if (isPlayer(val)) name = val.name;
  else if (val === null) { name = "BYE"; isBye = true; }
  else { name = "TBD"; isTBD = true; }

  if (isBye) slot.classList.add("bye");
  if (isTBD || isBye) slot.classList.add("empty");
  if (isPh) slot.classList.add("placeholder");

  // seed number for player
  let seedTxt = "";
  if (isPlayer(val) && !isPh) {
    const idx = state.players.findIndex(p => p.id === val.id);
    if (idx >= 0) seedTxt = "#" + (idx + 1);
  }

  const seedSpan = el("span", "slot-seed", seedTxt);
  slot.appendChild(seedSpan);

  if (isPlayer(val) && !isPh) {
    slot.appendChild(makeHead(val.name, 30, "slot-head"));
  } else {
    slot.appendChild(el("div", "slot-head"));
  }
  slot.appendChild(el("span", "slot-name", esc(name)));

  // winner / loser styling
  if (otherDecidedWinner && isPlayer(val) && !isPh) {
    if (m._winner.id === val.id) slot.classList.add("winner");
    else slot.classList.add("eliminated");
  }

  // score + interactivity (placeholders are not interactive)
  const bothPresent = isPlayer(m._a) && isPlayer(m._b) && !m._a.placeholder && !m._b.placeholder;
  if (bothPresent && isPlayer(val)) {
    const wins = key === "a" ? m._aWins : m._bWins;
    const th = m._th || 1;
    // show the running score once it's a series (BO>1 / FT>1) or a game has been played
    const showScore = th > 1 || m._decided || (m._aWins + m._bWins) > 0;
    slot.appendChild(el("span", "slot-score", showScore ? String(wins) : ""));
    if (th > 1) slot.appendChild(el("span", "pick-hint", "+1"));
    else slot.appendChild(el("span", "pick-hint", "win"));
    slot.onclick = () => addGame(m.id, val.id);
  } else {
    slot.classList.add("locked");
    slot.appendChild(el("span", "slot-score", ""));
  }
  return slot;
}

/* left-click a slot: award that player a game. If the match is already decided,
   clicking the current winner does nothing; clicking is capped at the threshold. */
function addGame(matchId, playerId) {
  const m = currentGraph.M[matchId];
  if (!m || !isPlayer(m._a) || !isPlayer(m._b)) return;
  const th = winThreshold(m.format);
  const sc = Object.assign({}, state.scores[matchId] || {});
  const cur = sc[playerId] || 0;
  if (m._decided) {
    // already over — a click on the loser bumps them (still can't exceed loser cap), on winner no-op
    if (m._winner && m._winner.id === playerId) return;
  }
  if (cur >= th) return;                 // can't exceed the needed wins
  sc[playerId] = cur + 1;
  state.scores[matchId] = sc;
  save();
  renderBracket();
}

/* ---------- format context menu ---------- */
let _menuEl = null;
function closeFormatMenu() { if (_menuEl) { _menuEl.remove(); _menuEl = null; document.removeEventListener("click", closeFormatMenu); } }
function openFormatMenu(matchId, x, y) {
  closeFormatMenu();
  const cur = state.formats[matchId] || DEFAULT_FORMAT;
  const menu = _menuEl = el("div", "ctx-menu");
  menu.innerHTML = `<div class="ctx-title">Match format</div>`;
  const grid = el("div", "ctx-grid");
  const opts = [
    ["BO", 1], ["BO", 3], ["BO", 5], ["BO", 7],
    ["FT", 1], ["FT", 2], ["FT", 3], ["FT", 5],
  ];
  opts.forEach(([kind, n]) => {
    const active = cur.kind === kind && cur.n === n;
    const b = el("button", "ctx-opt" + (active ? " active" : ""), kind + n);
    b.onclick = ev => { ev.stopPropagation(); setFormat(matchId, kind, n); closeFormatMenu(); };
    grid.appendChild(b);
  });
  menu.appendChild(grid);

  // custom number row
  const customRow = el("div", "ctx-custom");
  customRow.innerHTML = `<span>Custom</span>`;
  const kindSel = el("select", "ctx-select");
  kindSel.innerHTML = `<option value="BO">Best of</option><option value="FT">First to</option>`;
  kindSel.value = cur.kind;
  const numIn = el("input", "ctx-num");
  numIn.type = "number"; numIn.min = "1"; numIn.max = "99"; numIn.value = String(cur.n);
  const apply = el("button", "ctx-apply", "Set");
  apply.onclick = ev => {
    ev.stopPropagation();
    let n = parseInt(numIn.value, 10); if (isNaN(n) || n < 1) n = 1; if (n > 99) n = 99;
    setFormat(matchId, kindSel.value, n); closeFormatMenu();
  };
  [kindSel, numIn, apply].forEach(e => e.addEventListener("click", ev => ev.stopPropagation()));
  customRow.append(kindSel, numIn, apply);
  menu.appendChild(customRow);

  const reset = el("button", "ctx-reset", "Reset match score");
  reset.onclick = ev => { ev.stopPropagation(); delete state.scores[matchId]; save(); renderBracket(); closeFormatMenu(); };
  menu.appendChild(reset);

  document.body.appendChild(menu);
  // position within viewport
  const r = menu.getBoundingClientRect();
  const px = Math.min(x, window.innerWidth - r.width - 8);
  const py = Math.min(y, window.innerHeight - r.height - 8);
  menu.style.left = px + "px";
  menu.style.top = py + "px";
  setTimeout(() => document.addEventListener("click", closeFormatMenu), 0);
}

function setFormat(matchId, kind, n) {
  if (kind === "BO" && n === 1) delete state.formats[matchId];   // default, no need to store
  else state.formats[matchId] = { kind, n };
  delete state.scores[matchId];   // changing format resets the series score
  save();
  renderBracket();
}

/* ---------- SVG connectors ---------- */
function redrawAllConnectors() {
  if (state.view !== "bracket" || state.type === "roundrobin") return;
  $$(".bracket").forEach(drawConnectors);
}
/* draw on next frame, then again shortly after (covers rAF throttling / late layout) */
function scheduleConnectorDraw() {
  requestAnimationFrame(redrawAllConnectors);
  setTimeout(redrawAllConnectors, 60);
  setTimeout(redrawAllConnectors, 250);
}

function drawConnectors(bracket) {
  if (!bracket) return;
  const svg = bracket.querySelector(".svg-connectors");
  if (!svg) return;
  const bRect = bracket.getBoundingClientRect();
  const W = bracket.scrollWidth, H = bracket.scrollHeight;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.innerHTML = "";

  const cards = {};
  bracket.querySelectorAll(".match").forEach(c => { cards[c.dataset.mid] = c; });

  Object.keys(cards).forEach(mid => {
    const m = currentGraph.M[mid];
    if (!m) return;
    [m.a, m.b].forEach(s => {
      if (!s || (s.t !== "winner" && s.t !== "loser")) return;
      const fromCard = cards[s.m];
      const toCard = cards[mid];
      if (!fromCard || !toCard) return; // cross-section feed (e.g. loser drop) — not drawn
      const f = fromCard.getBoundingClientRect();
      const t = toCard.getBoundingClientRect();
      const x1 = f.right - bRect.left, y1 = f.top - bRect.top + f.height / 2;
      const x2 = t.left - bRect.left, y2 = t.top - bRect.top + t.height / 2;
      const midX = (x1 + x2) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
      if (m._a === undefined && m._b === undefined) {} // no lit
      if (currentGraph.M[s.m]._decided) path.classList.add("lit");
      svg.appendChild(path);
    });
  });
}

/* schedule column list (used by round robin + swiss + groups) */
function buildScheduleBox(columns, graph) {
  const box = el("div", "rr-matches");
  columns.forEach(col => {
    if (!col.matchIds.length) return;
    const rd = el("div");
    rd.appendChild(el("div", "rr-round-label", esc(col.label)));
    const bracket = el("div", "bracket");
    bracket.style.gap = "0";
    const round = el("div", "round");
    round.style.minWidth = "auto";
    const inner = el("div", "round-inner");
    inner.style.paddingTop = "0";
    inner.style.gap = "10px";
    col.matchIds.forEach(mid => inner.appendChild(renderMatch(graph.M[mid], graph, null, 0)));
    round.appendChild(inner);
    bracket.appendChild(round);
    rd.appendChild(bracket);
    box.appendChild(rd);
  });
  return box;
}

/* standings table; opts.cutoff draws a qualification line after row N */
function buildStandingsTable(rows, opts) {
  opts = opts || {};
  const table = el("table", "standings");
  table.innerHTML = `<thead><tr><th class="c">#</th><th>Player</th><th class="c">W</th><th class="c">L</th><th class="c">GP</th></tr></thead>`;
  const tbody = el("tbody");
  rows.forEach((row, i) => {
    const qualifies = opts.cutoff && i < opts.cutoff;
    const tr = el("tr", (qualifies ? "qualifies " : "") + (i === 0 && row.w > 0 ? "leader" : ""));
    if (opts.cutoff && i === opts.cutoff) tr.classList.add("cut");
    const pc = el("td"); const pcw = el("div", "stand-player");
    pcw.appendChild(makeHead(row.player.name, 26));
    pcw.appendChild(el("span", null, esc(row.player.name)));
    if (qualifies) pcw.appendChild(el("span", "qual-badge", "Q"));
    pc.appendChild(pcw);
    tr.innerHTML = `<td class="c rr-rank">${i + 1}</td>`;
    tr.appendChild(pc);
    tr.insertAdjacentHTML("beforeend", `<td class="c">${row.w}</td><td class="c">${row.l}</td><td class="c">${row.gp}</td>`);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

/* ---------- round robin view ---------- */
function renderRoundRobin(scroll, graph) {
  const wrap = el("div", "rr-wrap");
  const matchPanel = el("div", "rr-panel");
  matchPanel.appendChild(el("h3", null, "Schedule"));
  matchPanel.appendChild(buildScheduleBox(graph.sections[0].columns, graph));
  const standPanel = el("div", "rr-panel");
  standPanel.appendChild(el("h3", null, "Standings"));
  standPanel.appendChild(buildStandingsTable(standings(graph)));
  wrap.append(matchPanel, standPanel);
  scroll.appendChild(wrap);
}

/* ---------- swiss view ---------- */
function renderSwiss(scroll, graph) {
  const wrap = el("div", "rr-wrap");
  const matchPanel = el("div", "rr-panel");
  const totalR = graph.meta.rounds, shown = graph.sections[0].columns.length;
  matchPanel.appendChild(el("h3", null, `Rounds <span class="soft">(${shown}/${totalR})</span>`));
  matchPanel.appendChild(buildScheduleBox(graph.sections[0].columns, graph));
  const standPanel = el("div", "rr-panel");
  standPanel.appendChild(el("h3", null, "Standings"));
  standPanel.appendChild(buildStandingsTable(standingsFor(graph, state.players)));
  wrap.append(matchPanel, standPanel);
  scroll.appendChild(wrap);
}

/* ---------- group stage view ---------- */
function renderGroups(scroll, graph) {
  const cfg = state.groupConfig;
  const letters = "ABCDEFGHIJKLMNOP";
  const groupSecs = graph.sections.filter(s => s.groupIndex !== undefined);
  const mainSecs = graph.sections.filter(s => s.main);

  // group by groupIndex
  const byGroup = {};
  groupSecs.forEach(s => { (byGroup[s.groupIndex] = byGroup[s.groupIndex] || []).push(s); });

  const groupsWrap = el("div", "groups-wrap");
  Object.keys(byGroup).map(Number).sort((a, b) => a - b).forEach(gi => {
    const secs = byGroup[gi];
    const card = el("div", "group-card");
    card.appendChild(el("div", "group-title", `Group ${letters[gi]}`));
    // matches
    const matchBox = el("div", "group-matches");
    secs.forEach(s => {
      if (s.title && /·/.test(s.title)) matchBox.appendChild(el("div", "group-sub", esc(s.title.split("·").slice(1).join("·").trim())));
      if (cfg.groupFormat === "single" || cfg.groupFormat === "double") {
        const b = buildBracketSection(s, graph);
        matchBox.appendChild(b);
      } else {
        matchBox.appendChild(buildScheduleBox(s.columns, graph));
      }
    });
    card.appendChild(matchBox);
    // standings for round-robin / swiss groups
    if (cfg.groupFormat === "roundrobin" || cfg.groupFormat === "swiss") {
      const gp = groupPlayers(graph, gi);
      const rows = standingsForMatches(groupMatchesOf(graph, gi), gp);
      card.appendChild(buildStandingsTable(rows, { cutoff: cfg.advancePerGroup }));
    } else {
      // elimination: show qualifiers list
      const gp = groupPlayers(graph, gi);
      const ranked = rankSubGraph({ type: cfg.groupFormat, M: groupMatchDict(graph, gi) }, gp);
      const done = groupMatchesOf(graph, gi).every(m => m._decided);
      const ql = el("div", "qual-list");
      ql.appendChild(el("div", "qual-head", `Advancing (${cfg.advancePerGroup})`));
      ranked.slice(0, cfg.advancePerGroup).forEach((p, i) => {
        const row = el("div", "qual-row" + (done ? " q" : ""));
        row.appendChild(el("span", "qual-rank", "#" + (i + 1)));
        row.appendChild(makeHead(p.name, 24, "qual-head-img"));
        row.appendChild(el("span", null, esc(p.name)));
        ql.appendChild(row);
      });
      card.appendChild(ql);
    }
    groupsWrap.appendChild(card);
  });

  scroll.appendChild(el("div", "stage-label", `Group Stage — ${cfg.numGroups} groups · ${cfg.advancePerGroup} advance each`));
  scroll.appendChild(groupsWrap);

  // main bracket
  scroll.appendChild(el("div", "stage-label main", `Main Bracket — ${bracketTypeName(cfg.mainFormat)}`));
  if (!graph.meta.allComplete) {
    scroll.appendChild(el("div", "locked-note", "🔒 The main bracket fills in with the real qualifiers once every group has finished. Placeholder seeds are shown below."));
  }
  if (cfg.mainFormat === "roundrobin" || cfg.mainFormat === "swiss") {
    const box = el("div", "rr-panel");
    mainSecs.forEach(s => box.appendChild(buildScheduleBox(s.columns, graph)));
    scroll.appendChild(box);
  } else {
    mainSecs.forEach(section => {
      if (section.columns.every(c => !c.matchIds.length)) return;
      const block = el("div", "bracket-block");
      const bracket = buildBracketSection(section, graph);
      block.appendChild(bracket);
      scroll.appendChild(block);
    });
    scheduleConnectorDraw();
  }
}

/* helpers to slice group matches out of a composite graph */
function groupMatchesOf(graph, gi) {
  return Object.values(graph.M).filter(m => String(m.id).startsWith(`g${gi}-`));
}
function groupMatchDict(graph, gi) {
  const d = {}; groupMatchesOf(graph, gi).forEach(m => d[m.id] = m); return d;
}
function groupPlayers(graph, gi) {
  return uniquePlayers(groupMatchesOf(graph, gi));
}
function bracketTypeName(t) {
  return { single: "Single Elimination", double: "Double Elimination", roundrobin: "Round Robin", swiss: "Swiss" }[t] || t;
}

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
function setView(v) {
  state.view = v;
  save();
  $("#view-setup").classList.toggle("hidden", v !== "setup");
  $("#view-bracket").classList.toggle("hidden", v !== "bracket");
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.nav === v));
  if (v === "bracket") renderBracket();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ============================================================
   INIT / EVENTS
   ============================================================ */
function init() {
  load();

  // restore config inputs
  $("#tName").value = state.name || "";
  renderModes();
  $$("[data-bracket]").forEach(c => c.classList.toggle("active", c.dataset.bracket === state.type));
  renderConfigPanels();
  renderPlayers();

  // name
  $("#tName").addEventListener("input", e => { state.name = e.target.value; save(); });

  // bracket type
  $("#bracketTypes").addEventListener("click", e => {
    const chip = e.target.closest("[data-bracket]");
    if (!chip) return;
    state.type = chip.dataset.bracket;
    state.scores = {}; state.formats = {};              // reset progress on type change
    save();
    $$("[data-bracket]").forEach(c => c.classList.toggle("active", c === chip));
    renderConfigPanels();
    refreshGenerate();
  });

  // swiss rounds stepper
  const maxSwiss = () => Math.max(1, state.players.length - 1);
  $("#swissMinus").addEventListener("click", () => {
    const cur = state.swissRounds || swissRoundCount(state.players.length || 2);
    state.swissRounds = Math.max(1, cur - 1); state.scores = {}; save(); renderConfigPanels();
  });
  $("#swissPlus").addEventListener("click", () => {
    const cur = state.swissRounds || swissRoundCount(state.players.length || 2);
    state.swissRounds = Math.min(maxSwiss(), cur + 1); state.scores = {}; save(); renderConfigPanels();
  });
  $("#swissAuto").addEventListener("click", () => { state.swissRounds = null; state.scores = {}; save(); renderConfigPanels(); });

  // group config controls
  const gc = () => state.groupConfig;
  const resetProgress = () => { state.scores = {}; state.formats = {}; };
  $("#grpMinus").addEventListener("click", () => { gc().numGroups = Math.max(1, gc().numGroups - 1); resetProgress(); save(); renderConfigPanels(); refreshGenerate(); });
  $("#grpPlus").addEventListener("click", () => {
    const maxG = Math.max(1, Math.floor((state.players.length || 2) / 2));
    gc().numGroups = Math.min(maxG, gc().numGroups + 1); resetProgress(); save(); renderConfigPanels(); refreshGenerate();
  });
  $("#advMinus").addEventListener("click", () => { gc().advancePerGroup = Math.max(1, gc().advancePerGroup - 1); resetProgress(); save(); renderConfigPanels(); });
  $("#advPlus").addEventListener("click", () => { gc().advancePerGroup = Math.min(8, gc().advancePerGroup + 1); resetProgress(); save(); renderConfigPanels(); });
  $("#groupFormat").addEventListener("change", e => { gc().groupFormat = e.target.value; resetProgress(); save(); renderConfigPanels(); });
  $("#mainFormat").addEventListener("change", e => { gc().mainFormat = e.target.value; resetProgress(); save(); renderConfigPanels(); });

  // add player
  const addForm = $("#addPlayerForm");
  const input = $("#playerInput");
  input.addEventListener("input", updateAddPreview);
  addForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = input.value.trim();
    const hint = $("#addHint");
    if (name.length < 2) { hint.textContent = "Enter a valid Minecraft username."; hint.classList.add("error"); return; }
    if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      hint.textContent = `"${name}" is already added.`; hint.classList.add("error"); return;
    }
    if (state.players.length >= 128) { hint.textContent = "Player limit reached (128)."; hint.classList.add("error"); return; }
    hint.textContent = "Type a Minecraft username — the skin head loads automatically.";
    hint.classList.remove("error");
    state.players.push({ id: "p" + (pidCounter++), name });
    state.scores = {}; state.formats = {};
    input.value = "";
    updateAddPreview();
    save();
    renderPlayers();
    input.focus();
  });

  // quick actions — sample count stepper + add
  const sampleAvailable = () => SAMPLE.filter(n => !state.players.some(p => p.name.toLowerCase() === n.toLowerCase()));
  const clampSampleCount = () => {
    const avail = sampleAvailable().length;
    let c = parseInt($("#sampleCount").value, 10);
    if (isNaN(c) || c < 1) c = 1;
    c = Math.min(c, Math.max(1, avail));
    $("#sampleCount").value = c;
    $("#sampleCount").max = Math.max(1, avail);
    return c;
  };
  $("#sampleMinus").addEventListener("click", () => { $("#sampleCount").value = Math.max(1, (parseInt($("#sampleCount").value, 10) || 1) - 1); });
  $("#samplePlus").addEventListener("click", () => { $("#sampleCount").value = (parseInt($("#sampleCount").value, 10) || 0) + 1; clampSampleCount(); });
  $("#sampleCount").addEventListener("input", clampSampleCount);
  $("#seedSample").addEventListener("click", () => {
    const count = clampSampleCount();
    const avail = sampleAvailable();
    let added = 0;
    for (const n of avail) {
      if (added >= count || state.players.length >= 128) break;
      state.players.push({ id: "p" + (pidCounter++), name: n });
      added++;
    }
    state.scores = {}; state.formats = {}; save(); renderPlayers();
  });
  $("#clearPlayers").addEventListener("click", () => {
    if (!state.players.length) return;
    if (confirm("Remove all players?")) { state.players = []; state.scores = {}; state.formats = {}; save(); renderPlayers(); }
  });

  // generate
  $("#generateBtn").addEventListener("click", () => {
    if (state.players.length < 2) return;
    state.scores = {}; state.formats = {};   // fresh bracket
    save();
    setView("bracket");
  });

  // nav
  $$("[data-nav]").forEach(b => b.addEventListener("click", e => {
    e.preventDefault();
    const v = b.dataset.nav;
    if (v === "bracket" && state.players.length < 2) { setView("setup"); return; }
    setView(v);
  }));
  $("#backToSetup").addEventListener("click", () => setView("setup"));
  $("#resetAll").addEventListener("click", () => {
    if (confirm("Reset everything and start over?")) {
      state = { name: "", type: "single", mode: "sword", players: [], view: "setup", scores: {}, formats: {}, swissRounds: null, groupConfig: { numGroups: 2, groupFormat: "roundrobin", advancePerGroup: 2, mainFormat: "single" } };
      pidCounter = 1; save();
      $("#tName").value = "";
      renderModes();
      $$("[data-bracket]").forEach(c => c.classList.toggle("active", c.dataset.bracket === "single"));
      renderPlayers();
      setView("setup");
    }
  });

  // redraw connectors on resize
  let rz;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(redrawAllConnectors, 120);
  });

  // initial view
  setView(state.view === "bracket" && state.players.length >= 2 ? "bracket" : "setup");
}

document.addEventListener("DOMContentLoaded", init);
