/* ============================================================
   Tempest — relay and management API
   ============================================================
   One Cloudflare Worker doing two unrelated jobs:

   1. The live relay. Holds the current bracket for a tournament so a
      share link updates itself. No accounts, no secrets.

   2. The management API. Receives what the server plugins push
      (Perspective recordings, TempestAC flags) and serves it back to
      signed-in staff.

   Contract
   --------
   Relay (unchanged, no secrets needed)
     GET    /t/:id                → { data, version, updated }  (304 with If-None-Match)
     PUT    /t/:id                → { ok, version }             (X-Write-Token)
     DELETE /t/:id                → { ok }                      (X-Write-Token)

   Ingest - the plugins push here (Authorization: Bearer INGEST_KEY)
     POST   /api/recordings       one Perspective recording summary
     POST   /api/reconcile        { numbers: [...] } → { missing: [...] }
     POST   /api/flags            one TempestAC violation, or { flags: [...] }

   Read - the website reads here (Authorization: Bearer <session token>)
     POST   /api/login            { username, password } → { token, ... }
     GET    /api/recordings       → { recordings: [...] }
     GET    /api/flags            → { flags: [...] }

     GET    /                     plain-text health check

   Why the read side needs auth
   ----------------------------
   Recordings carry chat and the commands players ran; flags carry who
   was suspected of what. That is personal data. The website's own role
   checks run in the visitor's browser and protect nothing on their own,
   so the gate that actually matters is here.

   Secrets (wrangler secret put NAME)
   ----------------------------------
   INGEST_KEY      must match Perspective's web.ingest-key. Lets the
                   holder WRITE recordings and flags. Server-side only -
                   never ship it to a browser.
   SESSION_SECRET  random string; signs session tokens. Rotating it logs
                   everyone out, which is the intended panic button.
   STAFF_JSON      the staff list, same shape as staff.js exports:
                   [{ username, role, salt, iterations, hash }]
                   Passwords are verified against these PBKDF2 hashes, so
                   no plaintext ever reaches the Worker.

   Optional vars
     MIN_READ_LEVEL  role level needed to read management data (default 3,
                     which is Mod on the shipped ladder).
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,If-None-Match,X-Write-Token,Authorization",
  "Access-Control-Expose-Headers": "ETag",
  "Access-Control-Max-Age": "86400",
};

const MAX_BYTES = 512 * 1024;        // a 128-player bracket compresses to a few KB
const MAX_RECORD_BYTES = 118 * 1024; // Durable Object values cap at 128 KiB per key
const MAX_FLAGS = 5000;              // ring buffer; oldest fall off
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
/* Cloudflare caps PBKDF2 at 100k iterations in production. Above it,
   deriveBits throws and the whole request 500s. The cap is NOT enforced by
   wrangler dev, so this only ever shows up once deployed. */
const PBKDF2_MAX = 100000;

/* The shipped ladder from staff.js. Only used to turn a stored role into a
   number - if you renamed roles there, mirror it here. */
const ROLE_LEVEL = {
  player: 0, staff: 1, headstaff: 2, mod: 3,
  headmod: 4, manager: 5, owner: 6, founder: 7,
};

const json = (body, status, extra) =>
  new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS, extra || {}),
  });

const enc = new TextEncoder();
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const fromHex = h => new Uint8Array(String(h).match(/../g).map(x => parseInt(x, 16)));

/* constant-time compare, so a wrong value can't be probed byte by byte */
function sameString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function idForToken(token) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(token))).slice(0, 16);
}

/* ---------- sessions -------------------------------------------------------
   A token is payload.signature, both base64url. The payload is readable by
   design - it carries nothing secret, and the signature is what makes it
   unforgeable. */
