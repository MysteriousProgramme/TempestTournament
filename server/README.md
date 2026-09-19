# Tempest on your own box

One Node process serves the site **and** runs the management API, so an EC2
instance needs one service, one certificate and one thing to restart. The site
talks to an API on its own origin, which means no CORS and no second hostname.

It runs [`relay/worker.js`](../relay/worker.js) **unchanged**. That file's
router is written against `Request`, `Response`, `URL` and `crypto.subtle`, all
of which Node has natively; the only Cloudflare-specific parts were the two
Durable Object classes, and those talk to a small storage interface that
[`store.js`](store.js) reimplements on the filesystem. So Cloudflare and this
run the same routing, the same auth and the same validation — there is no
second implementation to drift.

You can keep the Cloudflare Worker deployed as a fallback. Both read the same
`worker.js`.

---

## Read this first: you need HTTPS, which means you need a name

**Use an Elastic IP.** The ordinary public IP changes every time the instance
stops, which would silently break the plugins and every share link. That part
is not optional and costs nothing while it is attached.

But you cannot serve the site on `http://<elastic-ip>` and have it work:

**Logging in needs a secure context.** The site derives PBKDF2 hashes with
WebCrypto, and browsers only expose `crypto.subtle` over HTTPS or on localhost.
On plain `http://` at a public address `crypto.subtle` does not exist, so the
page loads perfectly and **nobody can sign in** — no error, just a login that
refuses. Live share links need the same thing.

And a certificate needs a hostname, because:

- **Let's Encrypt refuses `*.compute.amazonaws.com`.** AWS asked for those
  names to be blocked, so certbot fails on the EC2 hostname. (This is a
  blocklist, not the Public Suffix List — PSL listing only changes how rate
  limits are counted.)
- **Certificates for bare IP addresses** are now technically possible from
  Let's Encrypt, but only on the short-lived profile, and client and tooling
  support is still patchy. Check before relying on it.

### The two ways to get a name

**A domain you own** — around £10 a year. Point an A record at the Elastic IP
and use that name throughout. Best option: it is yours, it is memorable, and
you can move the box later without telling anyone.

**`sslip.io`, if you would rather not buy one.** It is a public wildcard DNS
service that resolves `<ip>.sslip.io` straight to `<ip>` — no signup, no
account, no DNS to configure:

```
43-210-250-181.sslip.io  ->  43.210.250.181
```

That is this deployment: the Elastic IP `43.210.250.181` gives the hostname
`43-210-250-181.sslip.io` (dashes and dots both work), and certbot issues for it
normally. `nip.io` does the same thing if sslip.io is ever down.

This is as close to "just use the Elastic IP" as it gets: the address is still
your IP, you have just given it a name so a certificate can exist. The trade is
that the name is ugly, you depend on somebody else's DNS service staying up,
and if you ever change the IP the hostname changes with it — so every share
link you handed out dies. For a name you will paste into plugin configs and
hand to staff, a real domain is worth the tenner. For getting running today,
sslip.io is fine and you can move to a domain later.

### What not to do

- **Self-signed certificate.** It works, but every person hits a full-page
  browser warning, and Perspective and TempestAC will refuse the connection
  outright unless you disable verification — which throws away the point.
- **Plain HTTP.** The site will appear to work right up until someone tries to
  log in.

---

## Setup on an instance you already have

Written for **Ubuntu 24.04 LTS**, which is what this deployment runs. Amazon
Linux 2023 differences are noted inline — mostly `dnf` for `apt-get`.

**Step 0 runs on your own machine. Everything from step 1 runs on the
instance, over SSH.** Those are bash commands on Linux — pasting them into
PowerShell will not work.

This deployment is pinned to:

| | |
| --- | --- |
| Elastic IP | `43.210.250.181` |
| Hostname | `43-210-250-181.sslip.io` |
| Site | `https://43-210-250-181.sslip.io` |

The hostname is that IP with dashes, resolved by `sslip.io`, so there is no DNS
to configure. If the Elastic IP ever changes, the hostname changes with it and
every command below has to change too — that is the cost of not owning a domain.

### 0. Push the code first (on your own machine)

