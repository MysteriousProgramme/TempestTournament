/* ============================================================
   Tempest PVP Tournament Maker
   ============================================================ */
"use strict";

/* ---------- PvP modes (icons sourced from pvphq.com; vanilla = crystal pvp) ---------- */
const MODES = [
  { id: "sword",   name: "Sword",   img: "assets/modes/sword.png" },
  { id: "axe",     name: "Axe",     img: "assets/modes/axe.png" },
  { id: "mace",    name: "Mace",    img: "assets/modes/mace.png" },
  { id: "spear",   name: "Spear Mace", img: "assets/modes/spear.png" },
  { id: "uhc",     name: "UHC",     img: "assets/modes/uhc.png" },
  { id: "nethpot", name: "NethPot", img: "assets/modes/nethpot.png" },
  { id: "pot",     name: "Pot",     img: "assets/modes/pot.png" },
  { id: "smp",     name: "SMP",     img: "assets/modes/smp.png" },
  { id: "diasmp",  name: "DiaSMP",  img: "assets/modes/diasmp.png" },
  { id: "cart",    name: "Cart",    img: "assets/modes/cart.png" },
  { id: "vanilla", name: "Vanilla", img: "assets/modes/vanilla.png" },
];

/* ---------- skill tiers (HT1 = best … LT5 = worst) ----------------------
   `rank` is the sort key: 1 is the strongest. Unranked players sort last. */
const TIERS = [
  { id: "HT1", label: "HT1", name: "High Tier 1", rank: 1,  n: 1 },
  { id: "LT1", label: "LT1", name: "Low Tier 1",  rank: 2,  n: 1 },
  { id: "HT2", label: "HT2", name: "High Tier 2", rank: 3,  n: 2 },
  { id: "LT2", label: "LT2", name: "Low Tier 2",  rank: 4,  n: 2 },
  { id: "HT3", label: "HT3", name: "High Tier 3", rank: 5,  n: 3 },
  { id: "LT3", label: "LT3", name: "Low Tier 3",  rank: 6,  n: 3 },
  { id: "HT4", label: "HT4", name: "High Tier 4", rank: 7,  n: 4 },
  { id: "LT4", label: "LT4", name: "Low Tier 4",  rank: 8,  n: 4 },
  { id: "HT5", label: "HT5", name: "High Tier 5", rank: 9,  n: 5 },
  { id: "LT5", label: "LT5", name: "Low Tier 5",  rank: 10, n: 5 },
];
const UNRANKED = { id: "", label: "UR", name: "Unranked", rank: 99, n: 0 };
const tierById = id => TIERS.find(t => t.id === id) || UNRANKED;
const tierRank = p => tierById(p && p.tier).rank;
/* Normalise whatever a tier list calls a tier ("HT1", "high tier 1", "lt3") to our id. */
function normTier(v) {
  if (v == null) return "";
  const s = String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^(H|L)(?:IGH|OW)?T(?:IER)?([1-5])$/.exec(s);
  return m ? m[1] + "T" + m[2] : "";
}
function tierBadge(tierId, cls) {
  const t = tierById(tierId);
  const b = el("span", "tier-badge t" + t.n + (t.id[0] === "H" ? " ht" : t.id ? " lt" : " ur") + (cls ? " " + cls : ""), t.label);
  b.title = t.name;
  return b;
}

// Fisher–Yates shuffle (returns a new array)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- live sample sources (Minecraft PvP tier lists) ------------------
   Real ranked usernames are pulled from five community tier lists, giving an
   effectively unlimited pool of sample players.

   • MCTiers & SubTiers expose an open-CORS JSON API, so they're fetched
     directly from the browser.
   • PvPTiers, MCPVP & Central Tiers do NOT allow cross-origin browser
     requests (no `Access-Control-Allow-Origin`, and MCPVP additionally sits
     behind Cloudflare bot protection). A static page can't reach them on its
     own, so we route those through public CORS proxies as a best effort —
     this depends on third-party proxies and may occasionally be unavailable.

   Each source exposes: modes[], url(mode), parse(responseText) → [{name, tier}],
   and `direct` (true = try a same-origin-style fetch before any proxy). The tier
   is best-effort — when a source labels its groups something we don't recognise
   the player simply comes in unranked. */
const tierEntry = (name, tier) => ({ name, tier: normTier(tier) });
const tierDictEntries = txt => {         // MCTiers/SubTiers { tier: [{name}] }
  const d = JSON.parse(txt);
  if (Array.isArray(d)) return d.map(r => tierEntry(r && r.name, r && (r.tier || r.tierName)));
  return Object.entries(d).flatMap(([key, rows]) =>
    (Array.isArray(rows) ? rows : []).map(r => tierEntry(r && r.name, normTier(key) || (r && r.tier))));
};
const SAMPLE_SOURCES = [
  { id: "mctiers", label: "MCTiers", direct: true,
    modes: ["sword", "axe", "mace", "pot", "nethop", "uhc", "smp", "vanilla"],
    url: m => `https://mctiers.com/api/v2/mode/${m}?count=50`, parse: tierDictEntries },
  { id: "subtiers", label: "SubTiers", direct: true,
    modes: ["dia_crystal", "dia_smp", "bow", "trident", "bed", "elytra",
            "debuff", "manhunt", "minecart", "speed", "og_vanilla", "creeper"],
    url: m => `https://subtiers.net/api/v2/mode/${m}?count=50`, parse: tierDictEntries },
  { id: "pvptiers", label: "PvPTiers", direct: false,
    modes: ["all"],
    url: () => `https://pvptiers.com/api/results/all`,
    parse: txt => JSON.parse(txt).map(r => tierEntry(r && r.name, r && r.tier)) },
  { id: "mcpvp", label: "MCPVP", direct: false,
    modes: ["vanilla", "sword", "axe", "pot", "nethop", "smp", "uhc", "mace"],
    url: m => `https://www.mcpvp.com/tiers/data?kit=${m}&include_retired=0`,
    parse: txt => Object.entries(JSON.parse(txt).kitTiers || {}).flatMap(([key, rows]) =>
      (Array.isArray(rows) ? rows : []).map(r => tierEntry(r && r.name, normTier(key) || (r && r.tier)))) },
  { id: "central", label: "Central Tiers", direct: false,
    modes: ["overall", "sword", "CPvP", "netherite", "pot", "mace", "axe", "UHC", "smp", "diasmp"],
    url: m => `https://www.centraltierlist.com/rankings/${m}`,
    // Next.js server-renders the roster into the HTML; scrape the ingameName fields.
    parse: txt => [...txt.matchAll(/ingameName\\?"\s*:\s*\\?"([A-Za-z0-9_]{2,16})/g)].map(m => tierEntry(m[1])) },
];
// Public CORS proxies, tried in order for sources that block direct access.
const CORS_PROXIES = [
  u => "https://proxy.cors.sh/" + u,
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
];
// {name, tier} entries pulled from the sources this session (deduped, case-insensitive)
const fetchedPool = [];
const fetchedSeen = new Set();

// GET a URL as text, trying a direct request first (if allowed) then proxies.
async function fetchText(url, direct) {
  const attempts = direct ? [url] : [];
  for (const p of CORS_PROXIES) attempts.push(p(url));
  for (const attempt of attempts) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(attempt, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return await res.text();
    } catch (e) { /* blocked / timeout — try the next attempt */ }
  }
  return null;
}

// Fetch a batch of usernames from a random tier-list source/mode.
// Resolves with the number of NEW names added to fetchedPool (0 on failure).
async function fetchSampleBatch() {
  const validName = n => typeof n === "string" && /^[A-Za-z0-9_]{2,16}$/.test(n);
  for (const src of shuffle(SAMPLE_SOURCES)) {
    const mode = src.modes[Math.floor(Math.random() * src.modes.length)];
    try {
      const text = await fetchText(src.url(mode), src.direct);
      if (!text) continue;
      let added = 0;
      for (const entry of (src.parse(text) || [])) {
        if (!entry || !validName(entry.name)) continue;
        const key = entry.name.toLowerCase();
        if (fetchedSeen.has(key)) continue;
        fetchedSeen.add(key);
        fetchedPool.push({ name: entry.name, tier: entry.tier || "" });
        added++;
      }
      if (added) return added;
    } catch (e) { /* parse / network failure — fall through to next source */ }
  }
  return 0;
}

/* ---------- state ---------- */
const LS_KEY = "tsmp_state";
let state = {
  name: "",
  type: "single",           // single | double | roundrobin
  mode: "sword",
  players: [],              // {id, name, team, tier}
  view: "home",             // home | servers | setup | bracket | next | schedule
  scores: {},               // matchId -> { playerId: gamesWon }
  formats: {},              // matchId -> { kind:'BO'|'FT', n }
  swissRounds: null,        // null = auto (ceil(log2 n))
  groupConfig: { numGroups: 2, groupFormat: "roundrobin", advancePerGroup: 2, mainFormat: "single" },
  style: "regular",         // regular | switching | pvpchamp
  switchModes: [],          // mode ids to cycle through (switching)
  champModes: [],           // exactly 5 mode ids (pvpchamp)
  matchModes: {},           // matchId -> modeId override (switching)
  champ: {},                // matchId -> { picks:{a,b}, bans:{a,b}, wins:{g1,g2,g3} }
  boards: [],               // saved schedule boards (see makeBoard)
  splitView: true,          // mirrored bracket (halves left + right, final centred)
  serverId: "",             // which server this tournament is played on (optional)
  serverSnap: null,         // name/host of that server, so share links survive a local list
};
const DEFAULT_GROUP = { numGroups: 2, groupFormat: "roundrobin", advancePerGroup: 2, mainFormat: "single" };
function freshState() {
  return { name: "", type: "single", mode: "sword", players: [], view: "home", scores: {}, formats: {},
    swissRounds: null, groupConfig: Object.assign({}, DEFAULT_GROUP), style: "regular",
    switchModes: [], champModes: [], matchModes: {}, champ: {}, boards: [], splitView: true, serverId: "", serverSnap: null };
}

/* ---------- who is using Tempest -------------------------------------------
   Roles, capabilities and the shipped accounts all come from staff.js, so
   this file only implements the mechanics. See that file for the honest
   account of what this protects and what it does not.

   Two ways in:
     Sign up   makes a player account. Anyone can, and it grants nothing.
     Log in    is how staff get their tools. Staff accounts are created for
               them on the Staff tab, never self-registered.

   A share link is always view-only regardless of who is signed in. */
const ROLES = Array.isArray(window.TEMPEST_ROLES) ? window.TEMPEST_ROLES : [];
const CAPS = window.TEMPEST_CAPABILITIES || {};
const FULL_CONTROL_LEVEL = window.TEMPEST_FULL_CONTROL_LEVEL || 6;
const SEED_STAFF = Array.isArray(window.TEMPEST_STAFF) ? window.TEMPEST_STAFF : [];

/* Sub-roles sit alongside the rank rather than inside it: the rank says
   where someone sits on the team, the sub-role says what they do at an
   event. An account can hold any number. */
const SUBROLES = Array.isArray(window.TEMPEST_SUBROLES) ? window.TEMPEST_SUBROLES : [];
const SUBROLE_GROUPS = Array.isArray(window.TEMPEST_SUBROLE_GROUPS) ? window.TEMPEST_SUBROLE_GROUPS : [];
const SUBROLE_CAPS = window.TEMPEST_SUBROLE_CAPABILITIES || {};

const LS_ACCOUNTS = "tempest_accounts";
const LS_SESSION = "tempest_session";
/* accounts shipped in staff.js return on every reload, so removing one
   needs a tombstone too, or it would reappear */
const LS_REMOVED = "tempest_removed";
const LS_ROLE_COLORS = "tempest_role_colors";
const LS_PERMS = "tempest_perms";
const LS_EVENTS = "tempest_events";
/* Cloudflare Workers refuse PBKDF2 above 100k iterations in production, and
   the relay API has to be able to verify what this file derives. Browsers have
   no such cap, so anything already stored at 150k still verifies HERE - see the
   legacy path in signIn, which quietly re-derives it. */
const PBKDF2_ITER = 100000;

/* Roles and sub-roles are coloured the same way, so for anything to do
   with gradients they are one list. */
const PALETTE = () => ROLES.concat(SUBROLES);
const paletteById = id => PALETTE().find(r => r.id === id) || null;

/* The gradient stops shipped in staff.js, kept aside before any local
   override is applied, so "reset" always has something to go back to. */
const ROLE_DEFAULTS = PALETTE().map(r => ({ id: r.id, from: r.from, to: r.to }));
const roleDefault = id => ROLE_DEFAULTS.find(r => r.id === id) || null;

/* Colours picked on the Staff tab live in this browser and win over the
   file, the same arrangement as servers and accounts. Applied before the
   first paint so nothing flashes the old colour. */
function loadRoleColors() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_ROLE_COLORS) || "{}") || {}; } catch (e) {}
  PALETTE().forEach(r => {
    const o = saved[r.id];
    if (o && /^#[0-9a-f]{6}$/i.test(o.from || "") && /^#[0-9a-f]{6}$/i.test(o.to || "")) {
      r.from = o.from;
      r.to = o.to;
    }
  });
}
function saveRoleColors() {
  const out = {};
  PALETTE().forEach(r => {
    const d = roleDefault(r.id);
    // only store what actually differs from the file
    if (!d || d.from !== r.from || d.to !== r.to) out[r.id] = { from: r.from, to: r.to };
  });
  try {
    if (Object.keys(out).length) localStorage.setItem(LS_ROLE_COLORS, JSON.stringify(out));
    else localStorage.removeItem(LS_ROLE_COLORS);
  } catch (e) {}
}
loadRoleColors();

/* ---------- the capability ladder, as edited on the Staff tab ----------
   staff.js holds the defaults. An owner can move any capability up or down
   the ladder, or hand it to a sub-role, without editing a file - so what
   ships and what is in force are two different things and both have to be
   kept. CAP_DEFAULTS is the file as loaded; CAPS is what can() reads.

   A level of null means no rank grants it at all, which is how
   events.assist and tournaments.assist already work: sub-role or nothing. */
const CAP_DEFAULTS = Object.assign({}, CAPS);
const SUBCAP_DEFAULTS = {};
SUBROLES.forEach(sr => { SUBCAP_DEFAULTS[sr.id] = (SUBROLE_CAPS[sr.id] || []).slice(); });

/* Every capability the site knows about, file or override, in a stable order:
   the ones with a rank first, then the sub-role-only ones. */
function allCaps() {
  const fromSubs = Object.values(SUBROLE_CAPS).reduce((a, b) => a.concat(b), []);
  const seen = [];
  Object.keys(CAP_DEFAULTS).concat(Object.keys(CAPS), fromSubs).forEach(c => {
    if (!seen.includes(c)) seen.push(c);
  });
  return seen;
}

function loadPerms() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_PERMS) || "{}") || {}; } catch (e) {}
  applyPerms(saved);
}

/* One shape for both the browser copy and the API copy:
   { caps: { "cap.key": level or null }, subs: { "sub-role-id": ["cap.key"] } } */
function applyPerms(saved) {
  const caps = saved && saved.caps;
  if (caps && typeof caps === "object") {
    Object.keys(caps).forEach(c => {
      const v = caps[c];
      if (v === null) delete CAPS[c];
      else if (typeof v === "number" && v >= 0 && v <= 99) CAPS[c] = v;
    });
  }
  const subs = saved && saved.subs;
  if (subs && typeof subs === "object") {
    Object.keys(subs).forEach(id => {
      if (subById(id) && Array.isArray(subs[id])) {
        SUBROLE_CAPS[id] = subs[id].filter(c => typeof c === "string");
      }
    });
  }
}

/* Store only what differs from staff.js, so editing the file still moves
   anything an owner has not deliberately overridden. */
function permOverrides() {
  const caps = {};
  allCaps().forEach(c => {
    const now = typeof CAPS[c] === "number" ? CAPS[c] : null;
    const was = typeof CAP_DEFAULTS[c] === "number" ? CAP_DEFAULTS[c] : null;
    if (now !== was) caps[c] = now;
  });
  const subs = {};
  SUBROLES.forEach(sr => {
    const now = (SUBROLE_CAPS[sr.id] || []).slice().sort();
    const was = (SUBCAP_DEFAULTS[sr.id] || []).slice().sort();
    if (now.join("|") !== was.join("|")) subs[sr.id] = now;
  });
  const out = {};
  if (Object.keys(caps).length) out.caps = caps;
  if (Object.keys(subs).length) out.subs = subs;
  return out;
}

function savePerms() {
  const out = permOverrides();
  try {
    if (Object.keys(out).length) localStorage.setItem(LS_PERMS, JSON.stringify(out));
    else localStorage.removeItem(LS_PERMS);
  } catch (e) {}
  pushPermsToApi();
}

const subById = id => SUBROLES.find(s => s.id === id) || null;
/* the sub-roles an account actually holds, in the file order */
const subsOf = acc => !acc || !Array.isArray(acc.subs) ? []
  : SUBROLES.filter(s => acc.subs.includes(s.id));
const mySubs = () => session.shared ? [] : subsOf(session.account);

/* now that subById exists, the stored overrides can be validated and applied -
   before anything calls can(), which is the whole point of doing it here */
loadPerms();

const roleById = id => ROLES.find(r => r.id === id) || null;
const roleLevel = id => { const r = roleById(id); return r ? r.level : -1; };
/* staff roles are everything above the player floor */
const staffRoles = () => ROLES.filter(r => r.level >= 1).sort((a, b) => a.level - b.level);

/* ---------- password hashing (PBKDF2-SHA256 over a per-account salt) ---- */
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const fromHex = h => new Uint8Array(String(h).match(/../g).map(x => parseInt(x, 16)));

async function derivePassword(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: iterations || PBKDF2_ITER, hash: "SHA-256" },
    key, 256);
  return toHex(bits);
}
async function makeCredential(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, iterations: PBKDF2_ITER, hash: await derivePassword(password, salt, PBKDF2_ITER) };
}
async function passwordMatches(account, password) {
  if (!account || !account.salt || !account.hash) return false;
  const got = await derivePassword(password, account.salt, account.iterations);
  return got === account.hash;
}

/* ---------- the account store ------------------------------------------
   Seeded from staff.js, then kept in this browser. Accounts made in the
   app are local until they are exported back into staff.js, which the
   Staff tab explains and offers a one-click copy for. */
let ACCOUNTS = [];

function normaliseAccount(a) {
  return {
    username: String(a.username || "").toLowerCase().trim(),
    display: a.display || a.username || "",
    role: roleById(a.role) ? a.role : "player",
    salt: a.salt || "", iterations: a.iterations || PBKDF2_ITER, hash: a.hash || "",
    subs: Array.isArray(a.subs) ? a.subs.filter(id => subById(id)) : [],
    discord: String(a.discord || "").trim(),
    seeded: !!a.seeded,
    createdAt: a.createdAt || 0,
  };
}
function loadAccounts() {
  const seeded = SEED_STAFF.map(a => normaliseAccount(Object.assign({}, a, { seeded: true })));
  let local = [];
  try {
    const raw = localStorage.getItem(LS_ACCOUNTS);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) local = list.map(normaliseAccount);
    }
  } catch (e) {}
  // a locally edited account wins over the shipped one of the same name,
  // so changing someone's role in the app takes effect straight away
  const byName = new Map();
  seeded.forEach(a => byName.set(a.username, a));
  local.forEach(a => byName.set(a.username, a));
  let gone = [];
  try { const l = JSON.parse(localStorage.getItem(LS_REMOVED) || "[]"); if (Array.isArray(l)) gone = l; } catch (e) {}
  ACCOUNTS = [...byName.values()].filter(a => !gone.includes(a.username));
}
function saveAccounts() {
  try { localStorage.setItem(LS_ACCOUNTS, JSON.stringify(ACCOUNTS)); } catch (e) {}
}
const accountByName = u => ACCOUNTS.find(a => a.username === String(u || "").toLowerCase().trim()) || null;

loadAccounts();

/* ---------- session ---------- */
let session = { account: null, role: "visitor", shared: false };

const myLevel = () => session.shared ? -1 : roleLevel(session.role);
const isStaff = () => myLevel() >= 1;
/* kept under its old name: a great deal of existing code asks this */
const isAdmin = () => isStaff();
const isPlayerAccount = () => !!session.account && myLevel() === 0;

/* Owner and Founder are exempt by design - full creative control. */
function can(cap) {
  if (session.shared) return false;
  const lvl = myLevel();
  if (lvl >= FULL_CONTROL_LEVEL) return true;
  const need = CAPS[cap];
  if (typeof need === "number" && lvl >= need) return true;
  // a sub-role can grant something the rank on its own would not
  return mySubs().some(s => (SUBROLE_CAPS[s.id] || []).includes(cap));
}

function restoreSession() {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (!raw) return;
    const who = JSON.parse(raw);
    const acc = accountByName(who && who.username);
    if (acc) { session.account = acc; session.role = acc.role; }
  } catch (e) {}
}
function rememberSession(acc) {
  try {
    if (acc) localStorage.setItem(LS_SESSION, JSON.stringify({ username: acc.username }));
    else localStorage.removeItem(LS_SESSION);
  } catch (e) {}
}
const DEFAULT_FORMAT = { kind: "BO", n: 1 };
function fmtLabel(f) { return (f || DEFAULT_FORMAT).kind + (f || DEFAULT_FORMAT).n; }
function winThreshold(f) { f = f || DEFAULT_FORMAT; return f.kind === "FT" ? f.n : Math.floor(f.n / 2) + 1; }
let pidCounter = 1;

/* ---------- persistence ---------- */
function save() {
  if (session.shared) return;            // never overwrite the viewer's own tournament
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  schedulePublish();                     // live links follow every change
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state = Object.assign(state, s);
      normalisePlayers();
      // reindex pid counter
      state.players.forEach(p => {
        const n = parseInt(String(p.id).replace(/\D/g, ""), 10);
        if (!isNaN(n) && n >= pidCounter) pidCounter = n + 1;
      });
    }
  } catch (e) {}
}
/* older saves (and shared payloads) may predate team/tier */
function normalisePlayers() {
  state.players = (state.players || []).map(p => ({
    id: p.id, name: p.name,
    team: (p.team || "").trim(),
    tier: normTier(p.tier),
    discord: (p.discord || "").trim(),
  }));
  if (state.splitView === undefined) state.splitView = true;
}

/* ============================================================
   SHARE LINKS  — the whole tournament packed into the URL hash
   ============================================================ */
const b64u = {
  enc(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str) {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  },
};
async function squeeze(bytes, mode) {
  const Ctor = mode === "in" ? window.DecompressionStream : window.CompressionStream;
  if (typeof Ctor !== "function") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new Ctor("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) { return null; }
}

/* compact wire format (short keys keep links short) */
function sharePayload() {
  return {
    n: state.name, t: state.type, m: state.mode, y: state.style,
    sm: state.switchModes, cm: state.champModes,
    p: state.players.map(p => [p.id, p.name, p.team || "", p.tier || "", p.discord || ""]),
    sc: state.scores, f: state.formats, mm: state.matchModes, ch: state.champ,
    sr: state.swissRounds, gc: state.groupConfig, sv: state.splitView ? 1 : 0,
    srv: state.serverId || "",
    srvs: state.serverSnap || null,
  };
}
function applySharePayload(d) {
  state = Object.assign(freshState(), {
    name: d.n || "", type: d.t || "single", mode: d.m || "sword", style: d.y || "regular",
    switchModes: d.sm || [], champModes: d.cm || [],
    players: (d.p || []).map(([id, name, team, tier, discord]) => ({ id, name, team, tier, discord: discord || "" })),
    scores: d.sc || {}, formats: d.f || {}, matchModes: d.mm || {}, champ: d.ch || {},
    swissRounds: d.sr || null,
    groupConfig: Object.assign({}, DEFAULT_GROUP, d.gc || {}),
    splitView: d.sv === 0 ? false : true,
    serverId: d.srv || "",
    serverSnap: d.srvs || null,
    view: "bracket",
  });
  normalisePlayers();
}

/* ---------- where links point --------------------------------------------------
   Links are built from the address the app is *published* at, which usually
   isn't the address the host is browsing: a bracket opened from a dev server or
   a file:// path would otherwise hand out links nobody else can open. */
const LS_BASE = "tsmp_base";
let publicBase = "";

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;
/* true when the current address only resolves on this machine or LAN */
const isLocalOrigin = () => location.protocol === "file:" || LOCAL_HOST_RE.test(location.hostname);
/* live links and sign-in need a secure context (https, or localhost) */
const isSecureEnough = () => window.isSecureContext !== false && !!(window.crypto && crypto.subtle);

function loadPublicBase() {
  try { publicBase = localStorage.getItem(LS_BASE) || ""; } catch (e) { publicBase = ""; }
}
function setPublicBase(url) {
  publicBase = normaliseBase(url);
  try { publicBase ? localStorage.setItem(LS_BASE, publicBase) : localStorage.removeItem(LS_BASE); } catch (e) {}
}
function normaliseBase(url) {
  const v = String(url || "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) return "";
  return v.split("#")[0].replace(/\?$/, "");
}
const linkBase = () => publicBase || location.href.split("#")[0];

async function buildShareLink() {
  return `${linkBase()}#t=${await buildPayloadString()}`;
}

/* Turn a payload string ("2.<b64>" / "1.<b64>") back into tournament state. */
async function applyPayloadString(str) {
  const m = /^([12])\.(.+)$/.exec(str || "");
  if (!m) return false;
  let bytes = b64u.dec(m[2]);
  if (m[1] === "2") {
    bytes = await squeeze(bytes, "in");
    if (!bytes) return false;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || !Array.isArray(data.p)) return false;
  applySharePayload(data);
  return true;
}

/* the payload string a link (or the relay) carries */
async function buildPayloadString() {
  const bytes = new TextEncoder().encode(JSON.stringify(sharePayload()));
  const packed = await squeeze(bytes, "out");
  return packed ? `2.${b64u.enc(packed)}` : `1.${b64u.enc(bytes)}`;
}

/* Read a shared tournament out of the URL hash. Returns true when one loaded.
   A link that's been cut short or edited fails here — and the caller keeps the
   session as a viewer rather than falling through to the host's own screen. */
async function loadFromHash() {
  const m = /^#t=([12]\..+)$/.exec(location.hash || "");
  if (!m) { session.linkFailed = "the link looks cut short"; return false; }
  try {
    const ok = await applyPayloadString(m[1]);
    if (!ok) session.linkFailed = "the link is damaged";
    return ok;
  } catch (e) {
    session.linkFailed = "the link is damaged";
    return false;
  }
}


/* ============================================================
   LIVE LINKS  — one short permanent URL that keeps itself current
   ------------------------------------------------------------
   Two ways to carry the updates:

   • "instant" (default, nothing to install) — publishes to a public
     pub/sub relay (ntfy.sh, or your own ntfy server). Viewers hold an
     EventSource open, so updates land the moment you publish. The topic is
     public, so every message is *signed*: the host's browser keeps an
     ECDSA private key, the link carries only the public key, and viewers
     ignore anything not signed by that key. Messages are append-only, so
     nobody with the link can erase or fake the bracket.

   • "relay" — your own Cloudflare Worker (see relay/README.md). Writes are
     restricted by a token, viewers poll it. Nothing is public.

   Either way the signing key / write token never leaves the host's browser,
   so a viewer can never publish.
   ============================================================ */
const LS_LIVE = "tsmp_live";
const LIVE_POLL_MS = 8000;             // own-relay polling
const PUBLISH_DEBOUNCE_MS = 1500;
const NTFY_DEFAULT = "https://ntfy.sh";
const NTFY_MAX_BODY = 4000;            // ntfy.sh caps a message around 4 KB

/* admin-side config (device-local, never part of the tournament state) */
let live = {
  mode: "",          // "instant" | "relay"
  on: false,
  seq: 0,            // monotonic, so viewers can't be replayed an older state
  server: "", topic: "", pub: "", privJwk: null,   // instant
  url: "", token: "", id: "",                      // own relay
};
let _privKey = null;   // the imported signing key, kept out of localStorage

/* what the status chip shows, for admin and viewer alike */
let liveState = { mode: "off", text: "", error: "", version: 0, at: 0, checkedAt: 0 };

const liveOn = () => !!(live.on && (live.mode === "relay"
  ? (live.url && live.token && live.id)
  : (live.topic && live.pub && live.privJwk)));
const relayFor = (base, id) => base.replace(/\/+$/, "") + "/t/" + id;
const ntfyFor = (server, topic) => server.replace(/\/+$/, "") + "/" + topic;

/* a relay that hangs shouldn't leave the host stuck on "Publishing…" forever */
async function relayFetch(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 10000);
  try {
    return await fetch(url, Object.assign({ signal: ctrl.signal, cache: "no-store" }, opts));
  } finally {
    clearTimeout(timer);
  }
}

function loadLive() {
  try {
    const raw = localStorage.getItem(LS_LIVE);
    if (raw) live = Object.assign(live, JSON.parse(raw));
  } catch (e) {}
}
function saveLive() {
  try { localStorage.setItem(LS_LIVE, JSON.stringify(live)); } catch (e) {}
}

const hasWebCrypto = () => !!(window.crypto && crypto.subtle);
async function sha256Hex(s) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* a fresh write token, and the public id derived from it (own-relay mode) */
async function mintRelayKeys() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return { token, id: (await sha256Hex(token)).slice(0, 16) };
}

/* ---------- signing (instant mode) ---------- */
const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" };

/* keypair for a new live link; only the public half goes in the URL */
async function mintSigningKeys() {
  const pair = await crypto.subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  _privKey = pair.privateKey;
  return { pub: b64u.enc(raw), privJwk, topic: "tt" + (await sha256Bytes(raw)).slice(0, 20) };
}
async function signingKey() {
  if (_privKey) return _privKey;
  if (!live.privJwk) return null;
  _privKey = await crypto.subtle.importKey("jwk", live.privJwk, ECDSA, false, ["sign"]);
  return _privKey;
}
async function verifyKeyFrom(pubB64) {
  return crypto.subtle.importKey("raw", b64u.dec(pubB64), ECDSA, false, ["verify"]);
}

/* what actually goes on the wire: the payload plus a signature over it */
async function signMessage(data, seq) {
  const key = await signingKey();
  if (!key) throw new Error("this browser no longer holds the signing key for that link");
  const at = Date.now();
  const canon = `1|${seq}|${at}|${data}`;
  const sig = await crypto.subtle.sign(SIGN_ALG, key, new TextEncoder().encode(canon));
  return JSON.stringify({ v: 1, seq, at, data, sig: b64u.enc(new Uint8Array(sig)) });
}
/* returns the message if it really came from the link's owner, else null */
async function openMessage(key, raw) {
  let m;
  try { m = JSON.parse(raw); } catch (e) { return null; }
  if (!m || m.v !== 1 || typeof m.data !== "string" || typeof m.sig !== "string") return null;
  const canon = `1|${m.seq}|${m.at}|${m.data}`;
  try {
    const ok = await crypto.subtle.verify(SIGN_ALG, key, b64u.dec(m.sig), new TextEncoder().encode(canon));
    return ok ? m : null;
  } catch (e) { return null; }
}

function liveLink() {
  if (!liveOn()) return "";
  const base = linkBase();
  if (live.mode === "relay") {
    return `${base}#live=${live.id}~${b64u.enc(new TextEncoder().encode(live.url.replace(/\/+$/, "")))}`;
  }
  const custom = live.server && live.server !== NTFY_DEFAULT
    ? "~" + b64u.enc(new TextEncoder().encode(live.server)) : "";
  return `${base}#live2=${live.pub}${custom}`;
}

/* ---------- admin: publishing ---------- */
let _pubTimer = null, _pubRunning = false, _pubAgain = false, _pubFails = 0;

/* every state change funnels through save(), so this is the only hook needed */
function schedulePublish(delay) {
  if (!liveOn() || !isAdmin() || session.shared) return;
  if (liveState.mode !== "failed") liveState.mode = "pending";
  renderLiveChip();
  clearTimeout(_pubTimer);
  _pubTimer = setTimeout(publishNow, delay == null ? PUBLISH_DEBOUNCE_MS : delay);
}

async function publishNow() {
  if (!liveOn() || !isAdmin()) return;
  clearTimeout(_pubTimer);
  if (_pubRunning) { _pubAgain = true; return; }      // coalesce, don't stack requests
  _pubRunning = true;
  liveState.mode = "publishing";
  renderLiveChip();
  try {
    const payload = await buildPayloadString();
    const version = live.mode === "relay" ? await publishToRelay(payload) : await publishToNtfy(payload);
    _pubFails = 0;
    liveState = { mode: "live", text: "", error: "", version, at: Date.now(), checkedAt: Date.now() };
  } catch (e) {
    _pubFails++;
    liveState.mode = "failed";
    liveState.error = e && e.name === "AbortError" ? "the relay didn't respond" : String((e && e.message) || e);
  } finally {
    _pubRunning = false;
    renderLiveChip();
    // keep trying by itself — a blip shouldn't leave viewers on a stale bracket
    if (_pubAgain) { _pubAgain = false; schedulePublish(); }
    else if (liveState.mode === "failed") schedulePublish(Math.min(30000, 5000 * _pubFails));
  }
}

