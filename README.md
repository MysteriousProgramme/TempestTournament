# TSMP Tournament Maker

A Minecraft PvP tournament bracket builder with a Tempest-SMP inspired theme
(red-on-black, grid glow, glass panels) and PvPHQ-style championship brackets.

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
  (with a live preview while typing).
- **Interactive bracket:** click a player in any match to advance them; winners
  flow to the next round, connectors light up, and the champion is crowned.
  Byes are seeded and auto-advanced.
- **Series formats:** right-click any match to set it to **Best of (BOx)** or
  **First to (FTx)** — pick a preset (BO1/3/5/7, FT1/2/3/5) or a custom number.
  Each left-click on a player awards them a game; when a player reaches the
  needed wins they take the match and advance. "Reset match score" clears it.
- **Auto-save:** your setup and bracket progress persist in the browser.

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

**Easiest:** just open `index.html` in your browser.

**If skin heads or auto-save misbehave on `file://`** (some browsers restrict
those), serve it over HTTP from this folder, e.g.:

```
npx serve .
# or
python -m http.server 8000
```

then visit the printed URL.

## Files

- `index.html` — markup / layout
- `styles.css` — Tempest theme
- `app.js` — bracket generation, resolution, and rendering (no framework)

Skin heads are fetched from `mc-heads.net` (falls back to `minotar.net`, then a
default Steve head) so an internet connection is needed for avatars.
