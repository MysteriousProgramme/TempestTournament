# Tempest relay and management API

> **Not on Cloudflare?** This same `worker.js` runs on a plain Node host —
> nothing in it is Cloudflare-specific except the two Durable Object classes,
> and those talk to a storage interface `server/store.js` reimplements on the
> filesystem. To run the site and this API together on your own box (AWS EC2 or
> anything else), see [../server/README.md](../server/README.md). Everything
> below still describes the routes and the contract either way.

One Cloudflare Worker doing two unrelated jobs.

**The live relay** holds the current bracket for a tournament so a share link
updates itself. No accounts, no secrets — the tournament id in the public link
is the first 16 hex of `SHA-256(write token)`, so anyone with the link can read
it and only the holder of the token can write it.

**The management API** receives what the server plugins push — Perspective
recordings and TempestAC flags — and serves them back to signed-in staff.

Neither is required to use Tempest. The site works standalone; this is what
makes it work for more than one person.

## Deploy

```bash
cd relay
npx wrangler deploy
```

That gives you a URL like `https://tempest-tournament-relay.<you>.workers.dev`.
Open it in a browser — it prints a health check saying which pieces are wired.

The relay half works immediately. The management half needs three secrets:

```bash
npx wrangler secret put INGEST_KEY       # a long random string you invent
npx wrangler secret put SESSION_SECRET   # a different long random string
npx wrangler secret put STAFF_JSON       # paste from the site, see below
```

- **INGEST_KEY** — what the plugins authenticate with. Anyone holding it can
  write recordings and flags into your catalogue, so treat it like a password
  and never put it anywhere a browser can see.
- **SESSION_SECRET** — signs staff session tokens. Rotating it logs everyone
  out, which is the intended panic button.
- **STAFF_JSON** — a ONE-TIME bootstrap so there is somebody to log in as.
  Generate it with **Copy server staff** on the site's Staff tab. It contains
  PBKDF2 hashes, never passwords. It is imported the first time anything asks
  and the store is empty; after that the API owns the account list and this
  secret is ignored. You do **not** re-paste it when staff change.

## Point the site at it

In `management.js`:

```js
apiBase: "https://tempest-tournament-relay.<you>.workers.dev",
```

That is all. The site fills in the endpoints, and when you log in it exchanges
your Tempest credentials for a session token so the API will talk to it.

## Point the plugins at it

**Perspective** (`config.yml`). Two ways to run it — pick one:

*Recommended: pull on demand.* Nothing personal leaves the server until a
member of staff asks for a specific recording.

```yaml
web:
  enabled: true
  url: "https://tempest-tournament-relay.<you>.workers.dev"
  ingest-key: "the INGEST_KEY you set"
  include-transcripts: false   # stays off
  on-demand: true
  pull-interval-seconds: 10
```

Recordings show up as summaries. When a mod hits **Load transcript** on one,
the site records the request, Perspective collects it on its next poll and
sends that recording's chat, commands, joins, leaves, deaths and flags. The
row says *Requested* until it lands. No open port is needed — every
connection is outbound from your server.

*Or: push everything.* Simpler, but it mirrors every player's chat and
commands to the site whether anyone ever reads them.

```yaml
web:
  enabled: true
  url: "https://tempest-tournament-relay.<you>.workers.dev"
  ingest-key: "the INGEST_KEY you set"
  include-transcripts: true   # read docs/PRIVACY.md first
```

One trap worth knowing: `include-transcripts` only applies at the moment a
recording is finalised. Turning it on later does **not** backfill anything
already recorded — `reconcile` only re-sends recordings the site is missing,
not ones it already holds with thinner data. On-demand has no such gap, since
any recording can be requested at any time.

**TempestAC** (`config.yml`):

```yaml
web:
  enabled: true
  url: "https://tempest-tournament-relay.<you>.workers.dev"
  ingest-key: "the same INGEST_KEY"
```

