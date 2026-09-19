/* ============================================================
   Tempest Tournament — server directory
   ============================================================
   The servers offered on the Servers tab, and the list a host picks
   from when choosing where a tournament is played.

   This is a plain script rather than a JSON file on purpose: the site
   has no build step, and a <script> keeps working when index.html is
   opened straight off disk (file://), where fetch() would be blocked.

   To add a server, copy a block and fill it in:

     id       unique, lowercase, no spaces — stored in the saved
              tournament, so renaming it orphans existing tournaments
     name     what people see
     host     the address players connect to. Live status is looked up
              from this, so it has to be the real hostname.
     port     omit for the default 25565
     region   short tag — NA, EU, AS, OCE, GLOBAL
     modes    ids from MODES in app.js: sword, axe, mace, spear, uhc,
              nethpot, pot, smp, diasmp, cart, vanilla
     blurb    one short line
     accent   "R,G,B" — the wash on the featured card
     featured true for the three cards at the top of the page

   These starter entries are well-known public servers, here as
   examples. Swap in whatever you actually run tournaments on.
   ============================================================ */
window.TEMPEST_SERVERS = [
  {
    id: "minemen-na",
    name: "Minemen Club NA",
    host: "na.minemen.club",
    region: "NA",
    modes: ["sword", "nethpot", "pot", "axe"],
    blurb: "North American practice server — ranked queues and duels.",
    accent: "239,68,68",
    featured: true,
  },
  {
    id: "minemen-eu",
    name: "Minemen Club EU",
    host: "eu.minemen.club",
    region: "EU",
    modes: ["sword", "nethpot", "pot", "axe"],
    blurb: "European practice server — same queues, closer ping.",
    accent: "0,89,255",
    featured: true,
  },
  {
    id: "hypixel",
    name: "Hypixel",
    host: "mc.hypixel.net",
    region: "GLOBAL",
    modes: ["sword", "uhc", "vanilla", "smp"],
    blurb: "Duels and UHC lobbies — easy to fill a casual bracket.",
    accent: "255,132,0",
    featured: true,
  },
  {
    id: "pika",
    name: "Pika Network",
    host: "play.pika-network.net",
    region: "EU",
    modes: ["sword", "pot", "smp"],
    blurb: "Large network with practice and SMP modes.",
    accent: "153,64,255",
  },
  {
    id: "tempest-smp",
    name: "Tempest SMP",
    host: "play.example.net",
    region: "NA",
    modes: ["smp", "diasmp", "mace", "cart"],
    blurb: "Placeholder — point this at your own server.",
    accent: "0,194,103",
  },
];