/* PUT the bracket to the host's own Worker; returns its version */
async function publishToRelay(payload) {
  const res = await relayFetch(relayFor(live.url, live.id), {
    method: "PUT",
    headers: { "Content-Type": "text/plain", "X-Write-Token": live.token },
    body: payload,
  });
  if (!res.ok) throw new Error(`relay said ${res.status}`);
  const out = await res.json().catch(() => ({}));
  return out.version || 0;
}

/* POST a signed message to the pub/sub topic; returns the sequence number */
async function publishToNtfy(payload) {
  const seq = live.seq + 1;
  const body = await signMessage(payload, seq);
  if (body.length > NTFY_MAX_BODY) {
    throw new Error(`this bracket is ${Math.round(body.length / 1024)} KB — too big for the free relay, use your own`);
  }
  const res = await relayFetch(ntfyFor(live.server, live.topic), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
  });
  if (res.status === 429) throw new Error("the free relay is rate-limiting — it'll retry shortly");
  if (!res.ok) throw new Error(`relay said ${res.status}`);
  live.seq = seq;
  saveLive();
  return seq;
}

/* start a live link. mode: "instant" (public pub/sub) or "relay" (own Worker) */
async function enableLive(mode, opts) {
  opts = opts || {};
  if (!hasWebCrypto()) throw new Error("secure-context");
  if (mode === "relay") {
    const keys = await mintRelayKeys();
    live = Object.assign(freshLive(), {
      mode: "relay", on: true, url: (opts.url || "").replace(/\/+$/, ""), token: keys.token, id: keys.id,
    });
  } else {
    const keys = await mintSigningKeys();
    live = Object.assign(freshLive(), {
      mode: "instant", on: true, server: (opts.server || NTFY_DEFAULT).replace(/\/+$/, ""),
      topic: keys.topic, pub: keys.pub, privJwk: keys.privJwk,
    });
  }
  saveLive();
  await publishNow();
  return liveState.mode === "live";
}
function freshLive() {
  return { mode: "", on: false, seq: 0, server: "", topic: "", pub: "", privJwk: null, url: "", token: "", id: "" };
}

/* stop the current link. The own-relay bracket is deleted outright; a pub/sub
   topic is append-only, so instead we publish a "closed" marker and the link's
   viewers are told the host ended it. */
async function disableLive() {
  const prev = Object.assign({}, live);
  live.on = false;
  saveLive();
  liveState = { mode: "off", text: "", error: "", version: 0, at: 0, checkedAt: 0 };
  renderLiveChip();
  try {
    if (prev.mode === "relay" && prev.url && prev.token && prev.id) {
      await relayFetch(relayFor(prev.url, prev.id), { method: "DELETE", headers: { "X-Write-Token": prev.token } });
    } else if (prev.mode === "instant" && prev.topic) {
      live.seq = prev.seq;                                   // sign with the retiring key
      const body = await signMessage("closed", prev.seq + 1);
      await relayFetch(ntfyFor(prev.server, prev.topic), { method: "POST", body });
    }
  } catch (e) { /* best effort — worst case the old link just stops changing */ }
  _privKey = null;
  live = freshLive();
  saveLive();
}

/* ---------- viewer: watching ---------- */
let _watch = null;
function startLiveWatch(id, relayUrl) {
  _watch = { id, url: relayUrl, etag: "", timer: null, misses: 0 };
  const tick = async () => {
    if (!_watch) return;
    try {
      const res = await relayFetch(relayFor(_watch.url, _watch.id), {
        headers: _watch.etag ? { "If-None-Match": _watch.etag } : {},
      });
      liveState.checkedAt = Date.now();
      if (res.status === 304) {
        _watch.misses = 0;
        liveState.mode = "live";
      } else if (res.ok) {
        const out = await res.json();
        _watch.etag = res.headers.get("ETag") || "";
        _watch.misses = 0;
        if (out.data && out.version !== liveState.version) {
          const view = state.view;
          if (await applyPayloadString(out.data)) {
            state.view = view;                        // don't yank the viewer off their tab
            liveState.version = out.version;
            liveState.at = Date.now();
            rerenderCurrentView();
          }
        }
        liveState.mode = "live";
      } else {
        throw new Error(`relay said ${res.status}`);
      }
      liveState.error = "";
    } catch (e) {
      _watch.misses++;
      liveState.mode = _watch.misses > 1 ? "stalled" : "live";
      liveState.error = e && e.name === "AbortError" ? "the relay didn't respond" : String((e && e.message) || e);
    }
    renderLiveChip();
    _watch.timer = setTimeout(tick, LIVE_POLL_MS);
  };
  tick();
}

/* ---------- viewer: instant mode (signed pub/sub stream) ---------- */
/* Holds an EventSource open, so a published score lands immediately. Anything
   that isn't signed by the key in the link is dropped, and an older sequence
   number can't replace a newer one. */
function startNtfyWatch(topic, server, key) {
  const es = new EventSource(`${ntfyFor(server, topic)}/sse?since=all`);
  const w = { es, seq: 0, closed: false };
  _watch = w;

  es.addEventListener("open", () => {
    liveState.mode = "live";
    liveState.checkedAt = Date.now();
    renderLiveChip();
  });

  es.onmessage = async ev => {
    liveState.checkedAt = Date.now();
    let env;
    try { env = JSON.parse(ev.data); } catch (e) { return; }
    if (env.event && env.event !== "message") return;
    const m = await openMessage(key, env.message || "");
    if (!m) return;                                    // forged or corrupt — ignore it
    if (m.seq <= w.seq) return;                        // replay of an older state
    w.seq = m.seq;
    if (m.data === "closed") {
      w.closed = true;
      liveState.mode = "closed";
      renderLiveChip();
      showLiveClosed();
      return;
    }
    const view = state.view;
    if (await applyPayloadString(m.data)) {
      state.view = view;                               // don't yank the viewer off their tab
      liveState.version = m.seq;
      liveState.at = m.at || Date.now();
      liveState.mode = "live";
      liveState.error = "";
      clearLiveError();
      rerenderCurrentView();
    }
  };

  es.onerror = () => {
    // EventSource reconnects by itself; just reflect it in the chip
    if (w.closed) return;
    liveState.mode = "stalled";
    liveState.error = "lost the connection to the relay";
    renderLiveChip();
  };
  return w;
}

/* first load of an instant live link (#live2=<publicKey>[~<server>]) */
async function loadFromNtfyHash() {
  const m = /^#live2=([A-Za-z0-9_-]{40,})(?:~([A-Za-z0-9_-]+))?$/.exec(location.hash || "");
  if (!m) { session.liveFailed = "that link is incomplete"; return false; }
  if (!hasWebCrypto()) { session.liveFailed = "live links need https:// (or localhost) to check the host's signature"; return false; }

  let server = NTFY_DEFAULT, key, topic;
  try {
    if (m[2]) server = new TextDecoder().decode(b64u.dec(m[2]));
    if (!/^https?:\/\//.test(server)) throw new Error("bad relay address");
    key = await verifyKeyFrom(m[1]);
    topic = "tt" + (await sha256Bytes(b64u.dec(m[1]))).slice(0, 20);
  } catch (e) {
    session.liveFailed = "that link is damaged — ask the host to send it again";
    return false;
  }

  const w = startNtfyWatch(topic, server, key);
  session.liveWatch = { mode: "instant", topic, server };
  // wait briefly for the first signed message; if none arrives we still keep
  // listening, so the bracket appears by itself once the host publishes
  const got = await new Promise(resolve => {
    const started = Date.now();
    const check = () => {
      if (w.seq > 0) return resolve(true);
      if (Date.now() - started > 9000) return resolve(false);
      setTimeout(check, 150);
    };
    check();
  });
  if (!got) session.liveFailed = "waiting for the host to publish the bracket";
  return got;
}

/* first load of an own-relay live link — returns true once a bracket is on screen */
async function loadFromLiveHash() {
  const m = /^#live=([a-f0-9]{8,32})~(.+)$/.exec(location.hash || "");
  if (!m) { session.liveFailed = "that link is incomplete"; return false; }
  let relayUrl;
  try { relayUrl = new TextDecoder().decode(b64u.dec(m[2])); } catch (e) { relayUrl = ""; }
  if (!/^https?:\/\//.test(relayUrl)) {
    session.liveFailed = "that link is damaged — ask the host to send it again";
    return false;
  }
  try {
    const res = await relayFetch(relayFor(relayUrl, m[1]), {}, 12000);
    if (!res.ok) throw new Error(res.status === 404 ? "nothing published on this link yet" : `relay said ${res.status}`);
    const out = await res.json();
    if (!out.data || !(await applyPayloadString(out.data))) throw new Error("couldn't read the bracket");
    liveState = { mode: "live", text: "", error: "", version: out.version || 0, at: Date.now(), checkedAt: Date.now() };
    session.liveWatch = { mode: "relay", id: m[1], url: relayUrl };
    return true;
  } catch (e) {
    session.liveFailed = String((e && e.message) || e);
    return false;
  }
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

/* ============================================================
   AUTO MATCHING
   Two rules drive the draw:
     • Skill — a round-1 match is between *close but different* tiers
       (HT5 vs LT4, never LT4 vs LT4), taken from neighbours in the ranking.
     • Teams — team-mates can't meet before the quarterfinals. Each quarterfinal
       slot is fed by a sub-tree of size/8 bracket slots, so no team may appear
       twice inside one of those blocks.
   Everything below works in *slot space* (bracket positions), which is then
   inverted back through the seed order so the generators reproduce the draw.
   ============================================================ */
const teamKey = p => ((p && p.team) || "").trim().toLowerCase();

/* Pair neighbours in a strength-ranked list, nudging equal-tier pairs apart so a
   match is close on skill without being a mirror of itself. */
function pairAdjacent(ranked) {
  const a = ranked.slice();
  const rank = i => tierRank(a[i]);
  for (let i = 0; i + 1 < a.length; i += 2) {
    if (rank(i) !== rank(i + 1)) continue;
    // nearest player further down the ranking with a different tier
    let j = -1;
    for (let k = i + 2; k < a.length; k++) if (rank(k) !== rank(i)) { j = k; break; }
    // otherwise borrow from the pair just above, if that pair stays mixed
    if (j < 0 && i >= 2 && rank(i - 1) !== rank(i) && rank(i - 2) !== rank(i + 1)) j = i - 1;
    if (j < 0) continue;                          // whole tail is one tier — unavoidable
    const t = a[i + 1]; a[i + 1] = a[j]; a[j] = t;
  }
  const pairs = [];
  for (let i = 0; i < a.length; i += 2) pairs.push([a[i], a[i + 1]]);
  return pairs;
}

/* How many bracket slots feed one quarterfinal slot — keeping a team to one
   player per block is what guarantees team-mates can't meet before the
   quarterfinals. A block can only hold distinct teams if there are at least
   that many teams, so with a short team list we protect the largest sub-tree we
   actually can. 1 = nothing to protect (round 1 *is* the quarterfinals). */
function qfBlockSize(size, teamCount) {
  let b = Math.max(1, size / 8);
  while (b > 1 && teamCount && teamCount < b) b /= 2;
  return b;
}
/* the earliest round two players in one block of `b` slots can meet */
function blockMeetRound(size, b) {
  const total = Math.round(Math.log2(size));
  const round = Math.round(Math.log2(b)) + 1;
  return roundName(total - round, total, "");
}
const roundPhrase = r => /^Round/.test(r) ? r : "the " + r.toLowerCase();

/* Move players between blocks until no team appears twice inside a block.
   Candidates are ranked by how little they disturb the draw (closest tier, and
   preferring not to create a same-tier round-1 match). */
function separateTeams(slots, size, bs) {
  const s = slots.slice();
  const blocks = [];
  for (let i = 0; i < size; i += bs) blocks.push(Array.from({ length: bs }, (_, k) => i + k));
  if (bs < 2) return { slots: s, before: 0, after: 0 };

  const team = i => teamKey(s[i]);
  /* slots in `block` whose team already appeared earlier in the same block */
  const dupes = block => {
    const seen = new Set(), bad = [];
    block.forEach(i => {
      const t = team(i);
      if (!t) return;
      if (seen.has(t)) bad.push(i); else seen.add(t);
    });
    return bad;
  };
  const countDupes = () => blocks.reduce((n, b) => n + dupes(b).length, 0);
  const before = countDupes();
  const opponent = i => (i % 2 === 0 ? i + 1 : i - 1);

  blocks.forEach((block, bi) => {
    for (let guard = 0; guard < bs; guard++) {
      const bad = dupes(block);
      if (!bad.length) break;
      const i = bad[0], ti = team(i);
      let best = null;
      blocks.forEach((other, oi) => {
        if (oi === bi) return;
        other.forEach(j => {
          if (!s[j]) return;                                     // never move a bye
          const tj = team(j);
          if (other.some(k => k !== j && team(k) === ti)) return;      // clashes over there
          if (block.some(k => k !== i && tj && team(k) === tj)) return; // clashes over here
          // tie-break: keep tiers close, and avoid making a same-tier round-1 match
          const dist = Math.abs(tierRank(s[j]) - tierRank(s[i]));
          const mirror = (s[opponent(j)] && tierRank(s[opponent(j)]) === tierRank(s[i]) ? 1 : 0)
                       + (s[opponent(i)] && tierRank(s[opponent(i)]) === tierRank(s[j]) ? 1 : 0);
          const score = dist + mirror * 2;
          if (!best || score < best.score) best = { j, score };
        });
      });
      if (!best) break;
      const t = s[i]; s[i] = s[best.j]; s[best.j] = t;
    }
  });

  return { slots: s, before, after: countDupes() };
}

/* Build the whole draw. Returns the reseeded roster plus what had to give. */
function autoMatchByTier() {
  const n = state.players.length;
  const size = nextPow2(n);
  const nMatches = size / 2;
  const ranked = shuffle(state.players).sort((x, y) => tierRank(x) - tierRank(y));

  // the strongest players take the byes, the rest pair off on tier
  const byes = size - n;
  const pairs = byes >= n
    ? ranked.map(p => [p, null])                       // everyone has a bye (tiny fields)
    : ranked.slice(0, byes).map(p => [p, null]).concat(pairAdjacent(ranked.slice(byes)));

  // scatter matches across the bracket by strength, so the top seeds stay apart
  const mOrder = nMatches < 2 ? [1] : seedOrder(nMatches);
  const slots = new Array(size).fill(null);
  mOrder.forEach((strength, pos) => {
    const m = pairs[strength - 1] || [null, null];
    slots[pos * 2] = m[0];
    slots[pos * 2 + 1] = m[1];
  });

  const teamCount = new Set(state.players.map(teamKey).filter(Boolean)).size;
  const block = qfBlockSize(size, teamCount);
  const fixed = separateTeams(slots, size, block);

  // invert the seed order: slot position p holds the player seeded order[p]
  const order = seedOrder(size);
  const out = new Array(size).fill(null);
  order.forEach((seed, pos) => { out[seed - 1] = fixed.slots[pos]; });

  return {
    players: out.filter(Boolean),
    teamsBefore: fixed.before, teamsAfter: fixed.after,
    mirrors: countMirrorMatches(fixed.slots, size),
    block, teamCount,
    qfBlock: qfBlockSize(size),                 // what a full QF split would need
    protects: block > 1 ? blockMeetRound(size, block) : null,
  };
}

/* round-1 matches where both players sit in the same tier */
function countMirrorMatches(slots, size) {
  let n = 0;
  for (let i = 0; i < size; i += 2) {
    const a = slots[i], b = slots[i + 1];
    if (a && b && a.tier && tierRank(a) === tierRank(b)) n++;
  }
  return n;
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
      const head = avatarStack(p, 38);
      const info = el("div", "player-info");
      info.appendChild(el("span", "player-name", esc(p.name)));
      info.appendChild(el("span", "player-team", p.team ? esc(p.team) : "<i>No team</i>"));
      const edit = el("button", "player-edit", "&#9998;");
      edit.title = "Edit team / tier";
      edit.onclick = () => openPlayerModal(p.id);
      const rm = el("button", "player-remove", "&times;");
      rm.title = "Remove";
      rm.onclick = () => { state.players.splice(i, 1); save(); renderPlayers(); refreshGenerate(); };
      li.append(seed, head, info, discordBadge(p), tierBadge(p.tier), edit, rm);
      listEl.appendChild(li);
    });
  }
  $("#playerCount").textContent = state.players.length;
  // sample availability
  const cap = 128 - state.players.length; // capacity left up to the 128-player cap
  const availEl = $("#sampleAvail");
  if (availEl) availEl.textContent = cap <= 0
    ? "Player limit reached (128)."
    : "Samples load live from MCTiers, SubTiers, PvPTiers, MCPVP & Central Tiers.";
  const scEl = $("#sampleCount");
  if (scEl) {
    scEl.max = Math.max(1, cap);
    if (parseInt(scEl.value, 10) > cap) scEl.value = Math.max(1, cap);
    scEl.disabled = cap <= 0;
  }
  const seedBtn = $("#seedSample");
  if (seedBtn) seedBtn.disabled = cap <= 0;
  const shuffleBtn = $("#shufflePlayers");
  if (shuffleBtn) shuffleBtn.disabled = state.players.length < 2;
  refreshGenerate();
  renderParticipants();          // the roster tab mirrors this list
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

/* fill a <select> with the tier list (best first) */
function fillTierSelect(sel, value) {
  sel.innerHTML = "";
  const none = el("option", null, "Unranked");
  none.value = "";
  sel.appendChild(none);
  TIERS.forEach(t => {
    const o = el("option", null, `${t.label} — ${t.name}`);
    o.value = t.id;
    sel.appendChild(o);
  });
  sel.value = normTier(value);
}

/* edit an existing player's name / team / tier */
function openPlayerModal(playerId) {
  const p = state.players.find(x => x.id === playerId);
  if (!p) return;
  const wrap = el("div", "player-modal");
  wrap.appendChild(el("div", "modal-title", "Edit Player"));
  wrap.appendChild(el("div", "modal-sub", "Team and tier are used by auto matching. Discord is optional."));

  const mk = (label, node) => {
    const f = el("label", "field");
    f.appendChild(el("span", "field-label", label));
    f.appendChild(node);
    return f;
  };
  const nameIn = el("input", "input"); nameIn.type = "text"; nameIn.maxLength = 16; nameIn.value = p.name;
  const teamIn = el("input", "input"); teamIn.type = "text"; teamIn.maxLength = 20; teamIn.value = p.team || "";
  teamIn.placeholder = "Team / clan";
  const tierSel = el("select", "input select"); fillTierSelect(tierSel, p.tier);
  const dcIn = el("input", "input"); dcIn.type = "text"; dcIn.maxLength = 40; dcIn.value = p.discord || "";
  dcIn.placeholder = "Discord username, or their 18-digit ID";
  wrap.append(mk("Minecraft username", nameIn), mk("Representing", teamIn), mk("Tier", tierSel), mk("Discord", dcIn));

  const err = el("p", "hint");
  wrap.appendChild(err);

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.onclick = closeModal;
  const ok = el("button", "btn btn-primary", "Save");
  ok.onclick = () => {
    const name = nameIn.value.trim();
    if (name.length < 2) { err.textContent = "Enter a valid Minecraft username."; err.classList.add("error"); return; }
    if (state.players.some(x => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) {
      err.textContent = `"${name}" is already added.`; err.classList.add("error"); return;
    }
    p.name = name;
    p.team = teamIn.value.trim();
    p.tier = tierSel.value;
    p.discord = dcIn.value.trim();
    save();
    renderPlayers();
    closeModal();
  };
  actions.append(cancel, ok);
  wrap.appendChild(actions);
  openModal(wrap);
  nameIn.focus();
}

/* ============================================================
   RENDER — bracket
   ============================================================ */
let currentGraph = null;

function renderBracket() {
  // nothing built yet, and no controls to build it with
  if (!isAdmin() && state.players.length < 2 && !session.shared) {
    $("#bracketMode").textContent = "TEMPEST PVP";
    $("#bracketName").textContent = "No tournament yet";
    $("#championBadge").classList.add("hidden");
    const scroll = $("#bracketScroll");
    scroll.innerHTML = "";
    const box = el("div", "locked-note", "No bracket has been built on this device yet. The tournament host signs in to create one — everyone else follows the link they share.");
    scroll.appendChild(box);
    const signin = el("button", "btn btn-primary", "Host sign in");
    signin.style.marginTop = "14px";
    signin.onclick = openLoginModal;
    scroll.appendChild(signin);
    return;
  }
  const graph = currentGraph = resolve(buildGraphWithState());
  syncScoresFromGraph(graph);
  const typeLabel = { single: "SINGLE ELIM", double: "DOUBLE ELIM", roundrobin: "ROUND ROBIN", swiss: "SWISS", groups: "GROUP STAGE" }[state.type];
  let modeHtml;
  if (state.style === "switching") {
    const icons = (state.switchModes.length ? state.switchModes : [state.mode]).map(id => `<img class="mode-eyebrow-img" src="${modeById(id).img}" alt="">`).join("");
    modeHtml = `${icons} SWITCHING · ${typeLabel}`;
  } else if (state.style === "pvpchamp") {
    const icons = state.champModes.map(id => `<img class="mode-eyebrow-img" src="${modeById(id).img}" alt="">`).join("");
    modeHtml = `${icons} PVPCHAMP · ${typeLabel}`;
  } else {
    const mode = modeById(state.mode);
    modeHtml = `<img class="mode-eyebrow-img" src="${mode.img}" alt=""> ${mode.name.toUpperCase()} · ${typeLabel}`;
  }
  $("#bracketMode").innerHTML = modeHtml;
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
  // PvPChamp: every match is a best-of-3 (first to 2)
  if (state.style === "pvpchamp") Object.values(g.M).forEach(m => { m.format = { kind: "BO", n: 3 }; });
  return g;
}

/* the mode a Switching-tournament match is played in (cycled, override-able) */
function switchModeFor(m) {
  if (state.matchModes[m.id]) return state.matchModes[m.id];
  const list = state.switchModes.length ? state.switchModes : [state.mode];
  return list[((m.no || 1) - 1) % list.length];
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

function connectorLayer() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "svg-connectors");
  return svg;
}