## Contract

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/t/:id` | GET | none | read a published bracket (`304` with `If-None-Match`) |
| `/t/:id` | PUT / DELETE | `X-Write-Token` | publish or withdraw one |
| `/api/recordings` | POST | `Bearer INGEST_KEY` | one Perspective recording |
| `/api/reconcile` | POST | `Bearer INGEST_KEY` | `{numbers:[…]}` in, `{missing:[…]}` out |
| `/api/flags` | POST | `Bearer INGEST_KEY` | one violation or `{flags:[…]}` |
| `/api/requests` | GET | `Bearer INGEST_KEY` | what staff have asked for: `{numbers:[…]}` |
| `/api/requests` | POST | `Bearer <token>` | `{number}` for one, or `{numbers:[…]}` for a batch |
| `/api/login` | POST | none | `{username,password}` in, session token out |
| `/api/accounts` | GET | `Bearer <token>` | the account list, credentials withheld |
| `/api/accounts` | POST | `Bearer <token>` | create or update one (Owner+) |
| `/api/accounts/delete` | POST | `Bearer <token>` | remove one (Owner+) |
| `/api/recordings` | GET | `Bearer <token>` | the catalogue |
| `/api/flags` | GET | `Bearer <token>` | the flag list |
| `/api/cases` | GET | `Bearer <token>` | who has claimed or ruled on what |
| `/api/cases` | POST | `Bearer <token>` | `claim` / `release` / `resolve` / `reopen` |
| `/api/perms` | GET | `Bearer <token>` | the site's capability ladder, as edited |
| `/api/perms` | POST | `Bearer <token>` | replace it (needs `MIN_MANAGE_LEVEL`, default 6) |
| `/` | GET | none | health check |

Reads need a role level of at least `MIN_READ_LEVEL` (default 3, Mod on the
shipped ladder). Change it in `wrangler.toml`.

## Cases

A case is one anticheat check against one player. The bundling is derived from
the flags by the site every time, so the store holds only the human part:

```json
{ "key": "Notch|Reach A", "player": "Notch", "check": "Reach A",
  "status": "resolved", "result": "hacking",
  "claimedBy": "somemod", "claimedAt": 0,
  "resolvedBy": "somemod", "resolvedAt": 0, "note": "" }
```

`status` is `open`, `claimed` or `resolved`; `result` is `hacking` or
`false-call`. The POST body is `{key, player, check, action}` plus `result` when
the action is `resolve`. `claimedBy` and `resolvedBy` are taken from the session
token, never from the body — a client cannot claim a case as somebody else.

This has to be server state. Two mods working the same pile is the failure it
exists to prevent, and a verdict has to outlive the browser that recorded it.

## The capability ladder

`staff.js` ships the defaults; an owner can move a capability up or down the
ladder on the Staff tab. Those overrides live here so a demotion holds on every
device rather than only the browser it was typed in:

```json
{ "caps": { "broadcast": 2, "tournament.reset": null },
  "subs": { "event-mod": ["events.assist", "management.anticheat"] } }
```

Only the difference from the file is stored. A `null` level means no rank grants
it — sub-role or nothing. A POST replaces the whole set rather than merging, so
clearing an override on one device clears it everywhere.

**This does not gate this API.** Reads and writes here are checked against the
account's own level in `requireLevel`, which the site cannot influence. The
ladder above is the *website's* own gating, and the website runs in the
visitor's browser — see below.

## Why the read side is authenticated

Recordings carry chat and the commands players ran; flags carry who was
suspected of what. That is personal data about your players. The website's own
role checks run in the visitor's browser and protect nothing on their own — the
gate that actually matters is this one. Do not remove it to make debugging
easier and then forget.

## Storage and limits

- Brackets: one Durable Object per tournament id, 512 KB per bracket.
- Management: a single `Catalog` Durable Object holding every recording
  (`rec:<number>`) and a bounded ring of the most recent 5000 flags.
- A Durable Object value caps at 128 KiB. A recording with a very long
  transcript is trimmed from the end of its event list to fit and marked
  `eventsTruncated`, rather than being rejected — the summary is the part you
  cannot reconstruct.

If `wrangler deploy` rejects Durable Objects on your account, the relay half
can fall back to KV (see the commented block in `wrangler.toml`), but the
management API needs the `CATALOG` Durable Object either way.
