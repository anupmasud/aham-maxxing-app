/* ==========================================================================
   Working without a connection, and catching up afterwards.

   Two things are worth saying plainly, because both are easy to assume wrong.

   Google Drive's "available offline" does nothing for this app. It caches a
   file for Google's own editors — the Sheets app, Docs in Chrome. This app
   talks to the Sheets API over HTTPS, and offline those calls fail like any
   other request. Nothing in Google's cache is reachable from here, so offline
   has to be the app's own job.

   And it is not a setting. A switch marked "work offline" is a switch someone
   leaves on: days of entries pile up on one phone, the other phone shows a
   stale week, and the first anyone knows about it is a conflict. Being
   readable and writable without a connection is how the app should always
   behave; the only thing worth showing a person is whether their last few
   entries have reached Drive yet.

   What lives here is the part worth testing on its own: given what is cached
   and what Drive says, decide whose copy wins. The rule is that unsynced local
   work is never thrown away silently — it is either pushed, or raised as a
   conflict for a person to settle. Overwriting it because the network came
   back is the one outcome that must not happen.
   ========================================================================== */

/* The cached copy, with enough beside it to know what it is.

   The document used to be cached on its own, which made "edited on a plane"
   and "last seen from Drive" indistinguishable — and a load that succeeded
   would replace the first with whatever Drive held. `dirty` is the whole fix:
   it says this copy contains work Drive has not got.

   `base` is the Drive modification time this device last successfully read or
   wrote. Kept beside the document because it is the only way, after the app
   has been closed and reopened, to tell "nobody else touched it while I was
   away" from "somebody did". */
export const ENVELOPE = 2;

export function envelope(doc, { dirty = false, base = null, at = null } = {}) {
  return { v: ENVELOPE, doc, dirty: !!dirty, base: base || null, at: at || new Date().toISOString() };
}

/* Reads a cache written by any version.

   Version 1 was the bare document. Those are still on people's phones, and
   treating one as unsynced would push a stale copy over a good one — so a
   legacy cache is read as clean, which is what it effectively was. */
export function readEnvelope(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.v === ENVELOPE && raw.doc) return { ...raw, dirty: !!raw.dirty };
  // Legacy: the document itself, with no wrapper.
  if (raw.categories || raw.targets || raw.log) {
    return { v: 1, doc: raw, dirty: false, base: null, at: null };
  }
  return null;
}

/* Whose copy wins, once Drive has answered.

   - Nothing cached, or the cache holds nothing Drive is missing: take Drive's.
     It is the durable copy and may carry another device's work.
   - Unsynced local work, and Drive is exactly where this device left it:
     nobody else has touched it, so the local copy is simply ahead. Push it.
   - Unsynced local work, and Drive has moved: two devices changed the same
     document. Neither copy can be discarded on the app's own authority, so
     this is a conflict and a person decides.
   - Unsynced local work and no idea what it was based on — a cache carried
     across a reinstall, or a first run that never reached Drive: treated as a
     conflict too. Guessing here means guessing about someone's data. */
export function decideOnLoad({ dirty, hasCache, base, remoteTime } = {}) {
  if (!hasCache || !dirty) return { use: "remote", action: "none" };
  if (!base) return { use: "local", action: "conflict", why: "unknown-base" };
  if (base === remoteTime) return { use: "local", action: "push", why: "ahead" };
  return { use: "local", action: "conflict", why: "both-moved" };
}

/* Is this the same document, whatever the clock says?

   A conflict is decided by comparing Drive's modification time against the one
   this device last agreed with, and that timestamp is a weak proxy. Drive
   updates it asynchronously after a write, adding a tab touches it, and a
   second device opening the file can move it without changing a thing. Each of
   those looks exactly like somebody editing the same document somewhere else
   — so the app asks which copy to keep, about two copies that are identical.

   Comparing the contents settles it. If the two are the same there is nothing
   to choose between and nothing to lose either way; only a real difference is
   worth interrupting somebody for.

   Only the parts that are the document are compared. `createdAt` and the
   reminder time ride along in the same object but are settings, not content,
   and a difference in one of those is not a reason to make someone choose. */
const CONTENT = ["categories", "targets", "log", "notes", "plans", "breaks", "tasks", "timers"];

/* Key order is not stable between a document built from the spreadsheet and
   one built in memory, so a plain JSON.stringify would call identical
   documents different. Sorting keys at every level is what makes the
   comparison mean what it says. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function sameDoc(a, b) {
  if (!a || !b) return false;
  const pick = (d) => {
    const out = {};
    CONTENT.forEach((k) => { out[k] = d[k] === undefined ? null : d[k]; });
    return out;
  };
  return stableStringify(pick(a)) === stableStringify(pick(b));
}

/* How long to wait before trying Drive again.

   Backs off so a phone with no signal is not retrying every second for an
   afternoon, and stops lengthening at a minute so that walking back into wifi
   is noticed promptly rather than in a quarter of an hour. Attempt 0 is the
   first retry after a failure. */
const BACKOFF = [5000, 15000, 30000, 60000];

export const retryDelay = (attempt) =>
  BACKOFF[Math.min(Math.max(0, attempt | 0), BACKOFF.length - 1)];

/* How long a change has been waiting, in words, for the header.

   Deliberately coarse. A counter ticking through the seconds invites someone
   to watch it, and the honest message is only ever "not yet" or "a while". */
export function waitingFor(since, now = Date.now()) {
  if (!since) return "";
  const ms = now - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
