/* ============================================================
   Tempest — roles and staff accounts
   ============================================================
   Everything about who exists and what they can do lives here, so the
   whole permission model is one file to read and one file to edit.

   Loaded before app.js, same as servers.js, and for the same reason:
   no build step, and it still works opened straight off disk.

   -----------------------------------------------------------------
   READ THIS BEFORE TRUSTING IT WITH ANYTHING THAT MATTERS
   -----------------------------------------------------------------
   Tempest is a static site. There is no server, so every check below
   runs on the visitor's own machine, on data their browser can see.
   Anyone willing to open devtools can hand themselves any role.

   What this model does: keeps spectators out of the controls, and
   keeps honest staff inside their lane.
   What it does not do: stop a determined person. Do not reuse a
   password here that protects anything else.

   Passwords are stored as PBKDF2-SHA256 (150k iterations) over a
   random per-account salt, never in the clear. That is real
   protection for the password itself if the file leaks - it is not
   protection for the account, because the check is client side.
   ============================================================ */

/* ---------- roles, lowest status to highest ----------------------------
   `level` is the ladder. Everything is gated on it, so inserting a new
   role is a matter of giving it a level between its neighbours.

   `from` and `to` are the two stops of the role's gradient. It always
   runs left to right; change the hexes and nothing else moves. */
window.TEMPEST_ROLES = [
  { id: "player",     name: "Player",     level: 0, from: "#cdd3db", to: "#8b95a3" },
  { id: "staff",      name: "Staff",      level: 1, from: "#9be7a6", to: "#34a853" },
  { id: "headstaff",  name: "Head Staff", level: 2, from: "#6ee7d2", to: "#0f9b8e" },
  { id: "mod",        name: "Mod",        level: 3, from: "#ffd9a0", to: "#c9871f" },
  { id: "headmod",    name: "Head Mod",   level: 4, from: "#5ff08a", to: "#0e8a3c" },
  { id: "manager",    name: "Manager",    level: 5, from: "#ff6b7f", to: "#b3123c" },
  { id: "owner",      name: "Owner",      level: 6, from: "#ffe082", to: "#d99400" },
  { id: "founder",    name: "Founder",    level: 7, from: "#f0f3f7", to: "#8b95a3" },
];

/* ---------- who can do what ------------------------------------------
   The minimum role level each action needs. Owner and Founder are
   exempt from all of it (see FULL_CONTROL_LEVEL below) because they
   are meant to have free rein.

   Tune these numbers to move a permission up or down the ladder - or do it on
   the Staff tab, under Permissions, which is the same thing without a redeploy.
   Overrides made there are stored as a difference against this file, so editing
   a number here still moves anything nobody has deliberately changed. "Copy
   permissions" on that tab gives you this block back. */
window.TEMPEST_CAPABILITIES = {
  "participants.manage": 2,   // add, edit and remove players
  "tournament.score":    3,   // record results on the bracket
  "broadcast":           4,   // Next Match and Schedule boards
  "tournament.create":   5,   // the Tournament Maker
  "tournament.share":    5,   // share and live links
  "servers.manage":      5,   // add, edit and remove servers
  "tournament.reset":    6,   // wipe the tournament
  "staff.manage":        6,   // create accounts and assign roles
  "events.host":         5,   // create and edit events (or be an Event Host)
  "tournaments.host":    5,   // create and edit tournaments (or be a Tournament Overseer)

  // Management. Both tabs are Mod and up. Drop anticheat to 1 if you want
  // plain Staff able to read flags without seeing replays.
  "management.perspective": 3,   // the Perspective replay catalogue
  "management.anticheat":   3,   // the TempestAC flag list

  // The Staff tab itself. Mod and up get the dashboard; only Owner and up
  // get the account and role controls underneath it.
  "staff.dashboard":        3,   // recent replays and bundled flag cases
  "cases.resolve":          3,   // claim a case and record Hacking / False Call
};