const b64u = {
  enc: s => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: s => atob(s.replace(/-/g, "+").replace(/_/g, "/")),
};

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]);
}
async function signToken(secret, payload) {
  const body = b64u.enc(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return body + "." + b64u.enc(String.fromCharCode(...new Uint8Array(sig)));
}
async function readToken(secret, token) {
  const dot = String(token || "").indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const want = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  if (!sameString(token.slice(dot + 1), b64u.enc(String.fromCharCode(...new Uint8Array(want))))) return null;
  try {
    const payload = JSON.parse(b64u.dec(body));
    if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

/* Same derivation the website uses, so the hashes in staff.js verify here
   unchanged: PBKDF2-SHA256 over a per-account salt, 256 bits, hex. */
async function derivePassword(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex),
      iterations: Math.min(iterations || PBKDF2_MAX, PBKDF2_MAX), hash: "SHA-256" }, key, 256);
  return toHex(bits);
}

function staffList(env) {
  try {
    const list = JSON.parse(env.STAFF_JSON || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

const bearer = req => (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

function ingestOk(req, env) {
  const key = env.INGEST_KEY || "";
  return key.length >= 16 && sameString(bearer(req), key);
}

async function sessionFor(req, env) {
  if (!env.SESSION_SECRET) return null;
  return await readToken(env.SESSION_SECRET, bearer(req));
}

/* ---------- storage --------------------------------------------------------
   Durable Objects are strongly consistent, so a score shows up on the next
   poll. KV is the fallback if your account can't use Durable Objects - it's
   eventually consistent, so viewers can lag by up to a minute. */
function backend(env) {
  if (env.TOURNAMENTS) return "do";
  if (env.TOURNAMENT_KV) return "kv";
  return null;
}

async function readRecord(env, id) {
  if (backend(env) === "do") {
    const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
    return await (await stub.fetch("https://do/read")).json();
  }
  const got = await env.TOURNAMENT_KV.getWithMetadata(id);
  if (!got || got.value == null) return { data: null, version: 0, updated: 0 };
  const meta = got.metadata || {};
  return { data: got.value, version: meta.version || 1, updated: meta.updated || 0 };
}

async function writeRecord(env, id, data) {
  if (backend(env) === "do") {
    const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
    return await (await stub.fetch("https://do/write", { method: "PUT", body: data })).json();
  }
  const prev = await readRecord(env, id);
  const version = (prev.version || 0) + 1;
  await env.TOURNAMENT_KV.put(id, data, { metadata: { version, updated: Date.now() } });
  return { ok: true, version };
}

async function deleteRecord(env, id) {
  if (backend(env) === "do") {
    const stub = env.TOURNAMENTS.get(env.TOURNAMENTS.idFromName(id));
    await stub.fetch("https://do/delete", { method: "DELETE" });
    return { ok: true };
  }
  await env.TOURNAMENT_KV.delete(id);
  return { ok: true };
}

/* the management catalogue lives in a single Durable Object */
const catalog = env => env.CATALOG.get(env.CATALOG.idFromName("catalog"));
const callCatalog = async (env, path, body) =>
  await (await catalog(env).fetch("https://do" + path, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  })).json();

/* A recording with a long transcript can exceed what one Durable Object key
   holds. Rather than reject it, drop events from the end until it fits and
   say so, since the summary is the part you cannot reconstruct.

   The limit is a parameter because it is a property of the host, not of the
   data: 128 KiB per key is a Cloudflare rule, and a plain Node host running
   this same Worker has no such ceiling. Set MAX_RECORD_BYTES there and
   transcripts stop being truncated at all. */
function fitRecording(rec, limit) {
  const cap = limit || MAX_RECORD_BYTES;
  let out = rec;
  if (JSON.stringify(out).length <= cap) return out;
  const events = Array.isArray(rec.events) ? rec.events.slice() : [];
  out = Object.assign({}, rec, { eventsTruncated: true });
  while (events.length && JSON.stringify(Object.assign({}, out, { events })).length > cap) {
    events.splice(Math.floor(events.length * 0.9) || events.length - 1);
  }
  out.events = events;
  return out;
}

/* ---------- accounts ------------------------------------------------------
   The API owns the account list. STAFF_JSON is only a BOOTSTRAP: it is
   imported once, the first time anything asks and the store is empty, so
   there is somebody to log in as. After that the store is authoritative and
   STAFF_JSON is ignored - promotions and removals happen through the Staff
   tab and take effect immediately, with nothing to re-paste.

   Crucially, a token carries only WHO you are, never what you may do. Level
   is resolved from the store on every request, so a demotion or a removal
   bites at once instead of waiting for a 12 hour token to expire. */
const levelFromRole = a =>
  typeof a.level === "number" ? a.level : (ROLE_LEVEL[a.role] || 0);

async function fingerprint(s) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(String(s || "")))).slice(0, 32);
}

