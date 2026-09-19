/* ============================================================
   Tempest — Management data sources
   ============================================================
   Where the Perspective replay catalogue and the TempestAC flag list
   are read from. Loaded before app.js, same as servers.js and staff.js.

   -----------------------------------------------------------------
   DO NOT PUT AN INGEST KEY IN HERE
   -----------------------------------------------------------------
   This file ships to the browser, so anything in it is public. The
   Perspective ingest key lets the holder POST recordings into your
   catalogue - it belongs on the server, never here. The URLs below are
   for READING only, and whatever serves them should treat them as
   public or put its own auth in front of the whole site.
   ============================================================ */

window.TEMPEST_MANAGEMENT = {
  /* The relay API base, no trailing path. Set this and the two URLs below
     fill themselves in, and the site will exchange your Tempest login for a
     session token so the API will talk to it at all.

     e.g. "https://tempest-tournament-relay.your-name.workers.dev"

     Set it to the exact string "same-origin" when the site and the API are
     served by the same host, which is what server/ does. The site then uses
     whatever origin it was loaded from, so the one setting works by domain, by
     IP and on localhost, and there is no CORS and no mixed-content trap.

     Leave it empty for no API at all - the site still runs standalone. */
  apiBase: "same-origin",

  /* Leave a URL blank and that tab falls back to whatever was last
     cached in this browser, plus the Import button. The site works
     fine with no endpoints at all - it just will not self-update. */

  /* Expected: a JSON array of recordings, or {"recordings":[...]}.
     This is exactly what Perspective's WebCatalogService POSTs to
     /api/recordings, so a store that keeps those bodies and serves
     them back as an array needs no translation:

       { "number": 41,
         "world": "world",
         "createdMillis": 1737000000000,
         "endedMillis":   1737000600000,
         "durationMillis": 600000,
         "sizeBytes": 4823000,
         "tickCount": 12000,
         "tpsMin": 19.2, "tpsMax": 20.0,
         "players": ["Waffledd", "K1"],
         "events": [ { "kind": "chat", "atMillis": 1737000012000,
                       "name": "Waffledd", "text": "gg" } ],
         "available": true }

     Event kinds: chat, command, join, leave, death - and flag, once the
     plugin sends it (see the note in the README). */
  recordingsUrl: "",

  /* Expected: a JSON array of flags, or {"flags":[...]}.
     One object per TempestAC Violation record:

       { "uuid": "…", "playerName": "Waffledd", "checkName": "Reach",
         "category": "COMBAT", "vl": 3.0, "debug": "d=3.41",
         "ping": 42, "tps": 20.0, "timestampMs": 1737000000000 } */
  flagsUrl: "",

  /* Seconds before a tab will refetch. 0 disables the timer entirely
     and the tabs only load when opened or when you hit Refresh. */
  refreshSeconds: 0,

  /* How many rows to hold in the browser cache per tab. */
  maxRecordings: 500,
  maxFlags: 2000,

  /* Opening Perspective asks the server for the transcript of every recording
     that does not have one yet, so the catalogue fills itself in instead of
     waiting for a click per row.

     Understand what this trades away. Perspective's on-demand mode exists so
     that chat and commands stay on the game server until a specific recording
     is actually wanted; asking for all of them the moment a mod opens the tab
     is, in practice, the same as mirroring everything. Set this to false to go
     back to one deliberate request per recording. */
  autoRequestTranscripts: true,
};
