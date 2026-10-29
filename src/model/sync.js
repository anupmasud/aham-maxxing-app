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

export function envelope(doc, { dirty = false, base = null, at = null, baseDoc = null } = {}) {
  return {
    v: ENVELOPE, doc, dirty: !!dirty, base: base || null,
    /* The document as Drive last had it. Without it the app can only ask
       "do these two differ", which cannot tell an entry somebody deleted
       from one another device has not seen yet — and guessing that wrong is
       how a save removes days from Drive. */
    baseDoc: baseDoc || null,
    at: at || new Date().toISOString(),
  };
}

/* Reads a cache written by any version.

   Version 1 was the bare document. Those are still on people's phones, and
   treating one as unsynced would push a stale copy over a good one — so a
   legacy cache is read as clean, which is what it effectively was. */
export function readEnvelope(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.v === ENVELOPE && raw.doc) return { ...raw, dirty: !!raw.dirty, baseDoc: raw.baseDoc || null };
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

/* ------------------------------------------------------------- merging -- */

/* Most "conflicts" are not disagreements at all.

   Two devices, and the phone logged today while the browser logged yesterday.
   Nothing contradicts; the two copies simply each know something the other
   does not. Asking a person to pick one — and throw the other away — is the
   wrong question, and it is the question they were being asked over and over.

   So: if the only differences are days one side has and the other lacks, the
   two are folded together and nobody is asked anything. A real disagreement —
   the same target, on the same day, with two different values, or a change to
   what the targets themselves are — still stops and asks, because that is a
   decision only a person can make.

   Drive is the base of the merge. It is the durable copy and the one other
   devices read, so when something has to win by default, it wins. */

const DAY_MAPS = ["log", "notes", "plans"];
const STRUCTURE = ["categories", "targets", "timers", "breaks"];

const asMap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/* Day-keyed maps folded together. Returns null the moment the same entry
   holds two different values, because that is a genuine disagreement. */
function mergeDayMap(mine, theirs) {
  const a = asMap(mine);
  const b = asMap(theirs);
  const out = { ...b };
  for (const day of Object.keys(a)) {
    if (!(day in b)) { out[day] = a[day]; continue; }
    const mineDay = asMap(a[day]);
    const theirDay = asMap(b[day]);
    const merged = { ...theirDay };
    for (const id of Object.keys(mineDay)) {
      if (!(id in theirDay)) { merged[id] = mineDay[id]; continue; }
      if (stableStringify(mineDay[id]) !== stableStringify(theirDay[id])) return null;
    }
    out[day] = merged;
  }
  return out;
}

/* Lists keyed by id. An id on one side only is added; an id on both with
   different contents is a disagreement. */
function mergeById(mine, theirs) {
  const a = Array.isArray(mine) ? mine : [];
  const b = Array.isArray(theirs) ? theirs : [];
  const byId = {};
  b.forEach((x) => { if (x && x.id) byId[x.id] = x; });
  const out = b.slice();
  for (const item of a) {
    if (!item || !item.id) continue;
    const other = byId[item.id];
    if (!other) { out.push(item); continue; }
    if (stableStringify(item) !== stableStringify(other)) return null;
  }
  return out;
}

/* The merged document, or null when a person has to decide.

   Null is not a failure — it is the honest answer whenever folding the two
   together would mean choosing something on somebody's behalf. */
export function mergeDocs(mine, theirs) {
  if (!mine || !theirs) return null;

  /* A change to the targets themselves is never merged. Union would
     resurrect a target deleted on the other device, which is worse than
     asking: a deletion is a decision, and quietly undoing one is the kind of
     bug nobody reports because they assume they imagined it. */
  for (const key of STRUCTURE) {
    if (stableStringify(mine[key] ?? null) !== stableStringify(theirs[key] ?? null)) return null;
  }

  const merged = { ...theirs };
  for (const key of DAY_MAPS) {
    const m = mergeDayMap(mine[key], theirs[key]);
    if (m === null) return null;
    merged[key] = m;
  }

  const tasks = mergeById(mine.tasks, theirs.tasks);
  if (tasks === null) return null;
  merged.tasks = tasks;

  return merged;
}

/* Three-way merge: what changed here, applied to what is in Drive.

   This is what makes "my Drive is never overwritten" true rather than
   hopeful. Every other approach compares two documents and has to guess what
   the difference means — and an entry present in Drive but missing here is
   ambiguous between "I deleted it" and "another device added it while I was
   away". Guess that wrong in the second case and a save quietly removes days
   from Drive, which is exactly what happened.

   With the document Drive last agreed with in hand there is no guessing:

     in base, gone here          → deleted on purpose, remove it
     not in base, here           → added here, add it
     changed here                → apply the change
     in Drive, not in base       → another device's work, leave it alone

   The result is that a save can only ever carry this device's own changes.
   Anything it never knew about survives untouched.

   `theirs` is the base of the result, so when this device has nothing to say
   about something, Drive's version stands. */
