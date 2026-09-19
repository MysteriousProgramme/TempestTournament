/* ============================================================
   Tempest — one Node process, site and API
   ============================================================
   Serves the static site AND runs relay/worker.js unchanged, so an EC2 box
   needs one service rather than two, and the site talks to an API on its own
   origin: no CORS, one certificate, one thing to restart.

   The Worker is imported, not copied. Its router is written against Request,
   Response, URL and crypto.subtle, all of which Node has natively, so the only
   things this file supplies are the two Durable Object bindings (see store.js)
   and a bridge from node:http to fetch(). Cloudflare and EC2 therefore run the
   same routing, the same auth and the same validation.

   Routes
     /api/...   the management API   ) straight to the Worker
     /t/...     the live relay       )
     /health    plain-text status    )
     everything else                 the static site

   `/` is the site, not the health check - that is why the Worker's health
   check is read at /health here.

   Run it
     node server/server.js
   Configure it with server/.env (see .env.example) or real environment
   variables. Never commit .env: it holds INGEST_KEY and SESSION_SECRET.
   ============================================================ */

import http from "node:http";
import https from "node:https";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import worker, { Tournament, Catalog } from "../relay/worker.js";
import { namespace } from "./store.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(HERE, "..");

/* ---------- configuration ----------
   A .env file beside this one, overlaid by real environment variables so a
   systemd drop-in or a one-off shell export always wins. */
