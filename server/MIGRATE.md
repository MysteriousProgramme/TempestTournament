# Moving Tempest to another instance

The goal is a move where **nothing outside the box has to change**: same
hostname, same certificate, same ingest key. If you get that right, the game
server plugins, every share link you have handed out and every staff login
carry on working and never know anything happened.

That is achievable because all four of those are portable:

| Thing | Where it lives | Moves how |
| --- | --- | --- |
| The code | git | `git clone` |
| Accounts, flags, recordings, cases, brackets | `server/data/` | copy the directory |
| `INGEST_KEY`, `SESSION_SECRET`, `STAFF_JSON` | `server/.env` | copy the file |
| The certificate | `/etc/letsencrypt/` | copy the directory |
| The hostname | the Elastic IP | reassign it |

---

## The one constraint: stay in the same region

**An Elastic IP cannot move between AWS regions.**

The hostname `43-210-250-181.sslip.io` is derived from the Elastic IP
`43.210.250.181`. Keep that IP and the hostname is unchanged, the certificate
stays valid, and nothing else needs touching.

Launch in a different region and you get a different IP, therefore a different
hostname, therefore a new certificate, therefore edits to both plugin configs —
and every share link already issued points at an address that no longer serves
the site.

So: **launch the new instance in the same region** (`ap-southeast-7`, Asia
Pacific / Thailand).

If you actually want a different region — because that one is far from your
players — do it by buying a domain first. A domain you own points anywhere,
which makes this the last migration that ever costs you a hostname.

---

## Sizing

Tempest is small. Measured on the current box: **14.5 MB resident** with the
service running and answering. It is one Node process with no database, no
runtime dependencies and no build step.

What actually consumes memory is the store, which is held in memory and written
through to disk. Its ceiling is set by the limits in `relay/worker.js` and
`server/.env`:

- 5,000 flags — a few MB
- up to 500 recordings at `MAX_RECORD_BYTES` (2 MiB) — up to ~1 GB in the worst
  case, and far less in practice, because most recordings are a summary plus a
  short transcript

So:

| Instance | Verdict |
| --- | --- |
| `t3.micro` (1 GB) | Works, but the recording ceiling is uncomfortably close. |
| **`t3.small` (2 GB)** | **Recommended.** Comfortable headroom for the store. |
| `t3.medium` (4 GB) | Only if you expect heavy replay use with long transcripts. |

Disk: **20 GB gp3** is plenty. Replay files stay on the game server — Tempest
only ever receives summaries and transcripts.

If memory is ever the binding constraint, lower `maxRecordings` in
`management.js` or `MAX_RECORD_BYTES` in `server/.env` before buying a bigger
box.

---

## The move

Roughly twenty minutes, most of it waiting for `apt-get`.

### 1. Launch the new instance

In the EC2 console, same region as the old one:

- **Ubuntu Server 24.04 LTS**, `t3.small`, 20 GB gp3
- The same key pair you use for the current box
- A security group allowing **22** from your IP, **80** and **443** from
  anywhere

Do **not** assign the Elastic IP yet. It is still serving the live site.

### 2. Prepare the new box

Everything here is the normal setup from [README.md](README.md), steps 1 to 3:

```bash
sudo apt-get update
sudo apt-get install -y git certbot
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

```bash
sudo useradd --system --home /opt/tempest --shell /usr/sbin/nologin tempest
sudo mkdir -p /opt/tempest
sudo chown tempest:tempest /opt/tempest
sudo -u tempest git clone https://github.com/MysteriousProgramme/TempestTournament.git /opt/tempest
sudo -u tempest mkdir -p /opt/tempest/server/data /opt/tempest/server/acme /opt/tempest/server/tls
```

Do not start the service yet — it has no configuration.

### 3. Take everything off the old box

On the **old** instance. Stopping the service first means the data directory
cannot be written to mid-copy:

```bash
sudo systemctl stop tempest
sudo tar czf /tmp/tempest-move.tgz -C /opt/tempest/server data .env
sudo tar czf /tmp/tempest-le.tgz -C /etc letsencrypt
sudo chown ubuntu:ubuntu /tmp/tempest-move.tgz /tmp/tempest-le.tgz
ls -lh /tmp/tempest-*.tgz
```

The site is down from here until step 6. It is a couple of minutes.

### 4. Copy them across

From your own machine, via `scp` (Windows has it built in). Down from the old
box, up to the new one:

```bash
scp -i <your-key.pem> ubuntu@43.210.250.181:/tmp/tempest-*.tgz .
scp -i <your-key.pem> tempest-move.tgz tempest-le.tgz ubuntu@<NEW-INSTANCE-IP>:/tmp/
```

`<NEW-INSTANCE-IP>` is the new box's ordinary public IP — it does not have the
Elastic IP yet.

### 5. Restore on the new box

```bash
sudo tar xzf /tmp/tempest-move.tgz -C /opt/tempest/server
sudo chown -R tempest:tempest /opt/tempest/server/data /opt/tempest/server/.env
sudo chmod 600 /opt/tempest/server/.env
sudo tar xzf /tmp/tempest-le.tgz -C /etc
```

```bash
sudo cp /opt/tempest/server/tempest.service /etc/systemd/system/
sudo install -m 755 /opt/tempest/server/certbot-deploy-hook.sh \
     /etc/letsencrypt/renewal-hooks/deploy/tempest.sh
sudo /etc/letsencrypt/renewal-hooks/deploy/tempest.sh
sudo systemctl daemon-reload
sudo systemctl enable tempest
```

The deploy hook copies the certificate into `server/tls/` where the service can
read it, exactly as it did the first time.

### 6. Move the Elastic IP

In the EC2 console: **Elastic IPs → 43.210.250.181 → Disassociate**, then
**Associate** it with the new instance.

This is the cutover. The hostname now points at the new box.

```bash
sudo systemctl start tempest
curl -s https://43-210-250-181.sslip.io/health
```

Every line should report up, with the same staff account count as before.

### 7. Check before you throw anything away

```bash
sudo ss -ltnp | grep -E ':(80|443) '     # node on both
sudo journalctl -u tempest -n 30 --no-pager
```

Then, from anywhere:

- Open `https://43-210-250-181.sslip.io` and **log in** — proves the
  certificate and the accounts came across.
- **Management → AntiCheat** should show the flags you already had.
- Watch the game server reconnect: `sudo journalctl -u tempest -f`, expect
  `POST /api/reconcile 200` within a minute of the plugins' next poll.

Nothing on the game server changes. The URL is the same and `INGEST_KEY` came
across in `.env`.

### 8. Keep the old box for a day

Stop it rather than terminating it:

```bash
sudo systemctl disable --now tempest
```

Then stop the instance in the console. If anything turns out to be missing, the
data is still there. Terminate it once you are satisfied — and remember the
Elastic IP is no longer attached to it, so terminating costs you nothing.

---

## If you cannot keep the Elastic IP

Then the hostname changes, and four things change with it:

1. `sudo certbot certonly --webroot -w /opt/tempest/server/acme -d <new-host>`
2. `TLS_CERT` / `TLS_KEY` in `server/.env` still point at `server/tls/`, so only
   the deploy hook's `DOMAIN=` needs editing
3. `web.url` in **both** plugin configs on the game server
4. Any share link already handed out is dead — they encode the address

`apiBase: "same-origin"` in `management.js` means the site itself needs no
change, whatever the hostname becomes.