/* STAFF_JSON is applied when it CHANGES, not just when the store is empty.
   Normal staff churn still goes through the Staff tab and never touches this
   secret - but editing it deliberately re-applies those accounts, which is the
   way back in if every owner is locked out. Accounts created in the app and not
   named in the secret are left alone. */
async function ensureSeeded(env) {
  const seed = staffList(env);
  if (!seed.length) return;
  const fp = await fingerprint(env.STAFF_JSON);
  const state = await callCatalog(env, "/acct/seedstate");
  if (state && state.fingerprint === fp) return;
  await callCatalog(env, "/acct/seed", {
    fingerprint: fp,
    accounts: seed.map(a => ({
      username: String(a.username || "").toLowerCase().trim(),
      display: a.display || a.username || "",
      role: a.role || "player",
      level: levelFromRole(a),
      salt: a.salt || "",
      // stored as given, NOT clamped: clamping would hide that a credential is
      // too old to verify, turning a fixable "legacy" into "wrong password"
      iterations: a.iterations || PBKDF2_MAX,
      hash: a.hash || "",
      subs: Array.isArray(a.subs) ? a.subs : [],
    })),
  });
}

/** The caller's live account, or null. Never trusts the token beyond its name. */
async function callerAccount(req, env) {
  const who = await sessionFor(req, env);
  if (!who || !who.u) return null;
  await ensureSeeded(env);
  const got = await callCatalog(env, "/acct/get", { username: who.u });
  return got && got.account ? got.account : null;
}

/** Resolve the caller and check they still clear a level. */
async function requireLevel(req, env, need) {
  const acc = await callerAccount(req, env);
  if (!acc) return { error: json({ error: "sign in first" }, 401) };
  if ((acc.level || 0) < need) {
    return { error: json({ error: "your role cannot do this" }, 403) };
  }
  return { account: acc };
}

