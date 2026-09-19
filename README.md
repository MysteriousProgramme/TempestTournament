# Tempest

Home of **Tempest SMP** and **Tempest PvP/FFA**: a server directory, a player
roster, and a tournament builder with broadcast-ready brackets.

## Pages

| Page | Who sees it | What it does |
| --- | --- | --- |
| **Home** | everyone | Landing page: featured servers, what Tempest is, supported gamemodes. |
| **Servers** | everyone | The server directory, with live player counts and copy-to-clipboard addresses. |
| **Events** | everyone | The calendar: events and tournaments, when, where, who runs them and who works them. |
| **Participants** | everyone | The roster: team, tier, and who each player is on Discord. |
| **Bracket** | everyone | The tournament bracket. Recording results needs Mod or above. |
| **Profile** | everyone | Your own account: rank, sub-roles, what you can do, events you are on. |
| **Tournament Maker** | Manager and up | Add players, pick the format and gamemode, generate the bracket. |
| **Next Match** | Head Mod and up | Broadcast face-off graphic for the next match. |
| **Schedule** | Head Mod and up | Broadcast schedule board for a given day. |
| **Perspective** | Mod and up | Replay catalogue: chat, commands, joins, leaves, deaths and flags per recording. |
| **AntiCheat** | Mod and up | Every TempestAC flag, filterable by check and by player. |
| **Staff** | Owner and Founder | Accounts, passwords, role and sub-role assignment. |