function buildBracketSection(section, graph, opts) {
  if ((!opts || opts.split !== false) && state.splitView !== false && isSplittable(section, graph))
    return buildSplitSection(section, graph);

  const bracket = el("div", "bracket");
  bracket.appendChild(connectorLayer());

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

/* A section can be mirrored when it's a clean elimination tree: every column is
   half the size of the one before it and it ends in a single match. */
function isSplittable(section, graph) {
  const cols = section.columns.filter(c => c.matchIds.length);
  if (cols.length < 2) return false;
  if (cols[cols.length - 1].matchIds.length !== 1) return false;
  for (let i = 1; i < cols.length; i++) {
    if (cols[i].matchIds.length * 2 !== cols[i - 1].matchIds.length) return false;
  }
  // a bracket reset column isn't part of the tree
  return !cols.some(c => c.matchIds.some(id => graph.M[id] && graph.M[id].reset));
}

/* Broadcast layout: the top half of the tree runs left→right on the left, the
   bottom half runs right→left on the right, and the final sits in the middle.
   The two halves of an elimination tree are independent sub-trees, so slicing
   each column in half keeps every feed inside its own side. */
function buildSplitSection(section, graph) {
  const cols = section.columns.filter(c => c.matchIds.length);
  const feeders = cols.slice(0, -1);
  const finalCol = cols[cols.length - 1];

  const bracket = el("div", "bracket split");
  bracket.appendChild(connectorLayer());

  const buildSide = which => {
    const side = el("div", "split-side " + which);
    feeders.forEach(col => {
      const half = col.matchIds.length / 2;
      const ids = which === "left" ? col.matchIds.slice(0, half) : col.matchIds.slice(half);
      const round = el("div", "round");
      round.appendChild(el("div", "round-label", esc(col.label)));
      const inner = el("div", "round-inner");
      ids.forEach((mid, i) => inner.appendChild(renderMatch(graph.M[mid], graph, section, i)));
      round.appendChild(inner);
      side.appendChild(round);
    });
    return side;
  };

  const centre = el("div", "round split-centre");
  centre.appendChild(el("div", "round-label", esc(finalCol.label)));
  const cInner = el("div", "round-inner");
  const finalId = finalCol.matchIds[0];
  cInner.appendChild(renderMatch(graph.M[finalId], graph, section, 0));
  // only crown here when this really is the tournament's last match
  const meta = graph.meta || {};
  const isTrueFinal = meta.finalId === finalId || (meta.mainMeta && meta.mainMeta.finalId === finalId);
  const champ = isTrueFinal ? champion(graph) : null;
  if (champ) {
    const crown = el("div", "centre-champ");
    crown.appendChild(el("span", "centre-champ-label", "CHAMPION"));
    const body = el("div", "centre-champ-body");
    body.appendChild(makeHead(champ.name, 34, "centre-champ-head"));
    body.appendChild(el("span", null, esc(champ.name)));
    crown.appendChild(body);
    cInner.appendChild(crown);
  }
  centre.appendChild(cInner);

  bracket.append(buildSide("left"), centre, buildSide("right"));
  // wrapper the fit pass can scale + collapse to the scaled height
  const fit = el("div", "bracket-fit");
  fit.appendChild(bracket);
  return fit;
}

/* Fit a mirrored bracket to the canvas so the whole draw is visible at once:
   the canvas first widens to the window (a split bracket is much wider than the
   page column), then columns tighten, then it zooms out only if still too wide.
   `zoom` (not `transform`) so the layout box shrinks with it and nothing
   overflows. MIN_FIT keeps it readable — past that the canvas scrolls instead. */
const MIN_FIT = 0.72;
function fitBrackets() {
  const scroll = $("#bracketScroll");
  if (scroll) scroll.classList.toggle("wide", !!scroll.querySelector(".bracket-fit"));

  $$("#bracketScroll .bracket-fit").forEach(fit => {
    const bracket = fit.firstElementChild;
    if (!bracket) return;
    const avail = fit.clientWidth - 2;      // the wrapper is exactly the canvas content box
    if (avail <= 0) return;

    // pass 1 — full size, then compact columns, keeping the first that fits
    let scale = 1;
    bracket.style.zoom = "";
    bracket.classList.remove("compact");
    if (bracket.offsetWidth > avail) bracket.classList.add("compact");

    // pass 2 — zoom out the remainder
    const w = bracket.offsetWidth;
    if (w > avail) {
      scale = Math.max(MIN_FIT, avail / w);
      bracket.style.zoom = String(scale);
    }
    bracket.dataset.fitScale = String(scale);
  });
}

function renderMatch(m, graph, section, idxInCol) {
  const done = m._decided && m._winner;
  const isChamp = state.style === "pvpchamp";
  const card = el("div", "match" + (done ? " done" : "") + (isChamp ? " champ" : ""));
  card.dataset.mid = m.id;

  const head = el("div", "match-num");
  const label = m.reset ? "RESET" : (section && section.key === "GF" ? "GF" : "M" + (m.no || "?"));
  const fmt = m.format || DEFAULT_FORMAT;
  let rightHtml = `<span class="match-fmt" title="Right-click to change format">${fmtLabel(fmt)}</span>`;
  // switching: show the match's mode
  if (state.style === "switching") {
    const mo = modeById(switchModeFor(m));
    rightHtml = `<span class="match-mode" title="Right-click to change mode"><img src="${mo.img}" alt="">${mo.name}</span>`;
  } else if (isChamp) {
    rightHtml = `<span class="match-fmt">BO3</span>`;
  }
  head.innerHTML = `<span>${label}</span>${rightHtml}`;
  card.appendChild(head);

  card.appendChild(renderSlot(m, "a", graph));
  card.appendChild(renderSlot(m, "b", graph));

  // PvPChamp: pick/ban summary + manage button
  if (isChamp) card.appendChild(renderChampFooter(m));

  // right-click context menu (format, and mode for switching) — admin only
  if (isAdmin()) card.addEventListener("contextmenu", e => { e.preventDefault(); openFormatMenu(m.id, e.clientX, e.clientY); });
  return card;
}

/* compact pick/ban summary shown under a PvPChamp match */
function renderChampFooter(m) {
  const foot = el("div", "champ-foot");
  const bothReal = isPlayer(m._a) && isPlayer(m._b) && !m._a.placeholder && !m._b.placeholder;
  if (!bothReal) { foot.appendChild(el("span", "champ-hint", "Waiting for players…")); return foot; }
  const c = state.champ[m.id];
  const games = champGames(m);
  if (!games) {
    foot.appendChild(el("span", "champ-hint", "Modes not set"));
    if (isAdmin()) {
      const btn = el("button", "btn btn-ghost btn-sm champ-manage", "Pick / Ban →");
      btn.onclick = ev => { ev.stopPropagation(); openChampModal(m.id); };
      foot.appendChild(btn);
    }
  } else {
    const row = el("div", "champ-games");
    games.forEach((g, i) => {
      const mo = modeById(g.mode);
      const w = c && c.wins && c.wins["g" + (i + 1)];
      const chip = el("span", "cgame" + (g.decider ? " decider" : "") + (w ? " won" : ""));
      chip.innerHTML = `<img src="${mo.img}" alt=""><em>G${i + 1}</em>`;
      chip.title = `Game ${i + 1}: ${mo.name}${g.decider ? " (decider)" : ""}`;
      row.appendChild(chip);
    });
    foot.appendChild(row);
    if (isAdmin()) {
      const btn = el("button", "btn btn-ghost btn-sm champ-manage", m._decided ? "View" : "Play →");
      btn.onclick = ev => { ev.stopPropagation(); openChampModal(m.id); };
      foot.appendChild(btn);
    }
  }
  return foot;
}

/* ---------- PvPChamp pick/ban helpers ---------- */
function champUsed(c) { return [c.picks.a, c.picks.b, c.bans.a, c.bans.b].filter(Boolean); }
function champComplete(c) { return !!(c && c.picks.a && c.picks.b && c.bans.a && c.bans.b); }
function champDecider(c) {
  const used = champUsed(c);
  return state.champModes.find(id => !used.includes(id)) || null;
}
/* ordered games once pick/ban is complete, else null */
function champGames(m) {
  const c = state.champ[m.id];
  if (!champComplete(c)) return null;
  return [
    { mode: c.picks.a },
    { mode: c.picks.b },
    { mode: champDecider(c), decider: true },
  ];
}
function ensureChamp(matchId) {
  if (!state.champ[matchId]) state.champ[matchId] = { picks: {}, bans: {}, wins: {} };
  const c = state.champ[matchId];
  c.picks = c.picks || {}; c.bans = c.bans || {}; c.wins = c.wins || {};
  return c;
}
/* recompute the match win tally from recorded game winners */
function syncChampScore(matchId, aId, bId) {
  const c = state.champ[matchId];
  if (!c || !c.wins) { delete state.scores[matchId]; return; }
  let aw = 0, bw = 0;
  Object.values(c.wins).forEach(pid => { if (pid === aId) aw++; else if (pid === bId) bw++; });
  const sc = {};
  if (aw) sc[aId] = aw;
  if (bw) sc[bId] = bw;
  if (aw || bw) state.scores[matchId] = sc; else delete state.scores[matchId];
}

/* ---------- PvPChamp match modal ---------- */
function openChampModal(matchId) {
  const build = () => {
    const m = currentGraph.M[matchId];
    if (!m || !isPlayer(m._a) || !isPlayer(m._b)) { closeModal(); return; }
    const A = m._a, B = m._b;
    const c = ensureChamp(matchId);
    const wrap = el("div", "champ-modal");

    wrap.appendChild(el("div", "modal-title", "PvPChamp Match"));
    const vs = el("div", "champ-vs");
    vs.innerHTML = `<span class="cvs-p"><img src="${headUrl(A.name,28)}" alt="">${esc(A.name)}</span><span class="cvs-x">vs</span><span class="cvs-p"><img src="${headUrl(B.name,28)}" alt="">${esc(B.name)}</span>`;
    wrap.appendChild(vs);

    // determine current pick/ban step
    let step = null;
    if (!c.picks.a) step = { who: A, key: "picks", side: "a", verb: "picks", tag: "Game 1" };
    else if (!c.picks.b) step = { who: B, key: "picks", side: "b", verb: "picks", tag: "Game 2" };
    else if (!c.bans.a) step = { who: A, key: "bans", side: "a", verb: "bans", tag: "Ban" };
    else if (!c.bans.b) step = { who: B, key: "bans", side: "b", verb: "bans", tag: "Ban" };

    const used = champUsed(c);
    const pb = el("div", "champ-pb");
    pb.appendChild(el("div", "champ-section", "Pick &amp; Ban"));
    if (step) {
      pb.appendChild(el("div", "champ-step", `<b>${esc(step.who.name)}</b> ${step.verb} — <em>${step.tag}</em>`));
      const grid = el("div", "modepick-grid");
      state.champModes.forEach(id => {
        const taken = used.includes(id);
        grid.appendChild(modeChip(id, { disabled: taken, banned: taken && (c.bans.a === id || c.bans.b === id), active: taken && (c.picks.a === id || c.picks.b === id), onClick: () => {
          c[step.key][step.side] = id; save(); renderBracket(); build();
        } }));
      });
      pb.appendChild(grid);
    } else {
      // complete — show the mode assignments
      const games = champGames(m);
      const grid = el("div", "champ-assign");
      games.forEach((g, i) => {
        const mo = modeById(g.mode);
        const owner = i === 0 ? A.name : i === 1 ? B.name : "Decider";
        grid.appendChild(el("div", "cassign" + (g.decider ? " decider" : ""),
          `<img src="${mo.img}" alt=""><div><b>Game ${i + 1}</b><span>${mo.name} · ${i < 2 ? esc(owner) + "'s pick" : "tiebreaker"}</span></div>`));
      });
      // show bans
      grid.appendChild(el("div", "cassign banned", `<img src="${modeById(c.bans.a).img}" alt=""><div><b>Banned</b><span>${modeById(c.bans.a).name} · ${esc(A.name)}</span></div>`));
      grid.appendChild(el("div", "cassign banned", `<img src="${modeById(c.bans.b).img}" alt=""><div><b>Banned</b><span>${modeById(c.bans.b).name} · ${esc(B.name)}</span></div>`));
      pb.appendChild(grid);
    }
    wrap.appendChild(pb);

    // results phase
    if (champComplete(c)) {
      const games = champGames(m);
      let aw = 0, bw = 0;
      Object.values(c.wins).forEach(pid => { if (pid === A.id) aw++; else if (pid === B.id) bw++; });
      const decided = aw >= 2 || bw >= 2;

      const res = el("div", "champ-results");
      res.appendChild(el("div", "champ-section", `Games <span class="soft">(first to 2)</span> — <b>${aw}</b>–<b>${bw}</b>`));
      games.forEach((g, i) => {
        const gi = i + 1, gk = "g" + gi;
        // decider only playable/visible when 1-1
        if (g.decider && !(aw === 1 && bw === 1) && !c.wins[gk]) return;
        const mo = modeById(g.mode);
        const rowLocked = decided && !c.wins[gk];
        const row = el("div", "cgrow" + (rowLocked ? " locked" : ""));
        row.appendChild(el("span", "cgrow-mode", `<img src="${mo.img}" alt=""> G${gi} · ${mo.name}${g.decider ? " (decider)" : ""}`));
        const pick = el("div", "cgrow-pick");
        [A, B].forEach(P => {
          const won = c.wins[gk] === P.id;
          const b = el("button", "cgrow-btn" + (won ? " won" : ""), esc(P.name));
          b.onclick = () => {
            if (c.wins[gk] === P.id) delete c.wins[gk]; else c.wins[gk] = P.id;
            // clamp: if match already decided by earlier games, ignore extra (recompute handles)
            syncChampScore(matchId, A.id, B.id);
            save(); renderBracket(); build();
          };
          pick.appendChild(b);
        });
        row.appendChild(pick);
        res.appendChild(row);
      });
      wrap.appendChild(res);

      if (decided) {
        const champW = aw >= 2 ? A : B;
        const banner = el("div", "champ-winner");
        banner.innerHTML = `<img src="${headUrl(champW.name,30)}" alt=""> <span><b>${esc(champW.name)}</b> wins the match</span>`;
        wrap.appendChild(banner);
      }
    }

    const actions = el("div", "modal-actions");
    const resetBtn = el("button", "btn btn-ghost", "Reset match");
    resetBtn.onclick = () => { delete state.champ[matchId]; delete state.scores[matchId]; save(); renderBracket(); build(); };
    const closeBtn = el("button", "btn btn-primary", "Done");
    closeBtn.onclick = closeModal;
    actions.append(resetBtn, closeBtn);
    wrap.appendChild(actions);

    openModal(wrap);
  };
  build();
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
  const idBox = el("div", "slot-id");
  idBox.appendChild(el("span", "slot-name", esc(name)));
  if (isPlayer(val) && val.team) idBox.appendChild(el("span", "slot-team", esc(val.team)));
  slot.appendChild(idBox);
  if (isPlayer(val) && val.tier) slot.appendChild(tierBadge(val.tier, "mini"));

  // winner / loser styling
  if (otherDecidedWinner && isPlayer(val) && !isPh) {
    if (m._winner.id === val.id) slot.classList.add("winner");
    else slot.classList.add("eliminated");
  }

  // score + interactivity (placeholders are not interactive)
  const bothPresent = isPlayer(m._a) && isPlayer(m._b) && !m._a.placeholder && !m._b.placeholder;
  const champStyle = state.style === "pvpchamp";
  if (bothPresent && isPlayer(val)) {
    const wins = key === "a" ? m._aWins : m._bWins;
    const th = m._th || 1;
    const showScore = th > 1 || m._decided || (m._aWins + m._bWins) > 0;
    slot.appendChild(el("span", "slot-score", showScore ? String(wins) : ""));
    if (champStyle || !isAdmin()) {
      // scoring handled by the pick/ban modal (or by the admin), not slot clicks
      slot.classList.add("locked");
    } else {
      slot.appendChild(el("span", "pick-hint", th > 1 ? "+1" : "win"));
      slot.onclick = () => addGame(m.id, val.id);
    }
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
function placeMenu(menu, x, y) {
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + "px";
  menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + "px";
  setTimeout(() => document.addEventListener("click", closeFormatMenu), 0);
}
function openFormatMenu(matchId, x, y) {
  closeFormatMenu();

  // PvPChamp: right-click opens pick/ban management
  if (state.style === "pvpchamp") {
    const menu = _menuEl = el("div", "ctx-menu");
    menu.innerHTML = `<div class="ctx-title">PvPChamp match</div>`;
    const open = el("button", "ctx-reset", "Open pick / ban");
    open.onclick = ev => { ev.stopPropagation(); closeFormatMenu(); openChampModal(matchId); };
    const reset = el("button", "ctx-reset", "Reset match");
    reset.onclick = ev => { ev.stopPropagation(); delete state.champ[matchId]; delete state.scores[matchId]; save(); renderBracket(); closeFormatMenu(); };
    menu.append(open, reset);
    placeMenu(menu, x, y);
    return;
  }

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

  // Switching: choose this match's mode
  if (state.style === "switching") {
    menu.appendChild(el("div", "ctx-title", "Match mode"));
    const mgrid = el("div", "ctx-modes");
    const curMode = switchModeFor(currentGraph.M[matchId] || { id: matchId });
    MODES.forEach(mo => {
      const b = el("button", "ctx-mode" + (mo.id === curMode ? " active" : ""));
      b.innerHTML = `<img src="${mo.img}" alt=""><span>${mo.name}</span>`;
      b.onclick = ev => { ev.stopPropagation(); state.matchModes[matchId] = mo.id; save(); renderBracket(); closeFormatMenu(); };
      mgrid.appendChild(b);
    });
    menu.appendChild(mgrid);
  }

  const reset = el("button", "ctx-reset", "Reset match score");
  reset.onclick = ev => { ev.stopPropagation(); delete state.scores[matchId]; save(); renderBracket(); closeFormatMenu(); };
  menu.appendChild(reset);

  placeMenu(menu, x, y);
}

function setFormat(matchId, kind, n) {
  if (kind === "BO" && n === 1) delete state.formats[matchId];   // default, no need to store
  else state.formats[matchId] = { kind, n };
  delete state.scores[matchId];   // changing format resets the series score
  save();
  renderBracket();
}

/* ---------- bracket PNG export ----------------------------------------------
   Clones the whole canvas offscreen at natural size (no fit zoom, no compact
   columns), redraws the connectors for that geometry, and rasterises it with a
   title header — so the download is the full-size bracket, not the shrunk one. */
const fileSlug = s => (String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bracket");

async function downloadBracketPng() {
  const canvas = $("#bracketScroll");
  const btn = $("#bracketDownload");
  if (!canvas || !canvas.firstElementChild || !btn) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Rendering…";

  // the stage itself must carry no positioning: it gets cloned into the export
  // SVG, where an offscreen offset would push the whole drawing out of frame
  const holder = el("div");
  holder.style.cssText = "position:fixed; left:-100000px; top:0; width:20000px; z-index:-1; pointer-events:none;";
  const stage = el("div", "bracket-export");
  try {
    const head = el("div", "bx-head");
    head.appendChild(el("div", "bx-title", esc(state.name || "Untitled Tournament")));
    head.appendChild(el("div", "bx-sub", $("#bracketMode").innerHTML));
    const champ = champion(currentGraph);
    if (champ) head.appendChild(el("div", "bx-champ", `CHAMPION · ${esc(champ.name)}`));
    stage.appendChild(head);

    const body = el("div", "bx-body");
    Array.from(canvas.children).forEach(node => body.appendChild(node.cloneNode(true)));
    // a mirrored bracket sizes itself from its columns; the round-robin / swiss
    // grids don't, and would collapse into one very tall column without a width
    if (!body.querySelector(".bracket-fit")) body.style.width = Math.max(canvas.scrollWidth, 900) + "px";
    stage.appendChild(body);

    holder.appendChild(stage);
    document.body.appendChild(holder);

    // natural size + connectors redrawn against it
    stage.querySelectorAll(".bracket").forEach(b => {
      b.style.zoom = "";
      b.classList.remove("compact");
      b.dataset.fitScale = "1";
      drawConnectors(b);
    });

    const w = Math.ceil(stage.scrollWidth), h = Math.ceil(stage.scrollHeight);
    if (!w || !h) throw new Error("nothing to render");
    const ratio = w * h > 3.2e6 ? 1 : 2;               // 2× for crisp text, 1× once the draw is huge
    await nodeToPng(stage, `${fileSlug(state.name)}-bracket.png`, w, h, ratio);
    btn.textContent = "Saved PNG";
  } catch (e) {
    btn.textContent = "Couldn't render — screenshot instead";
  } finally {
    holder.remove();
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2400);
  }
}

/* ============================================================
   GENERIC MODAL
   ============================================================ */
function openModal(node) {
  const box = $("#modalBox");
  box.innerHTML = "";
  box.appendChild(node);
  $("#modalOverlay").classList.remove("hidden");
}
function closeModal() { $("#modalOverlay").classList.add("hidden"); $("#modalBox").innerHTML = ""; }

function modeChip(modeId, { active, banned, disabled, label, onClick } = {}) {
  const m = modeById(modeId);
  const chip = el("button", "modepick" + (active ? " active" : "") + (banned ? " banned" : "") + (disabled ? " disabled" : ""));
  chip.type = "button";
  chip.innerHTML = `<img src="${m.img}" alt=""><span>${m.name}</span>` + (label ? `<em class="modepick-tag">${label}</em>` : "");
  if (onClick && !disabled) chip.onclick = onClick;
  return chip;
}

/* ============================================================
   STYLE SELECTION POPUP (shown on Generate)
   ============================================================ */
function openStyleModal() {
  if (!state.switchModes.length) state.switchModes = [state.mode];
  if (state.champModes.length !== 5) state.champModes = defaultChampModes();

  const wrap = el("div", "style-modal");
  wrap.appendChild(el("div", "modal-title", "Choose Tournament Style"));
  wrap.appendChild(el("div", "modal-sub", "How should PvP modes work across the bracket?"));

  const opts = el("div", "style-opts");
  const configArea = el("div", "style-config");

  const STYLES = [
    { id: "regular", title: "Regular Tournament", desc: "One mode for the whole bracket." },
    { id: "switching", title: "Switching Tournament", desc: "Each match plays a different mode (auto-cycled, editable)." },
    { id: "pvpchamp", title: "PvPChamp Tournament", desc: "5 modes; players pick & ban a best-of-3 for every match." },
  ];
  let chosen = state.style || "regular";

  const renderConfig = () => {
    configArea.innerHTML = "";
    if (chosen === "regular") {
      const m = modeById(state.mode);
      const row = el("div", "config-note");
      row.innerHTML = `Uses your selected mode: <b class="mode-inline"><img src="${m.img}" alt="">${m.name}</b>. Change it on the setup screen.`;
      configArea.appendChild(row);
    } else if (chosen === "switching") {
      configArea.appendChild(el("div", "config-label", "Modes in rotation (matches cycle through these)"));
      const grid = el("div", "modepick-grid");
      MODES.forEach(mo => {
        const on = state.switchModes.includes(mo.id);
        grid.appendChild(modeChip(mo.id, { active: on, onClick: () => {
          if (on) { if (state.switchModes.length > 1) state.switchModes = state.switchModes.filter(x => x !== mo.id); }
          else state.switchModes.push(mo.id);
          renderConfig();
        } }));
      });
      configArea.appendChild(grid);
      configArea.appendChild(el("div", "config-hint", `${state.switchModes.length} selected · at least 1 required`));
    } else if (chosen === "pvpchamp") {
      configArea.appendChild(el("div", "config-label", "Pick exactly 5 modes for the pick/ban pool"));
      const grid = el("div", "modepick-grid");
      MODES.forEach(mo => {
        const on = state.champModes.includes(mo.id);
        const full = state.champModes.length >= 5;
        grid.appendChild(modeChip(mo.id, { active: on, disabled: !on && full, onClick: () => {
          if (on) state.champModes = state.champModes.filter(x => x !== mo.id);
          else if (state.champModes.length < 5) state.champModes.push(mo.id);
          renderConfig();
        } }));
      });
      configArea.appendChild(grid);
      const ok = state.champModes.length === 5;
      configArea.appendChild(el("div", "config-hint" + (ok ? " ok" : ""), `${state.champModes.length} / 5 selected`));
    }
    // enable/disable create
    const createBtn = $("#styleCreate");
    if (createBtn) createBtn.disabled = (chosen === "pvpchamp" && state.champModes.length !== 5) || (chosen === "switching" && state.switchModes.length < 1);
  };

  STYLES.forEach(s => {
    const card = el("button", "style-card" + (chosen === s.id ? " active" : ""));
    card.type = "button";
    card.innerHTML = `<span class="style-name">${s.title}</span><span class="style-desc">${s.desc}</span>`;
    card.onclick = () => {
      chosen = s.id;
      $$(".style-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      renderConfig();
    };
    opts.appendChild(card);
  });

  wrap.append(opts, configArea);

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.onclick = closeModal;
  const create = el("button", "btn btn-primary", "Create Tournament →");
  create.id = "styleCreate";
  create.onclick = () => {
    state.style = chosen;
    // reset progress for a fresh bracket
    state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {};
    save();
    closeModal();
    setView("bracket");
  };
  actions.append(cancel, create);
  wrap.appendChild(actions);

  openModal(wrap);
  renderConfig();
}

function defaultChampModes() {
  const pref = ["uhc", "diasmp", "spear", "cart", "sword"];
  const ids = pref.filter(id => MODES.some(m => m.id === id));
  for (const m of MODES) { if (ids.length >= 5) break; if (!ids.includes(m.id)) ids.push(m.id); }
  return ids.slice(0, 5);
}

/* ---------- SVG connectors ---------- */
function redrawAllConnectors() {
  if (state.view !== "bracket" || state.type === "roundrobin") return;
  $$(".bracket").forEach(drawConnectors);
}
/* fit + draw on next frame, then again shortly after (covers rAF throttling / late layout) */
function scheduleConnectorDraw() {
  const pass = () => { fitBrackets(); redrawAllConnectors(); };
  requestAnimationFrame(pass);
  setTimeout(pass, 60);
  setTimeout(pass, 250);
}

function drawConnectors(bracket) {
  if (!bracket) return;
  const svg = bracket.querySelector(".svg-connectors");
  if (!svg) return;
  const bRect = bracket.getBoundingClientRect();
  // a fitted bracket is zoomed, so measured rects come back scaled — divide the
  // factor back out and keep drawing in the bracket's own coordinate space
  const k = parseFloat(bracket.dataset.fitScale) || 1;
  const un = v => v / k;
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
      // mirrored halves feed right→left, so pick the edges from actual geometry
      const flip = (f.left + f.right) > (t.left + t.right);
      const x1 = un((flip ? f.left : f.right) - bRect.left), y1 = un(f.top - bRect.top + f.height / 2);
      const x2 = un((flip ? t.right : t.left) - bRect.left), y2 = un(t.top - bRect.top + t.height / 2);
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
        const b = buildBracketSection(s, graph, { split: false });   // group cards are too narrow to mirror
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
   SCHEDULE BOARD  (broadcast graphic generator)
   ============================================================ */
const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

/* Parse a yyyy-mm-dd string into a nice "MONTH DD" (avoids TZ shifts). */
function prettyDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return `${MONTHS[m - 1].toUpperCase()} ${d}`;
}

/* "Winners/Losers" → broadcast-style "Upper/Lower"; tidy the final labels. */
function boardRound(label) {
  return String(label)
    .replace(/Winners/g, "Upper").replace(/Losers/g, "Lower")
    .replace(/Grand Final$/, "Grand Finals");
}

/* Flatten the current bracket into an ordered list of schedulable matches,
   each with resolved player names or "M# Winner/Loser" placeholders. */
function scheduleMatches() {
  if (state.players.length < 2) return [];
  const g = resolve(buildGraphWithState());
  const M = g.M;
  const slotOf = (srcSlot, resolved) => {
    if (isPlayer(resolved) && !resolved.placeholder) return { kind: "player", name: resolved.name };
    if (isPlayer(resolved) && resolved.placeholder)  return { kind: "tbd", name: resolved.name };
    if (!srcSlot) return { kind: "tbd", name: "TBD" };
    if (srcSlot.t === "player") return { kind: "player", name: srcSlot.p.name };
    if (srcSlot.t === "bye")    return { kind: "bye", name: "BYE" };
    if (srcSlot.t === "winner") { const f = M[srcSlot.m]; return { kind: "tbd", name: `M${f ? f.no : "?"} WINNER` }; }
    if (srcSlot.t === "loser")  { const f = M[srcSlot.m]; return { kind: "tbd", name: `M${f ? f.no : "?"} LOSER` }; }
    return { kind: "tbd", name: "TBD" };
  };
  const out = [];
  g.sections.forEach(section => {
    section.columns.forEach(col => {
      col.matchIds.forEach(mid => {
        const m = M[mid];
        if (!m) return;
        if (m.reset && !resetNeeded(g)) return;             // hide unused bracket reset
        const a = slotOf(m.a, m._a), b = slotOf(m.b, m._b);
        if (a.kind === "bye" || b.kind === "bye") return;   // a walkover isn't a scheduled match
        // the single true championship match — featured full-width on the board
        const isGrandFinal =
          (section.key === "GF" && /Grand Final/.test(col.label)) ||
          (g.meta && g.meta.finalId && m.id === g.meta.finalId);
        out.push({
          id: m.id, no: m.no, a, b,
          round: boardRound(col.label),
          final: !!isGrandFinal,
        });
      });
    });
  });
  return out;
}

/* Assemble a saved board object from the builder inputs + selected matches. */
function makeBoard(matches) {
  const times = ($("#sbTimes").value || "").split("\n").map(s => s.trim()).filter(Boolean);
  const iso = $("#sbDate").value || "";
  return {
    id: `${iso || "nodate"}#${$("#sbDay").value || 1}`,
    event: ($("#sbEvent").value || "").trim() || "Tempest PVP",
    host: ($("#sbHost").value || "").trim(),
    range: ($("#sbRange").value || "").trim(),
    day: parseInt($("#sbDay").value, 10) || 1,
    date: iso,
    times,
    matches,   // snapshot of match descriptors {no, round, a, b, final}
  };
}

/* ----- rendering the board graphic ----- */
function boardHead(slot, size) {
  if (slot.kind === "player") {
    const img = makeHead(slot.name, size, "sb-head");
    return img;
  }
  const box = el("div", "sb-head sb-head-tbd", "?");   // unknown / placeholder tile
  return box;
}

function renderMatchCard(mt, featured) {
  const card = el("div", "sb-card" + (featured ? " featured" : ""));
  const row = el("div", "sb-card-row");
  const aName = el("span", "sb-name sb-name-l" + (mt.a.kind === "tbd" ? " tbd" : ""), esc(mt.a.name.toUpperCase()));
  const bName = el("span", "sb-name sb-name-r" + (mt.b.kind === "tbd" ? " tbd" : ""), esc(mt.b.name.toUpperCase()));
  const vs = el("span", "sb-vs", "VS");
  row.append(aName, boardHead(mt.a, featured ? 46 : 40), vs, boardHead(mt.b, featured ? 46 : 40), bName);
  card.appendChild(row);
  const lbl = featured ? "GRAND FINALS" : `Match ${mt.no} - ${mt.round}`;
  card.appendChild(el("div", "sb-card-label", esc(lbl)));
  return card;
}

function buildBoardEl(board) {
  const sb = el("div", "sboard");
  ["tl", "tr", "bl", "br"].forEach(c => sb.appendChild(el("span", "sb-corner sb-corner-" + c)));

  // header
  const header = el("div", "sb-header");
  const logo = el("div", "sb-logo");
  const logoImg = el("img", "sb-logo-img"); logoImg.src = "assets/icon.png"; logoImg.alt = "";
  logo.append(logoImg);
  const title = el("div", "sb-title");
  title.appendChild(el("div", "sb-day", esc(`DAY ${board.day} - ${prettyDate(board.date)}`)));
  title.appendChild(el("div", "sb-sched", "SCHEDULE"));
  const times = el("div", "sb-times");
  board.times.forEach(t => times.appendChild(el("div", "sb-time", esc(t))));
  header.append(logo, title, times);
  sb.appendChild(header);

  // matches — regular ones in a 2-col grid, finals featured full-width below
  const regular = board.matches.filter(m => !m.final);
  const finals = board.matches.filter(m => m.final);
  const grid = el("div", "sb-matches");
  regular.forEach(m => grid.appendChild(renderMatchCard(m, false)));
  sb.appendChild(grid);
  if (finals.length) {
    const fwrap = el("div", "sb-finals");
    finals.forEach(m => fwrap.appendChild(renderMatchCard(m, true)));
    sb.appendChild(fwrap);
  }

  // footer
  const footer = el("div", "sb-footer");
  footer.append(
    el("span", "sb-foot-l", esc(board.event)),
    el("span", "sb-foot-c", esc(board.range)),
    el("span", "sb-foot-r", board.host ? esc("HOSTED BY " + board.host.toUpperCase()) : "")
  );
  sb.appendChild(footer);
  return sb;
}

let _boardZoom = false;
/* scale the fixed 1280×720 board to fit its container (or 1:1 when zoomed) */
function fitBoard() {
  const wrap = $("#sbBoardWrap");
  const sb = wrap && wrap.querySelector(".sboard");
  if (!sb) return;
  const scale = _boardZoom ? 1 : Math.min(1, (wrap.clientWidth || 1280) / 1280);
  sb.style.transform = `scale(${scale})`;
  wrap.style.height = (720 * scale) + "px";
}

function showBoard(board) {
  const wrap = $("#sbBoardWrap");
  wrap.innerHTML = "";
  wrap.appendChild(buildBoardEl(board));
  $("#sbStage").classList.remove("hidden");
  $("#sbStageTitle").textContent = `${board.event} · Day ${board.day}${board.date ? " · " + prettyDate(board.date) : ""}`;
  fitBoard();
}

/* Turn a cross-origin image URL into a data: URI so the export canvas isn't
   tainted. Falls back to a transparent pixel if the fetch is blocked. */
async function toDataURI(url) {
  const blank = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return blank;
    const blob = await res.blob();
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(blank); fr.readAsDataURL(blob); });
  } catch (e) { return blank; }
}

/* Render a fixed 1280×720 board node to a PNG via an SVG <foreignObject>
   snapshot. Best-effort: images are inlined as data URIs so the canvas isn't
   tainted; throws if the browser blocks the rasterization. */
async function nodeToPng(src, filename, w, h, ratio) {
  ratio = ratio || 1;
  const node = src.cloneNode(true);
  node.style.transform = "none";
  const clones = [...node.querySelectorAll("img")];
  const origs = [...src.querySelectorAll("img")];
  await Promise.all(clones.map(async (img, i) => {
    const realSrc = (origs[i] && origs[i].currentSrc) || img.getAttribute("src");
    img.setAttribute("src", await toDataURI(realSrc));
  }));
  const css = await fetch("styles.css").then(r => r.text()).catch(() => "");
  const xml = new XMLSerializer().serializeToString(node);
  // viewBox scales the content up, so text is rendered at `ratio` resolution
  // instead of being upscaled from a smaller bitmap
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * ratio}" height="${h * ratio}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml">` +
    `<style>${css}</style>${xml}</div></foreignObject></svg>`;
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve; img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  const canvas = el("canvas"); canvas.width = w * ratio; canvas.height = h * ratio;
  canvas.getContext("2d").drawImage(img, 0, 0, w * ratio, h * ratio);
  const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png"));
  const a = el("a"); a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/* the broadcast boards are always a fixed 1280×720 */
const boardToPng = (src, filename) => nodeToPng(src, filename, 1280, 720);

async function downloadBoardPng() {
  const src = $("#sbBoardWrap .sboard");
  const hint = $("#sbHint");
  if (!src) return;
  const btn = $("#sbDownload"); const orig = btn.textContent;
  btn.disabled = true; btn.textContent = "Rendering…";
  try {
    await boardToPng(src, `schedule-day${$("#sbDay").value || 1}.png`);
    hint.classList.remove("error"); hint.textContent = "Downloaded PNG.";
  } catch (e) {
    hint.classList.add("error");
    hint.textContent = "Couldn't render a PNG in this browser — use a screenshot / OBS capture of the board below.";
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

/* ----- the schedule builder view ----- */
function renderSavedBoards() {
  const list = $("#sbSavedList");
  const hint = $("#sbSavedHint");
  list.innerHTML = "";
  const boards = state.boards || [];
  hint.classList.toggle("hidden", boards.length > 0);
  boards.forEach(b => {
    const li = el("li", "sched-saved-item");
    const info = el("button", "sched-saved-open");
    info.innerHTML = `<strong>Day ${b.day}</strong><span>${esc(prettyDate(b.date) || "no date")} · ${b.matches.length} matches</span>`;
    info.onclick = () => { loadBoardIntoBuilder(b); showBoard(b); };
    const del = el("button", "sched-saved-del", "✕");
    del.title = "Delete board";
    del.onclick = () => {
      state.boards = state.boards.filter(x => x.id !== b.id);
      save(); renderSavedBoards();
    };
    li.append(info, del);
    list.appendChild(li);
  });
}

function loadBoardIntoBuilder(b) {
  $("#sbEvent").value = b.event || "";
  $("#sbHost").value = b.host || "";
  $("#sbRange").value = b.range || "";
  $("#sbDay").value = b.day || 1;
  $("#sbDate").value = b.date || "";
  $("#sbTimes").value = (b.times || []).join("\n");
  // re-check the matches that were on this board (match by number)
  renderMatchChecklist(new Set(b.matches.map(m => m.no)));
}

function renderMatchChecklist(preselect) {
  const listEl = $("#sbMatchList");
  listEl.innerHTML = "";
  const matches = scheduleMatches();
  listEl._matches = matches;
  matches.forEach(mt => {
    const li = el("li", "sched-match");
    const cb = el("input", "sched-check"); cb.type = "checkbox"; cb.dataset.mid = mt.id;
    if (preselect && preselect.has(mt.no)) cb.checked = true;
    cb.onchange = updateSchedCount;
    const lab = el("label", "sched-match-lab");
    lab.append(cb, el("span", "sched-match-no", "M" + mt.no),
      el("span", "sched-match-vs", `${esc(mt.a.name)}  vs  ${esc(mt.b.name)}`),
      el("span", "sched-match-round", esc(mt.round)));
    li.appendChild(lab);
    listEl.appendChild(li);
  });
  updateSchedCount();
}

function selectedMatchDescriptors() {
  const listEl = $("#sbMatchList");
  const matches = listEl._matches || [];
  const checked = new Set($$("#sbMatchList .sched-check:checked").map(c => c.dataset.mid));
  return matches.filter(m => checked.has(m.id))
    .map(m => ({ no: m.no, round: m.round, a: m.a, b: m.b, final: m.final }));
}

function updateSchedCount() {
  const n = $$("#sbMatchList .sched-check:checked").length;
  $("#sbCount").textContent = `${n} selected`;
}

function renderScheduleView() {
  const ready = state.players.length >= 2;
  $("#schedEmpty").classList.toggle("hidden", ready);
  $("#schedGrid").classList.toggle("hidden", !ready);
  if (!ready) { $("#sbStage").classList.add("hidden"); return; }
  // sensible defaults on first open
  if (!$("#sbEvent").value) $("#sbEvent").value = state.name || "Tempest PVP";
  if (!$("#sbTimes").value) $("#sbTimes").value = "9:00 PST\n12:00 EST\n17:00 BST";
  renderMatchChecklist();
  renderSavedBoards();
}

/* ============================================================
   NEXT MATCH BOARD  (live face-off card for the upcoming match)
   ============================================================ */
const isRealPlayer = v => isPlayer(v) && !v.placeholder;
/* large 3D isometric head render (with graceful fallbacks) */
function makeBigHead(name, size, cls) {
  const img = el("img", cls); img.alt = name;
  let stage = 0;
  img.onerror = () => {
    stage++;
    if (stage === 1) img.src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`;
    else if (stage === 2) img.src = `https://minotar.net/helm/${encodeURIComponent(name)}/${size}.png`;
    else img.onerror = null;
  };
  img.src = `https://mc-heads.net/head/${encodeURIComponent(name)}/${size}`;
  return img;
}

/* the game mode / kit a given match is played in */
function matchModeName(m) {
  if (state.style === "switching") return modeById(switchModeFor(m)).name;
  if (state.style === "pvpchamp") return "PvPChamp";
  return modeById(state.mode).name;
}

/* map every match id -> its round label + whether it's the grand final */
function matchLabelMap(g) {
  const map = {};
  g.sections.forEach(section => section.columns.forEach(col => col.matchIds.forEach(mid => {
    map[mid] = {
      round: boardRound(col.label),
      final: (section.key === "GF" && /Grand Final/.test(col.label)) ||
             (g.meta && g.meta.finalId && mid === g.meta.finalId),
    };
  })));
  return map;
}

/* find the next match to be played: the first (by number) that isn't decided
   and has both real players; falls back to the first undecided match. */
function nextMatchInfo() {
  if (state.players.length < 2) return null;
  const g = resolve(buildGraphWithState());
  const labels = matchLabelMap(g);
  const ordered = Object.values(g.M)
    .filter(m => !(m.reset && !resetNeeded(g)))
    .sort((a, b) => (a.no || 0) - (b.no || 0));
  let m = ordered.find(x => !x._decided && isRealPlayer(x._a) && isRealPlayer(x._b))
       || ordered.find(x => !x._decided);
  if (!m) return null;                                   // tournament complete
  const side = val => {
    if (isRealPlayer(val)) {
      const idx = state.players.findIndex(p => p.id === val.id);
      return { name: val.name, seed: idx >= 0 ? idx + 1 : null, real: true,
               team: val.team || "", tier: val.tier || "" };
    }
    return { name: "TBD", seed: null, real: false, team: "", tier: "" };
  };
  const lab = labels[m.id] || { round: "", final: false };
  return {
    no: m.no,
    round: lab.final ? "Grand Finals" : lab.round,
    mode: matchModeName(m),
    a: side(m._a), b: side(m._b),
  };
}

function vsSide(s, cls) {
  const col = el("div", "vs-side " + cls);
  const figure = el("div", "vs-figure");
  const block = el("div", "vs-nameblock");
  block.appendChild(el("div", "vs-name", esc(s.name.toUpperCase())));
  if (s.team || s.tier) {
    const meta = el("div", "vs-meta");
    if (s.tier) meta.appendChild(tierBadge(s.tier, "big"));
    if (s.team) meta.appendChild(el("span", "vs-team", esc(s.team.toUpperCase())));
    block.appendChild(meta);
  }
  figure.appendChild(block);
  figure.appendChild(s.real ? makeBigHead(s.name, 300, "vs-head") : makeBigHead("MHF_Steve", 300, "vs-head tbd"));
  col.append(figure);
  return col;
}

function buildVsBoard(info) {
  const vb = el("div", "vsboard");
  ["tl", "tr", "bl", "br"].forEach(c => vb.appendChild(el("span", "sb-corner sb-corner-" + c)));
  const main = el("div", "vs-main");
  main.append(vsSide(info.a, "vs-left"), el("div", "vs-center", "VS"), vsSide(info.b, "vs-right"));
  vb.appendChild(main);
  // bottom bar — round title + event, logo on the right (no elo, no sponsor)
  const bar = el("div", "vs-bar");
  const left = el("div", "vs-bar-left");
  left.append(el("div", "vs-bar-title", esc((info.round || "Match").toUpperCase())),
              el("div", "vs-bar-sub", esc((state.name || "Tempest PVP") + " · Match " + info.no)));
  const logo = el("img", "vs-bar-logo"); logo.src = "assets/icon.png"; logo.alt = "";
  bar.append(left, logo);
  vb.appendChild(bar);
  return vb;
}

let _nextZoom = false;
function fitNextBoard() {
  const wrap = $("#nextWrap");
  const vb = wrap && wrap.querySelector(".vsboard");
  if (!vb) return;
  const scale = _nextZoom ? 1 : Math.min(1, (wrap.clientWidth || 1280) / 1280);
  vb.style.transform = `scale(${scale})`;
  wrap.style.height = (720 * scale) + "px";
}

function renderNextView() {
  const info = nextMatchInfo();
  $("#nextEmpty").classList.toggle("hidden", !!info);
  $("#nextStage").classList.toggle("hidden", !info);
  if (!info) return;
  const wrap = $("#nextWrap");
  wrap.innerHTML = "";
  wrap.appendChild(buildVsBoard(info));
  $("#nextTitle").textContent = `Match ${info.no} · ${info.round}`;
  fitNextBoard();
}

/* ============================================================
   ROLES  — signing in, signing up, and who sees what
   ============================================================ */

/* A role's name, painted in its own two-stop gradient. The gradient
   always runs left to right; both stops come straight from staff.js. */
function roleBadge(roleId) {
  const r = paletteById(roleId);
  const span = el("span", "role-badge");
  if (!r) { span.classList.add("none"); span.textContent = "Visitor"; return span; }
  span.textContent = r.name;
  span.style.setProperty("--rf", r.from);
  span.style.setProperty("--rt", r.to);
  return span;
}
function roleGem(roleId) {
  const r = paletteById(roleId);
  const gem = el("span", "role-gem");
  gem.style.setProperty("--rf", r ? r.from : "#6f6666");
  gem.style.setProperty("--rt", r ? r.to : "#3a3436");
  return gem;
}

/* ---------- getting in ---------- */
async function signIn(username, password) {
  if (session.shared) return { ok: false, why: "shared" };
  if (!window.crypto || !crypto.subtle) return { ok: false, why: "insecure" };

  let acc = null;

  /* With an API configured, IT owns the account list. A rejection there is
     final: falling back to this browser's copy would let somebody who has
     been removed or demoted straight back in. Only an unreachable API falls
     through, so the site still works standalone. */
  if (apiBase()) {
    const res = await apiLogin(username, password);
    // The API knows this account but may not check a credential derived above
    // the runtime cap. Do not lock them out of their own site over it: verify
    // here, where there is no cap, and carry on WITHOUT an API token so the
    // Management tabs stay shut until the credential is re-derived.
    if (res.legacy) {
      const local = accountByName(username);
      if (!local || !(await passwordMatches(local, password))) return { ok: false, why: "bad" };
      acc = local;
    }
    if (!res.legacy && res.reachable && !res.ok) return { ok: false, why: "bad" };
    if (res.reachable && res.ok) acc = adoptApiAccount(res.data);
  }

  if (!acc) {
    const local = accountByName(username);
    // deliberately the same answer for both, so the form is not a user list
    if (!local || !(await passwordMatches(local, password))) return { ok: false, why: "bad" };
    acc = local;
  }

  session.account = acc;
  session.role = acc.role;
  rememberSession(acc);
  applyRole();
  // land staff where they can actually work, players on the front page
  setView(!isStaff() ? "home"
    : state.players.length >= 2 ? "bracket"
    : can("tournament.create") ? "setup"
    : "bracket");
  return { ok: true };
}

function signOut() {
  setApiToken(null);
  session.account = null;
  session.role = "visitor";
  rememberSession(null);
  applyRole();
  setView("home");
}

/* Sign up only ever makes a player account. Staff are created for them
   on the Staff tab - there is no way to self-register into a role. */
async function signUp(username, display, password) {
  const cred = await makeCredential(password);
  const acc = normaliseAccount(Object.assign(
    { username, display, role: "player", createdAt: Date.now() }, cred));
  ACCOUNTS.push(acc);
  saveAccounts();
  session.account = acc;
  session.role = acc.role;
  rememberSession(acc);
  applyRole();
  setView("home");
  return acc;
}

/* ---------- reflect the current role across the whole page ---------- */
function applyRole() {
  const staff = isStaff();
  document.body.classList.toggle("role-visitor", !staff);
  // [data-admin] means "any staff role"; [data-cap] is the finer ladder
  $$("[data-admin]").forEach(n => n.classList.toggle("hidden", !staff));
  $$("[data-cap]").forEach(n => n.classList.toggle("hidden", !can(n.dataset.cap)));
  // [data-cap-any] needs just one of a pipe-separated list, for things
  // an Event Host and a Tournament Overseer both reach by different routes
  $$("[data-cap-any]").forEach(n => {
    const ok = n.dataset.capAny.split("|").some(c => can(c.trim()));
    n.classList.toggle("hidden", !ok);
  });
  // a dropdown with nothing left in it should not sit there empty
  $$(".nav-group").forEach(g => {
    const items = [...g.querySelectorAll(".nav-menu-item")];
    g.classList.toggle("hidden", !items.some(i => !i.classList.contains("hidden")));
  });

  const chip = $("#roleChip");
  const gem = $("#roleGem");
  const rname = $("#roleName");
  const uname = $("#roleLabel");
  const sw = $("#roleSwitch");
  const su = $("#signUpBtn");
  const r = roleById(session.role);

  if (session.account) {
    chip.classList.remove("hidden");
    gem.style.setProperty("--rf", r ? r.from : "#6f6666");
    gem.style.setProperty("--rt", r ? r.to : "#3a3436");
    rname.textContent = r ? r.name : "Player";
    rname.style.setProperty("--rf", r ? r.from : "#9e9494");
    rname.style.setProperty("--rt", r ? r.to : "#6f6666");
    uname.textContent = session.account.display || session.account.username;
    chip.title = (r ? r.name : "Player") + ", signed in as " + session.account.username;
    sw.textContent = "Log out";
    sw.classList.remove("signin");
    su.classList.add("hidden");
  } else {
    chip.classList.add("hidden");
    sw.textContent = "Log in";
    sw.classList.add("signin");
    su.classList.remove("hidden");
  }

  // a share link fixes the role, so there is nothing to sign into
  if (session.shared) {
    chip.classList.add("hidden");
    sw.classList.add("hidden");
    su.classList.add("hidden");
  }

  const note = $("#viewOnlyNote");
  note.classList.toggle("hidden", can("tournament.score"));
  $("#viewOnlyText").textContent =
    session.liveWatch
      ? "You are following a live link. The bracket updates itself as results are recorded. You can switch layouts and download it, but not change anything."
      : session.shared
        ? "You are following a view-only link. The bracket is set by the people running the tournament."
        : session.account
          ? "Read-only for your role. Recording results needs Mod or above."
          : "Read-only view. Staff can log in to run a tournament.";
}

/* ---------- which screens a role may open ---------- */
const PUBLIC_VIEWS = ["home", "servers", "events", "participants", "bracket", "profile"];
function allowedView(v) {
  if (PUBLIC_VIEWS.includes(v)) return v;
  if (v === "staff") return can("staff.dashboard") ? v : "home";
  if (v === "perspective") return can("management.perspective") ? v : "home";
  if (v === "anticheat") return can("management.anticheat") ? v : "home";
  if (v === "setup") return can("tournament.create") ? v : "home";
  if (v === "next" || v === "schedule") return can("broadcast") ? v : "home";
  return isStaff() ? v : "home";
}

/* ---------- log in ---------- */
function openLoginModal() {
  if (session.shared) return;
  const wrap = el("div", "auth-modal");
  wrap.appendChild(el("div", "modal-title", "Log in"));
  wrap.appendChild(el("div", "modal-sub", "Staff accounts are set up for you. Players can sign up instead."));

  const form = el("form", "auth-form");
  const user = el("input", "input");
  user.type = "text"; user.placeholder = "Username"; user.autocomplete = "username";
  const pass = el("input", "input");
  pass.type = "password"; pass.placeholder = "Password"; pass.autocomplete = "current-password";
  const go = el("button", "btn btn-primary btn-lg", "Log in");
  go.type = "submit";
  form.append(user, pass, go);
  wrap.appendChild(form);

  const err = el("p", "hint");
  wrap.appendChild(err);

  form.onsubmit = async e => {
    e.preventDefault();
    err.classList.remove("error");
    if (!user.value.trim() || !pass.value) {
      err.textContent = "Enter a username and password."; err.classList.add("error"); return;
    }
    go.disabled = true;
    err.textContent = "Checking...";
    const res = await signIn(user.value, pass.value);
    if (res.ok) { closeModal(); return; }
    err.textContent = res.why === "insecure"
      ? "Logging in needs a secure page. Open Tempest over https or on localhost."
      : res.why === "legacy"
        ? "This account needs its password set again before the server will accept it. See the PBKDF2 note in relay/README.md."
        : "That username and password do not match.";
    err.classList.add("error");
    pass.value = "";
    pass.focus();
    go.disabled = false;
  };

  const actions = el("div", "modal-actions");
  const toSignup = el("button", "btn btn-ghost", "Sign up instead");
  toSignup.type = "button";
  toSignup.onclick = () => { closeModal(); openSignupModal(); };
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  actions.append(toSignup, cancel);
  wrap.appendChild(actions);

  openModal(wrap);
  user.focus();
}

/* ---------- sign up (players only) ---------- */
function openSignupModal() {
  if (session.shared) return;
  const wrap = el("div", "auth-modal");
  wrap.appendChild(el("div", "modal-title", "Create a player account"));
  wrap.appendChild(el("div", "modal-sub", "For players joining Tempest events. Staff accounts are made by an owner."));

  const form = el("form", "auth-form");
  const user = el("input", "input");
  user.type = "text"; user.placeholder = "Username"; user.maxLength = 20; user.autocomplete = "username";
  const disp = el("input", "input");
  disp.type = "text"; disp.placeholder = "Minecraft username (optional)"; disp.maxLength = 16;
  const pass = el("input", "input");
  pass.type = "password"; pass.placeholder = "Password (8 characters or more)"; pass.autocomplete = "new-password";
  const pass2 = el("input", "input");
  pass2.type = "password"; pass2.placeholder = "Password again"; pass2.autocomplete = "new-password";
  const go = el("button", "btn btn-primary btn-lg", "Sign up");
  go.type = "submit";
  form.append(user, disp, pass, pass2, go);
  wrap.appendChild(form);

  const err = el("p", "hint");
  wrap.appendChild(err);

  form.onsubmit = async e => {
    e.preventDefault();
    err.classList.remove("error");
    const u = user.value.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,20}$/.test(u)) {
      err.textContent = "Usernames are 3 to 20 characters: letters, numbers, dot, dash or underscore.";
      err.classList.add("error"); return;
    }
    if (accountByName(u)) { err.textContent = "That username is taken."; err.classList.add("error"); return; }
    if (pass.value.length < 8) { err.textContent = "Use at least 8 characters."; err.classList.add("error"); return; }
    if (pass.value !== pass2.value) { err.textContent = "The two passwords do not match."; err.classList.add("error"); return; }
    if (!window.crypto || !crypto.subtle) {
      err.textContent = "Signing up needs a secure page. Open Tempest over https or on localhost.";
      err.classList.add("error"); return;
    }
    go.disabled = true;
    err.textContent = "Creating your account...";
    await signUp(u, disp.value.trim() || u, pass.value);
    closeModal();
  };

  const actions = el("div", "modal-actions");
  const toLogin = el("button", "btn btn-ghost", "I already have an account");
  toLogin.type = "button";
  toLogin.onclick = () => { closeModal(); openLoginModal(); };
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  actions.append(toLogin, cancel);
  wrap.appendChild(actions);

  openModal(wrap);
  user.focus();
}
/* ---------- "where is this app published?" panel ---------- */
function buildBaseSection(reopen) {
  const box = el("div", "base-panel");
  const local = isLocalOrigin();
  const usingLocal = local && !publicBase;

  if (usingLocal) {
    const warn = el("div", "base-warn");
    warn.innerHTML = `<span class="vo-badge">HEADS UP</span><span>You're running the app from <b>${esc(location.host || "a file")}</b>, ` +
      `which only exists on this computer — links built from it won't open on a phone or anyone else's machine. ` +
      `Publish the app somewhere (see the README) and put its address below.</span>`;
    box.appendChild(warn);
  }

  box.appendChild(el("div", "share-divider", "Link address"));
  const row = el("div", "share-row");
  const input = el("input", "input share-input");
  input.type = "url";
  input.placeholder = "https://yourname.github.io/TempestTournament/";
  input.value = publicBase;
  const save = el("button", "btn " + (usingLocal ? "btn-primary" : "btn-ghost"), "Use this");
  row.append(input, save);
  box.appendChild(row);

  const hint = el("p", "hint share-note");
  hint.innerHTML = publicBase
    ? `Links are built from <b>${esc(publicBase)}</b>. Make sure the app is actually published there — clear the box to go back to the address you're browsing.`
    : "Where the app is published. Leave blank to build links from the address you're on.";
  box.appendChild(hint);

  save.onclick = () => {
    const v = input.value.trim();
    if (v && !normaliseBase(v)) {
      hint.textContent = "That needs to be a full address starting with https://";
      hint.classList.add("error");
      return;
    }
    setPublicBase(v);
    reopen();
  };
  return box;
}

/* ---------- the live-link panel inside the share modal ---------- */
function buildLiveSection(reopen) {
  const box = el("div", "live-panel" + (liveOn() ? " on" : ""));
  box.appendChild(el("div", "share-divider", "Live link"));

  if (!liveOn()) {
    box.appendChild(el("p", "hint share-note",
      "Send one short link that keeps itself up to date as you record scores."));

    let mode = "instant";
    const opts = el("div", "style-opts");
    const extra = el("div", "live-extra");
    const err = el("p", "hint");

    const MODES = [
      { id: "instant", title: "Instant · nothing to install",
        desc: "Publishes through a public relay (ntfy.sh). Viewers get updates the moment you record them. Every message is signed by this browser, so nobody else can post to your link." },
      { id: "relay", title: "My own relay",
        desc: "Point at your own Cloudflare Worker from relay/README.md, or your own ntfy server. Nothing goes near a shared service." },
    ];
    const drawExtra = () => {
      extra.innerHTML = "";
      if (mode === "instant") return;
      extra.appendChild(el("div", "config-label", "Relay URL"));
      const input = el("input", "input");
      input.type = "url";
      input.id = "liveUrlInput";
      input.placeholder = "https://tempest-tournament-relay.you.workers.dev";
      input.value = live.url || live.server || "";
      extra.appendChild(input);
      extra.appendChild(el("p", "hint",
        "A Worker URL uses the token-protected relay. An ntfy server URL (ending in <code>/</code> or a bare host) uses signed pub/sub instead."));
    };
    MODES.forEach(o => {
      const card = el("button", "style-card" + (mode === o.id ? " active" : ""));
      card.type = "button";
      card.innerHTML = `<span class="style-name">${o.title}</span><span class="style-desc">${o.desc}</span>`;
      card.onclick = () => {
        mode = o.id;
        $$(".live-panel .style-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        drawExtra();
      };
      opts.appendChild(card);
    });
    box.append(opts, extra);
    drawExtra();

    const go = el("button", "btn btn-primary", "Turn on live updates");
    go.style.marginTop = "14px";
    box.append(go, err);

    go.onclick = async () => {
      err.classList.remove("error");
      if (!hasWebCrypto()) {
        err.textContent = "Live links need a secure context — serve the app over https:// (or localhost) rather than opening the file directly.";
        err.classList.add("error"); return;
      }
      let kind = "instant", args = {};
      if (mode === "relay") {
        const url = ($("#liveUrlInput").value || "").trim();
        if (!/^https?:\/\/.+/.test(url)) { err.textContent = "Enter your relay's URL, starting with https://"; err.classList.add("error"); return; }
        // a Worker exposes /t/:id; anything else we treat as an ntfy server
        if (/\/$/.test(url) || /ntfy/i.test(url)) { kind = "instant"; args = { server: url }; }
        else { kind = "relay"; args = { url }; }
      }
      go.disabled = true; go.textContent = "Connecting…";
      let ok = false;
      try { ok = await enableLive(kind, args); } catch (e) { liveState.error = String((e && e.message) || e); }
      if (!ok) {
        live = freshLive(); saveLive();
        err.textContent = `Couldn't publish: ${liveState.error}. Check the relay URL opens in a browser.`;
        err.classList.add("error");
        go.disabled = false; go.textContent = "Turn on live updates";
        return;
      }
      renderLiveChip();
      reopen();                                   // redraw the modal in its "on" state
    };
    return box;
  }

  box.appendChild(el("p", "hint share-note", live.mode === "instant"
    ? "This is the link to send. It stays valid for the whole tournament and everyone watching sees each result the moment you record it."
    : "This is the link to send. It stays valid for the whole tournament and refreshes itself for everyone watching, every few seconds."));

  const row = el("div", "share-row");
  const input = el("input", "input share-input");
  input.type = "text"; input.readOnly = true; input.value = liveLink();
  const copy = el("button", "btn btn-primary", "Copy");
  copy.onclick = async () => {
    const ok = await copyText(liveLink());
    copy.textContent = ok ? "Copied" : "Press Ctrl+C";
    if (!ok) input.select();
    setTimeout(() => { copy.textContent = "Copy"; }, 1800);
  };
  row.append(input, copy);
  box.appendChild(row);

  const status = el("p", "hint");
  const setStatus = () => {
    if (liveState.mode === "failed") {
      status.classList.add("error");
      status.textContent = `Last publish failed: ${liveState.error}`;
    } else {
      status.classList.remove("error");
      const where = live.mode === "instant"
        ? `signed updates via ${live.server.replace(/^https?:\/\//, "")}`
        : `your relay at ${live.url.replace(/^https?:\/\//, "")}`;
      status.textContent = (liveState.at ? `Published ${agoText(liveState.at)}` : "Not published yet") + ` · ${where}`;
    }
  };
  setStatus();
  box.appendChild(status);

  const acts = el("div", "live-acts");
  const pub = el("button", "btn btn-ghost btn-sm", "Publish now");
  pub.onclick = async () => { pub.disabled = true; await publishNow(); setStatus(); pub.disabled = false; };
  const fresh = el("button", "btn btn-ghost btn-sm", "New link");
  fresh.title = "Mint a new link and retire the current one";
  fresh.onclick = async () => {
    if (!confirm("Start a new live link? Anyone holding the current one stops receiving updates.")) return;
    const mode = live.mode, args = mode === "relay" ? { url: live.url } : { server: live.server };
    await disableLive();
    try { await enableLive(mode, args); } catch (e) { /* surfaced by the chip */ }
    renderLiveChip();
    reopen();
  };
  const off = el("button", "btn btn-ghost btn-sm", "Turn off");
  off.onclick = async () => {
    if (!confirm("Turn off live updates? The link you sent will stop working.")) return;
    await disableLive();
    reopen();
  };
  acts.append(pub, fresh, off);
  box.appendChild(acts);
  return box;
}

/* clipboard with a select-and-copy fallback for older/locked-down browsers */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    try { return document.execCommand("copy"); } catch (e2) { return false; }
  }
}