The box installs by cloning, so anything not committed does not exist as far
as the server is concerned.

```bash
git add -A
git commit -m "Site, relay and server"
git push
```

`server/.env` and `server/data/` are gitignored, so no secret can ride along.
Verify before you push if you like:

```bash
git status --short            # neither should appear
```

### 1. Packages

Ubuntu 24.04 ships Node 18, which is end of life, so Node comes from NodeSource
rather than the distro. No nginx: Tempest terminates TLS itself.

```bash
sudo apt-get update
sudo apt-get install -y git certbot
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version          # want v22.x
```

<details><summary>Amazon Linux 2023</summary>

```bash
sudo dnf install -y git certbot nodejs22
node --version
```
</details>

While you are here, confirm the box really is on the Elastic IP the hostname is
built from — if these disagree, certbot will fail and the site will be
unreachable:

```bash
curl -s https://checkip.amazonaws.com     # expect 43.210.250.181
```

### 2. A user that owns nothing else

The process holds `INGEST_KEY`, `SESSION_SECRET` and every staff password
hash, and it is reachable from the internet. It should not run as `ec2-user`
and it must not run as root.

```bash
sudo useradd --system --home /opt/tempest --shell /usr/sbin/nologin tempest
sudo mkdir -p /opt/tempest
sudo chown tempest:tempest /opt/tempest
```

### 3. The code

```bash
sudo -u tempest git clone https://github.com/MysteriousProgramme/TempestTournament.git /opt/tempest
cd /opt/tempest
```

No `npm install` — there are no dependencies.

### 4. Configuration

```bash
# data/ is gitignored, so a fresh clone has no such directory, and the systemd
# unit runs with the filesystem read-only. Create it before first start.
sudo -u tempest mkdir -p server/data
sudo -u tempest cp server/.env.example server/.env
sudo -u tempest chmod 600 server/.env
openssl rand -hex 32    # for INGEST_KEY
openssl rand -hex 32    # for SESSION_SECRET
sudo -u tempest nano server/.env
```

`chmod 600` matters: the file holds the ingest key and the session secret.

#### STAFF_JSON, and the one ordering trap

Open the site (locally is fine), sign in, go to **Staff → Accounts**, and use
**Copy server staff**. Paste the result into `.env` on one line. It only needs
enough people to log in as — after that the Staff tab owns the account list and
this value is ignored until you change it.

**Re-set each password with "Set password" before you copy.** Anything derived
at the old 150,000 iterations is above the cap this API can verify, so it comes
back `409 legacy-credential`. The site handles that gracefully — it signs you in
against the local copy — but it does so *without* an API token, so every
Management tab stays shut and it looks like the server is broken when it is not.
Re-setting stores the credential at 100,000, which both sides can check.

Quickest way to tell: `grep iterations staff.js`. If it says 150000, re-set.

### 5. Start it

```bash
sudo cp server/tempest.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tempest
curl -s localhost:8791/health
```

Expect every line to say it is up:

```
Tempest relay
  relay: up (do storage)
  management: up
  ingest key: set
  session secret: set
  staff accounts: 1
```

### 6. Open the security group

In the EC2 console, on this instance's security group, allow inbound:

| Port | Source | Why |
| --- | --- | --- |
| 80 | anywhere | the ACME challenge, and the redirect to HTTPS |
| 443 | anywhere | the site |
| 22 | your IP only | SSH |

**Do this before the next step.** Let's Encrypt proves you control the host by
fetching a file over port 80; if it is closed, issuance fails with a connection
timeout that looks like a certbot bug and is not.

### 7. TLS, with no reverse proxy

Tempest terminates TLS itself. There is no nginx here — it would have done
exactly one job, and skipping it means one process to run and nothing else on
the box to configure or disturb.

Port 80 stays up purely to answer ACME challenges and redirect everything else
to HTTPS, so **renewal never needs this service stopped and never needs a port
of its own.**

```bash
sudo apt-get install -y certbot
sudo -u tempest mkdir -p /opt/tempest/server/acme /opt/tempest/server/tls
```

Let's Encrypt keeps the private key root-only, and this service deliberately
does not run as root — so a deploy hook copies each new certificate somewhere
the service user can read and restarts it. Install that **before** issuing, and
renewal is then automatic for good:

```bash
sudo install -m 755 /opt/tempest/server/certbot-deploy-hook.sh      /etc/letsencrypt/renewal-hooks/deploy/tempest.sh
```

Tempest has to be serving port 80 for the challenge to be answered. It does that
by itself: with `TLS_CERT`/`TLS_KEY` set but no certificate there yet, it starts
on plain HTTP and says so, rather than refusing to run. That is deliberate —
exiting would make first issuance impossible, because the only way to get a
certificate is to answer a challenge over port 80.

Start it, confirm it is answering, then issue:

```bash
sudo systemctl restart tempest
curl -s localhost/health          # must print the relay block before you go on
```

```bash
sudo certbot certonly --webroot -w /opt/tempest/server/acme      -d 43-210-250-181.sslip.io --agree-tos --no-eff-email -m <your-email>
```

The hook fires on success, copies the certificate and restarts Tempest onto
HTTPS. Check:

```bash
curl -s https://43-210-250-181.sslip.io/health
sudo systemctl list-timers | grep certbot     # renewal is scheduled
```

<details><summary>Dry-run the renewal (worth doing once)</summary>

```bash
sudo certbot renew --dry-run
```

This proves the challenge still gets answered with the service running, which
is the thing that quietly breaks ninety days later.
</details>

### 8. Point the site at itself

[`management.js`](../management.js) already reads:

```js
apiBase: "same-origin",
```

which means the site uses whatever origin it was loaded from — so the one
setting works on the sslip.io name, on a real domain later, and on localhost,
with nothing to change per host.

**If you were also serving this from GitHub Pages, that copy will stop reaching
the API**, because its own origin has no API on it. Send people to the EC2 URL,
or take the Pages deployment down.

### 9. Point the plugins at it

Both plugins take a **base URL** and append their own paths — do not put
`/api/recordings` or anything else on the end. Both are also `enabled: false`
by default, so setting the URL alone does nothing.

Read your ingest key off the box:

```bash
sudo grep '^INGEST_KEY=' /opt/tempest/server/.env
```

**Perspective** — `plugins/Perspective/config.yml` on the game server:

```yaml
web:
  enabled: true
  url: "https://43-210-250-181.sslip.io"
  ingest-key: "<INGEST_KEY>"
  include-transcripts: false
  on-demand: true
  pull-interval-seconds: 10
  allow-insecure: false
```

`include-transcripts: false` with `on-demand: true` is the pairing that keeps
chat and commands on the game server until the site actually asks for a
specific recording. See the note about `autoRequestTranscripts` above: with it
on, the site asks for everything as soon as a mod opens the tab.

**TempestAC** — `plugins/TempestAC/config.yml`:

```yaml
web:
  enabled: true
  url: "https://43-210-250-181.sslip.io"
  ingest-key: "<INGEST_KEY>"
  batch-seconds: 5
```

Note it is `ingest-key`, not `key`, and the same value as Perspective's.

Both connect **outbound only**, so the game server needs no inbound ports and
can stay where it is. Both also refuse to send an ingest key over plain `http`
to a remote host, which is one more reason the certificate matters.

Restart the game server, then watch them arrive:

```bash
sudo journalctl -u tempest -f
```

You want `POST /api/flags 200` and `POST /api/reconcile 200` within a minute or
so, then `POST /api/recordings 200` as recordings finish. After that they show
up under **Management** on the site.

## Moving to another instance

Same hostname, same certificate, same ingest key — so the game server plugins
and every share link carry on working. See [MIGRATE.md](MIGRATE.md). The one
thing that constrains it: an Elastic IP cannot move between AWS regions, and
the hostname is derived from the Elastic IP.

## Updating

```bash
cd /opt/tempest && sudo -u tempest git pull && sudo systemctl restart tempest
```

`server/.env` and `server/data/` are gitignored, so neither is touched.

---

## The data

Everything is under `server/data/`, one JSON file per key:

```
data/catalog/catalog/     accounts, recordings, flags, cases, permissions
data/tournaments/<id>/    one directory per published bracket
```

