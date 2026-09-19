/* ============================================================
   Tempest — generate a STAFF_JSON credential
   ============================================================
   For setting or rotating a password without a browser, straight on the box:

     node server/mkstaff.js waffledd owner 'the new password'

   Paste the single line it prints into STAFF_JSON in server/.env and restart.
   The API re-applies STAFF_JSON whenever its value CHANGES, so this is both
   the way to rotate a password and the way back in if every owner is locked
   out.

   Derivation is PBKDF2-SHA256, 100,000 iterations over a random 16-byte salt,
   which is exactly what the website and the API both verify against. 100,000
   is the ceiling Cloudflare enforces; going above it makes a credential the
   API cannot check, which presents as "legacy-credential" rather than as a
   wrong password.

   The password is an argument, so it lands in your shell history. Clear it
   afterwards, or put a space before the command if your shell is set to skip
   those (HISTCONTROL=ignorespace).

   ESM, not CommonJS - server/package.json sets "type": "module".
   ============================================================ */

import c from "node:crypto";
const [user, role, pw] = process.argv.slice(2);
if (!user || !role || !pw) { console.error("usage: node mkstaff.js <username> <role> <password>"); process.exit(1); }
const LEVEL = { player:0, staff:1, headstaff:2, mod:3, headmod:4, manager:5, owner:6, founder:7 };
const salt = c.randomBytes(16).toString("hex");
console.log(JSON.stringify([{
  username: user.toLowerCase(), display: user, role,
  level: LEVEL[role] ?? 0, salt, iterations: 100000,
  hash: c.pbkdf2Sync(pw, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex"),
}]));