/* ---------- share link modal (admin) ---------- */
async function openShareModal() {
  const wrap = el("div", "share-modal");
  wrap.appendChild(el("div", "modal-title", "Share this bracket"));
  wrap.appendChild(el("div", "modal-sub", "Anyone with the link opens the bracket in view-only mode — no setup, no editing."));

  wrap.appendChild(buildBaseSection(() => openShareModal()));
  wrap.appendChild(buildLiveSection(() => openShareModal()));
  wrap.appendChild(el("div", "share-divider", liveOn() ? "One-off snapshot link" : "Snapshot link"));
  wrap.appendChild(el("p", "hint share-note", liveOn()
    ? "A frozen copy of the bracket as it stands now — handy for a recap post. It won't update."
    : "The whole bracket travels inside this link, so it shows the scores as they are right now and won't change afterwards."));

  const row = el("div", "share-row");
  const input = el("input", "input share-input");
  input.type = "text"; input.readOnly = true; input.value = "Building link…";
  const copy = el("button", "btn btn-primary", "Copy");
  copy.disabled = true;
  row.append(input, copy);
  wrap.appendChild(row);

  const hint = el("p", "hint", "The link carries a snapshot of the bracket as it stands right now — send a fresh one after recording new results.");
  wrap.appendChild(hint);

  const actions = el("div", "modal-actions");
  const open = el("button", "btn btn-ghost", "Preview");
  open.disabled = true;
  const mail = el("button", "btn btn-ghost", "Email");
  mail.disabled = true;
  const done = el("button", "btn btn-primary", "Done");
  done.onclick = closeModal;
  actions.append(open, mail, done);
  wrap.appendChild(actions);

  openModal(wrap);

  const link = await buildShareLink();
  input.value = link;
  copy.disabled = open.disabled = mail.disabled = false;

  copy.onclick = async () => {
    const ok = await copyText(link);
    if (!ok) input.select();
    copy.textContent = ok ? "Copied" : "Press Ctrl+C";
    setTimeout(() => { copy.textContent = "Copy"; }, 1800);
  };
  open.onclick = () => window.open(link, "_blank");
  mail.onclick = () => {
    const subject = encodeURIComponent(`${state.name || "Tempest PVP"} — tournament bracket`);
    const body = encodeURIComponent(`Here's the live bracket (view only):\n\n${link}\n`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (isLocalOrigin() && !publicBase) {
    hint.classList.add("error");
    hint.textContent = "This link points at this computer, so nobody else can open it. Set the link address above to wherever the app is published.";
  } else if (link.length > 8000) {
    hint.classList.add("error");
    hint.textContent = `That's a long link (${link.length} characters) — some chat apps may cut it off. Copy it into a link shortener or a pastebin if it breaks.`;
  }
}

/* ---------- live status chip ---------- */
function agoText(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  return m < 60 ? m + "m ago" : Math.round(m / 60) + "h ago";
}

function renderLiveChip() {
  const chip = $("#liveChip"), label = $("#liveChipText");
  if (!chip) return;
  const watching = !!session.liveWatch;
  if (!watching && !liveOn()) { chip.classList.add("hidden"); return; }
  chip.classList.remove("hidden");
  chip.classList.remove("pending", "failed", "stalled");

  if (liveState.mode === "closed") {
    label.textContent = "Live link ended";
    chip.classList.add("stalled");
    chip.title = "The host closed this live link. You're seeing the last bracket they published.";
    chip.disabled = true;
    return;
  }
  if (liveState.mode === "publishing") {
    label.textContent = "Publishing…";
    chip.classList.add("pending");
    chip.title = "Sending the latest scores to the live link";
  } else if (liveState.mode === "pending") {
    label.textContent = "Unpublished changes";
    chip.classList.add("pending");
    chip.title = "Publishing in a moment — click to send now";
  } else if (liveState.mode === "failed") {
    label.textContent = "Publish failed";
    chip.classList.add("failed");
    chip.title = `Couldn't reach the relay: ${liveState.error}. Click to retry.`;
  } else if (liveState.mode === "stalled") {
    label.textContent = "Reconnecting…";
    chip.classList.add("stalled");
    chip.title = `Can't reach the relay: ${liveState.error}. Showing the last bracket received.`;
  } else {
    label.textContent = watching ? `Live · updated ${agoText(liveState.at)}` : `Live · published ${agoText(liveState.at)}`;
    chip.title = watching
      ? `This bracket updates itself as the admin records results. Last change ${agoText(liveState.at)}; last checked ${agoText(liveState.checkedAt)}.`
      : "Your live link is up to date — click to publish again";
  }
  chip.disabled = watching;
}

/* a share link that couldn't be opened — say why, and never show host controls */
function showLinkProblem(reason, selfHealing) {
  const note = $("#viewOnlyNote");
  note.classList.remove("hidden");
  note.classList.add("live-error");
  $("#viewOnlyText").textContent = `Couldn't open this link — ${reason}.`;
  const scroll = $("#bracketScroll");
  scroll.innerHTML = "";
  scroll.appendChild(el("div", "locked-note", selfHealing
    ? "Still listening — the bracket will appear here by itself as soon as the host publishes it."
    : "Nothing to show. If the link was copied in pieces, ask the host for the whole thing; if they haven't published yet, try again in a moment."));
  if (!selfHealing) {
    const retry = el("button", "btn btn-ghost btn-sm", "Try again");
    retry.style.marginTop = "14px";
    retry.onclick = () => location.reload();
    scroll.appendChild(retry);
  }
}
/* the first good message arrived after a failed start — drop the warning */
function clearLiveError() {
  const note = $("#viewOnlyNote");
  if (!note.classList.contains("live-error")) return;
  note.classList.remove("live-error");
  session.linkFailed = session.liveFailed = "";
  applyRole();
}
/* the host ended the live link */
function showLiveClosed() {
  const note = $("#viewOnlyNote");
  note.classList.remove("hidden");
  note.classList.add("live-error");
  $("#viewOnlyText").textContent = "The host has ended this live link. The bracket below is the last version they published.";
}

/* re-render whatever the viewer is looking at (used when live data lands) */
function rerenderCurrentView() {
  if (state.view === "bracket") renderBracket();
  else if (state.view === "next") renderNextView();
  else if (state.view === "schedule") renderScheduleView();
  else { renderPlayers(); refreshGenerate(); }
  renderLiveChip();
}

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
/* every open nav dropdown, shut */
function closeNavMenus() {
  $$(".nav-group").forEach(g => {
    g.classList.remove("open");
    const b = g.querySelector(".nav-group-btn");
    if (b) b.setAttribute("aria-expanded", "false");
  });
}

const VIEWS = ["home", "servers", "events", "participants", "setup", "bracket", "next", "schedule",
                "perspective", "anticheat", "staff", "profile"];

function setView(v) {
  v = allowedView(v);
  state.view = v;
  save();
  VIEWS.forEach(name => $("#view-" + name).classList.toggle("hidden", v !== name));
  $$(".nav-link[data-nav], .nav-menu-item").forEach(b => b.classList.toggle("active", b.dataset.nav === v));
  // a group button lights up when the open view is one of its own items
  $$(".nav-group").forEach(g => {
    const on = [...g.querySelectorAll(".nav-menu-item")].some(i => i.dataset.nav === v);
    g.querySelector(".nav-group-btn").classList.toggle("active", on);
  });
  closeNavMenus();
  if (v === "home") renderHome();
  if (v === "servers") renderServers();
  if (v === "events") renderEvents();
  if (v === "perspective") {
    renderPerspective();
    // fetch the catalogue if this session has not yet, then ask for every
    // transcript it came back without
    ensureLoaded("recordings")
      .then(got => { if (got) renderPerspective(); return requestAllTranscripts(); })
      .then(n => { if (n) renderPerspective(); });
  }
  if (v === "anticheat") {
    renderAnticheat();
    ensureLoaded("flags").then(got => { if (got) renderAnticheat(); });
  }
  if (v === "profile") { renderProfile(); renderPermMatrix("profilePerms"); }
  if (v === "participants") renderParticipants();
  if (v === "staff") {
    renderStaff(); renderRoleEditor(); renderDashboard();
    renderStaffSubTabs();
    // the dashboard is built out of both sources, so it needs both
    Promise.all([ensureLoaded("flags"), ensureLoaded("recordings")])
      .then(got => { if (got.some(Boolean)) { renderDashboard(); renderStaffSubTabs(); } });
    // paint from the local copy first, then correct it from the API
    syncAccountsFromApi().then(ok => { if (ok) renderStaff(); });
    syncPermsFromApi().then(changed => { if (changed) afterPermChange(); });
    fetchCases().then(() => { renderCases(); renderDashTiles(); renderStaffSubTabs(); });
  }
  if (v === "setup") renderSetupServer();
  if (v === "bracket") { renderBracket(); renderBracketServer(); }
  if (v === "next") renderNextView();
  if (v === "schedule") renderScheduleView();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ============================================================
   INIT / EVENTS
   ============================================================ */
async function init() {
  loadLive();                                    // device config (which links this browser publishes)
  loadPublicBase();
  const hash = location.hash || "";
  const linkKind = /^#live2=/.test(hash) ? "instant"
    : /^#live=/.test(hash) ? "relay"
    : /^#t=/.test(hash) ? "snapshot" : "";
  if (linkKind) {
    // Anything that looks like a share link is a viewer session — before we
    // even try to read it. A truncated or hand-edited link therefore can't
    // fall through to the host's controls; it just fails as a viewer.
    session.shared = true;
    session.role = "visitor";
    session.linkKind = linkKind;

    const ok = linkKind === "instant" ? await loadFromNtfyHash()
      : linkKind === "relay" ? await loadFromLiveHash()
      : await loadFromHash();
    if (!ok) { state = freshState(); state.view = "bracket"; }
  } else {
    load();
    // visitor unless this browser has signed in as the host before
    restoreSession();               // whoever last logged in on this device
  }

  // restore config inputs
  $("#tName").value = state.name || "";
  fillTierSelect($("#tierInput"), "");
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
    state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {};              // reset progress on type change
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
  const resetProgress = () => { state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {}; };
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
    hint.textContent = "Team and tier stay put so you can add a whole roster in a row.";
    hint.classList.remove("error");
    state.players.push({
      id: "p" + (pidCounter++), name,
      team: $("#teamInput").value.trim(),
      tier: $("#tierInput").value,
      discord: $("#discordInput").value.trim(),
    });
    state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {};
    input.value = "";
    $("#discordInput").value = "";     // per-person, unlike team and tier
    updateAddPreview();
    save();
    renderPlayers();
    input.focus();
  });

  // quick actions — sample count stepper + add (shuffled, with live top-up)
  const clampSampleCount = () => {
    const cap = Math.max(1, 128 - state.players.length); // room left up to the cap
    let c = parseInt($("#sampleCount").value, 10);
    if (isNaN(c) || c < 1) c = 1;
    c = Math.min(c, cap);
    $("#sampleCount").value = c;
    $("#sampleCount").max = cap;
    return c;
  };
  $("#sampleMinus").addEventListener("click", () => { $("#sampleCount").value = Math.max(1, (parseInt($("#sampleCount").value, 10) || 1) - 1); });
  $("#samplePlus").addEventListener("click", () => { $("#sampleCount").value = (parseInt($("#sampleCount").value, 10) || 0) + 1; clampSampleCount(); });
  $("#sampleCount").addEventListener("input", clampSampleCount);

  const seedBtn = $("#seedSample");
  // Add `count` players drawn at random from the built-in + live-fetched pool,
  // fetching more from the tier lists whenever the pool runs dry.
  async function addSamples(count) {
    const label = seedBtn.textContent;
    seedBtn.disabled = true;
    let added = 0, fetches = 0;
    while (added < count && state.players.length < 128) {
      const taken = new Set(state.players.map(p => p.name.toLowerCase()));
      const pool = shuffle(fetchedPool.filter(e => !taken.has(e.name.toLowerCase())));
      if (!pool.length) {
        if (fetches++ >= 12) break;            // safety valve against a spin loop
        seedBtn.textContent = "Fetching…";
        if (!(await fetchSampleBatch())) break; // offline / all sources unreachable
        continue;
      }
      for (const e of pool) {
        if (added >= count || state.players.length >= 128) break;
        state.players.push({ id: "p" + (pidCounter++), name: e.name, team: "", tier: e.tier || "" });
        added++;
      }
    }
    seedBtn.textContent = label;
    seedBtn.disabled = false;
    if (added) { state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {}; save(); renderPlayers(); }
    return added;
  }
  seedBtn.addEventListener("click", async () => {
    const count = clampSampleCount();
    const added = await addSamples(count);
    if (added < count) {
      const hint = $("#sampleAvail");
      if (hint) hint.textContent = added
        ? `Added ${added} — couldn't reach the tier lists for the rest (offline?).`
        : "Couldn't reach the tier lists — check your connection and try again.";
    }
  });
  // auto match: seed by tier, keep team-mates apart in round 1
  $("#autoMatch").addEventListener("click", () => {
    const hint = $("#sampleAvail");
    if (state.players.length < 2) { hint.textContent = "Add at least 2 players first."; return; }
    const res = autoMatchByTier();
    state.players = res.players;
    state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {};
    save(); renderPlayers();

    const unranked = state.players.filter(p => !p.tier).length;
    const parts = [`Matched ${state.players.length} players on close tiers`];
    if (unranked) parts.push(`${unranked} unranked drawn last`);
    parts.push(res.mirrors
      ? `${res.mirrors} same-tier round-1 ${res.mirrors === 1 ? "match" : "matches"} left (no other tier to pair with)`
      : "no same-tier round-1 matches");

    if (!res.teamCount) {
      parts.push("no teams set, so nothing to keep apart");
    } else if (res.block < 2) {
      parts.push("round 1 is the quarterfinals here, so team-mates can meet straight away");
    } else if (res.teamsAfter) {
      parts.push(`${res.teamsAfter} player${res.teamsAfter === 1 ? "" : "s"} still share a path before ${roundPhrase(res.protects)} — too many from one team to split further`);
    } else if (res.block < res.qfBlock) {
      parts.push(`no team meets before ${roundPhrase(res.protects)} (a full quarterfinal split needs ${res.qfBlock} teams, you have ${res.teamCount})`);
    } else {
      parts.push("no team meets before the quarterfinals");
    }
    hint.textContent = parts.join(" · ") + ".";
  });
  $("#shufflePlayers").addEventListener("click", () => {
    if (state.players.length < 2) return;
    state.players = shuffle(state.players);                 // randomise seeding order
    state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {};
    save(); renderPlayers();
  });
  $("#clearPlayers").addEventListener("click", () => {
    if (!state.players.length) return;
    if (confirm("Remove all players?")) { state.players = []; state.scores = {}; state.formats = {}; state.matchModes = {}; state.champ = {}; save(); renderPlayers(); }
  });

  // generate — choose tournament style first
  $("#generateBtn").addEventListener("click", () => {
    if (state.players.length < 2) return;
    openStyleModal();
  });
  // close modal on overlay backdrop click / Escape
  $("#modalOverlay").addEventListener("click", e => { if (e.target === $("#modalOverlay")) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closeFormatMenu(); closeNavMenus(); } });

  // nav
  $$("[data-nav]").forEach(b => b.addEventListener("click", e => {
    e.preventDefault();
    const v = b.dataset.nav;
    // an empty bracket is only worth redirecting for the host, who can fill it
    if (v === "bracket" && state.players.length < 2 && isAdmin()) { setView("setup"); return; }
    setView(v);
  }));
  // nav dropdowns: toggle, and shut on an outside click
  $$(".nav-group-btn").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const g = btn.closest(".nav-group");
      const wasOpen = g.classList.contains("open");
      closeNavMenus();
      if (!wasOpen) {
        g.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
  document.addEventListener("click", ev => {
    if (!ev.target.closest(".nav-group")) closeNavMenus();
  });

  $("#backToSetup").addEventListener("click", () => setView("setup"));

  // participants roster
  $("#partSearch").addEventListener("input", renderParticipants);
  $("#partCopy").addEventListener("click", copyRoster);

  // server list editor (host only; the buttons are data-admin gated)
  $("#srvAdd").addEventListener("click", () => openServerModal(null));
  $("#srvReset").addEventListener("click", confirmResetServers);

  // ---- roles + sharing ----
  // only ever reachable in a local session — the button is hidden when shared
  $("#roleSwitch").addEventListener("click", () => session.account ? signOut() : openLoginModal());
  $("#signUpBtn").addEventListener("click", openSignupModal);
  $("#staffAdd").addEventListener("click", openStaffModal);
  $("#staffExport").addEventListener("click", copyStaffFile);
  $("#roleExport").addEventListener("click", copyRoleFile);
  $("#permExport").addEventListener("click", copyPermsFile);
  $("#permResetAll").addEventListener("click", resetAllPerms);
  $("#staffServerExport").addEventListener("click", copyServerStaff);
  $("#caseFilter").addEventListener("change", renderCases);
  $("#caseRefresh").addEventListener("click", async () => {
    await refreshFlags();
    await refreshRecordings();
    await fetchCases();
    renderDashboard();
  });
  $("#eventAdd").addEventListener("click", () => openEventModal(null));
  $("#roleChip").addEventListener("click", () => setView("profile"));

  // management tabs
  $("#perspectiveSearch").addEventListener("input", renderPerspective);
  $("#perspectiveRefresh").addEventListener("click", () => refreshManagement("recordings"));
  $("#perspectiveImport").addEventListener("click", () => importJsonFile("recordings"));
  $("#flagCheck").addEventListener("change", renderAnticheat);
  $("#flagPlayer").addEventListener("input", renderAnticheat);
  $("#flagRefresh").addEventListener("click", () => refreshManagement("flags"));
  $("#flagImport").addEventListener("click", () => importJsonFile("flags"));
  $("#roleResetAll").addEventListener("click", resetAllRoleColors);
  $("#shareBtn").addEventListener("click", openShareModal);
  $("#bracketDownload").addEventListener("click", downloadBracketPng);
  $("#liveChip").addEventListener("click", () => { if (!session.liveWatch) publishNow(); });
  $("#splitToggle").addEventListener("click", () => {
    state.splitView = state.splitView === false;
    save();
    updateSplitToggle();
    renderBracket();
  });

  // ---- schedule board builder ----
  $("#sbAll").addEventListener("click", () => { $$("#sbMatchList .sched-check").forEach(c => c.checked = true); updateSchedCount(); });
  $("#sbNone").addEventListener("click", () => { $$("#sbMatchList .sched-check").forEach(c => c.checked = false); updateSchedCount(); });
  $("#sbGenerate").addEventListener("click", () => {
    const hint = $("#sbHint");
    if (!$("#sbDate").value) { hint.textContent = "Pick a date for this schedule board first."; hint.classList.add("error"); return; }
    const picked = selectedMatchDescriptors();
    if (!picked.length) { hint.textContent = "Select at least one match to put on the board."; hint.classList.add("error"); return; }
    hint.classList.remove("error");
    const board = makeBoard(picked);
    state.boards = (state.boards || []).filter(b => b.id !== board.id); // upsert by date+day
    state.boards.push(board);
    state.boards.sort((a, b) => (a.date + a.day).localeCompare(b.date + b.day));
    save();
    renderSavedBoards();
    showBoard(board);
    hint.textContent = `Saved — Day ${board.day} board with ${board.matches.length} matches.`;
    $("#sbStage").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#sbZoom").addEventListener("click", e => {
    _boardZoom = !_boardZoom;
    e.target.textContent = _boardZoom ? "Fit" : "Full size";
    fitBoard();
  });
  $("#sbDownload").addEventListener("click", downloadBoardPng);

  // ---- next match board ----
  $("#nextZoom").addEventListener("click", e => {
    _nextZoom = !_nextZoom;
    e.target.textContent = _nextZoom ? "Fit" : "Full size";
    fitNextBoard();
  });
  $("#nextDownload").addEventListener("click", async () => {
    const src = $("#nextWrap .vsboard");
    if (!src) return;
    const btn = $("#nextDownload"), orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Rendering…";
    try { await boardToPng(src, `next-match-${(nextMatchInfo() || {}).no || ""}.png`); btn.textContent = orig; }
    catch (e) { btn.textContent = "Screenshot instead"; setTimeout(() => btn.textContent = orig, 2500); }
    finally { btn.disabled = false; }
  });
  $("#resetAll").addEventListener("click", () => {
    if (confirm("Reset everything and start over?")) {
      state = freshState();
      pidCounter = 1; save();
      $("#tName").value = "";
      renderModes();
      $$("[data-bracket]").forEach(c => c.classList.toggle("active", c.dataset.bracket === "single"));
      fillTierSelect($("#tierInput"), "");
      $("#teamInput").value = "";
      renderPlayers();
      updateSplitToggle();
      setView("setup");
    }
  });

  // a share link pasted into an already-open tab only changes the fragment,
  // which doesn't reload the page — so pick it up ourselves. In a shared session
  // clearing the payload puts it straight back: the link stays view-only.
  let loadedHash = location.hash;
  window.addEventListener("hashchange", () => {
    if (location.hash === loadedHash) return;
    if (/^#(t=|live=|live2=)/.test(location.hash)) { location.reload(); return; }
    if (session.shared) { location.hash = loadedHash; return; }
    loadedHash = location.hash;
  });

  // refit whenever the canvas itself changes width (window resize, nav wrap, …).
  // Width-only so the height change fitting causes can't feed back into a loop.
  if (typeof ResizeObserver === "function") {
    let lastW = 0;
    new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      fitBrackets();
      redrawAllConnectors();
    }).observe($("#bracketScroll"));
  }

  // redraw connectors on resize
  let rz;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { fitBrackets(); redrawAllConnectors(); fitBoard(); fitNextBoard(); }, 120);
  });

  // initial view
  updateSplitToggle();
  applyRole();
  const restore = state.view === "bracket" && state.players.length >= 2 ? "bracket"
    : VIEWS.includes(state.view) && state.view !== "bracket" ? state.view
    : "home";
  setView(restore);

  // live links: viewers follow new results, admins show their publish status
  if (session.liveWatch && session.liveWatch.mode === "relay") {
    startLiveWatch(session.liveWatch.id, session.liveWatch.url);
  }
  const problem = session.linkFailed || session.liveFailed;
  if (problem) showLinkProblem(problem, session.linkKind === "instant");
  renderLiveChip();
  setInterval(renderLiveChip, 15000);        // keep the "updated 20s ago" text honest
}