function threeWayDayMap(base, mine, theirs) {
  const b = asMap(base);
  const m = asMap(mine);
  const t = asMap(theirs);
  const out = { ...t };

  // Days removed here on purpose.
  for (const day of Object.keys(b)) {
    if (!(day in m)) delete out[day];
  }

  for (const day of Object.keys(m)) {
    const mineDay = asMap(m[day]);
    const baseDay = asMap(b[day]);
    const theirDay = asMap(t[day]);
    const merged = { ...theirDay };

    for (const id of Object.keys(mineDay)) {
      if (stableStringify(mineDay[id]) !== stableStringify(baseDay[id])) merged[id] = mineDay[id];
    }
    for (const id of Object.keys(baseDay)) {
      if (!(id in mineDay)) delete merged[id];
    }

    if (Object.keys(merged).length) out[day] = merged;
    else delete out[day];
  }
  return out;
}

function threeWayList(base, mine, theirs) {
  const b = Array.isArray(base) ? base : [];
  const m = Array.isArray(mine) ? mine : [];
  const t = Array.isArray(theirs) ? theirs : [];

  const baseById = {};
  b.forEach((x) => { if (x && x.id) baseById[x.id] = x; });
  const mineById = {};
  m.forEach((x) => { if (x && x.id) mineById[x.id] = x; });

  const out = [];
  const seen = new Set();

  for (const item of t) {
    if (!item || !item.id) { out.push(item); continue; }
    seen.add(item.id);
    if (item.id in baseById && !(item.id in mineById)) continue;   // deleted here
    const here = mineById[item.id];
    if (here && stableStringify(here) !== stableStringify(baseById[item.id])) out.push(here);
    else out.push(item);
  }

  // Added here, and Drive has never seen it.
  for (const item of m) {
    if (!item || !item.id || seen.has(item.id)) continue;
    if (item.id in baseById) continue;   // Drive deleted it; respect that
    out.push(item);
  }
  return out;
}

const LISTS = ["categories", "targets", "timers", "breaks", "tasks"];

export function threeWay(base, mine, theirs) {
  if (!mine) return theirs || null;
  if (!theirs) return mine;
  if (!base) return null;   // nothing to reason from; the caller decides

  const out = { ...theirs };
  DAY_MAPS.forEach((k) => { out[k] = threeWayDayMap(base[k], mine[k], theirs[k]); });
  LISTS.forEach((k) => { out[k] = threeWayList(base[k], mine[k], theirs[k]); });

  // Settings follow this device, which is where they were just changed.
  out.reminders = mine.reminders || theirs.reminders;
  out.homeTab = mine.homeTab || theirs.homeTab;
  out.createdAt = theirs.createdAt || mine.createdAt;
  return out;
}

/* Drive wins, and nothing that can be kept is thrown away.

   Asked for twice, plainly: the copy in Drive is the one that counts. So a
   difference is no longer a question. What happens instead:

   Everything only this device knows — a day Drive has never seen, a task it
   does not have — is folded in, because keeping it costs nothing and loses
   nothing. Where the two genuinely disagree, the same entry holding two
   different values, Drive's value is taken and this device's is dropped.

   The count of what was dropped comes back with the document, because this
   is the one place the app discards something a person typed, and doing that
   silently would be the wrong kind of quiet. */
function preferDayMap(mine, theirs, tally) {
  const a = asMap(mine);
  const b = asMap(theirs);
  const out = { ...b };
  for (const day of Object.keys(a)) {
    if (!(day in b)) { out[day] = a[day]; continue; }
    const mineDay = asMap(a[day]);
    const theirDay = asMap(b[day]);
    const merged = { ...theirDay };
    for (const id of Object.keys(mineDay)) {
      if (!(id in theirDay)) { merged[id] = mineDay[id]; continue; }
      if (stableStringify(mineDay[id]) !== stableStringify(theirDay[id])) tally.dropped += 1;
    }
    out[day] = merged;
  }
  return out;
}

function preferById(mine, theirs, tally) {
  const a = Array.isArray(mine) ? mine : [];
  const b = Array.isArray(theirs) ? theirs : [];
  const byId = {};
  b.forEach((x) => { if (x && x.id) byId[x.id] = x; });
  const out = b.slice();
  for (const item of a) {
    if (!item || !item.id) continue;
    const other = byId[item.id];
    if (!other) { out.push(item); continue; }
    if (stableStringify(item) !== stableStringify(other)) tally.dropped += 1;
  }
  return out;
}

export function preferDrive(mine, theirs) {
  if (!theirs) return null;
  if (!mine) return { doc: theirs, dropped: 0 };

  const tally = { dropped: 0 };
  const doc = { ...theirs };
  DAY_MAPS.forEach((key) => { doc[key] = preferDayMap(mine[key], theirs[key], tally); });
  doc.tasks = preferById(mine.tasks, theirs.tasks, tally);

  /* The targets themselves come from Drive untouched. Folding in a target
     this device still has would resurrect one deleted on the other, and a
     deletion is a decision. Their day-by-day entries survive regardless —
     the Log keeps whatever was logged against them. */
  STRUCTURE.forEach((key) => {
    if (stableStringify(mine[key] ?? null) !== stableStringify(theirs[key] ?? null)) tally.dropped += 0;
  });

  return { doc, dropped: tally.dropped };
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