/* These two are deliberately absent from the table above: no rank grants
   them. Working an event or a tournament comes from the sub-role and
   nothing else, which is the whole point of the Staff Roles group.
     events.assist       be listed as working an event
     tournaments.assist  be listed as working a tournament */

/* Owner and above bypass every capability check. */
window.TEMPEST_FULL_CONTROL_LEVEL = 6;

/* ---------- accounts that ship with the site --------------------------
   Staff do not sign themselves up: their accounts are made for them.
   These are the ones baked into the deploy, so they work on every
   device. Accounts created in the app afterwards live in that
   browser only, until you export them back into this list with
   "Copy staff file" on the Staff tab.

   To add someone by hand, use the Staff tab to make the account, then
   copy the generated block in here and redeploy. Do not hand-write a
   hash - it is a PBKDF2 derivation, not something you can guess at. */
window.TEMPEST_STAFF = [
  {
    username: "waffledd",
    display: "Waffledd",
    role: "owner",
    salt: "084cc47e8bfe7a973f7a997acc94847c",
    iterations: 150000,
    hash: "de5c3917d90293eefbd36c3d7d25e440afcc2d8b8a4c165f2ea51e7faa21d1ad",
  },
];

/* ---------- sub-roles --------------------------------------------------
   A rank above says where someone sits in the team. A sub-role says what
   they actually do at an event. They are separate on purpose: somebody
   can be a Head Mod with no event duties, or Staff who runs tournaments.

   An account can hold any number of these. Assign them on the Staff tab.

   Gradients work exactly like the role ones: two stops, left to right,
   editable on the Staff tab or right here. */
window.TEMPEST_SUBROLE_GROUPS = [
  {
    id: "hosting",
    name: "Hosting Roles",
    blurb: "Who can run an event, and who makes the calls on how it runs.",
  },
  {
    id: "working",
    name: "Staff Roles",
    blurb: "These are the ones you need to actually work an event or tournament.",
  },
];

window.TEMPEST_SUBROLES = [
  {
    id: "event-host", name: "Event Host", group: "hosting",
    from: "#b98cff", to: "#7a3ff0",
    desc: "Can host community events any time. You have to be ridiculously trusted by me and K1 to get this one.",
  },
  {
    id: "tournament-overseer", name: "Tournament Overseer", group: "hosting",
    from: "#f0b45c", to: "#c47a16",
    desc: "Can host seasonal tournaments and make the calls on how they run.",
  },
  {
    id: "event-mod", name: "Event Mod", group: "working",
    from: "#ff9f52", to: "#e0691a",
    desc: "Can use commands and gets a genuine say in some events. Mainly for the bigger ones run by me, K1 or an Event Host.",
  },
  {
    id: "event-staff", name: "Event Staff", group: "working",
    from: "#f7e06a", to: "#dfc224",
    desc: "Moderates and watches players. Communicates anything suspicious, any issues, or anything abnormal up to higher event staff.",
  },
  {
    id: "tournament-mod", name: "Tournament Mod", group: "working",
    from: "#ff9f52", to: "#e0691a",
    desc: "Can use commands during tournaments, helps run them, and gets included in tournament decisions.",
  },
  {
    id: "tournament-staff", name: "Tournament Staff", group: "working",
    from: "#f7e06a", to: "#dfc224",
    desc: "Spectates and watches for cheaters getting past the anticheat. Can screenshare using the tournament view as well.",
  },
];

/* What a sub-role lets someone do in the app, on top of whatever their
   rank already allows. Holding any of these is enough on its own. */
window.TEMPEST_SUBROLE_CAPABILITIES = {
  "event-host":          ["events.host"],
  "tournament-overseer": ["tournaments.host"],
  "event-mod":           ["events.assist"],
  "event-staff":         ["events.assist"],
  "tournament-mod":      ["tournaments.assist"],
  "tournament-staff":    ["tournaments.assist"],
};