function updateSplitToggle() {
  const btn = $("#splitToggle");
  if (btn) btn.textContent = state.splitView === false ? "Split view" : "Classic view";
}

/* ============================================================
   SERVERS  — the directory, and where a tournament is played
   ============================================================
   Server entries come from servers.js (window.TEMPEST_SERVERS). The
   tournament stores only the id, so a renamed or re-addressed server
   updates everywhere at once, and a tournament with no server set
   behaves exactly as it did before servers existed. */
/* servers.js ships the starter list; anything the host adds or edits in
   the app is kept per-browser in localStorage and takes over from it.
   "Reset to defaults" throws the local copy away and goes back to the
   file, so the shipped list stays the fallback rather than being lost. */
const SERVERS_KEY = "tsmp_servers";
const DEFAULT_SERVERS = Array.isArray(window.TEMPEST_SERVERS) ? window.TEMPEST_SERVERS : [];
let SERVERS = [];

function loadServers() {
  try {
    const raw = localStorage.getItem(SERVERS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        SERVERS = list.filter(s => s && s.id && s.name && s.host);
        return;
      }
    }
  } catch (e) {}
  SERVERS = DEFAULT_SERVERS.map(s => Object.assign({}, s));
}
function saveServers() {
  try { localStorage.setItem(SERVERS_KEY, JSON.stringify(SERVERS)); } catch (e) {}
}
function resetServers() {
  try { localStorage.removeItem(SERVERS_KEY); } catch (e) {}
  loadServers();
}
loadServers();

const serverById = id => SERVERS.find(s => s.id === id) || null;
const serverAddress = s => (s.port && s.port !== 25565) ? s.host + ":" + s.port : s.host;

/* a url-safe id from the name, kept unique */
function serverSlug(name, skipId) {
  let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "server";
  let id = base, n = 2;
  while (SERVERS.some(s => s.id === id && s.id !== skipId)) id = base + "-" + (n++);
  return id;
}

/* What the tournament remembers about its server. The list lives in this
   browser, so a viewer opening a share link has no way to look the id up
   - the snapshot travels with the link and is used as the fallback. */
function serverSnapshot(s) {
  return s ? { id: s.id, name: s.name, host: s.host, port: s.port || 0, region: s.region || "" } : null;
}
function chooseServer(id) {
  const s = serverById(id);
  state.serverId = s ? s.id : "";
  state.serverSnap = serverSnapshot(s);
  save();
}
/* the live entry if we have it, otherwise whatever the link carried */
function currentServer() {
  return serverById(state.serverId) || state.serverSnap || null;
}

/* ---------- add / edit a server ---------- */
function openServerModal(serverId) {
  const existing = serverById(serverId);
  const wrap = el("div", "server-modal");
  wrap.appendChild(el("div", "modal-title", existing ? "Edit server" : "Add a server"));
  wrap.appendChild(el("div", "modal-sub", "Only the name and address are required. Status is looked up from the address."));

  const mk = (label, node, hint) => {
    const f = el("label", "field");
    f.appendChild(el("span", "field-label", label));
    f.appendChild(node);
    if (hint) f.appendChild(el("span", "hint", hint));
    return f;
  };
  const input = (val, ph, max) => {
    const i = el("input", "input");
    i.type = "text"; i.value = val || ""; i.placeholder = ph || "";
    if (max) i.maxLength = max;
    return i;
  };

  const nameIn = input(existing && existing.name, "Minemen Club EU", 40);
  const hostIn = input(existing && existing.host, "eu.minemen.club", 80);
  const portIn = el("input", "input");
  portIn.type = "number"; portIn.min = 1; portIn.max = 65535;
  portIn.placeholder = "25565";
  portIn.value = existing && existing.port && existing.port !== 25565 ? existing.port : "";
  const regionIn = input(existing && existing.region, "EU", 8);
  const countryIn = input(existing && existing.country, "de", 2);
  const blurbIn = input(existing && existing.blurb, "One short line about it.", 90);

  const accentIn = el("select", "input select");
  [["239,68,68", "Red"], ["0,89,255", "Blue"], ["255,132,0", "Orange"],
   ["153,64,255", "Purple"], ["0,194,103", "Green"], ["255,200,0", "Gold"]]
    .forEach(([val, label]) => {
      const o = el("option"); o.value = val; o.textContent = label;
      accentIn.appendChild(o);
    });
  accentIn.value = (existing && existing.accent) || "239,68,68";

  const modeWrap = el("div", "srv-mode-pick");
  const boxes = MODES.map(m => {
    const lab = el("label", "srv-mode-opt");
    const cb = el("input");
    cb.type = "checkbox"; cb.value = m.id;
    cb.checked = !!(existing && (existing.modes || []).includes(m.id));
    const img = el("img"); img.src = m.img; img.alt = "";
    const txt = el("span"); txt.textContent = m.name;
    lab.append(cb, img, txt);
    modeWrap.appendChild(lab);
    return cb;
  });

  const featWrap = el("label", "srv-feat-opt");
  const featCb = el("input");
  featCb.type = "checkbox";
  featCb.checked = !!(existing && existing.featured);
  featWrap.append(featCb, document.createTextNode(" Show as a featured card"));

  wrap.append(
    mk("Server name", nameIn),
    mk("Address", hostIn, "The hostname players connect to."),
    mk("Port", portIn, "Leave blank for the default 25565."),
    mk("Region", regionIn, "Short tag, for example NA, EU, OCE."),
    mk("Country flag", countryIn, "Optional two-letter code such as de or us. Defaults to the region."),
    mk("Description", blurbIn),
    mk("Card colour", accentIn),
    mk("Gamemodes", modeWrap),
    featWrap
  );

  const err = el("p", "hint");
  wrap.appendChild(err);

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.onclick = closeModal;
  const ok = el("button", "btn btn-primary", existing ? "Save server" : "Add server");
  ok.onclick = () => {
    const name = nameIn.value.trim();
    const host = hostIn.value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (name.length < 2) { err.textContent = "Give the server a name."; err.classList.add("error"); return; }
    if (!/^[a-z0-9.-]+$/i.test(host)) { err.textContent = "Enter a valid address, like play.example.net."; err.classList.add("error"); return; }

    const port = parseInt(portIn.value, 10);
    const rec = {
      id: existing ? existing.id : serverSlug(name),
      name,
      host,
      port: port > 0 && port <= 65535 ? port : 0,
      region: regionIn.value.trim().toUpperCase(),
      country: countryIn.value.trim().toLowerCase(),
      modes: boxes.filter(b => b.checked).map(b => b.value),
      blurb: blurbIn.value.trim(),
      accent: accentIn.value,
      featured: featCb.checked,
    };
    if (existing) Object.assign(existing, rec);
    else SERVERS.push(rec);

    saveServers();
    // the tournament keeps a snapshot, so refresh it if this is its server
    if (state.serverId === rec.id) chooseServer(rec.id);
    renderServers();
    renderSetupServer();
    closeModal();
  };
  actions.append(cancel, ok);
  wrap.appendChild(actions);
  openModal(wrap);
  nameIn.focus();
}

function removeServer(id) {
  const s = serverById(id);
  if (!s) return;
  const wrap = el("div");
  wrap.appendChild(el("div", "modal-title", "Remove this server?"));
  const sub = el("div", "modal-sub");
  sub.textContent = s.name + " (" + serverAddress(s) + ") will be taken off the list on this device.";
  wrap.appendChild(sub);
  if (state.serverId === id) {
    wrap.appendChild(el("p", "hint error", "The current tournament is set to this server, so it will be cleared."));
  }
  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Keep it");
  cancel.onclick = closeModal;
  const go = el("button", "btn btn-primary", "Remove");
  go.onclick = () => {
    const i = SERVERS.findIndex(x => x.id === id);
    if (i >= 0) SERVERS.splice(i, 1);
    saveServers();
    if (state.serverId === id) chooseServer("");
    renderServers();
    renderSetupServer();
    closeModal();
  };
  actions.append(cancel, go);
  wrap.appendChild(actions);
  openModal(wrap);
}

function confirmResetServers() {
  const wrap = el("div");
  wrap.appendChild(el("div", "modal-title", "Reset the server list?"));
  wrap.appendChild(el("div", "modal-sub", "Your added and edited servers on this device are discarded and the list goes back to the ones shipped in servers.js."));
  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.onclick = closeModal;
  const go = el("button", "btn btn-primary", "Reset list");
  go.onclick = () => {
    resetServers();
    if (state.serverId && !serverById(state.serverId)) chooseServer("");
    renderServers();
    renderSetupServer();
    closeModal();
  };
  actions.append(cancel, go);
  wrap.appendChild(actions);
  openModal(wrap);
}

/* ---------- live status ----------------------------------------------
   Two public, CORS-enabled status APIs, the second as a fallback. Results
   are cached per host for a minute so flipping between tabs does not
   re-hammer them, and every failure path resolves to "unknown" rather
   than throwing — a directory that cannot reach the API still renders. */
const STATUS_TTL = 60000;
const STATUS_KEY = "tsmp_srv_status";

function statusCache() {
  try { return JSON.parse(sessionStorage.getItem(STATUS_KEY) || "{}"); } catch (e) { return {}; }
}
function statusCacheGet(host) {
  const hit = statusCache()[host];
  return hit && (Date.now() - hit.at) < STATUS_TTL ? hit.val : null;
}
function statusCacheSet(host, val) {
  try {
    const all = statusCache();
    all[host] = { at: Date.now(), val };
    sessionStorage.setItem(STATUS_KEY, JSON.stringify(all));
  } catch (e) {}
}

/* mcstatus.io goes first: unlike mcsrvstat it reliably returns the server
   icon and a version string, which are two of the table's columns. The
   other service stays as a fallback for when it is unreachable. */
async function fetchServerStatus(host) {
  const cached = statusCacheGet(host);
  if (cached) return cached;

  let out = { state: "unknown" };
  try {
    const r = await fetch("https://api.mcstatus.io/v2/status/java/" + encodeURIComponent(host));
    if (r.ok) {
      const d = await r.json();
      if (d && typeof d.online === "boolean") {
        out = d.online
          ? { state: "online",
              online: (d.players && d.players.online) || 0,
              max: (d.players && d.players.max) || 0,
              version: (d.version && d.version.name_clean) || "",
              icon: d.icon || "" }
          : { state: "offline" };
      }
    }
  } catch (e) {}

  if (out.state === "unknown") {
    try {
      const r = await fetch("https://api.mcsrvstat.us/3/" + encodeURIComponent(host));
      if (r.ok) {
        const d = await r.json();
        if (d && typeof d.online === "boolean") {
          out = d.online
            ? { state: "online",
                online: (d.players && d.players.online) || 0,
                max: (d.players && d.players.max) || 0,
                version: d.version || "",
                icon: d.icon || "" }
            : { state: "offline" };
        }
      }
    } catch (e) {}
  }

  statusCacheSet(host, out);
  return out;
}

const fmtPlayers = n => Number(n || 0).toLocaleString("en-US");

/* A region tag is not a country, so the flag is only ever region-level
   unless an entry sets `country` explicitly. GLOBAL deliberately gets
   none - there is no honest flag for "everywhere". */
const REGION_FLAG = { NA: "us", US: "us", EU: "eu", UK: "gb", OCE: "au", AU: "au",
                      AS: "sg", ASIA: "sg", SA: "br", AF: "za" };
function flagCode(s) {
  if (s.country) return String(s.country).toLowerCase();
  return REGION_FLAG[String(s.region || "").toUpperCase()] || "";
}
function flagCell(s) {
  const code = flagCode(s);
  const cell = el("div", "srv-flag");
  if (!code) {
    cell.textContent = "•";
    cell.title = s.region || "";
    return cell;
  }
  const img = el("img");
  img.src = "https://flagcdn.com/w40/" + code + ".png";
  img.alt = s.region || code.toUpperCase();
  img.title = s.region || code.toUpperCase();
  img.addEventListener("error", () => { cell.textContent = s.region || ""; }, { once: true });
  cell.appendChild(img);
  return cell;
}

/* the server's own favicon, once the status lookup brings it back */
function iconCell(s) {
  const cell = el("div", "srv-ico");
  const img = el("img");
  img.alt = "";
  cell.appendChild(img);
  return cell;
}

function statusPill(state) {
  const pill = el("span", "srv-state");
  if (state === "online") { pill.classList.add("on"); pill.textContent = "Online"; }
  else if (state === "offline") { pill.classList.add("off"); pill.textContent = "Offline"; }
  else if (state === "checking") { pill.classList.add("wait"); pill.textContent = "..."; }
  else { pill.classList.add("unknown"); pill.textContent = "Unknown"; }
  return pill;
}

/* a dot-plus-count node, used by the setup picker and bracket header */
function statusNode(host) {
  const wrap = el("div", "srv-status");
  const dot = el("span", "status-dot pending");
  const text = el("span", "", "Checking");
  wrap.append(dot, text);
  fetchServerStatus(host).then(st => {
    if (st.state === "online") {
      dot.className = "status-dot on";
      text.innerHTML = "";
      const b = el("b", "", fmtPlayers(st.online));
      text.append(b, document.createTextNode(st.max ? " / " + fmtPlayers(st.max) + " online" : " online"));
    } else if (st.state === "offline") {
      dot.className = "status-dot off";
      text.textContent = "Offline";
    } else {
      dot.className = "status-dot";
      text.textContent = "Status unknown";
    }
  });
  return wrap;
}

function modeIcons(ids) {
  const wrap = el("div", "srv-modes");
  (ids || []).forEach(id => {
    const m = MODES.find(x => x.id === id);
    if (!m) return;
    const img = el("img", "srv-mode-ico");
    img.src = m.img; img.alt = m.name; img.title = m.name;
    wrap.appendChild(img);
  });
  return wrap;
}

function copyIpButton(addr) {
  const btn = el("button", "btn btn-ghost btn-sm srv-copy", "Copy IP");
  btn.type = "button";
  btn.addEventListener("click", async () => {
    const ok = await copyText(addr);
    btn.textContent = ok ? "Copied" : "Copy failed";
    btn.classList.toggle("copied", ok);
    setTimeout(() => { btn.textContent = "Copy IP"; btn.classList.remove("copied"); }, 1600);
  });
  return btn;
}

/* host-only: adopt this server for the current tournament */
function useServerButton(s) {
  const btn = el("button", "btn btn-primary btn-sm", "Host here");
  btn.type = "button";
  btn.title = "Play the current tournament on this server";
  btn.setAttribute("data-admin", "");
  if (!isAdmin()) btn.classList.add("hidden");
  btn.addEventListener("click", () => {
    chooseServer(s.id);
    setView("setup");
  });
  return btn;
}

/* Minecraft cannot be launched from a browser, so Play hands over the
   address rather than pretending to connect. */
function playButton(s) {
  const btn = el("button", "srv-play", "Play");
  btn.type = "button";
  btn.title = "Copy " + serverAddress(s) + " to join in Minecraft";
  btn.addEventListener("click", async ev => {
    ev.stopPropagation();
    const ok = await copyText(serverAddress(s));
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => { btn.textContent = "Play"; }, 1500);
  });
  return btn;
}

function serverCard(s) {
  const card = el("div", "srv-card");
  if (s.accent) card.style.setProperty("--srv-accent", s.accent);

  const art = el("img", "srv-card-art");
  art.alt = "";
  card.appendChild(art);

  const top = el("div", "srv-card-top");
  const name = el("div", "srv-card-name");
  name.textContent = s.name;
  top.appendChild(name);
  if (s.blurb) {
    const blurb = el("div", "srv-card-blurb");
    blurb.textContent = s.blurb;
    top.appendChild(blurb);
  }

  const foot = el("div", "srv-card-foot");
  const live = el("div", "srv-card-live");
  const dot = el("span", "status-dot pending");
  const count = el("span", "srv-card-count", "Checking");
  live.append(dot, count);
  foot.append(live, playButton(s));

  card.append(top, foot);

  fetchServerStatus(s.host).then(st => {
    if (st.icon) { art.src = st.icon; card.classList.add("has-art"); }
    if (st.state === "online") {
      dot.className = "status-dot on";
      count.textContent = fmtPlayers(st.online) + " Online";
    } else if (st.state === "offline") {
      dot.className = "status-dot off";
      count.textContent = "Offline";
    } else {
      dot.className = "status-dot";
      count.textContent = "Status unknown";
    }
  });
  return card;
}

function serverRow(s) {
  const row = el("div", "row srv-row");

  const main = el("div", "srv-row-main");
  const name = el("div", "srv-row-name");
  name.textContent = s.name;
  const addr = el("div", "srv-row-sub");
  const ip = el("span", "srv-ip");
  ip.textContent = serverAddress(s);
  addr.appendChild(ip);
  if (s.blurb) addr.append(document.createTextNode(" - " + s.blurb));
  main.append(name, addr);

  const players = el("div", "srv-players", "&mdash;");
  const version = el("div", "srv-version", "&mdash;");
  const state = el("div", "srv-state-cell");
  state.appendChild(statusPill("checking"));

  const ico = iconCell(s);

  const actions = el("div", "srv-actions");
  actions.append(copyIpButton(serverAddress(s)), useServerButton(s));
  if (isAdmin()) {
    const edit = el("button", "btn btn-ghost btn-sm", "Edit");
    edit.type = "button";
    edit.setAttribute("data-admin", "");
    edit.onclick = () => openServerModal(s.id);
    const rm = el("button", "btn btn-ghost btn-sm part-remove", "Remove");
    rm.type = "button";
    rm.setAttribute("data-admin", "");
    rm.onclick = () => removeServer(s.id);
    actions.append(edit, rm);
  }

  row.append(flagCell(s), ico, main, players, version, state, modeIcons(s.modes), actions);

  fetchServerStatus(s.host).then(st => {
    if (st.icon) ico.querySelector("img").src = st.icon;
    else ico.classList.add("blank");
    if (st.state === "online") {
      players.textContent = fmtPlayers(st.online) + " / " + fmtPlayers(st.max);
      version.textContent = st.version || "Unknown";
    } else {
      players.textContent = "—";
      version.textContent = "—";
    }
    state.innerHTML = "";
    state.appendChild(statusPill(st.state));
  });
  return row;
}

/* the three cards at the top of a page, falling back to the first few */
function featuredServers() {
  const picked = SERVERS.filter(s => s.featured).slice(0, 3);
  return picked.length ? picked : SERVERS.slice(0, 3);
}

/* ---------- sorting the table ---------- */
const SRV_SORTS = [
  { key: "players", label: "Most players" },
  { key: "name",    label: "Name A to Z" },
  { key: "region",  label: "Region" },
];
let srvSort = 0;
/* On the first paint nothing is cached yet, so ordering by player count
   cannot work until the lookups land. Re-sort once they all have, then
   leave it alone so this cannot loop. */
let srvResorted = false;