/* ---------- the Worker ---------- */
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/" || path === "/health") {
      const be = backend(env);
      const bits = [
        be ? `relay: up (${be} storage)` : "relay: NO STORAGE BOUND - see relay/README.md",
        env.CATALOG ? "management: up" : "management: no CATALOG binding",
        env.INGEST_KEY ? "ingest key: set" : "ingest key: MISSING",
        env.SESSION_SECRET ? "session secret: set" : "session secret: MISSING",
        `staff accounts: ${staffList(env).length}`,
      ];
      return new Response("Tempest relay\n" + bits.map(b => "  " + b).join("\n") + "\n",
        { status: be ? 200 : 500, headers: Object.assign({ "Content-Type": "text/plain" }, CORS) });
    }

    /* ---------- management API ---------- */
    if (path.startsWith("/api/")) {
      if (!env.CATALOG) return json({ error: "no CATALOG binding - see relay/README.md" }, 500);

      if (path === "/api/login" && req.method === "POST") {
        if (!env.SESSION_SECRET) return json({ error: "SESSION_SECRET not set" }, 500);
        await ensureSeeded(env);
        let body = {};
        try { body = await req.json(); } catch (e) {}
        const username = String(body.username || "").toLowerCase().trim();
        const got = await callCatalog(env, "/acct/get", { username });
        const acc = got && got.account ? got.account : null;
        // same answer either way, so this is not a username oracle
        const bad = () => json({ error: "bad username or password" }, 401);
        if (!acc || !acc.hash || !acc.salt) return bad();
        // A credential derived above the cap cannot be checked here at all.
        // Say so distinctly so the site can verify it itself and re-derive
        // one we can handle - a silent 401 would just look like a bad password.
        if ((acc.iterations || 0) > PBKDF2_MAX) {
          return json({ error: "legacy-credential", username: acc.username }, 409);
        }
        const derived = await derivePassword(String(body.password || ""), acc.salt, acc.iterations);
        if (!sameString(derived, acc.hash)) return bad();

        // the token says who, never what - level is looked up per request
        const exp = Date.now() + TOKEN_TTL_MS;
        const token = await signToken(env.SESSION_SECRET, { u: acc.username, exp });
        return json({
          token, expiresAt: exp,
          username: acc.username, display: acc.display || acc.username,
          role: acc.role || "", level: acc.level || 0, subs: acc.subs || [],
        });
      }

      /* ---- accounts ------------------------------------------------------
         The API is the source of truth. The Staff tab writes through to here,
         so a promotion or a removal is live immediately and there is no
         secret to re-paste. */
      if (path === "/api/accounts" || path === "/api/accounts/delete") {
        const need = Number(env.MIN_MANAGE_LEVEL || 6);

        if (req.method === "GET") {
          const gate = await requireLevel(req, env, need);
          if (gate.error) return gate.error;
          const all = await callCatalog(env, "/acct/list");
          // never hand credentials back out, not even to an owner
          const accounts = (all.accounts || []).map(a => ({
            username: a.username, display: a.display, role: a.role,
            level: a.level, subs: a.subs || [], discord: a.discord || "",
            updatedAt: a.updatedAt || 0,
          }));
          return json({ accounts });
        }

        if (req.method === "POST") {
          const gate = await requireLevel(req, env, need);
          if (gate.error) return gate.error;
          let body = {};
          try { body = await req.json(); } catch (e) {}

          if (path === "/api/accounts/delete") {
            const username = String(body.username || "").toLowerCase().trim();
            if (!username) return json({ error: "username required" }, 400);
            if (username === gate.account.username) {
              return json({ error: "you cannot remove your own account" }, 400);
            }
            return json(await callCatalog(env, "/acct/delete", { username }));
          }

          const username = String(body.username || "").toLowerCase().trim();
          if (!/^[a-z0-9_.-]{3,20}$/.test(username)) {
            return json({ error: "bad username" }, 400);
          }
          // changing your own role here would be a way to lock yourself out,
          // or quietly promote yourself past whoever set you up
          if (username === gate.account.username && body.role && body.role !== gate.account.role) {
            return json({ error: "you cannot change your own role" }, 400);
          }
          return json(await callCatalog(env, "/acct/put", {
            username,
            display: String(body.display || username).slice(0, 40),
            role: String(body.role || "player"),
            level: typeof body.level === "number" ? body.level : (ROLE_LEVEL[body.role] || 0),
            subs: Array.isArray(body.subs) ? body.subs : [],
            discord: String(body.discord || "").slice(0, 60),
            // omit the credential to leave whatever is stored untouched
            salt: body.salt || "",
            iterations: body.iterations || 0,
            hash: body.hash || "",
          }));
        }

        return json({ error: "method not allowed" }, 405);
      }


      /* ---- the capability ladder ------------------------------------------
         Overrides an owner made on the Staff tab. Kept here so a demotion
         holds on every device rather than only the browser it was typed in.
         This does NOT gate this API - that stays on the account level in
         requireLevel - it is the site's own ladder. */
      if (path === "/api/perms") {
        if (req.method === "GET") {
          const gate = await requireLevel(req, env, 1);
          if (gate.error) return gate.error;
          return json(await callCatalog(env, "/perms/get"));
        }
        if (req.method === "POST") {
          const gate = await requireLevel(req, env, Number(env.MIN_MANAGE_LEVEL || 6));
          if (gate.error) return gate.error;
          let body = {};
          try { body = await req.json(); } catch (e) {}
          const caps = body.caps && typeof body.caps === "object" ? body.caps : {};
          const subs = body.subs && typeof body.subs === "object" ? body.subs : {};
          const cleanCaps = {};
          for (const k of Object.keys(caps).slice(0, 200)) {
            const v = caps[k];
            if (v === null) cleanCaps[String(k).slice(0, 60)] = null;
            else if (typeof v === "number" && v >= 0 && v <= 99) cleanCaps[String(k).slice(0, 60)] = v;
          }
          const cleanSubs = {};
          for (const k of Object.keys(subs).slice(0, 50)) {
            if (!Array.isArray(subs[k])) continue;
            cleanSubs[String(k).slice(0, 60)] =
              subs[k].filter(c => typeof c === "string").map(c => c.slice(0, 60)).slice(0, 200);
          }
          return json(await callCatalog(env, "/perms/put", {
            caps: cleanCaps, subs: cleanSubs, by: gate.account.username,
          }));
        }
        return json({ error: "method not allowed" }, 405);
      }

      /* ---- flag cases ----------------------------------------------------
         A case is one bundle of flags: the same check against the same player.
         Claiming and resolving MUST be shared state - the whole point is that
         two mods do not both work the same pile, and that a verdict outlives
         the browser it was recorded in. The bundling itself is derived from
         the flags, so only the human decisions live here. */
      if (path === "/api/cases") {
        const need = Number(env.MIN_READ_LEVEL || 3);

        if (req.method === "GET") {
          const gate = await requireLevel(req, env, need);
          if (gate.error) return gate.error;
          return json(await callCatalog(env, "/case/list"));
        }

        if (req.method === "POST") {
          const gate = await requireLevel(req, env, need);
          if (gate.error) return gate.error;
          let body = {};
          try { body = await req.json(); } catch (e) {}
          const key = String(body.key || "").slice(0, 120);
          if (!key) return json({ error: "key required" }, 400);

          const action = String(body.action || "");
          const me = gate.account.username;
          // Only carry these when given. /case/put merges over what is stored,
          // so sending "" would blank a case's player and check on any request
          // that happened not to repeat them - a claim keeps its identity.
          const patch = { key };
          if (body.player) patch.player = String(body.player).slice(0, 60);
          if (body.check) patch.check = String(body.check).slice(0, 60);

          if (action === "claim") {
            Object.assign(patch, { status: "claimed", claimedBy: me, claimedAt: Date.now() });
          } else if (action === "release") {
            Object.assign(patch, { status: "open", claimedBy: "", claimedAt: 0 });
          } else if (action === "resolve") {
            const result = body.result === "hacking" ? "hacking"
              : body.result === "false-call" ? "false-call" : "";
            if (!result) return json({ error: "result must be hacking or false-call" }, 400);
            Object.assign(patch, {
              status: "resolved", result,
              resolvedBy: me, resolvedAt: Date.now(),
              note: String(body.note || "").slice(0, 300),
            });
          } else if (action === "reopen") {
            Object.assign(patch, { status: "open", result: "", resolvedBy: "", resolvedAt: 0 });
          } else {
            return json({ error: "unknown action" }, 400);
          }

          return json(await callCatalog(env, "/case/put", patch));
        }

        return json({ error: "method not allowed" }, 405);
      }

      /* ---- transcript requests -------------------------------------------
         The plugin cannot be reached from outside, so the flow is inverted:
         staff record a request here, the plugin polls for it on its own
         outbound connection and pushes that one recording. Nothing personal
         leaves the game server until somebody actually asks for it. */
      if (path === "/api/requests") {
        // the plugin asking what has been requested
        if (req.method === "GET") {
          if (!ingestOk(req, env)) return json({ error: "bad ingest key" }, 403);
          return json(await callCatalog(env, "/req/list"));
        }
        // a member of staff asking for one
        if (req.method === "POST") {
          const gate = await requireLevel(req, env, Number(env.MIN_READ_LEVEL || 3));
          if (gate.error) return gate.error;
          let body = {};
          try { body = await req.json(); } catch (e) {}
          // Perspective asks for every untranscribed recording the moment the
          // tab opens, so the batch form matters: one round trip instead of one
          // per recording against a Durable Object that serialises them anyway.
          const many = Array.isArray(body.numbers) ? body.numbers : null;
          if (many) {
            const numbers = [...new Set(many.map(Number).filter(Number.isFinite))].slice(0, 500);
            if (!numbers.length) return json({ error: "numbers required" }, 400);
            return json(await callCatalog(env, "/req/addmany", { numbers, by: gate.account.username }));
          }
          const number = Number(body.number);
          if (!Number.isFinite(number)) return json({ error: "number required" }, 400);
          return json(await callCatalog(env, "/req/add", { number, by: gate.account.username }));
        }
        return json({ error: "method not allowed" }, 405);
      }

      /* writes come from the plugins */
      if (req.method === "POST" && (path === "/api/recordings" || path === "/api/reconcile" || path === "/api/flags")) {
        if (!ingestOk(req, env)) return json({ error: "bad ingest key" }, 403);

        if (path === "/api/recordings") {
          let rec;
          try { rec = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
          if (!rec || typeof rec.number !== "number") return json({ error: "number required" }, 400);
          const cap = Number(env.MAX_RECORD_BYTES) || MAX_RECORD_BYTES;
          return json(await callCatalog(env, "/rec/put", fitRecording(rec, cap)));
        }

        if (path === "/api/reconcile") {
          let body;
          try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
          const have = await callCatalog(env, "/rec/numbers");
          const onDisk = Array.isArray(body && body.numbers) ? body.numbers : [];
          const known = new Set(have.numbers || []);
          // what the server still has that we have never been sent
          const missing = onDisk.filter(n => !known.has(n));
          // and drop anything we hold that the server has since pruned
          const gone = (have.numbers || []).filter(n => !onDisk.includes(n));
          if (gone.length) await callCatalog(env, "/rec/unavailable", { numbers: gone });
          return json({ missing });
        }

        // flags: one violation, or a batch
        let body;
        try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
        const flags = Array.isArray(body) ? body
          : Array.isArray(body && body.flags) ? body.flags
          : body ? [body] : [];
        if (!flags.length) return json({ error: "no flags" }, 400);
        return json(await callCatalog(env, "/flags/add", { flags }));
      }

      /* reads come from the website, and need a staff session */
      if (req.method === "GET" && (path === "/api/recordings" || path === "/api/flags")) {
        const gate = await requireLevel(req, env, Number(env.MIN_READ_LEVEL || 3));
        if (gate.error) return gate.error;
        return json(await callCatalog(env, path === "/api/flags" ? "/flags/list" : "/rec/list"));
      }

      return json({ error: "not found" }, 404);
    }

    /* ---------- live relay ---------- */
    if (!backend(env)) return json({ error: "no storage bound - see relay/README.md" }, 500);

    const match = /^\/t\/([a-f0-9]{8,32})$/.exec(path);
    if (!match) return json({ error: "not found" }, 404);
    const id = match[1];

    if (req.method === "GET") {
      const rec = await readRecord(env, id);
      if (!rec.data) return json({ error: "no bracket published for this link yet" }, 404);
      const etag = `W/"${rec.version}"`;
      if (req.headers.get("If-None-Match") === etag) {
        return new Response(null, { status: 304, headers: Object.assign({ ETag: etag }, CORS) });
      }
      return json(rec, 200, { ETag: etag, "Cache-Control": "no-store" });
    }

    if (req.method === "PUT" || req.method === "DELETE") {
      const token = req.headers.get("X-Write-Token") || "";
      if (token.length < 16 || !sameString(await idForToken(token), id)) {
        return json({ error: "bad write token for this tournament id" }, 403);
      }
      if (req.method === "DELETE") return json(await deleteRecord(env, id));

      const data = await req.text();
      if (!data) return json({ error: "empty body" }, 400);
      if (data.length > MAX_BYTES) return json({ error: "bracket too large" }, 413);
      return json(await writeRecord(env, id, data));
    }

    return json({ error: "method not allowed" }, 405);
  },
};

