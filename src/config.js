/* ==========================================================================
   Everything you need to change to make this your own.
   ========================================================================== */

import { seededDoc } from "./model/seed";

export const CONFIG = {
  /* ---- Google OAuth client IDs -------------------------------------------
     From Google Cloud → APIs & Services → Credentials.

       iosClientId  an "iOS" client whose bundle ID matches app.json
                    (com.anupmasud.ahammaxxing). The drive-starter iOS client
                    will NOT work here — Google ties an iOS client to one
                    bundle ID, and this app has its own.
       webClientId  a "Web application" client. The drive-starter one is
                    reusable as-is: GitHub Pages project sites all sit on
                    https://anupmasud.github.io, which is already an
                    authorised origin on it.                                */
  iosClientId: "",
  webClientId: "432206356046-umf1ranbpqnttj4beulm9q79a1g6b5gf.apps.googleusercontent.com",

  /* drive.file is the narrowest useful scope: the app sees only files it made
     itself, never the rest of your Drive. Widening this would let the app read
     every document you own and would drag the project into Google's
     restricted-scope verification. */
  scopes: ["https://www.googleapis.com/auth/drive.file"],

  /* My Drive → Apps → AhamMaxxing. The app creates these, because drive.file
     cannot see folders it did not make. Rename or move the folder afterwards
     and nothing breaks: it is remembered by id, not by path. */
  folderPath: ["Apps", "AhamMaxxing"],

  /* The spreadsheet's name in Drive. Keep it recognisable — this is what you
     will see in a list of files, and what a search has to match. */
  sheetName: "AhamMaxxing",

  /* The old JSON store. Kept only so an existing document can be carried into
     the spreadsheet on first run; nothing is written to it any more. */
  fileName: "ahammaxxing-data.json",

  /* The document a brand-new person starts with: eleven categories and the
     handful of targets described in the brief. */
  emptyDoc: seededDoc,

  /* Optional allowlist. A list checked on the device is a signpost, not a
     lock — it ships to the phone and can be patched out. It is safe only
     because it is not load-bearing: everyone reads and writes a file in their
     own Drive, so bypassing it shows you your own empty document and nobody
     else's. Leave empty to let any Google account sign in. */
  allowedEmails: [],
};

export const isAllowed = (email) =>
  CONFIG.allowedEmails.length === 0 ||
  CONFIG.allowedEmails.map((e) => e.toLowerCase()).includes(String(email || "").toLowerCase());