function sortedServers() {
  const list = SERVERS.slice();
  const key = SRV_SORTS[srvSort].key;
  if (key === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (key === "region") {
    list.sort((a, b) => String(a.region || "").localeCompare(String(b.region || "")) || a.name.localeCompare(b.name));
  } else {
    // players needs the cached lookup; anything unresolved sorts last
    const count = s => {
      const st = statusCacheGet(s.host);
      return st && st.state === "online" ? st.online : -1;
    };
    list.sort((a, b) => count(b) - count(a) || a.name.localeCompare(b.name));
  }
  return list;
}

function renderServers() {
  const feat = $("#srvFeatured");
  const list = $("#srvList");
  if (!feat || !list) return;
  feat.innerHTML = "";
  list.innerHTML = "";

  if (!SERVERS.length) {
    list.appendChild(el("p", "empty-note", "No servers listed yet. Add one with the button above."));
    return;
  }
  featuredServers().forEach(s => feat.appendChild(serverCard(s)));

  // column header, sharing the row grid so the labels line up
  const head = el("div", "srv-head");
  const title = el("span", "srv-head-title", "Server");
  const ph = el("span", "", "Players");
  const vh = el("span", "", "Version");
  const sh = el("span", "", "Status");
  const sortBtn = el("button", "srv-sort");
  sortBtn.type = "button";
  sortBtn.textContent = SRV_SORTS[srvSort].label;
  sortBtn.title = "Change how the list is ordered";
  sortBtn.onclick = () => { srvSort = (srvSort + 1) % SRV_SORTS.length; srvResorted = false; renderServers(); };
  head.append(title, ph, vh, sh, sortBtn);
  list.appendChild(head);

  sortedServers().forEach(s => list.appendChild(serverRow(s)));

  if (SRV_SORTS[srvSort].key === "players" && !srvResorted) {
    srvResorted = true;                      // set first: the re-render must not schedule another
    Promise.all(SERVERS.map(s => fetchServerStatus(s.host)))
      .then(() => { if (state.view === "servers") renderServers(); });
  }
}

function renderHome() {
  const strip = $("#homeServers");
  if (strip) {
    strip.innerHTML = "";
    const pick = featuredServers();
    if (pick.length) pick.forEach(s => strip.appendChild(serverCard(s)));
    else strip.appendChild(el("p", "empty-note", "No servers listed yet — add one in servers.js."));
  }
  const modes = $("#homeModes");
  if (modes) {
    modes.innerHTML = "";
    MODES.forEach(m => {
      const chip = el("span", "home-mode");
      const img = el("img");
      img.src = m.img;
      img.alt = "";
      chip.append(img, document.createTextNode(m.name));
      modes.appendChild(chip);
    });
  }
}

/* ---------- the server picker on the Tournament Maker ---------- */
function renderSetupServer() {
  const host = $("#setupServer");
  if (!host) return;
  host.innerHTML = "";

  const sel = el("select", "input select");
  const none = el("option", "", "No server");
  none.value = "";
  sel.appendChild(none);
  SERVERS.forEach(s => {
    const o = el("option");
    o.value = s.id;
    o.textContent = s.name + " · " + serverAddress(s);
    sel.appendChild(o);
  });
  sel.value = serverById(state.serverId) ? state.serverId : "";
  sel.addEventListener("change", () => {
    chooseServer(sel.value);
    renderSetupServer();
  });
  host.appendChild(sel);

  const s = serverById(state.serverId);
  if (s) {
    const note = el("div", "srv-actions");
    note.style.marginTop = "10px";
    const pill = el("span", "pill pill-region");
    pill.textContent = s.region || "—";
    note.append(pill, statusNode(s.host), copyIpButton(serverAddress(s)));
    host.appendChild(note);
  } else {
    host.appendChild(el("p", "hint", "Optional — pick one on the Servers tab and it travels with the tournament."));
  }
}

/* ---------- the server shown above the bracket ---------- */
function renderBracketServer() {
  const host = $("#bracketServer");
  if (!host) return;
  host.innerHTML = "";
  const s = currentServer();
  if (!s) return;

  const wrap = el("div", "srv-actions");
  wrap.style.marginTop = "8px";
  const name = el("span", "pill");
  name.textContent = s.name;
  const ip = el("span", "pill");
  const ipText = el("span", "srv-ip");
  ipText.textContent = serverAddress(s);
  ip.appendChild(ipText);
  wrap.append(name, ip, statusNode(s.host));
  host.appendChild(wrap);
}

/* ============================================================
   PARTICIPANTS  — the roster, and who each player is on Discord
   ============================================================
   A player's `discord` field accepts either form, and which one you
   typed is worked out from the shape:

     a numeric snowflake  188342567890123456  -> we can build a real
       ping for it, so the roster offers a copyable mention
     a handle             zactempest          -> shown as @zactempest

   Discord will not tell us the username behind a snowflake without a
   bot token, so an id stays an id here: it is stored, displayed and
   made pingable, but it is never resolved to a name or avatar. Enter a
   handle if you want a readable roster, an id if you want to ping. */
const SNOWFLAKE = /^[0-9]{17,20}$/;

const discordKind = v => {
  const s = String(v || "").trim();
  if (!s) return "";
  return SNOWFLAKE.test(s) ? "id" : "handle";
};
/* what you paste into Discord to ping them */
const discordMention = id => "<@" + id + ">";
/* what the roster shows */
const discordLabel = v => {
  const s = String(v || "").trim();
  return discordKind(s) === "handle" ? "@" + s.replace(/^@/, "") : s;
};

/* ---------- turning an id into a face and a name -----------------------
   Discord will not answer a browser: GET /users/:id needs a bot token and
   refuses cross-origin either way. So a numeric id is resolved through a
   public read-only lookup service instead, with a second one as a
   fallback. Two things follow from that, both deliberate:

     - a participant's Discord id is sent to a third party to be looked
       up. Nothing else about them is, and only ids are ever sent.
     - the services are outside our control, so nothing depends on them.
       Every failure falls back to the default Discord avatar (which is
       derivable from the id alone, no network needed) and the raw id.

   Resolved profiles are cached for a day, since usernames and avatars
   change rarely and this keeps a big roster to one lookup per person. */
const DC_CACHE_KEY = "tsmp_dc_profiles";
const DC_TTL = 24 * 60 * 60 * 1000;
const dcPending = new Map();          // in-flight lookups, so a re-render does not refetch

function dcCache() {
  try { return JSON.parse(localStorage.getItem(DC_CACHE_KEY) || "{}"); } catch (e) { return {}; }
}
function dcCacheGet(id) {
  const hit = dcCache()[id];
  return hit && (Date.now() - hit.at) < DC_TTL ? hit.val : null;
}
function dcCacheSet(id, val) {
  try {
    const all = dcCache();
    all[id] = { at: Date.now(), val };
    localStorage.setItem(DC_CACHE_KEY, JSON.stringify(all));
  } catch (e) {}
}

/* Discord derives the fallback avatar from the id itself, so this works
   with no network and no lookup at all. */
function defaultAvatarUrl(id) {
  let idx = 0;
  try { idx = Number((BigInt(id) >> BigInt(22)) % BigInt(6)); } catch (e) { idx = 0; }
  return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
}

async function fetchDiscordProfile(id) {
  const cached = dcCacheGet(id);
  if (cached) return cached;
  if (dcPending.has(id)) return dcPending.get(id);

  const job = (async () => {
    let out = null;

    try {
      const r = await fetch("https://discord-lookup-api-livid.vercel.app/v1/user/" + encodeURIComponent(id));
      if (r.ok) {
        const d = await r.json();
        // an unknown id still answers 200, just without a username
        if (d && d.username) {
          const av = d.avatar && d.avatar.link
            ? d.avatar.link + (d.avatar.is_animated ? ".gif" : ".png") + "?size=64"
            : defaultAvatarUrl(id);
          out = { username: d.username, display: d.global_name || d.username, avatar: av };
        }
      }
    } catch (e) {}

    if (!out) {
      try {
        const r = await fetch("https://japi.rest/discord/v1/user/" + encodeURIComponent(id));
        if (r.ok) {
          const j = await r.json();
          const d = j && j.data;
          if (d && d.username) {
            out = {
              username: d.username,
              display: d.global_name || d.username,
              avatar: d.avatarURL || d.defaultAvatarURL || defaultAvatarUrl(id),
            };
          }
        }
      } catch (e) {}
    }

    if (!out) out = { unknown: true, avatar: defaultAvatarUrl(id) };
    dcCacheSet(id, out);
    dcPending.delete(id);
    return out;
  })();

  dcPending.set(id, job);
  return job;
}

/* A Minecraft head with the player's Discord avatar as a small circle
   sitting over its top-right corner. The circle appears immediately with
   the id's default avatar, then swaps to the real one once resolved. */
function avatarStack(p, size) {
  const wrap = el("div", "av-stack");
  wrap.style.width = size + "px";
  wrap.style.height = size + "px";
  wrap.appendChild(makeHead(p.name, size, "player-head"));

  if (discordKind(p.discord) !== "id") return wrap;

  const dot = el("img", "av-dc");
  dot.alt = "";
  dot.src = defaultAvatarUrl(p.discord);
  wrap.appendChild(dot);

  fetchDiscordProfile(p.discord).then(prof => {
    if (prof.avatar) dot.src = prof.avatar;
    if (prof.unknown) wrap.classList.add("dc-unknown");
    dot.title = prof.username ? "Discord: " + prof.username : "Discord id " + p.discord;
  });
  return wrap;
}

/* The chip next to a player. A handle shows as typed; a numeric id starts
   as the raw id and becomes the real username once the lookup lands.
   Clicking always copies the most useful thing to paste in Discord. */
function discordBadge(p) {
  const kind = discordKind(p.discord);
  if (!kind) return el("span", "dc-badge empty");

  const chip = el("span", "dc-badge " + kind);
  chip.textContent = discordLabel(p.discord);

  let copyValue = kind === "id" ? discordMention(p.discord) : discordLabel(p.discord);
  chip.title = kind === "id"
    ? "Discord id " + p.discord + " - click to copy a ping"
    : "Discord " + discordLabel(p.discord) + " - click to copy";

  if (kind === "id") {
    chip.classList.add("resolving");
    fetchDiscordProfile(p.discord).then(prof => {
      chip.classList.remove("resolving");
      if (prof.unknown) {
        chip.classList.add("unknown");
        chip.title = "No Discord user found for id " + p.discord + " - click to copy a ping anyway";
        return;
      }
      // the id has a name now, so show it and stop looking like an id
      chip.classList.remove("id");
      chip.classList.add("handle", "resolved");
      chip.textContent = "@" + prof.username;
      chip.title = prof.display && prof.display !== prof.username
        ? prof.display + " (@" + prof.username + ") - click to copy a ping"
        : "@" + prof.username + " - click to copy a ping";
    });
  }

  chip.addEventListener("click", async ev => {
    ev.stopPropagation();
    const ok = await copyText(copyValue);
    const was = chip.textContent;
    chip.textContent = ok ? "Copied" : "Copy failed";
    chip.classList.add("copied");
    setTimeout(() => { chip.textContent = was; chip.classList.remove("copied"); }, 1200);
  });
  return chip;
}

/* one roster row */
function participantRow(p, seed) {
  const row = el("div", "row part-row");

  const n = el("span", "part-seed");
  n.textContent = "#" + seed;

  const head = avatarStack(p, 34);

  const main = el("div", "part-main");
  const name = el("span", "part-name");
  name.textContent = p.name;
  const team = el("span", "part-team");
  team.textContent = p.team || "No team";
  if (!p.team) team.classList.add("none");
  main.append(name, team);

  const dc = el("div", "part-dc");
  dc.appendChild(discordBadge(p));

  const actions = el("div", "part-actions");
  if (isAdmin()) {
    const edit = el("button", "btn btn-ghost btn-sm", "Edit");
    edit.type = "button";
    edit.setAttribute("data-admin", "");
    edit.onclick = () => openPlayerModal(p.id);
    const rm = el("button", "btn btn-ghost btn-sm part-remove", "Remove");
    rm.type = "button";
    rm.setAttribute("data-admin", "");
    rm.onclick = () => {
      const i = state.players.findIndex(x => x.id === p.id);
      if (i < 0) return;
      state.players.splice(i, 1);
      save();
      renderPlayers();
      renderParticipants();
    };
    actions.append(edit, rm);
  }

  row.append(n, head, main, tierBadge(p.tier), dc, actions);
  return row;
}

/* copy every linked participant in one go, ready to paste into Discord */
async function copyRoster() {
  const lines = state.players
    .filter(p => discordKind(p.discord))
    .map(p => {
      const tag = discordKind(p.discord) === "id" ? discordMention(p.discord) : discordLabel(p.discord);
      return p.name + " - " + tag;
    });
  const btn = $("#partCopy");
  if (!lines.length) {
    if (btn) { btn.textContent = "Nobody linked yet"; setTimeout(() => { btn.textContent = "Copy Discord list"; }, 1600); }
    return;
  }
  const ok = await copyText(lines.join("\n"));
  if (btn) {
    btn.textContent = ok ? "Copied " + lines.length : "Copy failed";
    setTimeout(() => { btn.textContent = "Copy Discord list"; }, 1600);
  }
}

function renderParticipants() {
  const list = $("#partList");
  if (!list) return;
  list.innerHTML = "";

  const term = ($("#partSearch") ? $("#partSearch").value : "").trim().toLowerCase();
  const all = state.players;
  const shown = term
    ? all.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.team || "").toLowerCase().includes(term) ||
        (p.discord || "").toLowerCase().includes(term))
    : all;

  const linked = all.filter(p => discordKind(p.discord)).length;

  const countEl = $("#partCount");
  if (countEl) countEl.textContent = all.length;
  const statEl = $("#partStats");
  if (statEl) {
    statEl.textContent = all.length
      ? linked + " of " + all.length + " linked to Discord"
      : "No participants yet.";
  }

  if (!all.length) {
    list.appendChild(el("p", "empty-note", isAdmin()
      ? "No participants yet — add them on the Tournament Maker tab."
      : "No participants yet."));
    return;
  }
  if (!shown.length) {
    list.appendChild(el("p", "empty-note", "Nobody matches that search."));
    return;
  }
  shown.forEach(p => list.appendChild(participantRow(p, all.indexOf(p) + 1)));
}

/* ============================================================
   STAFF  — accounts and role assignment (owner and founder only)
   ============================================================ */


/* ---------- keeping accounts in step with the API -------------------------
   With apiBase set the API owns the account list, so the Staff tab reads from
   it and writes through to it. Promotions, demotions and removals are live
   the moment they are made - there is no secret to re-paste, and nothing can
   drift out of step.

   Every call is best effort. If the API is unreachable the tab keeps working
   against this browser's copy, which is what makes the site usable standalone. */

let acctSyncNote = "";

async function apiAccountFetch(path, options) {
  const base = apiBase();
  if (!base) { acctSyncNote = "no API is configured - see management.js"; return null; }
  const token = apiToken();
  if (!token) { acctSyncNote = "not signed in to the API - log out and back in"; return null; }
  try {
    const r = await fetch(base + path, Object.assign({
      headers: Object.assign(
        { "Content-Type": "application/json", Authorization: "Bearer " + token },
        (options && options.headers) || {}),
    }, options || {}));
    if (!r.ok) {
      acctSyncNote = r.status === 403 ? "the API says your role cannot manage accounts"
        : "the API replied " + r.status;
      return null;
    }
    acctSyncNote = "";
    return await r.json();
  } catch (e) {
    acctSyncNote = "the API is unreachable, showing this browser's copy";
    return null;
  }
}

/** Replace the local list with the API's, keeping any credential we hold. */
async function syncAccountsFromApi() {
  const got = await apiAccountFetch("/api/accounts", { method: "GET" });
  if (!got || !Array.isArray(got.accounts)) return false;
  ACCOUNTS = got.accounts.map(a => {
    const existing = accountByName(a.username);
    const acc = normaliseAccount({
      username: a.username, display: a.display, role: a.role, subs: a.subs, discord: a.discord,
    });
    if (existing) {
      acc.salt = existing.salt;
      acc.hash = existing.hash;
      acc.iterations = existing.iterations;
    }
    return acc;
  });
  saveAccounts();
  return true;
}

/** Upsert one account. Pass the credential only when it actually changed. */
async function pushAccountToApi(acc, withCredential) {
  const body = {
    username: acc.username,
    display: acc.display || acc.username,
    role: acc.role,
    level: roleLevel(acc.role),
    subs: acc.subs || [],
    discord: acc.discord || "",
  };
  if (withCredential) {
    body.salt = acc.salt;
    body.iterations = acc.iterations || PBKDF2_ITER;
    body.hash = acc.hash;
  }
  return await apiAccountFetch("/api/accounts", { method: "POST", body: JSON.stringify(body) });
}

async function deleteAccountOnApi(username) {
  return await apiAccountFetch("/api/accounts/delete", {
    method: "POST", body: JSON.stringify({ username }),
  });
}

function removedNames() {
  try { const l = JSON.parse(localStorage.getItem(LS_REMOVED) || "[]"); return Array.isArray(l) ? l : []; }
  catch (e) { return []; }
}
function markRemoved(username, on) {
  try {
    const set = new Set(removedNames());
    if (on) set.add(username); else set.delete(username);
    localStorage.setItem(LS_REMOVED, JSON.stringify([...set]));
  } catch (e) {}
}

/* staff at the top, highest role first, then player accounts by name */
function sortedAccounts() {
  return ACCOUNTS.slice().sort((a, b) => {
    const d = roleLevel(b.role) - roleLevel(a.role);
    return d !== 0 ? d : a.username.localeCompare(b.username);
  });
}

function accountRow(a) {
  const row = el("div", "row staff-row");
  const me = session.account && session.account.username === a.username;

  row.appendChild(roleGem(a.role));

  const main = el("div", "staff-main");
  const name = el("div", "staff-name");
  name.textContent = a.display || a.username;
  const sub = el("div", "staff-sub");
  sub.textContent = "@" + a.username + (a.seeded ? " - ships in staff.js" : "");
  const tags = el("div", "staff-tags");
  tags.appendChild(subBadges(a));
  if (discordKind(a.discord)) tags.appendChild(discordBadge(a));
  main.append(name, sub, tags);
  row.appendChild(main);

  row.appendChild(roleBadge(a.role));

  // role assignment
  const pick = el("select", "input select staff-role");
  ROLES.slice().sort((x, y) => x.level - y.level).forEach(r => {
    const o = el("option");
    o.value = r.id;
    o.textContent = r.name;
    pick.appendChild(o);
  });
  pick.value = a.role;
  if (me) {
    pick.disabled = true;
    pick.title = "You cannot change your own role - it would lock you out of this page.";
  }
  pick.onchange = async () => {
    a.role = pick.value;
    if (!ACCOUNTS.includes(a)) ACCOUNTS.push(a);
    saveAccounts();
    await pushAccountToApi(a, false);
    renderStaff();
  };
  row.appendChild(pick);

  const actions = el("div", "staff-actions");
  const duties = el("button", "btn btn-ghost btn-sm", "Sub-roles");
  duties.type = "button";
  duties.onclick = () => openSubRolesModal(a);
  actions.appendChild(duties);

  const dc = el("button", "btn btn-ghost btn-sm", a.discord ? "Discord" : "Link Discord");
  dc.type = "button";
  dc.onclick = () => openStaffDiscordModal(a);
  actions.appendChild(dc);

  const pw = el("button", "btn btn-ghost btn-sm", "Set password");
  pw.type = "button";
  pw.onclick = () => openPasswordModal(a);
  actions.appendChild(pw);

  const rm = el("button", "btn btn-ghost btn-sm part-remove", "Remove");
  rm.type = "button";
  if (me) {
    rm.disabled = true;
    rm.title = "You cannot remove your own account.";
  } else {
    rm.onclick = () => removeAccount(a);
  }
  actions.appendChild(rm);
  row.appendChild(actions);

  return row;
}

function renderStaff() {
  const list = $("#staffList");
  if (!list) return;
  list.innerHTML = "";
  if (!can("staff.manage")) {
    list.appendChild(el("p", "empty-note", "Only an owner or founder can manage accounts."));
    return;
  }
  const all = sortedAccounts();
  const staffCount = all.filter(a => roleLevel(a.role) >= 1).length;
  const stat = $("#staffStats");
  if (stat) stat.textContent = staffCount + " staff, " + (all.length - staffCount) + " player accounts";
  if (!all.length) {
    list.appendChild(el("p", "empty-note", "No accounts yet."));
    return;
  }

  // Grouped by rank rather than run together. A flat list of everybody makes
  // you read each row to work out where somebody sits; a heading per rank shows
  // the shape of the team before you read a single name.
  ROLES.slice().sort((a, b) => b.level - a.level).forEach(role => {
    const inRole = all.filter(a => a.role === role.id);
    if (!inRole.length) return;

    const head = el("div", "staff-group");
    const badge = roleBadge(role.id);
    badge.classList.add("staff-group-badge");
    const n = el("span", "staff-group-n");
    n.textContent = inRole.length;
    head.append(badge, n);
    list.appendChild(head);

    inRole.forEach(a => list.appendChild(accountRow(a)));
  });
}

/* ---------- create a staff account ---------- */
function openStaffModal() {
  const wrap = el("div", "auth-modal");
  wrap.appendChild(el("div", "modal-title", "Add a staff account"));
  wrap.appendChild(el("div", "modal-sub", "They log in with this username and password. Give them the password yourself - it is not recoverable from here."));

  const form = el("form", "auth-form");
  const user = el("input", "input");
  user.type = "text"; user.placeholder = "Username"; user.maxLength = 20;
  const disp = el("input", "input");
  disp.type = "text"; disp.placeholder = "Display name (optional)"; disp.maxLength = 24;
  const pick = el("select", "input select");
  staffRoles().forEach(r => {
    const o = el("option"); o.value = r.id; o.textContent = r.name;
    pick.appendChild(o);
  });
  pick.value = "staff";
  const pass = el("input", "input");
  pass.type = "text"; pass.placeholder = "Password (8 characters or more)";
  const go = el("button", "btn btn-primary btn-lg", "Create account");
  go.type = "submit";
  form.append(user, disp, pick, pass, go);
  wrap.appendChild(form);

  const err = el("p", "hint");
  wrap.appendChild(err);

  form.onsubmit = async e => {
    e.preventDefault();
    err.classList.remove("error");
    const u = user.value.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,20}$/.test(u)) {
      err.textContent = "Usernames are 3 to 20 characters: letters, numbers, dot, dash or underscore.";
      err.classList.add("error"); return;
    }
    if (accountByName(u)) { err.textContent = "That username is taken."; err.classList.add("error"); return; }
    if (pass.value.length < 8) { err.textContent = "Use at least 8 characters."; err.classList.add("error"); return; }
    go.disabled = true;
    err.textContent = "Creating...";
    const cred = await makeCredential(pass.value);
    const made = normaliseAccount(Object.assign(
      { username: u, display: disp.value.trim() || u, role: pick.value, createdAt: Date.now() }, cred));
    ACCOUNTS.push(made);
    markRemoved(u, false);
    saveAccounts();
    await pushAccountToApi(made, true);
    renderStaff();
    closeModal();
  };

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  actions.appendChild(cancel);
  wrap.appendChild(actions);
  openModal(wrap);
  user.focus();
}

/* ---------- set someone's password ---------- */
function openPasswordModal(a) {
  const wrap = el("div", "auth-modal");
  wrap.appendChild(el("div", "modal-title", "Set a password"));
  const sub = el("div", "modal-sub");
  sub.textContent = "For @" + a.username + ". Their old password stops working immediately.";
  wrap.appendChild(sub);

  const form = el("form", "auth-form");
  const pass = el("input", "input");
  pass.type = "text"; pass.placeholder = "New password (8 characters or more)";
  const go = el("button", "btn btn-primary btn-lg", "Set password");
  go.type = "submit";
  form.append(pass, go);
  wrap.appendChild(form);

  const err = el("p", "hint");
  wrap.appendChild(err);

  form.onsubmit = async e => {
    e.preventDefault();
    if (pass.value.length < 8) { err.textContent = "Use at least 8 characters."; err.classList.add("error"); return; }
    go.disabled = true;
    err.textContent = "Working...";
    const cred = await makeCredential(pass.value);
    Object.assign(a, cred);
    if (!ACCOUNTS.includes(a)) ACCOUNTS.push(a);
    saveAccounts();
    await pushAccountToApi(a, true);
    renderStaff();
    closeModal();
  };

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  actions.appendChild(cancel);
  wrap.appendChild(actions);
  openModal(wrap);
  pass.focus();
}

/* Owner-and-up can attach a Discord to any staff account. Same field the
   participants list uses - an id or a handle - so one person's Discord looks
   the same wherever the site shows it. The id form is worth preferring: it
   survives a rename, and it resolves to a live username and avatar. */
function openStaffDiscordModal(a) {
  const wrap = el("div", "auth-modal");
  wrap.appendChild(el("div", "modal-title", "Discord for this account"));
  const sub = el("div", "modal-sub");
  sub.textContent = "For @" + a.username + ". A user id or a handle - an id also pulls in their avatar.";
  wrap.appendChild(sub);

  const form = el("form", "auth-form");
  const input = el("input", "input");
  input.type = "text";
  input.placeholder = "123456789012345678 or @handle";
  input.value = a.discord || "";
  const go = el("button", "btn btn-primary btn-lg", "Save");
  go.type = "submit";
  form.append(input, go);
  wrap.appendChild(form);

  const preview = el("div", "dc-preview");
  wrap.appendChild(preview);
  const paint = () => {
    preview.innerHTML = "";
    const v = input.value.trim();
    if (!discordKind(v)) {
      preview.appendChild(el("p", "hint", v ? "That is not an id or a handle." : "Leave it empty to unlink."));
      return;
    }
    preview.appendChild(discordBadge({ discord: v }));
  };
  input.addEventListener("input", paint);
  paint();

  form.onsubmit = async e => {
    e.preventDefault();
    a.discord = input.value.trim();
    if (!ACCOUNTS.includes(a)) ACCOUNTS.push(a);
    saveAccounts();
    go.disabled = true;
    await pushAccountToApi(a, false);
    renderStaff();
    closeModal();
  };

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  actions.appendChild(cancel);
  wrap.appendChild(actions);
  openModal(wrap);
  input.focus();
}

function removeAccount(a) {
  const wrap = el("div");
  wrap.appendChild(el("div", "modal-title", "Remove this account?"));
  const sub = el("div", "modal-sub");
  sub.textContent = (a.display || a.username) + " (@" + a.username + ") will no longer be able to log in.";
  wrap.appendChild(sub);
  if (a.seeded) {
    wrap.appendChild(el("p", "hint",
      "This one ships in staff.js. Removing it here holds on this device, but take it out of that file too before your next deploy."));
  }
  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Keep it");
  cancel.type = "button";
  cancel.onclick = closeModal;
  const go = el("button", "btn btn-primary", "Remove");
  go.type = "button";
  go.onclick = async () => {
    const i = ACCOUNTS.indexOf(a);
    if (i >= 0) ACCOUNTS.splice(i, 1);
    markRemoved(a.username, true);
    saveAccounts();
    await deleteAccountOnApi(a.username);
    renderStaff();
    closeModal();
  };
  actions.append(cancel, go);
  wrap.appendChild(actions);
  openModal(wrap);
}

/* ---------- export back into staff.js ----------
   Accounts made in the app only exist in this browser. This produces the
   block to paste into staff.js so they work on every device. */
function staffFileText() {
  const staff = sortedAccounts().filter(a => roleLevel(a.role) >= 1);
  const esc2 = s => String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const body = staff.map(a => [
    "  {",
    '    username: "' + esc2(a.username) + '",',
    '    display: "' + esc2(a.display) + '",',
    '    role: "' + esc2(a.role) + '",',
    '    salt: "' + esc2(a.salt) + '",',
    "    iterations: " + (a.iterations || PBKDF2_ITER) + ",",
    '    hash: "' + esc2(a.hash) + '",',
    '    subs: [' + (a.subs || []).map(s => '"' + esc2(s) + '"').join(", ") + '],',
    "  },",
  ].join("\n")).join("\n");
  return "window.TEMPEST_STAFF = [\n" + body + "\n];";
}

async function copyStaffFile() {
  const btn = $("#staffExport");
  const ok = await copyText(staffFileText());
  if (btn) {
    const was = btn.textContent;
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => { btn.textContent = was; }, 1600);
  }
}

/* The same accounts in the shape the relay API wants for its STAFF_JSON
   secret. Level is baked in so the API never needs its own copy of the role
   ladder, and the password hashes are the ones already in use - the API
   verifies against them with the identical PBKDF2 derivation. */
function serverStaffJson() {
  const staff = sortedAccounts()
    .filter(a => roleLevel(a.role) >= 1)
    .map(a => ({
      username: a.username,
      role: a.role,
      level: roleLevel(a.role),
      salt: a.salt,
      iterations: a.iterations || PBKDF2_ITER,
      hash: a.hash,
    }));
  return JSON.stringify(staff);
}

async function copyServerStaff() {
  const btn = $("#staffServerExport");
  const ok = await copyText(serverStaffJson());
  if (btn) {
    const was = btn.textContent;
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => { btn.textContent = was; }, 1600);
  }
}

/* ============================================================
   ROLE COLOURS  — pick each role's two gradient stops
   ============================================================
   The gradient always runs left to right, so a role is just two hexes.
   Picking here writes to this browser; "Copy roles" gives you the block
   to paste into staff.js when you want it on every device. */

function isDefaultColor(r) {
  const d = roleDefault(r.id);
  return !!d && d.from === r.from && d.to === r.to;
}

function roleEditorRow(r) {
  const row = el("div", "row role-row");

  const gem = roleGem(r.id);
  const name = el("span", "role-badge");
  name.textContent = r.name;
  const bar = el("span", "role-bar");
  const lvl = el("span", "role-level");
  // ranks show their rung, sub-roles show which family they belong to
  lvl.textContent = typeof r.level === "number"
    ? "Level " + r.level
    : ((SUBROLE_GROUPS.find(g => g.id === r.group) || {}).name || "Sub-role");

  /* repaint just this row while the picker is open, so dragging a colour
     shows up immediately without re-rendering the whole page */
  const paint = () => {
    [gem, name, bar].forEach(n => {
      n.style.setProperty("--rf", r.from);
      n.style.setProperty("--rt", r.to);
    });
    reset.disabled = isDefaultColor(r);
  };

  const mkColor = which => {
    const wrap = el("label", "role-stop");
    const inp = el("input");
    inp.type = "color";
    inp.value = r[which];
    inp.title = which === "from" ? "Left-hand colour" : "Right-hand colour";
    inp.addEventListener("input", () => { r[which] = inp.value; paint(); });
    inp.addEventListener("change", () => {
      r[which] = inp.value;
      saveRoleColors();
      applyRole();          // the nav chip follows straight away
      renderStaff();         // and the badges in the accounts list
      paint();
    });
    wrap.appendChild(inp);
    return wrap;
  };
  const fromIn = mkColor("from");
  const toIn = mkColor("to");

  const swap = el("button", "btn btn-ghost btn-sm", "Swap");
  swap.type = "button";
  swap.title = "Flip which end each colour is on";
  swap.onclick = () => {
    const a = r.from; r.from = r.to; r.to = a;
    fromIn.querySelector("input").value = r.from;
    toIn.querySelector("input").value = r.to;
    saveRoleColors();
    applyRole();
    renderStaff();
    paint();
  };

  const reset = el("button", "btn btn-ghost btn-sm", "Reset");
  reset.type = "button";
  reset.title = "Back to the colours in staff.js";
  reset.onclick = () => {
    const d = roleDefault(r.id);
    if (!d) return;
    r.from = d.from; r.to = d.to;
    fromIn.querySelector("input").value = r.from;
    toIn.querySelector("input").value = r.to;
    saveRoleColors();
    applyRole();
    renderStaff();
    paint();
  };

  const stops = el("div", "role-stops");
  stops.append(fromIn, toIn, swap, reset);

  row.append(gem, name, lvl, bar, stops);
  paint();
  return row;
}

function renderRoleEditor() {
  const host = $("#roleEditor");
  if (!host) return;
  host.innerHTML = "";
  if (!can("staff.manage")) return;
  // highest status first, matching the accounts list above it
  ROLES.slice().sort((a, b) => b.level - a.level).forEach(r => host.appendChild(roleEditorRow(r)));
  // sub-roles are coloured the same way, so they belong in the same editor
  if (SUBROLES.length) {
    const head = el("div", "role-editor-head");
    head.textContent = "Sub-roles";
    host.appendChild(head);
    SUBROLES.forEach(s => host.appendChild(roleEditorRow(s)));
  }
}

function resetAllRoleColors() {
  ROLE_DEFAULTS.forEach(d => {
    const r = roleById(d.id);
    if (r) { r.from = d.from; r.to = d.to; }
  });
  saveRoleColors();
  applyRole();
  renderStaff();
  renderRoleEditor();
}

/* the block to paste back into staff.js */
function roleFileText() {
  const rows = ROLES.slice().sort((a, b) => a.level - b.level).map(r =>
    '  { id: "' + r.id + '", name: "' + r.name + '", level: ' + r.level +
    ', from: "' + r.from + '", to: "' + r.to + '" },');
  return "window.TEMPEST_ROLES = [\n" + rows.join("\n") + "\n];";
}

async function copyRoleFile() {
  const btn = $("#roleExport");
  const ok = await copyText(roleFileText());
  if (btn) {
    const was = btn.textContent;
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => { btn.textContent = was; }, 1600);
  }
}

/* ============================================================
   SUB-ROLES  — event and tournament duties, on top of the rank
   ============================================================ */

/* the little chips shown wherever a person appears */
function subBadges(acc, opts) {
  const wrap = el("div", "sub-badges");
  const subs = subsOf(acc);
  if (!subs.length) {
    if (opts && opts.emptyText) {
      const none = el("span", "sub-none");
      none.textContent = opts.emptyText;
      wrap.appendChild(none);
    }
    return wrap;
  }
  subs.forEach(s => {
    const chip = el("span", "sub-badge");
    chip.textContent = s.name;
    chip.title = s.desc || s.name;
    chip.style.setProperty("--rf", s.from);
    chip.style.setProperty("--rt", s.to);
    wrap.appendChild(chip);
  });
  return wrap;
}

/* assign duties to one account, grouped exactly as staff.js groups them */
function openSubRolesModal(a) {
  const wrap = el("div", "auth-modal sub-modal");
  wrap.appendChild(el("div", "modal-title", "Sub-roles"));
  const sub = el("div", "modal-sub");
  sub.textContent = "What " + (a.display || a.username) + " does at events, on top of their rank.";
  wrap.appendChild(sub);

  const boxes = [];
  SUBROLE_GROUPS.forEach(g => {
    const mine = SUBROLES.filter(s => s.group === g.id);
    if (!mine.length) return;
    const sec = el("div", "sub-group");
    const head = el("div", "sub-group-head");
    head.appendChild(el("span", "sub-group-name", "")).textContent = g.name;
    if (g.blurb) head.appendChild(el("span", "sub-group-blurb", "")).textContent = g.blurb;
    sec.appendChild(head);

    mine.forEach(s => {
      const opt = el("label", "sub-opt");
      const cb = el("input");
      cb.type = "checkbox";
      cb.value = s.id;
      cb.checked = (a.subs || []).includes(s.id);
      boxes.push(cb);

      const body = el("div", "sub-opt-body");
      const name = el("span", "sub-badge sub-badge-lg");
      name.textContent = s.name;
      name.style.setProperty("--rf", s.from);
      name.style.setProperty("--rt", s.to);
      const desc = el("span", "sub-opt-desc");
      desc.textContent = s.desc || "";
      body.append(name, desc);

      opt.append(cb, body);
      sec.appendChild(opt);
    });
    wrap.appendChild(sec);
  });

  if (!boxes.length) wrap.appendChild(el("p", "empty-note", "No sub-roles are defined in staff.js."));

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  const save = el("button", "btn btn-primary", "Save sub-roles");
  save.type = "button";
  save.onclick = async () => {
    a.subs = boxes.filter(b => b.checked).map(b => b.value);
    if (!ACCOUNTS.includes(a)) ACCOUNTS.push(a);
    saveAccounts();
    await pushAccountToApi(a, false);
    // your own duties can change what you can reach, so refresh the chrome
    if (session.account && session.account.username === a.username) {
      session.account = a;
      applyRole();
    }
    renderStaff();
    closeModal();
  };
  actions.append(cancel, save);
  wrap.appendChild(actions);

  openModal(wrap);
}

/* ============================================================
   EVENTS  — events and tournaments, kept as separate things
   ============================================================
   Kept in this browser, like servers and accounts. Anyone can read the
   list; hosting splits by kind, since an Event Host runs events and a
   Tournament Overseer runs tournaments. See hostCapFor below. */
let EVENTS = [];