/* ---------- Durable Object: one per tournament id ---------- */
export class Tournament {
  constructor(state) { this.state = state; }

  async fetch(req) {
    const store = this.state.storage;

    if (req.method === "PUT") {
      const data = await req.text();
      const version = ((await store.get("version")) || 0) + 1;
      await store.put({ data, version, updated: Date.now() });
      return Response.json({ ok: true, version });
    }

    if (req.method === "DELETE") {
      await store.deleteAll();
      return Response.json({ ok: true });
    }

    const rec = await store.get(["data", "version", "updated"]);
    return Response.json({
      data: rec.get("data") || null,
      version: rec.get("version") || 0,
      updated: rec.get("updated") || 0,
    });
  }
}

/* ---------- Durable Object: the management catalogue ----------
   One instance holds every recording ("rec:<number>") and a ring of flags
   ("flag:<seq>"), so reads are a prefix list and writes are a single put. */
export class Catalog {
  constructor(state) { this.state = state; }

  async fetch(req) {
    const store = this.state.storage;
    const path = new URL(req.url).pathname;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (path === "/case/list") {
      const map = await store.list({ prefix: "case:" });
      return Response.json({ cases: [...map.values()] });
    }

    if (path === "/case/put") {
      const key = "case:" + body.key;
      const prev = (await store.get(key)) || {};
      const rec = Object.assign({}, prev, body, { updatedAt: Date.now() });
      await store.put(key, rec);
      return Response.json({ ok: true, case: rec });
    }

    if (path === "/acct/count") {
      const map = await store.list({ prefix: "acct:" });
      return Response.json({ count: map.size });
    }

    if (path === "/acct/seedstate") {
      return Response.json({ fingerprint: (await store.get("seedFingerprint")) || "" });
    }

    if (path === "/acct/seed") {
      // applied whenever the secret changes; only the named accounts are touched
      const list = Array.isArray(body.accounts) ? body.accounts : [];
      for (const a of list) {
        if (!a.username) continue;
        await store.put("acct:" + a.username, Object.assign({}, a, { updatedAt: Date.now() }));
      }
      await store.put("seedFingerprint", body.fingerprint || "");
      return Response.json({ ok: true, seeded: list.length });
    }

    if (path === "/acct/get") {
      const a = await store.get("acct:" + String(body.username || "").toLowerCase().trim());
      return Response.json({ account: a || null });
    }

    if (path === "/acct/list") {
      const map = await store.list({ prefix: "acct:" });
      const accounts = [...map.values()].sort((a, b) => (b.level || 0) - (a.level || 0));
      return Response.json({ accounts });
    }

    if (path === "/acct/put") {
      const key = "acct:" + body.username;
      const prev = (await store.get(key)) || {};
      // a blank credential means "leave the password alone", so the Staff tab
      // can rename or re-role somebody without touching how they sign in
      const salt = body.salt || prev.salt || "";
      const hash = body.hash || prev.hash || "";
      // Defaulting to the old 150k here would stamp a brand new account as
      // legacy and lock it out of /api/login the moment it was created.
      const iterations = body.iterations || prev.iterations || PBKDF2_MAX;
      const rec = {
        username: body.username,
        display: body.display || prev.display || body.username,
        role: body.role || prev.role || "player",
        level: typeof body.level === "number" ? body.level : (prev.level || 0),
        subs: Array.isArray(body.subs) ? body.subs : (prev.subs || []),
        discord: body.discord !== undefined ? body.discord : (prev.discord || ""),
        salt, hash, iterations,
        updatedAt: Date.now(),
      };
      await store.put(key, rec);
      return Response.json({ ok: true, username: rec.username });
    }

    if (path === "/acct/delete") {
      await store.delete("acct:" + String(body.username || "").toLowerCase().trim());
      return Response.json({ ok: true });
    }

    if (path === "/rec/put") {
      const rec = Object.assign({}, body, { available: body.available !== false, receivedAt: Date.now() });
      await store.put("rec:" + rec.number, rec);
      // the data arrived, so whoever asked for it no longer needs to
      await store.delete("req:" + rec.number);
      return Response.json({ ok: true, number: rec.number });
    }

    if (path === "/rec/numbers") {
      const map = await store.list({ prefix: "rec:" });
      return Response.json({ numbers: [...map.values()].map(r => r.number) });
    }

    if (path === "/rec/unavailable") {
      const numbers = Array.isArray(body.numbers) ? body.numbers : [];
      for (const n of numbers) {
        const rec = await store.get("rec:" + n);
        if (rec) await store.put("rec:" + n, Object.assign({}, rec, { available: false }));
      }
      return Response.json({ ok: true, marked: numbers.length });
    }

    if (path === "/rec/list") {
      const map = await store.list({ prefix: "rec:" });
      const recordings = [...map.values()].sort((a, b) => (b.createdMillis || 0) - (a.createdMillis || 0));
      // so the site can show which transcripts are already on their way
      const reqs = await store.list({ prefix: "req:" });
      return Response.json({ recordings, pending: [...reqs.values()].map(r => r.number) });
    }

    if (path === "/req/add") {
      await store.put("req:" + body.number, { number: body.number, by: body.by || "", at: Date.now() });
      return Response.json({ ok: true, number: body.number });
    }

    if (path === "/perms/get") {
      return Response.json((await store.get("perms")) || { caps: {}, subs: {} });
    }

    if (path === "/perms/put") {
      const rec = { caps: body.caps || {}, subs: body.subs || {}, by: body.by || "", at: Date.now() };
      await store.put("perms", rec);
      return Response.json(rec);
    }

    if (path === "/req/addmany") {
      const at = Date.now();
      for (const n of body.numbers || []) {
        // an existing request keeps its original asker and time - re-asking for
        // something already queued should not look like a fresh request
        if (await store.get("req:" + n)) continue;
        await store.put("req:" + n, { number: n, by: body.by || "", at });
      }
      const map = await store.list({ prefix: "req:" });
      return Response.json({ ok: true, numbers: [...map.values()].map(r => r.number) });
    }

    if (path === "/req/list") {
      const map = await store.list({ prefix: "req:" });
      return Response.json({ numbers: [...map.values()].map(r => r.number) });
    }

    if (path === "/flags/add") {
      const incoming = Array.isArray(body.flags) ? body.flags : [];
      let seq = (await store.get("flagSeq")) || 0;
      for (const f of incoming) {
        seq += 1;
        await store.put("flag:" + String(seq).padStart(12, "0"), Object.assign({}, f, { receivedAt: Date.now() }));
      }
      await store.put("flagSeq", seq);

      // keep the ring bounded, oldest first
      const map = await store.list({ prefix: "flag:" });
      const overflow = map.size - MAX_FLAGS;
      if (overflow > 0) {
        const oldest = [...map.keys()].slice(0, overflow);
        await store.delete(oldest);
      }
      return Response.json({ ok: true, added: incoming.length });
    }

    if (path === "/flags/list") {
      const map = await store.list({ prefix: "flag:", reverse: true, limit: MAX_FLAGS });
      return Response.json({ flags: [...map.values()] });
    }

    return Response.json({ error: "unknown catalog path" }, { status: 404 });
  }
}
