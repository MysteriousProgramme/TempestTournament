/* ============================================================
   Tempest — Durable Object storage, on a filesystem
   ============================================================
   The point of this file is that relay/worker.js does not change.

   Both Durable Object classes in the Worker talk to exactly one small
   interface - get / put / delete / deleteAll / list - and nothing else about
   them is Cloudflare-specific. Reimplement that interface and the same Worker
   runs here, so the Cloudflare deploy and the EC2 deploy are the same code
   rather than two things that drift apart.

   Everything lives in memory and is written through to disk, one JSON file
   per key. That is not laziness about a database: every read path in the
   Worker is a prefix scan (`rec:`, `flag:`, `acct:`), and doing those against
   disk would mean reading every recording to list them. Memory is bounded by
   the Worker's own limits - 5000 flags, whatever recordings the game server
   still has - so a few hundred MB is the ceiling, and a t3.small has room.

   Durability is temp-file-then-rename, which is atomic on POSIX, so a crash
   mid-write leaves the old value rather than half the new one.

   Backing up is copying the data directory. Restoring is copying it back.
   ============================================================ */

import { promises as fs } from "node:fs";
import path from "node:path";

/* Keys contain characters that are awkward in filenames (`rec:42`), so they
   are percent-encoded going to disk and decoded coming back. Reversible, and
   it keeps the directory readable enough to debug by eye. */
const toFile = key => encodeURIComponent(String(key)) + ".json";
const fromFile = name => decodeURIComponent(name.replace(/\.json$/, ""));

export class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.mem = new Map();
    this.ready = this.#load();
  }

  async #load() {
    await fs.mkdir(this.dir, { recursive: true });
    let names = [];
    try { names = await fs.readdir(this.dir); } catch (e) { return; }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, name), "utf8");
        this.mem.set(fromFile(name), JSON.parse(raw));
      } catch (e) {
        // A single unreadable key must not stop the service from starting -
        // losing one recording is survivable, refusing to boot is not.
        console.error("[store] skipping unreadable key " + name + ": " + e.message);
      }
    }
  }

  async #write(key, value) {
    const final = path.join(this.dir, toFile(key));
    const tmp = final + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(value));
    await fs.rename(tmp, final);
  }

  async #remove(key) {
    try { await fs.unlink(path.join(this.dir, toFile(key))); } catch (e) {}
  }

  /* get("k") -> value, or get(["a","b"]) -> Map, matching the DO API. */
  async get(key) {
    await this.ready;
    if (Array.isArray(key)) {
      const out = new Map();
      for (const k of key) if (this.mem.has(k)) out.set(k, this.mem.get(k));
      return out;
    }
    return this.mem.get(key);
  }

  /* put("k", v) or put({ k: v, ... }), matching the DO API. */
  async put(key, value) {
    await this.ready;
    const pairs = typeof key === "object" && key !== null && value === undefined
      ? Object.entries(key)
      : [[key, value]];
    for (const [k, v] of pairs) {
      this.mem.set(k, v);
      await this.#write(k, v);
    }
  }

  async delete(key) {
    await this.ready;
    for (const k of Array.isArray(key) ? key : [key]) {
      this.mem.delete(k);
      await this.#remove(k);
    }
  }

  async deleteAll() {
    await this.ready;
    const keys = [...this.mem.keys()];
    this.mem.clear();
    for (const k of keys) await this.#remove(k);
  }

  /* Lexicographic by key, which the Worker relies on: the flag ring is keyed
     `flag:` plus a zero-padded sequence precisely so that the oldest sort
     first and can be trimmed off the front. */
  async list(opts) {
    await this.ready;
    const o = opts || {};
    let keys = [...this.mem.keys()].sort();
    if (o.prefix) keys = keys.filter(k => k.startsWith(o.prefix));
    if (o.start) keys = keys.filter(k => k >= o.start);
    if (o.end) keys = keys.filter(k => k < o.end);
    if (o.reverse) keys.reverse();
    if (typeof o.limit === "number") keys = keys.slice(0, o.limit);
    const out = new Map();
    for (const k of keys) out.set(k, this.mem.get(k));
    return out;
  }
}

/* ---------- the binding the Worker expects ----------
   env.CATALOG and env.TOURNAMENTS are namespaces: idFromName gives an id,
   get(id) gives a stub, and the stub takes a fetch. Each instance gets its own
   directory and its own store, which is what makes one-object-per-tournament
   work the same way it does on Cloudflare. */
export function namespace(root, DurableClass) {
  const instances = new Map();
  return {
    idFromName: name => String(name),
    get(id) {
      let inst = instances.get(id);
      if (!inst) {
        const store = new FileStore(path.join(root, encodeURIComponent(id)));
        inst = new DurableClass({ storage: store });
        instances.set(id, inst);
      }
      return { fetch: (url, init) => inst.fetch(new Request(url, init)) };
    },
  };
}