It is held in memory and written through to disk. That is deliberate: every
read path in the API is a prefix scan (`rec:`, `flag:`, `acct:`), and doing
those against disk would mean reading every recording just to list them.
Memory is bounded by the API's own limits — 5000 flags, plus whatever
recordings the game server still has — so a few hundred MB is the ceiling.

Writes are temp-file-then-rename, which is atomic, so a crash mid-write leaves
the old value rather than half the new one.

**Backing up is copying that directory.** Restoring is copying it back.

```bash
sudo tar czf tempest-$(date +%F).tar.gz -C /opt/tempest/server data
```

Worth a nightly cron job: it holds your staff accounts and every verdict
anyone has recorded.

---

## What moving here gets you

- **No PBKDF2 cap.** Cloudflare refuses more than 100,000 iterations in
  production, which is why `PBKDF2_MAX` exists and why credentials above it
  return `409 legacy-credential`. There is no such limit here. Raising it means
  changing `PBKDF2_ITER` in `app.js` and `PBKDF2_MAX` in `relay/worker.js`
  together, then re-setting every password — do not change one alone.
- **No 128 KiB record limit.** That was a Durable Object rule, and it is why
  long transcripts came through truncated with `eventsTruncated: true`.
  `MAX_RECORD_BYTES` in `server/.env` now sets it; the default here is 2 MiB.
- **One origin.** No CORS, one certificate, one restart.
- **No reverse proxy.** Tempest terminates TLS itself, so there is no nginx to
  install, configure or keep in step — which also means it can sit on a box
  that is already running someone else's web server without touching it.
- **The data is yours**, in files you can read, back up and grep.

## What it costs you

- **You own uptime.** No global edge, no automatic failover. If the instance
  goes down the site goes down, so the systemd unit restarts on failure and
  you should watch `journalctl -u tempest`.
- **You own patching** — the OS, Node, nginx and certificate renewal.
- **One region.** Players far from it will see the site load more slowly.
  Nothing here is latency-sensitive, so this mostly does not matter.

---

## Troubleshooting

| What you see | Why |
| --- | --- |
| Login does nothing, no error | Not a secure context — you are on `http://`, or on a bare IP. This is the one at the top of this file. |
| certbot: "not a valid domain" on the EC2 name | Let's Encrypt blocks `amazonaws.com` hostnames. Use your own domain or `<ip>.sslip.io`. |
| Log says "no usable TLS certificate ... serving PLAIN HTTP" | Normal before first issuance. If it persists after certbot succeeded, the deploy hook did not run — `sudo /etc/letsencrypt/renewal-hooks/deploy/tempest.sh` then restart. |
| certbot: "Connection refused" fetching the challenge | Either nothing is on port 80, or it is bound to loopback. `curl -s localhost/health` working while the outside cannot reach it means `HOST=127.0.0.1` in `server/.env` — set `HOST=0.0.0.0`. Check with `sudo ss -ltnp \| grep ':80 '`. |
| Same, and `HOST` is already `0.0.0.0` | The security group is not open on 80. |
| Service exits with `EACCES` on listen | `AmbientCapabilities=CAP_NET_BIND_SERVICE` missing from the unit — that is what lets a non-root process bind 80 and 443. |
| `EADDRINUSE` on 80 or 443 | Something else on the box already serves them. `sudo ss -ltnp \| grep -E ':(80\|443) '` to find it. |
| certbot renewal fails months later | Port 80 stopped answering the challenge. `sudo certbot renew --dry-run` reproduces it; Tempest must be running for it to pass. |
| `413` on recording ingest | `client_max_body_size` in nginx is below the recording size. Default is 1m. |
| `health` says `NO STORAGE BOUND` | `server.js` did not set the bindings — check the service actually started that file. |
| `ingest key: MISSING` | `server/.env` is unreadable by the `tempest` user, or the key is blank. |
| `403 bad ingest key` from a plugin | Plugin key does not match `INGEST_KEY`. It must be at least 16 characters. |
| `401` on everything after a restart | `SESSION_SECRET` changed, so every token is void. Log in again. |
| Everyone locked out | Change `STAFF_JSON` and restart: it is re-applied whenever it changes, which is the way back in. |