const EVENT_KINDS = [
  { id: "event", name: "Event" },
  { id: "tournament", name: "Tournament" },
];
const EVENT_STATUSES = [
  { id: "upcoming", name: "Upcoming" },
  { id: "live", name: "Live now" },
  { id: "done", name: "Finished" },
];

function normaliseEvent(e) {
  return {
    id: e.id || "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(e.name || "").slice(0, 80),
    kind: EVENT_KINDS.some(k => k.id === e.kind) ? e.kind : "event",
    start: e.start || "",
    serverId: e.serverId || "",
    desc: String(e.desc || "").slice(0, 400),
    host: e.host || "",
    staff: Array.isArray(e.staff) ? e.staff : [],
    status: EVENT_STATUSES.some(s => s.id === e.status) ? e.status : "upcoming",
  };
}
function loadEvents() {
  try {
    const raw = localStorage.getItem(LS_EVENTS);
    const list = raw ? JSON.parse(raw) : [];
    EVENTS = Array.isArray(list) ? list.map(normaliseEvent) : [];
  } catch (e) { EVENTS = []; }
}
function saveEvents() {
  try { localStorage.setItem(LS_EVENTS, JSON.stringify(EVENTS)); } catch (e) {}
}
const eventById = id => EVENTS.find(e => e.id === id) || null;
loadEvents();

/* soonest first, but anything finished drops to the bottom */
function sortedEvents() {
  const rank = e => e.status === "live" ? 0 : e.status === "upcoming" ? 1 : 2;
  return EVENTS.slice().sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    const at = a.start ? Date.parse(a.start) : Infinity;
    const bt = b.start ? Date.parse(b.start) : Infinity;
    return (isNaN(at) ? Infinity : at) - (isNaN(bt) ? Infinity : bt);
  });
}

function eventWhen(e) {
  if (!e.start) return "Date to be announced";
  const t = Date.parse(e.start);
  if (isNaN(t)) return "Date to be announced";
  const d = new Date(t);
  const when = d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
  const days = Math.round((t - Date.now()) / 86400000);
  if (e.status === "done") return when;
  if (days === 0) return when + " - today";
  if (days === 1) return when + " - tomorrow";
  if (days > 1) return when + " - in " + days + " days";
  return when;
}

/* Events and tournaments are separate things with separate people:
   an Event Host runs events, a Tournament Overseer runs tournaments.
   Everything below routes through the right capability for the kind. */
const hostCapFor = kind => kind === "tournament" ? "tournaments.host" : "events.host";
const assistCapFor = kind => kind === "tournament" ? "tournaments.assist" : "events.assist";
const canHostKind = kind => can(hostCapFor(kind));
const canHostAny = () => EVENT_KINDS.some(k => canHostKind(k.id));

/* the same rules as can(), asked about somebody else rather than yourself */
function accountCan(a, cap) {
  if (!a) return false;
  const lvl = roleLevel(a.role);
  if (lvl >= FULL_CONTROL_LEVEL) return true;
  const need = CAPS[cap];
  if (typeof need === "number" && lvl >= need) return true;
  return subsOf(a).some(s => (SUBROLE_CAPS[s.id] || []).includes(cap));
}
const canHostAccounts = kind => ACCOUNTS.filter(a => accountCan(a, hostCapFor(kind)));
const canWorkAccounts = kind => ACCOUNTS.filter(a => accountCan(a, assistCapFor(kind)));

function personChip(username) {
  const acc = accountByName(username);
  const chip = el("span", "person-chip");
  if (!acc) { chip.classList.add("unknown"); chip.textContent = username || "Unassigned"; return chip; }
  chip.appendChild(roleGem(acc.role));
  const n = el("span");
  n.textContent = acc.display || acc.username;
  chip.appendChild(n);
  chip.title = "@" + acc.username;
  return chip;
}

function eventRow(e) {
  const row = el("div", "row event-row");

  const kind = el("span", "event-kind " + e.kind);
  kind.textContent = e.kind === "tournament" ? "Tournament" : "Event";

  const main = el("div", "event-main");
  const name = el("div", "event-name");
  name.textContent = e.name || "Untitled event";
  const when = el("div", "event-when");
  when.textContent = eventWhen(e);
  main.append(name, when);
  if (e.desc) {
    const d = el("div", "event-desc");
    d.textContent = e.desc;
    main.appendChild(d);
  }

  const people = el("div", "event-people");
  const hostWrap = el("div", "event-host");
  hostWrap.appendChild(el("span", "event-label", "")).textContent = "Host";
  hostWrap.appendChild(personChip(e.host));
  people.appendChild(hostWrap);
  if (e.staff.length) {
    const sw = el("div", "event-staff");
    sw.appendChild(el("span", "event-label", "")).textContent = "Working it";
    const list = el("div", "event-staff-list");
    e.staff.forEach(u => list.appendChild(personChip(u)));
    sw.appendChild(list);
    people.appendChild(sw);
  }

  const where = el("div", "event-where");
  const srv = serverById(e.serverId);
  if (srv) {
    const pill = el("span", "pill");
    pill.textContent = srv.name;
    const ip = el("span", "pill");
    const ipt = el("span", "srv-ip");
    ipt.textContent = serverAddress(srv);
    ip.appendChild(ipt);
    where.append(pill, ip);
  }

  const status = el("span", "event-status " + e.status);
  status.textContent = (EVENT_STATUSES.find(s => s.id === e.status) || {}).name || e.status;

  const actions = el("div", "event-actions");
  if (canHostKind(e.kind)) {
    const edit = el("button", "btn btn-ghost btn-sm", "Edit");
    edit.type = "button";
    edit.onclick = () => openEventModal(e.id);
    const rm = el("button", "btn btn-ghost btn-sm part-remove", "Remove");
    rm.type = "button";
    rm.onclick = () => removeEvent(e.id);
    actions.append(edit, rm);
  }

  row.append(kind, main, where, people, status, actions);
  return row;
}

function renderEvents() {
  const list = $("#eventList");
  if (!list) return;
  list.innerHTML = "";

  const all = sortedEvents();
  const stat = $("#eventStats");
  if (stat) {
    const live = all.filter(e => e.status === "live").length;
    const soon = all.filter(e => e.status === "upcoming").length;
    stat.textContent = all.length
      ? soon + " upcoming, " + live + " live now"
      : "Nothing scheduled yet.";
  }
  if (!all.length) {
    list.appendChild(el("p", "empty-note", canHostAny()
      ? "No events yet. Hit Add an event to put one on the calendar."
      : "No events scheduled yet. Check back soon."));
    return;
  }
  all.forEach(e => list.appendChild(eventRow(e)));
}

/* ---------- create / edit ---------- */
function openEventModal(eventId) {
  const existing = eventById(eventId);
  const wrap = el("div", "auth-modal event-modal");
  wrap.appendChild(el("div", "modal-title", existing ? "Edit event" : "Add an event"));
  wrap.appendChild(el("div", "modal-sub", "Events and tournaments share the calendar, but they are separate things with separate people."));

  const mk = (label, node, hint) => {
    const f = el("label", "field");
    f.appendChild(el("span", "field-label", label));
    f.appendChild(node);
    if (hint) f.appendChild(el("span", "hint", hint));
    return f;
  };

  const nameIn = el("input", "input");
  nameIn.type = "text"; nameIn.maxLength = 80;
  nameIn.placeholder = "Summer Showdown";
  nameIn.value = existing ? existing.name : "";

  const kindIn = el("select", "input select");
  // only offer kinds you are actually allowed to run
  EVENT_KINDS.filter(k => canHostKind(k.id) || (existing && existing.kind === k.id))
    .forEach(k => { const o = el("option"); o.value = k.id; o.textContent = k.name; kindIn.appendChild(o); });
  kindIn.value = existing ? existing.kind
    : (kindIn.options[0] ? kindIn.options[0].value : "event");

  const startIn = el("input", "input");
  startIn.type = "datetime-local";
  startIn.value = existing ? existing.start : "";

  const statusIn = el("select", "input select");
  EVENT_STATUSES.forEach(s => { const o = el("option"); o.value = s.id; o.textContent = s.name; statusIn.appendChild(o); });
  statusIn.value = existing ? existing.status : "upcoming";

  const serverIn = el("select", "input select");
  const none = el("option"); none.value = ""; none.textContent = "No server set";
  serverIn.appendChild(none);
  SERVERS.forEach(s => {
    const o = el("option"); o.value = s.id; o.textContent = s.name + " - " + serverAddress(s);
    serverIn.appendChild(o);
  });
  serverIn.value = existing ? existing.serverId : (state.serverId || "");

  const hostIn = el("select", "input select");

  const descIn = el("textarea", "input");
  descIn.rows = 3; descIn.maxLength = 400;
  descIn.placeholder = "What it is, how to join, anything people need to know.";
  descIn.value = existing ? existing.desc : "";

  const staffWrap = el("div", "event-staff-pick");
  let staffBoxes = [];

  /* Who may host it and who may work it both depend on the kind - events
     and tournaments have separate people - so both lists rebuild when the
     kind changes, keeping whatever is still a valid choice. */
  function rebuildPeople(keepCurrent) {
    const kind = kindIn.value;
    const wantHost = keepCurrent ? hostIn.value
      : (existing ? existing.host : (session.account ? session.account.username : ""));
    const wantStaff = keepCurrent ? staffBoxes.filter(b => b.checked).map(b => b.value)
      : (existing ? existing.staff.slice() : []);

    hostIn.innerHTML = "";
    const hnone = el("option"); hnone.value = ""; hnone.textContent = "Nobody yet";
    hostIn.appendChild(hnone);
    canHostAccounts(kind).forEach(a => {
      const o = el("option");
      o.value = a.username;
      o.textContent = (a.display || a.username) + " - " + ((roleById(a.role) || {}).name || "");
      hostIn.appendChild(o);
    });
    hostIn.value = [...hostIn.options].some(o => o.value === wantHost) ? wantHost : "";

    staffWrap.innerHTML = "";
    staffBoxes = [];
    const workers = canWorkAccounts(kind);
    workers.forEach(a => {
      const opt = el("label", "event-staff-opt");
      const cb = el("input");
      cb.type = "checkbox";
      cb.value = a.username;
      cb.checked = wantStaff.includes(a.username);
      staffBoxes.push(cb);

      const body = el("span", "event-staff-body");
      body.appendChild(roleGem(a.role));
      const n = el("span");
      n.textContent = a.display || a.username;
      body.appendChild(n);
      const subs = subsOf(a);
      if (subs.length) {
        const s = el("span", "event-staff-subs");
        s.textContent = subs.map(x => x.name).join(", ");
        body.appendChild(s);
      }
      opt.append(cb, body);
      staffWrap.appendChild(opt);
    });
    if (!workers.length) {
      staffWrap.appendChild(el("p", "hint", kind === "tournament"
        ? "Nobody holds a tournament sub-role yet. Assign Tournament Mod or Tournament Staff on the Staff tab."
        : "Nobody holds an event sub-role yet. Assign Event Mod or Event Staff on the Staff tab."));
    }
  }
  kindIn.addEventListener("change", () => rebuildPeople(true));
  rebuildPeople(false);

  wrap.append(
    mk("Event name", nameIn),
    mk("Kind", kindIn),
    mk("Starts", startIn, "Shown in each visitor's own timezone."),
    mk("Status", statusIn),
    mk("Server", serverIn),
    mk("Host", hostIn, "Anyone who can host: Manager and up, Event Host, or Tournament Overseer."),
    mk("Details", descIn),
    mk("Working it", staffWrap)
  );

  const err = el("p", "hint");
  wrap.appendChild(err);

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  const ok = el("button", "btn btn-primary", existing ? "Save event" : "Add event");
  ok.type = "button";
  ok.onclick = () => {
    if (nameIn.value.trim().length < 2) {
      err.textContent = "Give the event a name."; err.classList.add("error"); return;
    }
    const rec = normaliseEvent({
      id: existing ? existing.id : undefined,
      name: nameIn.value.trim(),
      kind: kindIn.value,
      start: startIn.value,
      serverId: serverIn.value,
      desc: descIn.value.trim(),
      host: hostIn.value,
      staff: staffBoxes.filter(b => b.checked).map(b => b.value),
      status: statusIn.value,
    });
    if (existing) Object.assign(existing, rec);
    else EVENTS.push(rec);
    saveEvents();
    renderEvents();
    closeModal();
  };
  actions.append(cancel, ok);
  wrap.appendChild(actions);
  openModal(wrap);
  nameIn.focus();
}

function removeEvent(id) {
  const e = eventById(id);
  if (!e) return;
  const wrap = el("div");
  wrap.appendChild(el("div", "modal-title", "Remove this event?"));
  const sub = el("div", "modal-sub");
  sub.textContent = (e.name || "This event") + " will be taken off the calendar on this device.";
  wrap.appendChild(sub);
  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Keep it");
  cancel.type = "button";
  cancel.onclick = closeModal;
  const go = el("button", "btn btn-primary", "Remove");
  go.type = "button";
  go.onclick = () => {
    const i = EVENTS.findIndex(x => x.id === id);
    if (i >= 0) EVENTS.splice(i, 1);
    saveEvents();
    renderEvents();
    closeModal();
  };
  actions.append(cancel, go);
  wrap.appendChild(actions);
  openModal(wrap);
}

/* ============================================================
   PROFILE  — your own account
   ============================================================ */
const CAP_LABELS = {
  "participants.manage": "Manage the participant roster",
  "tournament.score":    "Record match results",
  "broadcast":           "Next Match and Schedule boards",
  "tournament.create":   "Build and generate tournaments",
  "tournament.share":    "Share and live links",
  "servers.manage":      "Add and edit servers",
  "tournament.reset":    "Reset the tournament",
  "staff.manage":        "Manage accounts and roles",
  "events.host":         "Create and run events",
  "events.assist":       "Be assigned to work events",
  "tournaments.host":    "Create and run tournaments",
  "tournaments.assist":  "Be assigned to work tournaments",
  "staff.dashboard":     "See the staff dashboard",
  "cases.resolve":       "Claim and rule on flag cases",
  "management.perspective": "Open Perspective replays",
  "management.anticheat":   "Open the AntiCheat flag list",
};

function renderProfile() {
  const host = $("#profileBody");
  if (!host) return;
  host.innerHTML = "";

  if (!session.account) {
    const empty = el("div", "profile-empty");
    empty.appendChild(el("p", "empty-note", "You are not signed in."));
    const row = el("div", "home-cta");
    const login = el("button", "btn btn-primary btn-lg", "Log in");
    login.type = "button";
    login.onclick = openLoginModal;
    const signup = el("button", "btn btn-ghost btn-lg", "Sign up");
    signup.type = "button";
    signup.onclick = openSignupModal;
    row.append(login, signup);
    empty.appendChild(row);
    host.appendChild(empty);
    return;
  }

  const a = session.account;
  const r = roleById(a.role);

  /* ---- who you are ---- */
  const card = el("div", "profile-card");
  const head = makeHead(a.display || a.username, 84, "player-head");
  card.appendChild(head);

  const idBlock = el("div", "profile-id");
  const dn = el("h2", "profile-name");
  dn.textContent = a.display || a.username;
  const handle = el("div", "profile-handle");
  handle.textContent = "@" + a.username;
  const badges = el("div", "profile-badges");
  badges.append(roleGem(a.role), roleBadge(a.role));
  if (a.seeded) {
    const s = el("span", "pill");
    s.textContent = "Ships in staff.js";
    badges.appendChild(s);
  }
  idBlock.append(dn, handle, badges);
  card.appendChild(idBlock);

  const acts = el("div", "profile-actions");
  const rename = el("button", "btn btn-ghost btn-sm", "Change display name");
  rename.type = "button";
  rename.onclick = openRenameModal;
  const pw = el("button", "btn btn-ghost btn-sm", "Change password");
  pw.type = "button";
  pw.onclick = openMyPasswordModal;
  const out = el("button", "btn btn-ghost btn-sm", "Log out");
  out.type = "button";
  out.onclick = signOut;
  acts.append(rename, pw, out);
  card.appendChild(acts);

  host.appendChild(card);

  /* ---- what you do at events ---- */
  const subs = subsOf(a);
  const dutiesWrap = el("div", "profile-section");
  dutiesWrap.appendChild(el("span", "section-eyebrow", "")).textContent = "At events";
  dutiesWrap.appendChild(el("h3", "section-h2", "")).textContent = "Sub-roles";
  if (!subs.length) {
    dutiesWrap.appendChild(el("p", "hint", isStaff()
      ? "No sub-roles yet. An owner assigns these on the Staff tab."
      : "Sub-roles are for staff working events."));
  } else {
    const list = el("div", "profile-subs");
    subs.forEach(s => {
      const item = el("div", "row profile-sub");
      const chip = el("span", "sub-badge sub-badge-lg");
      chip.textContent = s.name;
      chip.style.setProperty("--rf", s.from);
      chip.style.setProperty("--rt", s.to);
      const d = el("span", "profile-sub-desc");
      d.textContent = s.desc || "";
      item.append(chip, d);
      list.appendChild(item);
    });
    dutiesWrap.appendChild(list);
  }
  host.appendChild(dutiesWrap);

  /* ---- what the app lets you do ---- */
  const capsWrap = el("div", "profile-section");
  capsWrap.appendChild(el("span", "section-eyebrow", "")).textContent = "Permissions";
  capsWrap.appendChild(el("h3", "section-h2", "")).textContent = "What you can do";
  const grid = el("div", "profile-caps");
  // the sub-role-only capabilities are not in CAPS, so union them in
  const subCaps = Object.values(SUBROLE_CAPS).reduce((a, b) => a.concat(b), []);
  const allCaps = [...new Set(Object.keys(CAPS).concat(subCaps))];
  allCaps.forEach(c => {
    const item = el("div", "profile-cap" + (can(c) ? " on" : ""));
    const mark = el("span", "profile-cap-mark");
    mark.textContent = can(c) ? "Yes" : "No";
    const label = el("span");
    label.textContent = CAP_LABELS[c] || c;
    item.append(mark, label);
    grid.appendChild(item);
  });
  capsWrap.appendChild(grid);
  if (r && r.level >= FULL_CONTROL_LEVEL) {
    capsWrap.appendChild(el("p", "hint", r.name + " bypasses every permission check."));
  }
  host.appendChild(capsWrap);

  /* ---- events you are on ---- */
  const mine = EVENTS.filter(e => e.host === a.username || (e.staff || []).includes(a.username));
  if (mine.length) {
    const evWrap = el("div", "profile-section");
    evWrap.appendChild(el("span", "section-eyebrow", "")).textContent = "Calendar";
    evWrap.appendChild(el("h3", "section-h2", "")).textContent = "Events you are on";
    const list = el("div", "profile-events");
    mine.forEach(e => {
      const item = el("button", "row profile-event");
      item.type = "button";
      const n = el("span", "profile-event-name");
      n.textContent = e.name || "Untitled event";
      const role = el("span", "profile-event-role");
      role.textContent = e.host === a.username ? "Hosting" : "Working it";
      const when = el("span", "profile-event-when");
      when.textContent = eventWhen(e);
      item.append(n, role, when);
      item.onclick = () => setView("events");
      list.appendChild(item);
    });
    evWrap.appendChild(list);
    host.appendChild(evWrap);
  }
}

/* ---------- change your own display name ---------- */
function openRenameModal() {
  if (!session.account) return;
  const a = session.account;
  const wrap = el("div", "auth-modal");
  wrap.appendChild(el("div", "modal-title", "Change display name"));
  wrap.appendChild(el("div", "modal-sub", "Your username stays the same - this is just what people see."));

  const form = el("form", "auth-form");
  const inp = el("input", "input");
  inp.type = "text"; inp.maxLength = 24; inp.value = a.display || a.username;
  inp.placeholder = "Display name";
  const go = el("button", "btn btn-primary btn-lg", "Save");
  go.type = "submit";
  form.append(inp, go);
  wrap.appendChild(form);
  const err = el("p", "hint");
  wrap.appendChild(err);

  form.onsubmit = e => {
    e.preventDefault();
    const v = inp.value.trim();
    if (v.length < 2) { err.textContent = "Use at least 2 characters."; err.classList.add("error"); return; }
    a.display = v;
    if (!ACCOUNTS.includes(a)) ACCOUNTS.push(a);
    saveAccounts();
    applyRole();
    renderProfile();
    closeModal();
  };

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  actions.appendChild(cancel);
  wrap.appendChild(actions);
  openModal(wrap);
  inp.focus();
}

/* ---------- change your own password ----------
   Unlike an owner setting someone else's, this asks for the current one
   first, so a walk-up at an unlocked machine cannot take the account. */
function openMyPasswordModal() {
  if (!session.account) return;
  const a = session.account;
  const wrap = el("div", "auth-modal");
  wrap.appendChild(el("div", "modal-title", "Change your password"));
  wrap.appendChild(el("div", "modal-sub", "You need your current one to change it."));

  const form = el("form", "auth-form");
  const cur = el("input", "input");
  cur.type = "password"; cur.placeholder = "Current password"; cur.autocomplete = "current-password";
  const next = el("input", "input");
  next.type = "password"; next.placeholder = "New password (8 characters or more)"; next.autocomplete = "new-password";
  const again = el("input", "input");
  again.type = "password"; again.placeholder = "New password again"; again.autocomplete = "new-password";
  const go = el("button", "btn btn-primary btn-lg", "Change password");
  go.type = "submit";
  form.append(cur, next, again, go);
  wrap.appendChild(form);
  const err = el("p", "hint");
  wrap.appendChild(err);

  form.onsubmit = async e => {
    e.preventDefault();
    err.classList.remove("error");
    if (next.value.length < 8) { err.textContent = "Use at least 8 characters."; err.classList.add("error"); return; }
    if (next.value !== again.value) { err.textContent = "The two new passwords do not match."; err.classList.add("error"); return; }
    go.disabled = true;
    err.textContent = "Checking...";
    if (!(await passwordMatches(a, cur.value))) {
      err.textContent = "That is not your current password.";
      err.classList.add("error");
      go.disabled = false;
      return;
    }
    Object.assign(a, await makeCredential(next.value));
    if (!ACCOUNTS.includes(a)) ACCOUNTS.push(a);
    saveAccounts();
    closeModal();
  };

  const actions = el("div", "modal-actions");
  const cancel = el("button", "btn btn-ghost", "Cancel");
  cancel.type = "button";
  cancel.onclick = closeModal;
  actions.appendChild(cancel);
  wrap.appendChild(actions);
  openModal(wrap);
  cur.focus();
}

/* ============================================================
   MANAGEMENT  — Perspective replays and TempestAC flags
   ============================================================
   Two read-only views over what the plugins produce. Tempest is a static
   site, so it cannot receive a POST: it reads whatever is serving the
   plugin data, caches the result here, and degrades to that cache (or a
   file you import) when there is nothing to read.

   Shapes come straight from the plugins - see management.js. */
const MGMT = window.TEMPEST_MANAGEMENT || {};
const LS_RECORDINGS = "tempest_recordings";
const LS_FLAGS = "tempest_flags";

let RECORDINGS = [];
let FLAGS = [];
let mgmtState = { recLoaded: false, flagLoaded: false, recError: "", flagError: "" };

/* ---------- shaping whatever we are handed ---------- */
const asList = d => Array.isArray(d) ? d
  : d && Array.isArray(d.recordings) ? d.recordings
  : d && Array.isArray(d.flags) ? d.flags
  : d && Array.isArray(d.items) ? d.items
  : [];

function normaliseRecording(r) {
  return {
    number: Number(r.number) || 0,
    world: String(r.world || ""),
    createdMillis: Number(r.createdMillis) || 0,
    endedMillis: Number(r.endedMillis) || 0,
    durationMillis: Number(r.durationMillis) || 0,
    sizeBytes: Number(r.sizeBytes) || 0,
    tickCount: Number(r.tickCount) || 0,
    tpsMin: Number(r.tpsMin) || 0,
    tpsMax: Number(r.tpsMax) || 0,
    players: Array.isArray(r.players) ? r.players.map(String) : [],
    events: Array.isArray(r.events) ? r.events.map(e => ({
      kind: String(e.kind || "").toLowerCase(),
      atMillis: Number(e.atMillis) || 0,
      name: String(e.name || ""),
      text: String(e.text || ""),
    })) : [],
    available: r.available !== false,
  };
}
function normaliseFlag(f) {
  return {
    uuid: String(f.uuid || ""),
    playerName: String(f.playerName || f.player || ""),
    checkName: String(f.checkName || f.check || ""),
    category: String(f.category || ""),
    vl: Number(f.vl) || 0,
    debug: String(f.debug || ""),
    ping: Number(f.ping) || 0,
    tps: Number(f.tps) || 0,
    timestampMs: Number(f.timestampMs || f.timestamp) || 0,
  };
}

function cacheGet(key, mapper, cap) {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, cap).map(mapper) : [];
  } catch (e) { return []; }
}
function cacheSet(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
}

RECORDINGS = cacheGet(LS_RECORDINGS, normaliseRecording, MGMT.maxRecordings || 500);
FLAGS = cacheGet(LS_FLAGS, normaliseFlag, MGMT.maxFlags || 2000);

/* ---------- reading from the configured endpoint ---------- */
/* ---------- talking to the relay API -------------------------------------
   Set apiBase in management.js and the two endpoints fill themselves in.
   Reads need a session token, which the site gets by handing your Tempest
   login to the API when you sign in - so the password is only ever used to
   derive hashes, never stored. The token lives in sessionStorage, so it goes
   when the tab does. */
const LS_API_TOKEN = "tempest_api_token";

/* "same-origin" is for when the site and the API are served by the same host,
   which is the normal shape once this is on your own box: it keeps working
   whether you reach it by domain, by IP or on localhost, with no per-host
   config. An empty value still means "no API at all". */
const apiBase = () => {
  const raw = String(MGMT.apiBase || "").trim();
  if (raw === "same-origin") return location.origin;
  return raw.replace(/\/+$/, "");
};
function mgmtUrl(which) {
  const explicit = which === "flags" ? MGMT.flagsUrl : MGMT.recordingsUrl;
  if (explicit) return explicit;
  const base = apiBase();
  return base ? base + (which === "flags" ? "/api/flags" : "/api/recordings") : "";
}
function apiToken() {
  try {
    const raw = sessionStorage.getItem(LS_API_TOKEN);
    if (!raw) return "";
    const t = JSON.parse(raw);
    return t && t.expiresAt > Date.now() ? t.token : "";
  } catch (e) { return ""; }
}
function setApiToken(t) {
  try {
    if (t) sessionStorage.setItem(LS_API_TOKEN, JSON.stringify(t));
    else sessionStorage.removeItem(LS_API_TOKEN);
  } catch (e) {}
}

/* Distinguishes "the API said no" from "the API is not there", because those
   need opposite handling: a rejection must NOT fall back to a local copy that
   might still hold a removed or demoted account. */
async function apiLogin(username, password) {
  const base = apiBase();
  if (!base) return { reachable: false };
  try {
    const r = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (r.status === 401) return { reachable: true, ok: false };
    // the API knows this account but cannot check a credential that old
    if (r.status === 409) return { reachable: true, ok: false, legacy: true };
    if (!r.ok) return { reachable: false };
    const t = await r.json();
    if (!t || !t.token) return { reachable: true, ok: false };
    setApiToken(t);
    return { reachable: true, ok: true, data: t };
  } catch (e) { return { reachable: false }; }
}

/* Take the API's word for who this is. No credential comes back - the API
   never hands hashes out - so the local copy keeps whatever it had. */
function adoptApiAccount(data) {
  const existing = accountByName(data.username);
  const acc = normaliseAccount(Object.assign({}, existing || {}, {
    username: data.username,
    display: data.display || data.username,
    role: data.role || "player",
    subs: Array.isArray(data.subs) ? data.subs : (existing ? existing.subs : []),
  }));
  // keep the stored credential, if this browser happens to have one
  if (existing) {
    acc.salt = existing.salt;
    acc.hash = existing.hash;
    acc.iterations = existing.iterations;
  }
  const i = ACCOUNTS.findIndex(a => a.username === acc.username);
  if (i >= 0) ACCOUNTS[i] = acc; else ACCOUNTS.push(acc);
  saveAccounts();
  return acc;
}

async function pullObject(url) {
  const headers = { Accept: "application/json" };
  const token = apiToken();
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(url, { headers });
  if (r.status === 401) throw new Error("not signed in to the API");
  if (r.status === 403) throw new Error("your role cannot read this");
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}
const pullJson = async url => asList(await pullObject(url));

/* Which recordings staff have already asked for, so the row can say so
   rather than inviting a second identical request. */
let PENDING = [];

/* Ask the plugin (via the API) to send one recording's transcript. The plugin
   polls for this on its own outbound connection, so there is a short wait. */