async function loadEnv() {
  const env = {};
  try {
    const raw = await fs.readFile(path.join(HERE, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const at = trimmed.indexOf("=");
      if (at < 1) continue;
      let value = trimmed.slice(at + 1).trim();
      // allow quoting, which matters for STAFF_JSON
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[trimmed.slice(0, at).trim()] = value;
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return Object.assign(env, process.env);
}

const env = await loadEnv();
const PORT = Number(env.PORT || 8791);
const HOST = env.HOST || "127.0.0.1";
const DATA_DIR = path.resolve(HERE, env.DATA_DIR || "data");
/* A recording body is the only thing that can be genuinely large. The Worker
   trims transcripts to MAX_RECORD_BYTES; this is the hard stop before that,
   so a runaway upload cannot exhaust memory. */
const MAX_BODY = Number(env.MAX_BODY_BYTES || 16 * 1024 * 1024);

/* ---------- TLS, without a reverse proxy ----------
   nginx in front would do exactly one job: terminate TLS. Doing it here
   instead means one process, one thing to restart, and - on a box that is
   already running someone else's nginx - nothing of theirs to touch.

   Set TLS_CERT and TLS_KEY and the server binds 443 for the site and 80 for
   the redirect. Leave them unset and it stays plain HTTP on PORT, which is
   what you want when something else really is terminating TLS in front. */
const TLS_CERT = env.TLS_CERT || "";
const TLS_KEY = env.TLS_KEY || "";
const TLS_ON = !!(TLS_CERT && TLS_KEY);
const HTTPS_PORT = Number(env.HTTPS_PORT || 443);
const HTTP_PORT = Number(env.HTTP_PORT || 80);
/* Serving the public directly means binding every interface; behind a proxy it
   should stay on loopback. Default accordingly rather than making you think. */
const BIND = env.HOST || (TLS_ON ? "0.0.0.0" : "127.0.0.1");

/* Certbot writes its challenge under here and we serve it from there, so
   renewal needs no port of its own and never needs this process stopped.

   This is the WEBROOT, i.e. exactly what you pass to `certbot --webroot -w`.
   Certbot appends .well-known/acme-challenge/ itself, so this reads the same
   shape rather than a flat directory - otherwise renewal writes a file the
   server never looks at, and fails in ninety days for no visible reason. */
const ACME_DIR = path.resolve(HERE, env.ACME_DIR || "acme");
const ACME_PREFIX = "/.well-known/acme-challenge/";

env.TOURNAMENTS = namespace(path.join(DATA_DIR, "tournaments"), Tournament);
env.CATALOG = namespace(path.join(DATA_DIR, "catalog"), Catalog);

/* ---------- static files ----------
   Everything that is not the API is served from the repository root, which is
   also where relay/, server/ and the data directory live - so the denylist is
   not decoration. Combined with the traversal check below it is what stops
   `GET /server/.env` handing out the session secret. */
const DENY = new Set(["server", "relay", "data", "node_modules", ".git", ".claude"]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".map": "application/json; charset=utf-8",
};

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";

  const first = rel.split("/")[0];
  if (DENY.has(first) || rel.split("/").some(seg => seg.startsWith("."))) {
    return send(res, 404, "text/plain; charset=utf-8", "Not found");
  }

  const full = path.resolve(SITE_ROOT, rel);
  // resolve() has already collapsed any ..; this is the check that it did not
  // land outside the site
  if (full !== SITE_ROOT && !full.startsWith(SITE_ROOT + path.sep)) {
    return send(res, 404, "text/plain; charset=utf-8", "Not found");
  }

  let body;
  try {
    const stat = await fs.stat(full);
    if (stat.isDirectory()) return serveStatic(req, res, pathname.replace(/\/*$/, "/"));
    body = await fs.readFile(full);
  } catch (e) {
    return send(res, 404, "text/plain; charset=utf-8", "Not found");
  }

  const ext = path.extname(full).toLowerCase();
  // Nothing here is content-hashed, so a long cache would serve a stale app.js
  // after a deploy. HTML is never cached; the rest gets a few minutes.
  const cache = ext === ".html" ? "no-cache" : "public, max-age=300";
  send(res, 200, TYPES[ext] || "application/octet-stream", body, { "Cache-Control": cache });
}

/* The static handler refuses any path segment beginning with a dot, which
   would include /.well-known - so ACME is handled here, before it, and only
   for filenames in the token alphabet. */
async function serveAcme(req, res, pathname) {
  const name = pathname.slice(ACME_PREFIX.length);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(name)) {
    return send(res, 404, "text/plain; charset=utf-8", "Not found");
  }
  try {
    const body = await fs.readFile(path.join(ACME_DIR, ".well-known", "acme-challenge", name));
    send(res, 200, "text/plain; charset=utf-8", body);
  } catch (e) {
    send(res, 404, "text/plain; charset=utf-8", "Not found");
  }
}

function send(res, status, type, body, extra) {
  const head = Object.assign({ "Content-Type": type }, extra || {});
  if (body !== undefined && body !== null) head["Content-Length"] = Buffer.byteLength(body);
  res.writeHead(status, head);
  res.end(res.req && res.req.method === "HEAD" ? undefined : body);
}

/* ---------- node:http to fetch() and back ---------- */
/* Resolves as soon as the limit is crossed rather than throwing, and keeps
   draining without buffering. Destroying the socket here instead would mean
   the caller never receives the 413 and just sees a dropped connection -
   which, from a game server pushing a recording, is indistinguishable from
   the site being down. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) {
        if (!over) { over = true; resolve({ tooLarge: true }); }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => { if (!over) resolve(Buffer.concat(chunks)); });
    req.on("error", e => { if (!over) reject(e); });
  });
}

async function toWorker(req, res, url) {
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await readBody(req);
    if (body && body.tooLarge) {
      // answer first, then stop reading the rest of the upload
      res.writeHead(413, { "Content-Type": "application/json", "Connection": "close" });
      return res.end(JSON.stringify({ error: "body too large" }), () => req.destroy());
    }
  }

  const request = new Request(url.href, {
    method: req.method,
    headers: req.headers,
    body,
  });

  const out = await worker.fetch(request, env);
  const buf = Buffer.from(await out.arrayBuffer());
  const head = {};
  out.headers.forEach((v, k) => { head[k] = v; });
  head["Content-Length"] = buf.length;
  res.writeHead(out.status, head);
  res.end(req.method === "HEAD" ? undefined : buf);
}

const isApi = p => p.startsWith("/api/") || p.startsWith("/t/") || p === "/health";

async function handler(req, res) {
  res.req = req;
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  } catch (e) {
    return send(res, 400, "text/plain; charset=utf-8", "Bad request");
  }

  try {
    if (isApi(url.pathname)) await toWorker(req, res, url);
    else await serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error("[error] " + req.method + " " + url.pathname + ": " + (e.stack || e.message));
    if (!res.headersSent) {
      send(res, 500, "application/json", JSON.stringify({ error: "server error" }));
    }
  }

  // one line per request, enough to see what the plugins and the site are doing
  if (isApi(url.pathname) || res.statusCode >= 400) {
    console.log(req.method + " " + url.pathname + " " + res.statusCode
      + " " + (Date.now() - started) + "ms");
  }
}

const servers = [];

if (TLS_ON) {
  /* The private key under /etc/letsencrypt is root-only by default, so "cannot
     read it" is the single most likely thing to go wrong here. Say which file
     and why, rather than dumping an ENOENT stack trace and exiting. */
  let creds;
  try {
    creds = { cert: await fs.readFile(TLS_CERT), key: await fs.readFile(TLS_KEY) };
  } catch (e) {
    console.error("[tempest] cannot read the TLS " + (/key/i.test(e.path || "") ? "key" : "certificate")
      + ": " + e.path);
    console.error("[tempest] " + (e.code === "EACCES"
      ? "permission denied - this process does not run as root, so copy the files somewhere it can read (see server/README.md)"
      : e.code === "ENOENT"
        ? "no such file - check TLS_CERT and TLS_KEY in server/.env"
        : e.message));
    process.exit(1);
  }
  servers.push(https.createServer(creds, handler).listen(HTTPS_PORT, BIND, () =>
    console.log("[tempest] site + API on https://" + BIND + ":" + HTTPS_PORT)));

  /* Port 80 exists only to answer ACME and to send everyone to HTTPS. It must
     keep serving the challenge, or renewal fails in ninety days and the site
     goes down on a Tuesday for no visible reason. */
  servers.push(http.createServer((req, res) => {
    res.req = req;
    if (req.url && req.url.startsWith(ACME_PREFIX)) return serveAcme(req, res, req.url);
    const host = (req.headers.host || "").replace(/:\d+$/, "");
    res.writeHead(301, { Location: "https://" + host + req.url });
    res.end();
  }).listen(HTTP_PORT, BIND, () =>
    console.log("[tempest] redirect + ACME on http://" + BIND + ":" + HTTP_PORT)));
} else {
  servers.push(http.createServer(handler).listen(PORT, BIND, () =>
    console.log("[tempest] site + API on http://" + BIND + ":" + PORT)));
}

/* systemd sends SIGTERM on restart; finishing in-flight requests keeps a
   deploy from truncating a recording upload mid-flight. */
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log("[tempest] " + sig + ", closing");
    let left = servers.length;
    servers.forEach(s => s.close(() => { if (--left === 0) process.exit(0); }));
    setTimeout(() => process.exit(0), 10000).unref();
  });
}

console.log("[tempest] site root " + SITE_ROOT);
console.log("[tempest] data      " + DATA_DIR);
if (TLS_ON) console.log("[tempest] acme      " + ACME_DIR);
const missing = ["INGEST_KEY", "SESSION_SECRET", "STAFF_JSON"].filter(k => !env[k]);
if (missing.length) {
  console.log("[tempest] NOT SET: " + missing.join(", ") + " - see server/.env.example");
}