Everyone lands on **Home**; a share link still opens straight onto the bracket,
always view-only regardless of who is signed in. See
[Accounts and roles](#accounts-and-roles) for the full ladder.

The nav groups those pages into seven items: **Home**, **Servers**, **Events**,
**Tournament** (Bracket, Participants, Tournament Maker), **Broadcast** (Next
Match, Schedule), **Management** (Perspective, AntiCheat) and **Staff**. Your profile is the chip in the top right —
click it. A menu only lists what your role can open, and hides itself entirely
when that leaves it empty, so a visitor sees Home, Servers, Events and a
Tournament menu holding just Bracket and Participants.

On a narrow screen the tab row scrolls sideways, which would clip a popup, so
the menus flatten and their items join the row instead.

## Participants and Discord

The **Participants** tab is the roster: seed, skin, Minecraft name, team, tier,
and who that player is on Discord. Anyone can read it; only the host sees the
Edit and Remove buttons.

Set someone's Discord from the **Discord** box on the Tournament Maker add
form, or by hitting **Edit** on the roster. The field takes either a handle or
a numeric user id, and which one you typed is worked out from the shape — but
**the two are not equivalent**, so it is worth knowing which you want:

| You enter | Roster shows | Profile picture | Clicking the chip copies |
| --- | --- | --- | --- |
| `zactempest` (a handle) | `@zactempest` | no | the handle |
| `188342567890123456` (an id) | their real username, once resolved | yes, over the skin head | a ready-to-paste ping |

**Enter the numeric id if you want the avatar and username.** A handle is only
ever stored and displayed as typed, because Discord has no public way to go
from a handle back to an account. An id, on the other hand, resolves to the
current username and avatar — and keeps working after the person renames
themselves, which a handle does not.

To copy someone's id, turn on Developer Mode in Discord
(Settings, Advanced) then right-click them and choose Copy User ID.

### How the lookup works, and what it costs you

Discord's own API refuses this: `GET /users/:id` needs a bot token and will not
answer a browser cross-origin. A static site therefore cannot ask Discord
directly. Instead each id is resolved through a public read-only lookup
service, with a second one as a fallback.

Two consequences, both deliberate:

- **A participant's Discord id is sent to a third party** to be looked up.
  Nothing else about them is sent, and only ids ever leave the page. If that
  is not acceptable for your event, use handles instead and no lookup happens.
- **Nothing depends on those services staying up.** Every failure falls back to
  the default Discord avatar — which is derived from the id itself, with no
  network call — and the raw id. An id with no account behind it is shown
  greyed out and stays an id.

Resolved profiles are cached in `localStorage` for a day, so a large roster
costs one lookup per person rather than one per render.

**Copy Discord list** puts the whole linked roster on the clipboard as
`Minecraft name - Discord` lines, ready to paste into a channel to ping
everyone at once.

The field is optional, per-player, and travels with share links. Links made
before this existed still load - those players simply come in unlinked.

## Servers

### Editing the list in the app

Signed in as the host, the Servers page gains **Add a server**, plus **Edit**
and **Remove** on every row. The form covers name, address, port, region,
description, card colour, gamemodes and whether it shows as a featured card.
Visitors see none of this — just the list, the status and Copy IP.

Two things to know about where those edits live:

- **They are kept in this browser**, in `localStorage` under `tsmp_servers`,
  not written back to `servers.js`. So they follow the host's device, not the
  deployed site. To change the list for everyone who loads the page, edit
  `servers.js` (below) and redeploy.
- **Reset list** throws the local copy away and goes back to whatever
  `servers.js` ships, so the file is always the fallback rather than something
  the app can overwrite.

Because the list is per-browser, a tournament stores a small snapshot of its
server (name, address, region) alongside the id. That way someone opening a
share link still sees where the match is played, even though that server was
never in their own list. Removing a server that the current tournament is set
to warns you and clears it.

### Editing `servers.js`

`servers.js` defines `window.TEMPEST_SERVERS` and is the list everyone gets on
first load. It is a plain script rather than a JSON file so the site keeps
working with no build step and when opened straight off disk.

Each entry looks like this:

```js
{
  id: "minemen-eu",          // unique; stored in the saved tournament
  name: "Minemen Club EU",
  host: "eu.minemen.club",   // live status is looked up from this
  port: 25565,               // omit for the default
  region: "EU",
  modes: ["sword", "pot"],   // ids from MODES in app.js
  blurb: "One short line.",
  accent: "0,89,255",        // R,G,B wash on the featured card
  featured: true,            // one of the three cards at the top
}
```
The starter entries are well-known public servers, included as examples —
swap in whatever you actually run tournaments on.

### The list itself

Featured servers are the three cards at the top: name, tagline, live player
count and a **Play** button. Play copies the address — a web page cannot
launch Minecraft, so it hands you the thing you need to paste into it. The
faint artwork behind each card is the server's own icon.

Below that is the table, one row per server:

| Column | Where it comes from |
| --- | --- |
| Flag | the region tag, or a `country` code on the entry if you set one |
| Icon | the icon the server itself serves, from the status lookup |
| Server | the name, with the address and description underneath |
| Players | live `online / max`, shown exactly as reported |
| Version | the server software and version string it reports |
| Status | Online, Offline, or Unknown if the lookup could not be reached |

A region is not a country, so the flag is region-level by default (NA, EU, OCE
and so on). Set `country` on an entry, or fill in the Country flag box in the
editor, to pin an exact one. `GLOBAL` deliberately gets no flag.

The header button cycles the ordering between most players, name, and region.
Ordering by players can only work once the lookups have landed, so the list
re-sorts itself one time when they do. Below 1200px wide the table collapses
to a stacked card per server.

### Live status

Status comes from [mcstatus.io](https://api.mcstatus.io), with
[mcsrvstat.us](https://api.mcsrvstat.us) as a fallback. mcstatus.io is the
primary because it reliably returns the server icon and a version string, which
two of the columns need; mcsrvstat.us answers with neither when it is under
load. Results are cached per host in `sessionStorage` for a minute, so
switching tabs does not re-hammer them.

If both are unreachable the row shows "Unknown" and em-dashes rather than
failing — the page never depends on them being up.

A host can set a server on the Tournament Maker, or hit **Host here** on the
Servers page. The tournament stores the server's `id` plus a small snapshot of
it, it is entirely optional, and it travels with share links.


## Events

The **Events** tab is the calendar. Two kinds live on it, and they are separate
things with separate people: an **Event** and a **Tournament**. Both show side
by side, live first, then soonest, with anything finished dropped to the bottom.

Each entry carries its kind, a start time, a server, a status (Upcoming, Live
now, Finished), a description, a host, and the staff working it. Times are
stored as entered and shown in each visitor's own timezone, with a relative
hint like "in 3 days".

Anyone can read the calendar. Everything else splits down the middle:

| | Events | Tournaments |
| --- | --- | --- |
| Create and edit | `events.host` | `tournaments.host` |
| Be listed as working it | `events.assist` | `tournaments.assist` |
| Held by rank | Manager and up | Manager and up |
| Held by sub-role | **Event Host** | **Tournament Overseer** |
| Working sub-roles | **Event Mod**, **Event Staff** | **Tournament Mod**, **Tournament Staff** |

So an Event Host can put on an event but not a tournament, and a Tournament
Overseer the reverse. The kind dropdown only offers what you are allowed to
run, and the host and staff pickers rebuild when you switch kinds so they never
offer the wrong people.

The two `assist` capabilities are deliberately **not** granted by any rank.
Working an event or a tournament comes from the sub-role and nothing else,
which is the point of the Staff Roles group — a Manager can schedule a
tournament without being one of the people running it.

Events live in this browser under `tempest_events`, the same as servers and
accounts. There is no server to sync them, so a calendar built on your machine
is yours until you put it somewhere shared.
## Management

Two read-only views over what the server plugins produce, behind a
**Management** menu that is Mod and above.

- **Perspective** — the replay catalogue. Every recording the server kept,
  with the chat, commands, joins, leaves, deaths and flags inside it. Open one
  for a timeline, with the offset from the start of the recording against each
  line, and a pill per kind to filter the noise out. Opening the tab asks the
  server for every transcript it is missing, in one call, so the catalogue
  fills itself in — see `autoRequestTranscripts` below.
- **AntiCheat** — every flag TempestAC raised, newest first, filterable by
  check and by player.

Both are gated separately in `staff.js`, so you can move one without the other:

```js
"management.perspective": 3,   // Mod
"management.anticheat":   3,   // Mod
```

Drop `management.anticheat` to `1` if you want plain Staff reading flags
without access to replays.

### The Staff tab

The Staff tab is four sub-tabs, not one long page, and the bar only offers the
ones your rank can open:

| Sub-tab | Needs | What it holds |
| --- | --- | --- |
| **Dashboard** | `staff.dashboard` (Mod) | what is waiting to be looked at |
| **Permissions** | `staff.dashboard` to read, `staff.manage` to change | the capability ladder |
| **Accounts** | `staff.manage` (Owner) | everyone, grouped by rank |
| **Role colours** | `staff.manage` (Owner) | the gradients |

A Mod therefore lands on a two-tab page; an Owner gets all four. If a permission
change takes away the tab you are standing on, the bar falls back to the first
one still open rather than leaving you on a blank panel.

### The dashboard

It answers one question: what is waiting to be looked at.

- **The tiles** — open cases, cases you are holding, flags in the last 24
  hours, recordings (and how many are still waiting on a transcript), and the
  size of the team. Each one is the way in to what it counts.
- **Needs a look** — anticheat flags grouped into *cases*. A case is one check
  against one player, so fifty Reach flags on the same person is one row and one
  decision, not fifty. Each row carries the flag count, the peak violation
  level, when it last fired and the most recent debug line.
- **Latest replays** — the five newest recordings, straight through to
  Perspective.
The Dashboard sub-tab carries a count of open cases, so you can see there is
something to do without opening it.

### Editing permissions

The **Permissions** sub-tab is the capability ladder, generated from the live
values rather than a written list — a capability added to `staff.js` turns up
here on its own and cannot drift out of step with the checks it describes.
Everyone with `staff.dashboard` can read it; an Owner can change it:

- **The rank that unlocks it.** Any role, or **Nobody by rank** — which is a
  real choice, not an empty one. It is how `events.assist` already works, and
  the only way to make something sub-role-only.
- **Which sub-roles grant it** regardless of rank, as toggles.

Changes apply immediately, and a row that no longer matches `staff.js` is marked
**changed** with the shipped value on hover. **Reset all** puts everything back.

You cannot lock yourself out: Owner and Founder bypass every check whatever the
ladder says, which is also why an Owner sees every row marked as theirs.

Only the difference from `staff.js` is stored, so editing the file still moves
anything you have not deliberately overridden. That difference goes to this
browser **and** to the relay API, so a demotion holds on every device; if the
API cannot be reached the note under the matrix says so instead of implying the
change travelled. **Copy permissions** gives you the
`window.TEMPEST_CAPABILITIES` and `window.TEMPEST_SUBROLE_CAPABILITIES` blocks
to paste into `staff.js` when you want it in the deploy too.

The account list is grouped by rank rather than run together, so the shape of
the team reads without going name by name.

A case is **claimed** by one person, then ruled **Hacking** or **False call**.
Only the person holding a case can rule on it; anyone else sees who has it.
Resolved cases are dimmed but stay reachable through the filter, and can be
reopened.

**Claiming lives in the API, not the browser** — that is the whole point of it.
Two mods working the same pile is the failure this prevents, and a verdict
somebody recorded last week has to outlive the tab it was recorded in. The
bundling itself is derived from the flags every time, so only the human part
gets stored. With no API reachable, every case reads as open and the dashboard
says so rather than pretending nothing is claimed.

Both halves are gated in `staff.js`:

```js
"staff.dashboard": 3,   // Mod - see it at all
"cases.resolve":   3,   // Mod - claim and rule
```

Those are starting values — see **Editing permissions** below for changing them
without touching the file.

### Where the data comes from

With `apiBase` set (including `"same-origin"`), both tabs fill themselves in
and the two URLs below can stay blank. Set them only to read from something
other than the relay API:

```js
recordingsUrl: "https://example.net/api/recordings",
flagsUrl:      "https://example.net/api/flags",
```

Each should return a JSON array (or `{"recordings": []}` / `{"flags": []}`).
The shapes are exactly what the plugins already produce — the exact field
lists are documented in `management.js`. Results are cached in this browser,
so a tab still shows the last good copy when the source is unreachable, and
says so. **Import** loads a JSON file by hand, which makes both tabs usable
before anything is serving them.

**Never put an ingest key in `management.js`.** That file ships to the
browser. Perspective's ingest key lets the holder POST recordings into your
catalogue; it belongs on the server. The URLs above are for reading only.

### How the plugins reach a static site

Tempest cannot receive a POST — it is a static site. The `relay/` Worker is
what stands in the middle: the plugins push to it, and the site reads from it
with a staff session token. See [relay/README.md](relay/README.md) to deploy it.

**Perspective** can work two ways:

- **Pull on demand** (`web.on-demand: true`, `include-transcripts: false`).
  Recordings arrive as summaries, and the transcript follows when the site asks
  for it. Perspective collects the outstanding requests on its next poll, so no
  inbound port is needed — every connection is outbound from the game server.

  By default the site asks for **every** missing transcript the moment somebody
  opens the Perspective tab (`autoRequestTranscripts` in `management.js`). That
  is a real trade: on-demand exists so chat and commands stay on the game server
  until a specific recording is wanted, and asking for all of them on sight is
  in practice the same as mirroring everything. Set
  `autoRequestTranscripts: false` to go back to one deliberate **Load
  transcript** click per recording.
- **Push everything** (`include-transcripts: true`). Simpler, but it mirrors
  every player's chat and commands to the site whether anyone reads them or not.
  It also only applies from the moment a recording is finalised, so turning it
  on later backfills nothing.

Flags now travel with the transcript either way: `WebCatalogService` gained a
`FLAG` case, so `ActorEvent.FLAG` — which Perspective already records onto the
timeline when TempestAC is installed — reaches the web timeline instead of
being dropped.

**TempestAC** pushes flags itself through `WebFlagForwarder`. Flags are queued
on the main thread from `PlayerFlagEvent` and posted from an async task with a
bounded queue, so a slow or unreachable site can never touch MSPT. Configure it
under `web:` in its `config.yml`.

## Features

- **Bracket types:**
  - **Single Elimination** — seeded bracket with byes.
  - **Double Elimination** — winners + losers bracket with grand-final reset.
  - **Round Robin** — everyone plays everyone, with a live standings table.
  - **Swiss** — players are paired by record each round (rematch-free when
    possible), no elimination; round count defaults to `ceil(log2(players))`
    and is adjustable. Later rounds appear as each round is completed.
  - **Group Stage** — a two-phase tournament: pick the number of groups, the
    per-group format (Round Robin / Swiss / Single / Double), how many advance
    per group, and the main (playoff) bracket format. Qualifiers are highlighted
    in each group's standings, and the main bracket previews with placeholder
    seeds (e.g. "Group A #1") that fill in with the real qualifiers — seeded
    cross-group — once every group finishes.
- **PvP modes:** Sword, Axe, Mace, UHC, NethPot, Pot, SMP, DiaSMP, Cart, Vanilla
  — with the official PvPHQ mode icons (Vanilla uses the Crystal PvP icon),
  stored locally in `assets/modes/`.
- **Players:** add by Minecraft username — the skin head loads automatically
  (with a live preview while typing) — plus the **team/clan they represent** and
  their **tier** in the gamemode. Team and tier stick between adds so you can
  type in a whole roster in a row, and the ✎ button on any player edits them
  later.
- **Tiers & auto matching:** tiers run **HT1 (best) → LT1 → HT2 → LT2 → … →
  HT5 → LT5 (worst)**, with unranked players drawn last. **Auto match by tier**
  builds the whole draw from two rules:
  - **Close, not identical, on skill.** Round-1 matches are taken from
    neighbours in the tier ranking, so you get **HT5 vs LT4** rather than
    **LT4 vs LT4**. Equal-tier pairings are broken up by pulling in the nearest
    different tier; if the whole remaining tail is one tier there's nothing to
    pair with, and it says how many mirror matches are left.
  - **Team-mates can't meet before the quarterfinals.** Every quarterfinal slot
    is fed by a sub-tree of `size / 8` bracket slots, so a team may appear at
    most once inside each of those blocks. Players are traded between blocks
    closest-tier-first, so separating them barely moves the draw. A full
    quarterfinal split needs at least as many teams as there are slots per
    block (8 teams for a 64-player bracket) — with fewer teams it protects the
    largest sub-tree it can and tells you which round that guarantees. In an
    8-player bracket round 1 *is* the quarterfinals, so nothing is enforced.

  Pairs are then scattered across the bracket by strength, so the strongest
  entrants don't collide in round 2. The hint under the button reports exactly
  what the draw achieved.
- **Interactive bracket:** click a player in any match to advance them; winners
  flow to the next round, connectors light up, and the champion is crowned.
  Byes are seeded and auto-advanced.
- **Series formats:** right-click any match to set it to **Best of (BOx)** or
  **First to (FTx)** — pick a preset (BO1/3/5/7, FT1/2/3/5) or a custom number.
  Each left-click on a player awards them a game; when a player reaches the
  needed wins they take the match and advance. "Reset match score" clears it.
- **Split (mirrored) bracket:** by default an elimination bracket is drawn
  broadcast-style — the **top half runs left→right on the left**, the **bottom
  half runs right→left on the right**, and the **final sits in the middle** with
  the champion crowned underneath it. Connectors follow each side automatically.
  The split view **fits itself to the window** in three steps: the canvas breaks
  out of the page column to use the full window width, then the columns tighten,
  then it zooms out only if it's *still* too wide — and never below 72%, so the
  text stays readable (past that it scrolls instead). A 16-player draw lands at
  full size on a 1600px-wide window, 32 players at ~80%. It refits on resize.
  **Classic view / Split view** in the bracket header toggles between the
  mirrored layout and the single left-to-right one. Round robin and Swiss keep
  their schedule + standings layout; in double elimination the winners bracket
  mirrors while the losers bracket and grand finals stay classic.
- **Download PNG:** exports whatever the bracket screen is showing as an image,
  with the tournament name, mode and champion in a header. It renders at **full
  size** — the fit zoom and tightened columns are undone and the connectors
  redrawn for that geometry — so the file isn't the shrunk-to-fit version you
  see on screen. 2× resolution for normal draws, 1× once the image gets large.
  Visitors can download too.
- **Auto-save:** your setup and bracket progress persist in the browser.

## Accounts and roles

Tempest opens read-only for everyone. There are two ways to get an account:

- **Sign up** makes a **player** account. Anyone can, and it grants nothing
  beyond being signed in. This is for players joining Tempest events.
- **Log in** is how staff get their tools. Staff accounts are *created for
  them* on the **Staff** tab — there is deliberately no way to self-register
  into a role.

### The role ladder

Lowest status to highest. Everything is gated on the `level` number, so
inserting a new role means giving it a level between its neighbours.

| Role | Level | Gains |
| --- | --- | --- |
| Player | 0 | nothing; signed in only |
| Staff | 1 | — |
| Head Staff | 2 | manage participants |
| Mod | 3 | record results on the bracket |
| Head Mod | 4 | Next Match and Schedule boards |
| Manager | 5 | Tournament Maker, share links, manage servers |
| Owner | 6 | reset the tournament, manage accounts and roles |
| Founder | 7 | above Owner |

**Owner and Founder bypass every permission check** — full creative control, by
design. That is `TEMPEST_FULL_CONTROL_LEVEL` in `staff.js`.

Everything else is a minimum level per action in `TEMPEST_CAPABILITIES`, also in
`staff.js`. Move a number to move a permission up or down the ladder; nothing
else needs touching.

### Sub-roles

A rank says where someone sits on the team. A **sub-role** says what they
actually do at an event. They are deliberately separate: somebody can be a Head
Mod with no event duties, or plain Staff who runs tournaments. An account can
hold any number.

**Hosting Roles** — who can run an event, and who makes the calls on how it runs.

| Sub-role | What it means |
| --- | --- |
| **Event Host** | Can host community events any time. You have to be ridiculously trusted by me and K1 to get this one. |
| **Tournament Overseer** | Can host seasonal tournaments and make the calls on how they run. |

**Staff Roles** — the ones you need to actually work an event or tournament.

| Sub-role | What it means |
| --- | --- |
| **Event Mod** | Can use commands and gets a genuine say in some events. Mainly for the bigger ones run by me, K1 or an Event Host. |
| **Event Staff** | Moderates and watches players. Communicates anything suspicious, any issues, or anything abnormal up to higher event staff. |
| **Tournament Mod** | Can use commands during tournaments, helps run them, and gets included in tournament decisions. |
| **Tournament Staff** | Spectates and watches for cheaters getting past the anticheat. Can screenshare using the tournament view as well. |

Assign them with the **Sub-roles** button on any account in the Staff tab. They
show as chips next to the person wherever they appear, and in full with their
descriptions on that person's profile.

**A sub-role can grant something the rank alone would not.** That mapping lives
in `TEMPEST_SUBROLE_CAPABILITIES` in `staff.js`:

```js
"event-host":          ["events.host"],
"tournament-overseer": ["tournaments.host"],
```

So plain Staff holding Event Host can create and edit events, even though
`events.host` otherwise needs Manager. Events and tournaments are kept
separate throughout: the two Event sub-roles grant `events.assist`, the two
Tournament ones grant `tournaments.assist`, and no rank grants either.

Sub-roles carry two-stop gradients exactly like ranks, and appear in the same
**Role colours** editor.

### Seeing what your role unlocks

Every signed-in account gets a **Permissions** matrix at the bottom of its
**Profile**: one row per action the site gates, the lowest rank that unlocks it,
any sub-role that grants it regardless of rank, and a mark against the ones you
hold. It is generated from `staff.js`, so it cannot drift from the real checks —
add a capability there and it appears here.

Owner and Founder bypass every check, so they see every row marked; the note
under the matrix says so.

### Role colours

Each role carries a two-stop gradient that always runs left to right.

**Set them on the Staff tab.** Under *Role colours* every role gets two colour
swatches, a live preview bar, **Swap** to flip which end each colour is on, and
**Reset** to go back to the shipped value. Changes apply instantly across the
gem, the badge and the nav chip, and save to your browser as you pick.

Like accounts, those picks are local to that browser. **Copy roles** gives you
the `window.TEMPEST_ROLES` block to paste into `staff.js` so everyone sees them:

```js
{ id: "owner", name: "Owner", level: 6, from: "#ffe082", to: "#d99400" },
```

Only roles you actually changed are stored locally, so a role left alone keeps
following `staff.js` if you edit the file later. **Reset all** clears the lot
and hands every role back to the file. There is no CSS to touch either way.

### Managing accounts

The **Staff** tab (Owner and Founder only) lists everyone, highest role first,
and lets you add a staff account, set someone's password, reassign a role,
assign sub-roles, or remove an account. You cannot change or remove your own
account from there — that would lock you out of the page.

**Link Discord** on a row attaches a Discord to that staff member, the same
field the participants list uses — a user id or a handle. An id is worth
preferring: it survives a rename, and it resolves to the live username and
avatar. The chip then shows on the row wherever the site lists staff.

**Where those accounts live depends on whether the API is deployed.**

With `apiBase` set in `management.js`, the relay API owns the account list. The
Staff tab reads from it and writes through to it, so a promotion, a demotion or
a removal is live the moment you make it — on every device, with nothing to
re-paste. `STAFF_JSON` on the Worker is only a first-run bootstrap so there is
somebody to log in as; once the store has anybody in it, that secret is ignored.

Two things follow from the API owning it, both deliberate:

- **A login rejected by the API is final.** The site does not fall back to this
  browser's copy, because that copy might still hold somebody who has since been
  removed or demoted. Only an *unreachable* API falls back, which is what keeps
  the site usable standalone.
- **Permissions are resolved per request, not baked into the token.** A session
  token says only who you are. Demote someone and their existing token loses
  access immediately rather than lasting until it expires.

Without the API, accounts live in **that browser only**, and **Copy accounts**
produces the `window.TEMPEST_STAFF` block to paste into `staff.js` so they work
on every device. Accounts shipped in `staff.js` are labelled as such.

Passwords are stored as PBKDF2-SHA256 over a random per-account salt, 100,000
iterations, never in the clear — the same derivation on the site and in the API,
so the one set of hashes works for both. Logging in needs a secure context for
the hashing, so `https://` or `localhost` — not a `file://` path.

### What this protects, and what it does not

Tempest is a static site. There is no server, so **every check above runs on the
visitor's own machine, on data their browser can see.** Anyone willing to open
devtools can hand themselves any role.

What the model does: keeps spectators out of the controls, and keeps honest
staff inside their lane. What it does not do: stop a determined person. **Do not
reuse a password here that protects anything else.**

The hashing is still worth having: it means a leaked `staff.js` does not hand
over anybody's actual password. It is protection for the password, not for the
account.

What genuinely protects a bracket is different: publishing to a live link needs
the host's signing key, which is generated in their browser and never leaves
it. Someone who forced their way into the staff UI would only be editing their
own private copy.

### Sharing a bracket

**Share link** on the bracket screen offers two kinds of link.

**Live link — updates itself.** One short, permanent URL you send once at the
start of the tournament. Every score you record publishes automatically, and open
viewers see it without reloading, staying on whichever tab they were watching. A
status chip in the bracket header shows where things stand: *Unpublished changes*
→ *Publishing…* → **Live · published just now**, or *Publish failed* if the relay
can't be reached (it keeps retrying by itself, backing off up to 30 seconds).
Viewers get the same chip showing *Live · updated just now* or *Reconnecting…* —
and a viewer who loses the connection keeps the last bracket they received rather
than going blank.

Pick how the updates travel when you turn it on:

- **Instant · nothing to install** (the default) — publishes through the public
  [ntfy.sh](https://ntfy.sh) pub/sub service. Viewers hold a connection open, so
  results land **the moment you record them**, and there's nothing to deploy or
  sign up for. The topic is public, so **every message is signed**: your browser
  generates an ECDSA key, the link carries only the *public* half, and viewers
  ignore anything not signed by it. Messages are append-only, so nobody holding
  the link can erase or fake the bracket — a forged update is simply dropped.
  Practical limit: the bracket has to fit in one ~4 KB message, which covers
  everything up to roughly 100 players.
- **My own relay** — a Cloudflare Worker from [`relay/`](relay/README.md) (two
  commands, free tier), where writes need a token and viewers poll it every 8
  seconds. Or point at your own ntfy server for signed pub/sub on your own
  hardware. Either way nothing touches a shared service.

Then: **Publish now** forces a push, **New link** retires the current one and
mints a fresh one, **Turn off** ends the link — the Worker copy is deleted, and
instant-mode viewers are told the host closed it.

**Snapshot link — frozen.** No relay needed: the whole tournament is
deflate-compressed into the link's `#` fragment, so it works with no server at
all, but it shows the scores as they were when you generated it and will never
change. Good for a recap post. The modal has **Copy**, **Preview** and **Email**
(which opens your own mail client with the link pasted in).

**Arriving via a link locks the session to visitor.** The badge reads *View
only*, the sign-in button isn't even offered, and the app gives no route to the
host UI — the Setup tab and the logo both keep you on the bracket, and clearing
the payload out of the URL puts it straight back. Signing in from a link session
is refused outright, password or not. You can still change the bracket layout and
download the PNG.

**Trimming a link gets you nowhere.** Anything that *looks* like a share link is
a viewer session before the app even tries to read it, so a link that's been cut
short or hand-edited fails as a viewer with "the link is damaged" — it never
falls through to the setup screen. Cut the URL all the way back to `index.html`
and you get the ordinary read-only app, which now needs the password to do
anything.

Be clear-eyed about what that is and isn't. It stops a spectator wandering into
the host UI by trimming a URL; it is not a permission system, and someone
determined can always open the app fresh or edit the page. The guarantee that
actually matters is different: **a viewer can never publish.** The signing key
(instant mode) and the write token (own relay) are generated in the host's
browser and never appear in the link or on the wire, so the worst a spectator can
do is edit their own private copy of the bracket.

A few other things worth knowing:

- A **snapshot** link is frozen; send a fresh one after recording new results, or
  use a live link and never think about it again.
- Opening a shared link never touches the viewer's own saved tournament — it
  isn't written to storage, so their own bracket is still there when they open
  the app normally.
- Pasting a link into an already-open tab works: only the URL fragment changes,
  which wouldn't reload the page, so the app picks it up and reloads itself.
- Anyone with the link can read everything in it — the bracket travels in the
  link (snapshot) or through a public topic (instant mode). Don't put anything in
  a tournament name you wouldn't post publicly.
- Live links need a secure context for the signing key, so `https://` or
  `localhost` — not a `file://` path. The dialog says so rather than failing
  quietly.
- Links are only as public as the app is. If they point at `localhost`, nobody
  else can open them — see [Publishing it](#publishing-it-needed-for-sharing).
- Links opened from a `file://` path only work on that computer; serve the
  folder over HTTP (below) for links you want to send to other people.

## Tournament styles

When you click **Generate Bracket**, a popup asks how modes work across the bracket
(this is independent of the bracket type above):

- **Regular** — one PvP mode (the one selected on the setup screen) for every match.
- **Switching** — pick a set of modes; each match auto-cycles through them in order,
  and you can change any single match's mode by right-clicking it.
- **PvPChamp** — pick exactly **5 modes**. Every match is a best-of-3 decided by a
  pick/ban: **Player 1 picks Game 1's mode → Player 2 picks Game 2's mode →
  Player 1 bans → Player 2 bans → the last remaining mode is the Game 3 decider**
  (only played if the series is 1–1). Open a match's pick/ban with its **Pick / Ban →**
  button (or right-click). First to 2 wins and advances.

## Running

No build step or dependencies — it's a static site.

**Just to try it locally:** open `index.html`, or serve the folder:

```bash
npx serve .
```

Note that `file://` can't sign in or use live links (both need a secure
context), so `localhost` is the better local option.

## Publishing it (needed for sharing)

`localhost` and `127.0.0.1` only exist on your own machine — a link built from
one **will not open on a phone or anyone else's computer**. The app warns you
about this in the Share dialog. To hand out working links, publish the folder
anywhere that serves static files over **https**.

**GitHub Pages** (this repo is already on GitHub):

1. Push your changes to `main`.
2. Repo → **Settings → Pages**.
3. *Source*: **Deploy from a branch**; *Branch*: `main`, folder `/ (root)`. Save.
4. Wait a minute; Pages shows your URL, e.g.
   `https://mysteriousprogramme.github.io/TempestTournament/`.

Netlify, Cloudflare Pages and Vercel all work the same way — drag the folder in,
or point them at the repo. Any of them gives you https, which live links and
sign-in both require.

**Your own server (AWS EC2 or any Linux box).** One Node process serves the site
*and* runs the management API, so there is one service, one certificate and one
origin — no CORS, and the relay stops being a separate deployment. It runs
`relay/worker.js` unchanged, so it is the same routing and the same auth as the
Cloudflare version rather than a second implementation. See
[server/README.md](server/README.md). It also lifts two Cloudflare limits: the
100,000 PBKDF2 iteration cap, and the 128 KiB per-record cap that was truncating
long replay transcripts. You need HTTPS for sign-in to work at all, so you need
a hostname — either a domain you own, or the free `<ip>.sslip.io` if you would
rather just use the instance's Elastic IP.

### Telling the app where it lives

Once it's published, open **Share link → Link address** and paste the public URL.
Every link the app generates is built from that address, so you can keep working
on `localhost` and still hand out links that work. Leave it blank to use whatever
address you're browsing.

Two things that trip people up:

- Serving over plain `http://` on a LAN address like `192.168.1.20:5500` is *not*
  a secure context, so sign-in and live links won't work there even though the
  page loads. Use https.
- If you publish over https, a self-hosted relay must be https too — browsers
  block insecure requests from a secure page. The default ntfy.sh relay and
  Cloudflare Workers are both https already.
- Hosting the site and the API together (see above) sidesteps that entirely:
  set `apiBase: "same-origin"` in `management.js` and the site uses whatever
  origin it was loaded from, so there is only ever one scheme in play.

## Files

- `index.html` — markup / layout
- `styles.css` — the whole theme, as one file (see the caveat below)
- `servers.js` — the server directory (`window.TEMPEST_SERVERS`)
- `staff.js` — roles, sub-roles, gradients, permissions and the shipped staff accounts
- `app.js` — bracket generation, resolution, and rendering (no framework)
- `management.js` — where the replay and flag data is read from
- `relay/` — the relay and management API ([setup](relay/README.md)). Written as
  a Cloudflare Worker, but it is plain Web-standard JavaScript and `server/`
  runs the same file.
- `server/` — run the site and the API together on your own box, e.g. AWS EC2
  ([setup](server/README.md)). No dependencies, no build step.
- `.claude/launch.json` — dev-server config for previewing the app in Claude Code

### Two things to know before editing `styles.css`

PNG export works by inlining this stylesheet into an XML SVG and rasterising
it, which puts two constraints on the file:

1. **Keep it a single file.** `nodeToPng()` fetches `styles.css` by name. Split
   the CSS and the broadcast boards export unstyled.
2. **Never use a raw `<` or `&` in it, not even in a comment.** Either
   character breaks the XML parse and every PNG export fails silently. Spell
   such names out in words.

For the same reason the boards (`.sboard`, `.vsboard`) are pinned to the system
font stack via `--font-board`: a webfont cannot be resolved inside the exported
SVG, so it would fall back and the PNG would not match the screen. The rest of
the site uses Inter and Saira.

Skin heads are fetched from `mc-heads.net` (falls back to `minotar.net`, then a
default Steve head) so an internet connection is needed for avatars.