async function requestTranscript(number, btn) {
  const base = apiBase();
  if (!base) return;
  if (btn) { btn.disabled = true; btn.textContent = "Asking..."; }
  try {
    const r = await fetch(base + "/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiToken() },
      body: JSON.stringify({ number }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (!PENDING.includes(number)) PENDING.push(number);
    if (btn) btn.textContent = "Requested";
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Could not ask"; }
  }
}
/* Opening Perspective asks for every transcript that is missing, in one call,
   so the catalogue fills itself in rather than waiting for a click per row.
   Recordings the server has already pruned are skipped - the plugin has nothing
   left to send for those - and so is anything already queued. */
let askNote = "";
let lastAsked = "";
async function requestAllTranscripts() {
  if (MGMT.autoRequestTranscripts === false) return 0;
  if (!apiBase() || !apiToken() || !can("management.perspective")) return 0;

  const want = RECORDINGS
    .filter(r => !r.events.length && r.available !== false && !PENDING.includes(r.number))
    .map(r => r.number);
  if (!want.length) return 0;

  // A tab left open refreshing must not re-post an identical list forever, but
  // a refresh that turns up something new has to get through - so the guard is
  // the list itself, not a timer.
  const fingerprint = want.join(",");
  if (fingerprint === lastAsked) return 0;
  lastAsked = fingerprint;

  try {
    const r = await fetch(apiBase() + "/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiToken() },
      body: JSON.stringify({ numbers: want }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const got = await r.json();
    PENDING = Array.isArray(got.numbers) ? got.numbers : PENDING.concat(want);
    askNote = want.length + (want.length === 1 ? " transcript asked for" : " transcripts asked for")
      + " - they arrive as the server polls.";
    return want.length;
  } catch (e) {
    lastAsked = "";   // it did not land, so let the next open try again
    askNote = "Could not ask for the missing transcripts: " + (e.message || e) + ".";
    return 0;
  }
}

async function refreshRecordings() {
  const url = mgmtUrl("recordings");
  if (!url) { mgmtState.recError = "no-url"; return false; }
  try {
    const raw = await pullObject(url);
    PENDING = Array.isArray(raw && raw.pending) ? raw.pending : [];
    RECORDINGS = asList(raw).slice(0, MGMT.maxRecordings || 500).map(normaliseRecording);
    cacheSet(LS_RECORDINGS, RECORDINGS);
    mgmtState.recError = "";
    mgmtState.recLoaded = true;
    return true;
  } catch (e) { mgmtState.recError = String(e.message || e); return false; }
}
async function refreshFlags() {
  const url = mgmtUrl("flags");
  if (!url) { mgmtState.flagError = "no-url"; return false; }
  try {
    const list = await pullJson(url);
    FLAGS = list.slice(0, MGMT.maxFlags || 2000).map(normaliseFlag);
    cacheSet(LS_FLAGS, FLAGS);
    mgmtState.flagError = "";
    mgmtState.flagLoaded = true;
    return true;
  } catch (e) { mgmtState.flagError = String(e.message || e); return false; }
}

/* Import a JSON file by hand, so the tabs are usable before anything is
   serving the data - drop in what the plugin would have POSTed. */
function importJsonFile(kind) {
  const inp = el("input");
  inp.type = "file";
  inp.accept = "application/json,.json";
  inp.onchange = () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      let list;
      try { list = asList(JSON.parse(fr.result)); }
      catch (e) { alert("That file is not valid JSON."); return; }
      if (kind === "recordings") {
        RECORDINGS = list.slice(0, MGMT.maxRecordings || 500).map(normaliseRecording);
        cacheSet(LS_RECORDINGS, RECORDINGS);
        mgmtState.recError = "";
        renderPerspective();
      } else {
        FLAGS = list.slice(0, MGMT.maxFlags || 2000).map(normaliseFlag);
        cacheSet(LS_FLAGS, FLAGS);
        mgmtState.flagError = "";
        renderAnticheat();
      }
    };
    fr.readAsText(file);
  };
  inp.click();
}

/* ---------- formatting ---------- */
const fmtWhen = ms => ms ? new Date(ms).toLocaleString(undefined,
  { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Unknown";
function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return h + "h " + (m % 60) + "m";
  if (m) return m + "m " + (s % 60) + "s";
  return s + "s";
}
function fmtOffset(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function fmtSize(b) {
  if (!b) return "-";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
}

const EVENT_KIND_ORDER = ["chat", "command", "flag", "death", "join", "leave"];
const kindLabel = k => k.charAt(0).toUpperCase() + k.slice(1);

/* ============================================================
   PERSPECTIVE
   ============================================================ */
function recordingRow(r) {
  const row = el("div", "row mgmt-row rec-row");

  const num = el("span", "rec-number");
  num.textContent = "#" + r.number;

  const main = el("div", "rec-main");
  const title = el("div", "rec-title");
  title.textContent = r.world || "Recording";
  const meta = el("div", "rec-meta");
  meta.textContent = fmtWhen(r.createdMillis) + " - " + fmtDuration(r.durationMillis)
    + " - " + r.tickCount.toLocaleString("en-US") + " ticks - " + fmtSize(r.sizeBytes);
  main.append(title, meta);

  const who = el("div", "rec-players");
  if (r.players.length) {
    r.players.slice(0, 6).forEach(p => {
      const chip = el("span", "pill");
      chip.textContent = p;
      who.appendChild(chip);
    });
    if (r.players.length > 6) {
      const more = el("span", "pill");
      more.textContent = "+" + (r.players.length - 6);
      who.appendChild(more);
    }
  } else {
    who.appendChild(el("span", "sub-none", "No players recorded"));
  }

  // a count per event kind, so you can see at a glance what is in it
  const counts = el("div", "rec-counts");
  const tally = {};
  r.events.forEach(e => { tally[e.kind] = (tally[e.kind] || 0) + 1; });
  EVENT_KIND_ORDER.filter(k => tally[k]).forEach(k => {
    const c = el("span", "kind-pill " + k);
    c.textContent = tally[k] + " " + kindLabel(k);
    counts.appendChild(c);
  });
  if (!r.events.length) {
    const none = el("span", "sub-none");
    none.textContent = "No transcript";
    none.title = "Nothing was sent with this recording. With web.on-demand enabled you can ask for it.";
    counts.appendChild(none);
  }

  const tps = el("span", "pill");
  tps.textContent = "TPS " + (r.tpsMin || 0).toFixed(1) + "-" + (r.tpsMax || 0).toFixed(1);

  const open = el("button", "btn btn-ghost btn-sm", "Open");
  open.type = "button";
  open.onclick = () => openRecordingModal(r);
  if (!r.available) {
    open.disabled = true;
    open.title = "This recording is no longer on the server.";
  }

  const actions = el("div", "rec-actions");
  actions.appendChild(open);

  // Nothing to show and a live API: offer to go and fetch it. The plugin polls
  // for the request, so this is a short wait rather than an instant load.
  if (!r.events.length && apiBase() && can("management.perspective")) {
    const ask = el("button", "btn btn-ghost btn-sm", "Load transcript");
    ask.type = "button";
    ask.title = "Ask the server to send this recording2019s chat, commands and flags";
    if (r.available === false) {
      // the server pruned it, so there is nothing left for the plugin to send
      ask.disabled = true;
      ask.title = "This recording is no longer on the server, so its transcript cannot be fetched.";
    } else if (PENDING.includes(r.number)) {
      ask.disabled = true;
      ask.textContent = "Requested";
      ask.title = "Already asked for - it will appear here once the server sends it.";
    } else {
      ask.onclick = () => requestTranscript(r.number, ask);
    }
    actions.appendChild(ask);
  }

  row.append(num, main, who, counts, tps, actions);
  return row;
}

/* the timeline: every event in the recording, filterable by kind */
function openRecordingModal(r) {
  const wrap = el("div", "auth-modal rec-modal");
  wrap.appendChild(el("div", "modal-title", "Recording #" + r.number));
  const sub = el("div", "modal-sub");
  sub.textContent = (r.world || "world") + " - " + fmtWhen(r.createdMillis)
    + " - " + fmtDuration(r.durationMillis) + " - " + r.players.join(", ");
  wrap.appendChild(sub);

  const present = EVENT_KIND_ORDER.filter(k => r.events.some(e => e.kind === k));
  const active = new Set(present);

  const filters = el("div", "rec-filters");
  present.forEach(k => {
    const b = el("button", "kind-pill " + k + " on");
    b.type = "button";
    b.textContent = kindLabel(k);
    b.onclick = () => {
      if (active.has(k)) { active.delete(k); b.classList.remove("on"); }
      else { active.add(k); b.classList.add("on"); }
      paint();
    };
    filters.appendChild(b);
  });
  if (present.length) wrap.appendChild(filters);

  const list = el("div", "rec-timeline");
  wrap.appendChild(list);

  function paint() {
    list.innerHTML = "";
    const rows = r.events
      .filter(e => active.has(e.kind))
      .sort((a, b) => a.atMillis - b.atMillis);
    if (!rows.length) {
      list.appendChild(el("p", "empty-note", r.events.length
        ? "Nothing of those kinds in this recording."
        : "No transcript was sent with this recording."));
      return;
    }
    rows.forEach(e => {
      const item = el("div", "tl-row");
      const t = el("span", "tl-time");
      t.textContent = fmtOffset(e.atMillis - r.createdMillis);
      t.title = fmtWhen(e.atMillis);
      const k = el("span", "kind-pill " + e.kind);
      k.textContent = kindLabel(e.kind);
      const body = el("span", "tl-body");
      if (e.name) {
        const n = el("b");
        n.textContent = e.name;
        body.append(n, document.createTextNode(e.text ? " " + e.text : ""));
      } else {
        body.textContent = e.text;
      }
      item.append(t, k, body);
      list.appendChild(item);
    });
  }
  paint();

  const actions = el("div", "modal-actions");
  const close = el("button", "btn btn-ghost", "Close");
  close.type = "button";
  close.onclick = closeModal;
  actions.appendChild(close);
  wrap.appendChild(actions);
  openModal(wrap);
}

function renderPerspective() {
  const list = $("#perspectiveList");
  if (!list) return;
  list.innerHTML = "";
  if (!can("management.perspective")) {
    list.appendChild(el("p", "empty-note", "Replays are Mod and above."));
    return;
  }

  const term = ($("#perspectiveSearch") ? $("#perspectiveSearch").value : "").trim().toLowerCase();
  const all = RECORDINGS.slice().sort((a, b) => b.createdMillis - a.createdMillis);
  const shown = term
    ? all.filter(r =>
        String(r.number).includes(term) ||
        r.world.toLowerCase().includes(term) ||
        r.players.some(p => p.toLowerCase().includes(term)))
    : all;

  const stat = $("#perspectiveStats");
  if (stat) {
    const waiting = all.filter(r => !r.events.length && r.available !== false).length;
    stat.textContent = all.length
      ? all.length + " recordings"
        + (waiting ? ", " + waiting + " waiting on a transcript" : "")
        + (mgmtState.recError && mgmtState.recError !== "no-url"
          ? " (showing the cached copy: " + mgmtState.recError + ")" : "")
        + (askNote ? " - " + askNote : "")
      : mgmtSourceHint("recordings");
  }
  if (!shown.length) {
    list.appendChild(el("p", "empty-note", all.length
      ? "Nothing matches that search."
      : "No recordings yet."));
    return;
  }
  shown.forEach(r => list.appendChild(recordingRow(r)));
}

/* ============================================================
   ANTICHEAT
   ============================================================ */
function flagRow(f) {
  const row = el("div", "row mgmt-row flag-row");

  const when = el("div", "flag-when");
  when.textContent = fmtWhen(f.timestampMs);

  const who = el("div", "flag-player");
  who.textContent = f.playerName || "Unknown";

  const check = el("span", "flag-check");
  check.textContent = f.checkName || "-";
  if (f.category) check.title = f.category;

  const cat = el("span", "pill");
  cat.textContent = f.category || "-";

  const vl = el("span", "flag-vl");
  vl.textContent = "VL " + (Number.isInteger(f.vl) ? f.vl : f.vl.toFixed(1));

  const net = el("div", "flag-net");
  net.textContent = f.ping + "ms - " + (f.tps || 0).toFixed(1) + " TPS";

  const dbg = el("div", "flag-debug");
  dbg.textContent = f.debug || "";
  if (f.debug) dbg.title = f.debug;

  row.append(when, who, check, cat, vl, net, dbg);
  return row;
}

function renderAnticheat() {
  const list = $("#anticheatList");
  if (!list) return;
  list.innerHTML = "";
  if (!can("management.anticheat")) {
    list.appendChild(el("p", "empty-note", "Flags are Mod and above."));
    return;
  }

  // the check filter is built from whatever is actually in the data
  const sel = $("#flagCheck");
  if (sel) {
    const wanted = sel.value;
    const checks = [...new Set(FLAGS.map(f => f.checkName).filter(Boolean))].sort();
    sel.innerHTML = "";
    const any = el("option"); any.value = ""; any.textContent = "Every check";
    sel.appendChild(any);
    checks.forEach(c => { const o = el("option"); o.value = c; o.textContent = c; sel.appendChild(o); });
    sel.value = checks.includes(wanted) ? wanted : "";
  }

  const check = sel ? sel.value : "";
  const who = ($("#flagPlayer") ? $("#flagPlayer").value : "").trim().toLowerCase();

  const all = FLAGS.slice().sort((a, b) => b.timestampMs - a.timestampMs);
  const shown = all.filter(f =>
    (!check || f.checkName === check) &&
    (!who || f.playerName.toLowerCase().includes(who)));

  const stat = $("#anticheatStats");
  if (stat) {
    stat.textContent = all.length
      ? shown.length + " of " + all.length + " flags"
        + (mgmtState.flagError && mgmtState.flagError !== "no-url"
            ? " (showing the cached copy: " + mgmtState.flagError + ")" : "")
      : mgmtSourceHint("flags");
  }
  if (!shown.length) {
    list.appendChild(el("p", "empty-note", all.length
      ? "No flags match those filters."
      : "No flags yet."));
    return;
  }

  const head = el("div", "flag-head");
  ["When", "Player", "Check", "Category", "VL", "Ping / TPS", "Debug"]
    .forEach(h => { const s = el("span"); s.textContent = h; head.appendChild(s); });
  list.appendChild(head);
  shown.forEach(f => list.appendChild(flagRow(f)));
}

function mgmtSourceHint(which) {
  const url = mgmtUrl(which);
  if (!url) return "No source configured. Set apiBase (or "
    + (which === "flags" ? "flagsUrl" : "recordingsUrl") + ") in management.js, or use Import to load a file.";
  const err = which === "flags" ? mgmtState.flagError : mgmtState.recError;
  return err ? "Could not reach the source: " + err : "Nothing returned by the source yet.";
}

/* ---------- refresh buttons ---------- */
/* Load a management source once per session, the first time something needs it.
   Until now these tabs only painted from the browser cache, so a fresh device
   showed nothing until somebody thought to hit Refresh. */
async function ensureLoaded(which) {
  if (which === "flags") {
    if (mgmtState.flagLoaded) return false;
    return await refreshFlags();
  }
  if (mgmtState.recLoaded) return false;
  return await refreshRecordings();
}

async function refreshManagement(which) {
  const btn = which === "flags" ? $("#flagRefresh") : $("#perspectiveRefresh");
  if (btn) { btn.disabled = true; btn.textContent = "Refreshing..."; }
  const ok = which === "flags" ? await refreshFlags() : await refreshRecordings();
  if (btn) {
    btn.disabled = false;
    btn.textContent = ok ? "Refreshed" : "Refresh";
    if (ok) setTimeout(() => { btn.textContent = "Refresh"; }, 1400);
  }
  if (which === "flags") { renderAnticheat(); return; }
  renderPerspective();
  // a refresh can bring in recordings that landed since the tab was opened
  if (await requestAllTranscripts()) renderPerspective();
}

/* ============================================================
   STAFF DASHBOARD  — what is waiting to be looked at
   ============================================================
   Mod and up land here. Three things: flag cases that need a verdict, the
   latest replays, and a plain statement of who can do what.

   A "case" is one bundle: the same check against the same player. Fifty Reach
   flags on one player is one decision, not fifty. The bundling is derived from
   the flags every time; only the human part - who claimed it and what they
   decided - is stored, and that lives in the API so two mods cannot both work
   the same pile and a verdict outlives the browser that recorded it. */

let CASES = [];
let caseTrouble = "";

const caseKey = (player, check) => player + "|" + check;

async function fetchCases() {
  const got = await apiAccountFetch("/api/cases", { method: "GET" });
  if (got && Array.isArray(got.cases)) { CASES = got.cases; caseTrouble = ""; return true; }
  // Without the API every case reads as open, which would quietly hide the fact
  // that someone else already claimed or ruled on one. Say so rather than lie.
  caseTrouble = "Showing every bundle as open: " + (acctSyncNote || "the API did not answer") + ".";
  return false;
}
async function postCase(body) {
  return await apiAccountFetch("/api/cases", { method: "POST", body: JSON.stringify(body) });
}
const caseFor = key => CASES.find(c => c.key === key) || null;

/* Group the raw flags into one row per player-and-check. */
function bundleFlags() {
  const byKey = new Map();
  FLAGS.forEach(f => {
    if (!f.playerName || !f.checkName) return;
    const key = caseKey(f.playerName, f.checkName);
    let b = byKey.get(key);
    if (!b) {
      b = { key, player: f.playerName, check: f.checkName, category: f.category,
            count: 0, first: f.timestampMs, last: f.timestampMs, maxVl: 0, debug: f.debug };
      byKey.set(key, b);
    }
    b.count += 1;
    b.maxVl = Math.max(b.maxVl, f.vl || 0);
    if (f.timestampMs < b.first) b.first = f.timestampMs;
    if (f.timestampMs > b.last) { b.last = f.timestampMs; b.debug = f.debug; }
  });
  return [...byKey.values()].sort((a, b) => b.count - a.count || b.last - a.last);
}

function caseRow(b) {
  const rec = caseFor(b.key) || {};
  const status = rec.status || "open";
  const row = el("div", "row case-row " + status);

  const count = el("div", "case-count");
  count.appendChild(el("span", "case-n", "")).textContent = b.count;
  count.appendChild(el("span", "case-n-label", "")).textContent = b.count === 1 ? "flag" : "flags";

  const main = el("div", "case-main");
  const title = el("div", "case-title");
  const chk = el("span", "flag-check");
  chk.textContent = b.check;
  const on = el("span", "case-player");
  on.textContent = b.player;
  title.append(chk, on);
  const meta = el("div", "case-meta");
  meta.textContent = (b.category ? b.category + " - " : "")
    + "peak VL " + (Number.isInteger(b.maxVl) ? b.maxVl : b.maxVl.toFixed(1))
    + " - last " + fmtWhen(b.last);
  main.append(title, meta);
  if (b.debug) {
    const d = el("div", "case-debug");
    d.textContent = b.debug;
    main.appendChild(d);
  }

  const state = el("div", "case-state");
  const pill = el("span", "case-status " + status);
  pill.textContent = status === "resolved"
    ? (rec.result === "hacking" ? "Hacking" : "False call")
    : status === "claimed" ? "Claimed" : "Open";
  state.appendChild(pill);
  if (rec.claimedBy && status === "claimed") {
    const who = el("span", "case-who");
    who.textContent = "by " + rec.claimedBy;
    state.appendChild(who);
  }
  if (rec.resolvedBy && status === "resolved") {
    const who = el("span", "case-who");
    who.textContent = "by " + rec.resolvedBy;
    state.appendChild(who);
  }

  const actions = el("div", "case-actions");
  if (can("cases.resolve")) {
    const mine = rec.claimedBy && session.account && rec.claimedBy === session.account.username;

    if (status === "open") {
      actions.appendChild(caseBtn("Claim", "btn-primary", () =>
        postCase({ key: b.key, player: b.player, check: b.check, action: "claim" })));
    } else if (status === "claimed") {
      if (mine) {
        actions.appendChild(caseBtn("Hacking", "btn-primary", () =>
          postCase({ key: b.key, player: b.player, check: b.check, action: "resolve", result: "hacking" })));
        actions.appendChild(caseBtn("False call", "btn-ghost", () =>
          postCase({ key: b.key, player: b.player, check: b.check, action: "resolve", result: "false-call" })));
        actions.appendChild(caseBtn("Release", "btn-ghost", () =>
          postCase({ key: b.key, player: b.player, check: b.check, action: "release" })));
      } else {
        const note = el("span", "case-who");
        note.textContent = "someone else has this";
        actions.appendChild(note);
      }
    } else {
      actions.appendChild(caseBtn("Reopen", "btn-ghost", () =>
        postCase({ key: b.key, player: b.player, check: b.check, action: "reopen" })));
    }
  }

  row.append(count, main, state, actions);
  return row;
}

/* Every case button does the same thing: call, refresh, repaint. */
function caseBtn(label, cls, call) {
  const b = el("button", "btn " + cls + " btn-sm", label);
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    const was = b.textContent;
    b.textContent = "Saving...";
    const ok = await call();
    if (!ok) {
      b.disabled = false;
      b.textContent = was;
      caseTrouble = "Could not save that: " + (acctSyncNote || "the API refused it") + ".";
      renderCases();
      return;
    }
    caseTrouble = "";
    await fetchCases();
    renderCases();
    renderDashTiles();
  };
  return b;
}

function renderCases() {
  const list = $("#caseList");
  if (!list) return;
  list.innerHTML = "";

  const want = $("#caseFilter") ? $("#caseFilter").value : "open";
  const all = bundleFlags();
  const shown = all.filter(b => {
    const status = (caseFor(b.key) || {}).status || "open";
    return !want || status === want;
  });

  if (caseTrouble) {
    const warn = el("p", "hint error");
    warn.textContent = caseTrouble;
    list.appendChild(warn);
  }

  const stat = $("#caseStats");
  if (stat) {
    const open = all.filter(b => ((caseFor(b.key) || {}).status || "open") === "open").length;
    stat.textContent = all.length
      ? open + " open of " + all.length + (all.length === 1 ? " bundle" : " bundles")
        + ", from " + FLAGS.length + (FLAGS.length === 1 ? " flag" : " flags")
      : (mgmtUrl("flags") ? "No flags yet." : "No flag source configured - see management.js.");
  }
  if (!shown.length) {
    list.appendChild(el("p", "empty-note", all.length
      ? "Nothing in that state."
      : "Nothing to look at."));
    return;
  }
  shown.forEach(b => list.appendChild(caseRow(b)));
}

/* Anything that changes a case changes the tiles too, so they go together. */
function renderDashboard() {
  renderDashTiles();
  renderCases();
  renderDashReplays();
  renderPermMatrix("permMatrix");
}

/* ---------- the numbers, across the top ----------
   A page that opens on a wall of rows makes you read before you know whether
   anything needs you. These five say that first, and each one is the way in to
   the thing it counts. */
function renderDashTiles() {
  const host = $("#dashTiles");
  if (!host) return;
  host.innerHTML = "";

  const bundles = bundleFlags();
  const statusOf = b => (caseFor(b.key) || {}).status || "open";
  const open = bundles.filter(b => statusOf(b) === "open").length;
  const mine = bundles.filter(b => {
    const rec = caseFor(b.key) || {};
    return rec.status === "claimed" && session.account && rec.claimedBy === session.account.username;
  }).length;

  const dayAgo = Date.now() - 86400000;
  const today = FLAGS.filter(f => f.timestampMs >= dayAgo).length;
  const noTranscript = RECORDINGS.filter(r => !r.events.length && r.available !== false).length;

  const tiles = [
    { n: open, label: open === 1 ? "case open" : "cases open", tone: open ? "hot" : "",
      go: () => { const f = $("#caseFilter"); if (f) f.value = "open"; renderCases(); } },
    { n: mine, label: "claimed by you", tone: mine ? "warn" : "",
      go: () => { const f = $("#caseFilter"); if (f) f.value = "claimed"; renderCases(); } },
    { n: today, label: today === 1 ? "flag today" : "flags today",
      go: () => setView("anticheat") },
    { n: RECORDINGS.length, label: RECORDINGS.length === 1 ? "recording" : "recordings",
      sub: noTranscript ? noTranscript + " awaiting a transcript" : "",
      go: () => setView("perspective") },
    { n: ACCOUNTS.filter(a => roleLevel(a.role) >= 1).length, label: "staff accounts" },
  ];

  tiles.forEach(t => {
    const tile = el(t.go ? "button" : "div", "dash-tile" + (t.tone ? " " + t.tone : ""));
    if (t.go) { tile.type = "button"; tile.onclick = t.go; }
    const n = el("span", "dash-tile-n");
    n.textContent = t.n;
    const l = el("span", "dash-tile-label");
    l.textContent = t.label;
    tile.append(n, l);
    if (t.sub) {
      const sub = el("span", "dash-tile-sub");
      sub.textContent = t.sub;
      tile.appendChild(sub);
    }
    host.appendChild(tile);
  });
}

/* ---------- the latest replays, as a short list ---------- */
function renderDashReplays() {
  const host = $("#dashReplays");
  if (!host) return;
  host.innerHTML = "";
  const recent = RECORDINGS.slice()
    .sort((a, b) => b.createdMillis - a.createdMillis)
    .slice(0, 5);
  if (!recent.length) {
    host.appendChild(el("p", "empty-note", "No recordings yet."));
    return;
  }
  recent.forEach(r => {
    const row = el("button", "row dash-replay");
    row.type = "button";
    const n = el("span", "rec-number");
    n.textContent = "#" + r.number;
    const main = el("div", "rec-main");
    const t = el("div", "rec-title");
    t.textContent = r.world || "Recording";
    const m = el("div", "rec-meta");
    m.textContent = fmtWhen(r.createdMillis) + " - " + fmtDuration(r.durationMillis)
      + (r.players.length ? " - " + r.players.join(", ") : "");
    main.append(t, m);
    const go = el("span", "feature-go", "Open in Perspective →");
    row.append(n, main, go);
    row.onclick = () => setView("perspective");
    host.appendChild(row);
  });
}

/* ---------- who can do what ---------- */
/* ---------- who can do what, and (for an owner) what it should be ----------
   Read-only on the Profile page, editable on the Staff tab. The matrix is
   generated from the live ladder rather than a written list, so a capability
   added to staff.js turns up here on its own and cannot drift out of step with
   the checks it describes. */
function renderPermMatrix(hostId) {
  const host = $("#" + hostId);
  if (!host) return;
  host.innerHTML = "";

  const editable = hostId === "permMatrix" && can("staff.manage");
  const myLvl = myLevel();

  allCaps().forEach(cap => {
    const need = CAPS[cap];
    const grantedBySub = SUBROLES.filter(s => (SUBROLE_CAPS[s.id] || []).includes(cap));
    const haveIt = can(cap);
    const now = typeof need === "number" ? need : null;
    const was = typeof CAP_DEFAULTS[cap] === "number" ? CAP_DEFAULTS[cap] : null;

    const row = el("div", "row perm-row" + (haveIt ? " mine" : "") + (editable ? " editing" : ""));

    const name = el("div", "perm-name");
    name.textContent = CAP_LABELS[cap] || cap;
    if (now !== was) {
      const moved = el("span", "perm-moved");
      moved.textContent = "changed";
      moved.title = "staff.js ships this as " + levelName(was);
      name.appendChild(moved);
    }
    const key = el("div", "perm-key");
    key.textContent = cap;
    const main = el("div", "perm-main");
    main.append(name, key);

    const holder = el("div", "perm-holders");
    if (editable) {
      holder.append(permLevelPicker(cap), permSubPicker(cap, grantedBySub));
    } else {
      if (typeof need === "number") {
        const lowest = ROLES.filter(r => r.level >= need).sort((a, b) => a.level - b.level)[0];
        if (lowest) {
          holder.appendChild(roleBadge(lowest.id));
          const andUp = el("span", "perm-andup");
          andUp.textContent = "and up";
          holder.appendChild(andUp);
        }
      } else if (!grantedBySub.length) {
        const none = el("span", "sub-none");
        none.textContent = "nobody by rank";
        holder.appendChild(none);
      }
      grantedBySub.forEach(s => holder.appendChild(subChip(s)));
    }

    const yours = el("span", "perm-mark" + (haveIt ? " on" : ""));
    yours.textContent = haveIt ? "You" : "";

    row.append(main, holder, yours);
    host.appendChild(row);
  });

  if (hostId === "profilePerms") {
    const note = el("p", "hint");
    note.textContent = "Owner and Founder bypass every check above, whatever the rank column says."
      + (myLvl >= FULL_CONTROL_LEVEL ? " That includes you." : "");
    host.appendChild(note);
  } else {
    renderPermNote(editable);
  }
}

const levelName = lvl => {
  if (typeof lvl !== "number") return "nobody by rank";
  const r = ROLES.filter(x => x.level >= lvl).sort((a, b) => a.level - b.level)[0];
  return r ? r.name + " and up" : "nobody by rank";
};

function subChip(s) {
  const chip = el("span", "sub-badge");
  chip.textContent = s.name;
  chip.style.setProperty("--rf", s.from);
  chip.style.setProperty("--rt", s.to);
  return chip;
}

/* The rank that unlocks a capability. "Nobody by rank" is a real choice, not an
   empty one - it is how events.assist already works, and the only way to make
   something sub-role-only. */
function permLevelPicker(cap) {
  const pick = el("select", "input select perm-level");
  const none = el("option");
  none.value = "none";
  none.textContent = "Nobody by rank";
  pick.appendChild(none);
  ROLES.slice().sort((a, b) => a.level - b.level).forEach(r => {
    const o = el("option");
    o.value = String(r.level);
    o.textContent = r.name + " and up";
    pick.appendChild(o);
  });
  pick.value = typeof CAPS[cap] === "number" ? String(CAPS[cap]) : "none";
  pick.onchange = () => {
    if (pick.value === "none") delete CAPS[cap];
    else CAPS[cap] = Number(pick.value);
    savePerms();
    afterPermChange();
  };
  return pick;
}

/* Sub-roles that grant it whatever the rank says. */
function permSubPicker(cap, granted) {
  const wrap = el("div", "perm-subs");
  SUBROLES.forEach(s => {
    const on = granted.includes(s);
    const chip = el("button", "sub-badge perm-sub-toggle" + (on ? " on" : ""));
    chip.type = "button";
    chip.textContent = s.name;
    chip.style.setProperty("--rf", s.from);
    chip.style.setProperty("--rt", s.to);
    chip.title = (on ? "Take this away from " : "Give this to ") + s.name;
    chip.onclick = () => {
      const list = (SUBROLE_CAPS[s.id] || []).slice();
      const at = list.indexOf(cap);
      if (at === -1) list.push(cap); else list.splice(at, 1);
      SUBROLE_CAPS[s.id] = list;
      savePerms();
      afterPermChange();
    };
    wrap.appendChild(chip);
  });
  return wrap;
}

/* A permission change can take away the tab you are standing on, so the whole
   chrome is re-resolved rather than just the matrix. */
function afterPermChange() {
  applyRole();
  renderStaffSubTabs();
  renderPermMatrix("permMatrix");
}

function renderPermNote(editable) {
  const hint = $("#permHint");
  if (hint) {
    hint.textContent = editable
      ? "Set the rank that unlocks each action, or hand it to a sub-role. Changes apply immediately."
      : "Every action the site gates, against the rank that unlocks it. The ones you hold are marked.";
  }
  const note = $("#permNote");
  if (!note) return;
  const over = permOverrides();
  const n = Object.keys(over.caps || {}).length + Object.keys(over.subs || {}).length;
  note.textContent = (n
    ? n + (n === 1 ? " change" : " changes") + " against what staff.js ships. "
    : "Matching staff.js. ")
    + "Owner and Founder bypass every check whatever the rank says, so you cannot lock "
    + "yourself out here. Changes save to this browser and to the API, so they hold on every "
    + "device - Copy permissions gives you the block to paste into staff.js as well.";
  note.classList.toggle("error", !!permApiNote);
  if (permApiNote) note.textContent = permApiNote + " " + note.textContent;
}

/* ---------- sharing the ladder ---------- */
let permApiNote = "";
async function pushPermsToApi() {
  const over = permOverrides();
  const ok = await apiAccountFetch("/api/perms", {
    method: "POST",
    body: JSON.stringify({ caps: over.caps || {}, subs: over.subs || {} }),
  });
  // The note under the matrix promises these hold on every device. If the push
  // failed that promise is false, and saying so beats letting an owner think a
  // demotion travelled when it did not.
  permApiNote = ok ? "" : "This browser only - " + (acctSyncNote || "the API did not answer") + ".";
  renderPermNote(can("staff.manage"));
}

/* The API is the shared copy, so it wins. Reset to the file first: an override
   somebody cleared elsewhere has to clear here too, and a merge would keep it. */
async function syncPermsFromApi() {
  const got = await apiAccountFetch("/api/perms", { method: "GET" });
  if (!got || typeof got !== "object") return false;
  const before = JSON.stringify(permOverrides());
  permsToDefaults();
  applyPerms(got);
  try { localStorage.setItem(LS_PERMS, JSON.stringify(permOverrides())); } catch (e) {}
  return JSON.stringify(permOverrides()) !== before;
}

function permsToDefaults() {
  Object.keys(CAPS).forEach(k => delete CAPS[k]);
  Object.assign(CAPS, CAP_DEFAULTS);
  SUBROLES.forEach(sr => { SUBROLE_CAPS[sr.id] = (SUBCAP_DEFAULTS[sr.id] || []).slice(); });
}

function resetAllPerms() {
  permsToDefaults();
  savePerms();
  afterPermChange();
}

/* The staff.js block, for when you want the change in the deploy rather than
   only in the API. */
function copyPermsFile() {
  const caps = allCaps();
  const width = Math.max.apply(null, caps.map(c => c.length)) + 4;
  const lines = ["window.TEMPEST_CAPABILITIES = {"];
  caps.forEach(c => {
    if (typeof CAPS[c] !== "number") return;
    lines.push("  " + ('"' + c + '":').padEnd(width) + CAPS[c] + ",");
  });
  lines.push("};", "", "window.TEMPEST_SUBROLE_CAPABILITIES = {");
  const sw = Math.max.apply(null, SUBROLES.map(s => s.id.length)) + 5;
  SUBROLES.forEach(s => {
    const list = (SUBROLE_CAPS[s.id] || []).map(c => '"' + c + '"').join(", ");
    lines.push("  " + ('"' + s.id + '":').padEnd(sw) + "[" + list + "],");
  });
  lines.push("};");

  const btn = $("#permExport");
  copyText(lines.join("\n")).then(ok => {
    if (!btn) return;
    btn.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => { btn.textContent = "Copy permissions"; }, 1600);
  });
}

/* ============================================================
   STAFF SUB-TABS
   ============================================================
   The Staff page holds four unrelated jobs, and stacking them made the one you
   wanted the one you had to scroll past three others to reach. Each is its own
   panel now, and the bar only offers the ones your rank can open. */
const STAFF_TABS = [
  { id: "dashboard",   name: "Dashboard",   cap: "staff.dashboard" },
  { id: "permissions", name: "Permissions", cap: "staff.dashboard" },
  { id: "accounts",    name: "Accounts",    cap: "staff.manage" },
  { id: "appearance",  name: "Role colours", cap: "staff.manage" },
];
let staffTab = "dashboard";

function staffTabsOpen() {
  return STAFF_TABS.filter(t => can(t.cap));
}

function renderStaffSubTabs() {
  const bar = $("#staffSubTabs");
  if (!bar) return;
  const open = staffTabsOpen();
  // a capability change can take away the tab you are standing on
  if (!open.some(t => t.id === staffTab)) staffTab = open.length ? open[0].id : "";
  bar.innerHTML = "";

  open.forEach(t => {
    const b = el("button", "sub-tab" + (t.id === staffTab ? " on" : ""));
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", t.id === staffTab ? "true" : "false");
    b.textContent = t.name;
    if (t.id === "dashboard") {
      const open = bundleFlags().filter(x => ((caseFor(x.key) || {}).status || "open") === "open").length;
      if (open) {
        const n = el("span", "sub-tab-n");
        n.textContent = open;
        b.appendChild(n);
      }
    }
    b.onclick = () => setStaffTab(t.id);
    bar.appendChild(b);
  });

  $$(".sub-panel").forEach(p => p.classList.toggle("sub-off", p.dataset.sub !== staffTab));
}

function setStaffTab(id) {
  staffTab = id;
  renderStaffSubTabs();
  if (id === "dashboard") renderDashboard();
  if (id === "permissions") renderPermMatrix("permMatrix");
  if (id === "accounts") renderStaff();
  if (id === "appearance") renderRoleEditor();
}

document.addEventListener("DOMContentLoaded", init);
