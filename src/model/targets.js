/* ==========================================================================
   The domain model, as pure functions.

   Nothing here touches React, Drive or the DOM, which is what makes it
   testable in plain Node and portable between the web build and the phone.

   Every target is three independent axes, and between them they express every
   kind of goal the app needs:

     kind    'tick' | 'amount'        a checkbox, or a number you log
     dir     'at_least' | 'at_most'   a floor to reach, or a ceiling to stay under
     period  'day' | 'week'           judged each day, or across the whole week

   "8,000 steps every day" is amount/at_least/day. "Strength 4x a week" is
   tick/at_least/week. "No more than 6 units of alcohol a week" is
   amount/at_most/week.
   ========================================================================== */

export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DOW_LETTER = ["M", "T", "W", "T", "F", "S", "S"];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/* ---------------------------------------------------------------- dates --
   All dates are local, keyed "YYYY-MM-DD". Weeks start Monday, so day indexes
   throughout are 0=Mon .. 6=Sun rather than JS's 0=Sun.                     */

const pad = (n) => String(n).padStart(2, "0");
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const dow = (d) => (d.getDay() + 6) % 7;
export const todayKey = () => keyOf(new Date());
export const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k));

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
export const startOfWeek = (d) => addDays(d, -dow(d));
export const weekKeys = (monday) => ALL_DAYS.map((i) => keyOf(addDays(monday, i)));
export const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

/* Numbers: goals like 3 L of water move in quarters, so keep two decimals but
   never show a trailing ".00". */
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const fmtNum = (n) => {
  const r = round2(n);
  return Number.isInteger(r) ? String(r) : String(r);
};

/* ------------------------------------------------------------- readings -- */

/* One day's entry for one target, in a single shape whatever was stored.

   Ticks were originally `true` and amounts plain numbers. Targets with types
   (a strength session that was arms, or waist) need to record *which*, so an
   entry may also be `{ n, v }` — a count and the list of type ids. Reading
   everything through here means the older shapes keep working untouched, which
   matters when the file has been sitting in someone's Drive for months. */
export function entryOf(log, targetId, dayKey) {
  const v = (log[dayKey] || {})[targetId];
  if (v == null || v === false) return { n: 0, v: [] };
  if (v === true) return { n: 1, v: [] };
  if (typeof v === "number") return { n: v, v: [] };
  if (typeof v === "object") {
    const list = Array.isArray(v.v) ? v.v : [];
    return { n: Number(v.n) || list.length, v: list };
  }
  return { n: 0, v: [] };
}

export const valueOn = (log, targetId, dayKey) => entryOf(log, targetId, dayKey).n;

/* Which types were done on a day. */
export const typesOn = (log, targetId, dayKey) => entryOf(log, targetId, dayKey).v;

export const hasTypes = (t) => Array.isArray(t.types) && t.types.length > 0;

/* ------------------------------------------------------------- end date --
   A recurring plan repeats forever unless something stops it. `until` is the
   last date a target runs, inclusive — Spanish every day until the trip, the
   LED mask three times a week for the eight weeks of the course.

   It is deliberately not the same as archiving. Archiving pauses a target now
   and strikes it through the list; an end date is a decision made in advance
   about a date that may not have arrived yet, and the target behaves entirely
   normally until it does. Both leave history alone. */

/* The last day this target runs, or "" for one with no end. Stored as a date
   key so it sorts and compares as a string. */
export const endOf = (t) => (isDateKey(t.until) ? t.until : "");

/* Was this target still running on this date? */
export const runsOn = (t, dayKey) => {
  const end = endOf(t);
  return !end || dayKey <= end;
};

/* Has its end date already passed? For labelling it in a list, where the
   question is about now rather than about a particular date. */
export const hasEnded = (t) => {
  const end = endOf(t);
  return !!end && end < todayKey();
};

/* Sets or clears the end date. Anything that is not a date key clears it, so a
   half-typed value in a text field can never end a target by accident. */
export const setEnd = (t, dayKey) => ({ ...t, until: isDateKey(dayKey) ? dayKey : "" });

/* Does this target apply on this date at all? Weekly targets are eligible on
   any of their chosen days; daily ones are scheduled on theirs — and neither
   applies past the day it was set to end. */
export function appliesOn(t, dayKey) {
  if (!runsOn(t, dayKey)) return false;
  const days = t.days && t.days.length ? t.days : ALL_DAYS;
  return days.includes(dow(parseKey(dayKey)));
}

export const isFuture = (dayKey) => daysBetween(todayKey(), dayKey) > 0;

/* ------------------------------------------------------------- progress --
   One function answers "how is this target doing" for both periods. For a
   weekly target the window is the whole week the day falls in; for a daily one
   it is just that day. `met` is the pass/fail; `ratio` drives the bars. */

/* A tick judged daily can only ever be 0 or 1, so its goal is 1 whatever the
   stored value says. Editing a target from "4x a week" to a daily tick used to
   leave the 4 behind in a field the form no longer shows, producing a target
   that could be done every single day and still read 0%. Clamping here repairs
   documents already saved that way, without touching anyone's file. */
export const goalOf = (t) =>
  t.kind === "tick" && t.period === "day" ? 1 : Number(t.goal) || 1;

export function progress(t, dayKey, log) {
  let total;
  let window;
  if (t.period === "week") {
    const monday = startOfWeek(parseKey(dayKey));
    window = weekKeys(monday);
    total = window.reduce((sum, k) => sum + valueOn(log, t.id, k), 0);
  } else {
    window = [dayKey];
    total = valueOn(log, t.id, dayKey);
  }
  total = round2(total);

  const goal = goalOf(t);
  const met = t.dir === "at_most" ? total <= goal : total >= goal;

  return {
    total,
    goal,
    met,
    ratio: goal > 0 ? total / goal : 0,
    window,
    over: t.dir === "at_most" && total > goal,
  };
}

export const liveTargets = (targets) => targets.filter((t) => !t.archived);

/* Ceilings broken *on this specific day* — daily ones only. A weekly ceiling
   that has blown its budget is true of the whole week, so colouring every day
   of that week red would let one heavy Friday repaint the other six. Weekly
   ceilings get their own trend line in Insights instead. */
export function dayLimitsBroken(dayKey, targets, log) {
  return liveTargets(targets).filter(
    (t) => t.dir === "at_most" && t.period === "day" && appliesOn(t, dayKey) && progress(t, dayKey, log).over
  ).length;
}

/* The day ring counts only the "things to actively do" scheduled that day:
   daily at_least targets. Ceilings are reported beside it as limits kept,
   because a limit you have simply not broken yet should not inflate a score. */
export function dayScore(dayKey, targets, log) {
  const live = liveTargets(targets);
  const due = live.filter((t) => t.period === "day" && t.dir === "at_least" && appliesOn(t, dayKey));
  const done = due.filter((t) => progress(t, dayKey, log).met).length;

  const limits = live.filter((t) => t.dir === "at_most" && appliesOn(t, dayKey));
  const broken = limits.filter((t) => progress(t, dayKey, log).over).length;

  return { due: due.length, done, pct: due.length ? done / due.length : 0, limits: limits.length, broken };
}

/* Consecutive periods met, counting back from now. A period still in progress
   (today, or this week) never breaks a streak — it just does not add to it.

   `from` is the day the document was created. Nothing before it can count: an
   empty week in the past trivially satisfies "no more than 6 units", which
   would otherwise hand every ceiling an infinite streak reaching back to 1970. */
export function streak(t, log, from) {
  const floor = from || todayKey();

  if (t.period === "week") {
    // A target that has ended keeps the streak it finished on rather than
    // having it eaten away by the empty weeks since.
    const end = endOf(t);
    let monday = startOfWeek(end && end < todayKey() ? parseKey(end) : new Date());
    if (!progress(t, keyOf(monday), log).met) monday = addDays(monday, -7);
    let n = 0;
    for (let i = 0; i < 260; i++) {
      /* The whole week has to be yours, not just its last day. Testing the
         Sunday let the week you started in count — begin on a Friday and an
         untouched ceiling had already streaked two weeks by Monday. It is the
         same rule the hit rates use: a week you were only present for part of
         is not a week you kept. */
      if (daysBetween(floor, keyOf(monday)) < 0) break;
      if (!progress(t, keyOf(monday), log).met) break;
      n++;
      monday = addDays(monday, -7);
    }
    return n;
  }

  let d = new Date();
  if (appliesOn(t, keyOf(d)) && !progress(t, keyOf(d), log).met) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const k = keyOf(d);
    if (daysBetween(floor, k) < 0) break;
    if (appliesOn(t, k)) {
      if (!progress(t, k, log).met) break;
      n++;
    }
    d = addDays(d, -1);
  }
  return n;
}

/* ------------------------------------------------------------ hit rates --
   A target is measured in its own unit: a daily target in days, a weekly one
   in weeks. Blending the two would mean dividing a count of days by a count of
   weeks and calling the result a percentage.                                */

export function targetStats(t, keys, log) {
  if (t.period === "week") {
    /* A week only counts if the target ran for all of it. Ending something on
       a Wednesday leaves a two-day week that a "three times a week" goal was
       never going to be met in, and scoring that as a failure would make
       stopping a target look like giving up on it. */
    const mondays = [...new Set(keys.map((k) => keyOf(startOfWeek(parseKey(k)))))]
      .filter((m) => runsOn(t, keyOf(addDays(parseKey(m), 6))));
    const done = mondays.filter((m) => progress(t, m, log).met).length;
    return { n: mondays.length, done, pct: mondays.length ? done / mondays.length : 0, unit: "weeks" };
  }
  const sched = keys.filter((k) => appliesOn(t, k));
  const done = sched.filter((k) => progress(t, k, log).met).length;
  return { n: sched.length, done, pct: sched.length ? done / sched.length : 0, unit: "days" };
}

/* Pooled across every target of one period, so each target-day (or
   target-week) counts once.

   Pooling matters. Averaging each day's percentage instead would let a Monday
   with one target scheduled weigh as much as a Thursday with eight — so
   missing that single Monday thing costs the same as missing eight — which is
   not what "targets kept" sounds like it means.

   Ceilings are left out: they are reported as weeks within the limit on their
   own trend, and a limit you have merely not broken should not count as an
   achievement here. */
export function periodStats(targets, keys, log, period) {
  const ts = liveTargets(targets).filter((t) => t.period === period && t.dir === "at_least");
  let n = 0;
  let done = 0;
  ts.forEach((t) => {
    const s = targetStats(t, keys, log);
    n += s.n;
    done += s.done;
  });
  return {
    n, done,
    pct: n ? done / n : 0,
    unit: period === "week" ? "weeks" : "days",
    targets: ts.length,
  };
}

/* ----------------------------------------------------------- describing -- */

/* A plain-English sentence for a target. Reading these back is the quickest
   way to tell whether the three axes were set the way you meant them. */
export function describe(t) {
  const unit = t.unit ? ` ${t.unit}` : "";
  const days =
    t.days && t.days.length && t.days.length < 7
      ? ` on ${t.days.slice().sort((a, b) => a - b).map((d) => DOW[d]).join(", ")}`
      : "";

  // "Every day" is only true of a target with no end; saying so about one that
  // stopped in March is the sentence being wrong rather than merely terse.
  const end = endOf(t);
  const ends = end
    ? `${hasEnded(t) ? ", ended " : ", until "}${parseKey(end).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
    : "";

  if (t.period === "week") {
    if (t.dir === "at_most") return `No more than ${fmtNum(t.goal)}${unit} a week${ends}`;
    const base = t.kind === "tick" ? `${fmtNum(t.goal)}× a week` : `At least ${fmtNum(t.goal)}${unit} a week`;
    return hasTypes(t) ? `${base} · ${t.types.length} types${ends}` : `${base}${ends}`;
  }
  if (t.kind === "tick") return `Every day${days}${ends}`;
  if (t.dir === "at_most") return `No more than ${fmtNum(t.goal)}${unit} a day${days}${ends}`;
  return `At least ${fmtNum(t.goal)}${unit} a day${days}${ends}`;
}

/* ------------------------------------------------------------ mutations --
   Returned as new logs rather than mutated in place, so React sees a change
   and the Drive layer has a clean value to persist. */

export function setValue(log, targetId, dayKey, value) {
  const next = { ...log };
  const day = { ...(next[dayKey] || {}) };
  if (!value) delete day[targetId];
  else day[targetId] = value;
  if (Object.keys(day).length) next[dayKey] = day;
  else delete next[dayKey];
  return next;
}

/* Tapping the circle. A tick toggles; an amount either fills in exactly what
   is still needed to hit the goal, or clears the day if you tap it again. */
export function toggle(log, t, dayKey) {
  if (t.dir === "at_most") return log;          // you cannot "tick" a limit
  if (t.kind === "tick") {
    return setValue(log, t.id, dayKey, valueOn(log, t.id, dayKey) ? 0 : true);
  }
  if (valueOn(log, t.id, dayKey) > 0) return setValue(log, t.id, dayKey, 0);

  const p = progress(t, dayKey, log);
  const needed = t.period === "week" ? Math.max(t.step, round2(p.goal - p.total)) : t.goal;
  return setValue(log, t.id, dayKey, round2(needed));
}

export function step(log, t, dayKey, delta) {
  const next = Math.max(0, round2(valueOn(log, t.id, dayKey) + delta * t.step));
  return setValue(log, t.id, dayKey, next);
}

/* ---------------------------------------------------------------- types --
   Only tick targets carry types. "Did you do it, and which kind" is a sensible
   question; "how many minutes, and which kind" is two measurements wearing one
   coat, and the editor keeps them apart rather than pretending otherwise. */

/* Each type done on a day counts as one session, so ticking arms and waist on
   the same day is two towards a weekly total of four. */
export function setTypes(log, t, dayKey, ids) {
  const list = [...new Set(ids)].filter(Boolean);
  if (!list.length) return setValue(log, t.id, dayKey, 0);
  const next = { ...log };
  next[dayKey] = { ...(next[dayKey] || {}), [t.id]: { n: list.length, v: list } };
  return next;
}

export function toggleType(log, t, dayKey, typeId) {
  const current = typesOn(log, t.id, dayKey);
  return setTypes(log, t, dayKey,
    current.includes(typeId) ? current.filter((x) => x !== typeId) : [...current, typeId]);
}

/* How often one type was done across the week containing `dayKey`. */
export function typeProgress(t, type, dayKey, log) {
  const window = t.period === "week"
    ? weekKeys(startOfWeek(parseKey(dayKey)))
    : [dayKey];
  const total = window.filter((k) => typesOn(log, t.id, k).includes(type.id)).length;
  const goal = Number(type.goal) || 0;
  return { total, goal, met: goal ? total >= goal : null };
}

/* ----------------------------------------------------------- weekly plan --
   `t.plan` maps a weekday (0=Mon) to the type ids intended for that day. It is
   a template that repeats each week rather than a diary of specific dates —
   which is what "a plan for the week" usually means, and it survives into next
   week without being retyped. */

/* One weekday's entry in the plan, in a single shape whatever was stored.

   A target with types plans which kinds fall on which day, so its entry is a
   list of type ids. A target without types has nothing to choose between — the
   plan is simply "I mean to do this on Tuesday" — so its entry is `true`.
   Reading both through here keeps every caller from having to know which. */
export function planEntry(t, dowIndex) {
  const v = (t.plan || {})[dowIndex];
  if (v === true) return { planned: true, types: [] };
  if (Array.isArray(v) && v.length) return { planned: true, types: v };
  return { planned: false, types: [] };
}

/* What the plan asks of one target on one particular date.

   Two things can say: the target's own weekly rhythm, which repeats until its
   end date, and an override for that single date. The override wins —
   including when it says no, which is how a week you are away can differ from
   every other week without disturbing the rhythm you keep the rest of the
   time.

   `source` says which answered, so the interface can be honest about whether
   changing something affects one week or all of them. */
export function planFor(t, dayKey, plans) {
  // An end date outranks both. It is the one answer that is about whether the
  // target exists on that date at all, so a one-off override left behind past
  // the end cannot quietly resurrect it.
  if (!runsOn(t, dayKey)) return { planned: false, types: [], source: "ended" };

  const override = ((plans || {})[dayKey] || {})[t.id];

  if (override === false) return { planned: false, types: [], source: "override" };
  if (override === true) return { planned: true, types: [], source: "override" };
  if (Array.isArray(override)) {
    return { planned: override.length > 0, types: override, source: "override" };
  }

  const entry = planEntry(t, dow(parseKey(dayKey)));
  return { ...entry, source: entry.planned ? "recurring" : "none" };
}

/* The type ids planned for a day. Empty for a target without types, which is
   why isPlannedOn exists alongside it. */
export function plannedOn(t, dayKey, plans) {
  return planFor(t, dayKey, plans).types;
}

/* Whether the plan asked for this target at all on this day. */
export function isPlannedOn(t, dayKey, plans) {
  return planFor(t, dayKey, plans).planned;
}

/* Sets what one date asks of one target, without touching the weekly rhythm.
   `value` may be true, false, a list of type ids, or null to drop the override
   and fall back to whatever the rhythm says. */
export function setPlanOverride(plans, t, dayKey, value) {
  const next = { ...(plans || {}) };
  const day = { ...(next[dayKey] || {}) };

  if (value === null || value === undefined) delete day[t.id];
  else if (Array.isArray(value) && !value.length) day[t.id] = false;
  else day[t.id] = value;

  if (Object.keys(day).length) next[dayKey] = day;
  else delete next[dayKey];
  return next;
}

/* The type ids planned for one weekday, as a list.

   A weekday's plan is a list of type ids for a target with types and a plain
   `true` for one without, and both live in the same field. Anywhere that wants
   the ids has to cope with `true`, which has no `.filter`, no `.includes` and
   no length — reading through here rather than assuming an array is what stops
   that being discovered one call site at a time. */
export const planTypes = (plan, dowIndex) => {
  const v = (plan || {})[dowIndex];
  return Array.isArray(v) ? v : [];
};

/* Drops type ids that no longer exist, leaving whole-target flags alone.

   Deleting a kind has to take it out of the plan too, or the plan goes on
   asking for something there is no longer any way to do. A plain `true` is not
   about any kind, so it survives untouched — pruning it as though it were a
   list of ids is what used to make saving a planned target throw. */
export function prunePlan(plan, keepIds) {
  const keep = keepIds instanceof Set ? keepIds : new Set(keepIds || []);
  const out = {};
  Object.entries(plan || {}).forEach(([d, v]) => {
    if (v === true) { out[d] = true; return; }
    const ids = (Array.isArray(v) ? v : []).filter((id) => keep.has(id));
    if (ids.length) out[d] = ids;
  });
  return out;
}

/* ------------------------------------------------------------ day notes --
   What happened on one particular day, for one particular target.

   Distinct from a target's own `note`, which is the same text every time —
   the routine, the rule, the links. This is the opposite: "knee clicked on
   the third set", "walked it instead", "skipped, travelling". One is a
   reference, the other a diary.

   Kept beside the log rather than inside it for two reasons. A note is worth
   writing on a day you did *not* do the thing, which an entry in the log
   would misrepresent as having done it. And the log's cells already carry
   comma-separated kind names, so free text in the same cell could not be read
   back out again. */

export const dayNote = (notes, targetId, dayKey) =>
  String(((notes || {})[dayKey] || {})[targetId] || "");

export const hasDayNote = (notes, targetId, dayKey) => dayNote(notes, targetId, dayKey) !== "";

/* Writing an empty note removes it, and removes the day with it once nothing
   is left — otherwise clearing notes for a week leaves a week of empty days
   behind to be written to the sheet and read back forever. */
export function setDayNote(notes, targetId, dayKey, text) {
  const body = String(text == null ? "" : text).trim();
  const next = { ...(notes || {}) };
  const day = { ...(next[dayKey] || {}) };

  if (body) day[targetId] = body;
  else delete day[targetId];

  if (Object.keys(day).length) next[dayKey] = day;
  else delete next[dayKey];
  return next;
}

/* Every day this target has a note on, newest first — one target's diary. */
export function noteDays(notes, targetId) {
  return Object.keys(notes || {})
    .filter((k) => isDateKey(k) && dayNote(notes, targetId, k))
    .sort()
    .reverse();
}

/* Notes belonging to targets that no longer exist, dropped. Deleting a target
   already takes its history; its notes should not outlive it. */
export function pruneNotes(notes, targets) {
  const live = new Set((targets || []).map((t) => t.id));
  const out = {};
  Object.entries(notes || {}).forEach(([day, byTarget]) => {
    const kept = Object.fromEntries(
      Object.entries(byTarget).filter(([id, text]) => live.has(id) && String(text || "").trim())
    );
    if (Object.keys(kept).length) out[day] = kept;
  });
  return out;
}

/* ------------------------------------------------------- clearing history --
   Throwing away everything up to and including one date.

   The case this is for: a week of trying the app out, then a day you decide
   is the real beginning. Those first entries are not wrong exactly, they are
   just not yours — and left in place they sit in every rate and every trend
   as though they were.

   It moves the start date with them. Insights begins the window at whichever
   is earlier, the day the document was created or the first day anything was
   logged, so deleting the entries alone would leave the empty days before
   your real start still being counted, and counted as misses. */

/* What clearing would take, so the question can be asked with numbers in it
   rather than "are you sure". */
export function historyBefore(doc, dayKey) {
  if (!isDateKey(dayKey)) return { days: 0, entries: 0, notes: 0, plans: 0, first: null, last: null };

  const upTo = (map) => Object.keys(map || {}).filter((d) => isDateKey(d) && d <= dayKey);
  const count = (map) =>
    upTo(map).reduce((n, d) => n + Object.keys(map[d] || {}).length, 0);

  const days = [...new Set([
    ...upTo(doc.log), ...upTo(doc.notes), ...upTo(doc.plans),
  ])].sort();

  return {
    days: days.length,
    entries: count(doc.log),
    notes: count(doc.notes),
    plans: count(doc.plans),
    first: days[0] || null,
    last: days[days.length - 1] || null,
  };
}

export function clearHistoryBefore(doc, dayKey) {
  if (!isDateKey(dayKey)) return doc;

  const keep = (map) => Object.fromEntries(
    Object.entries(map || {}).filter(([d]) => isDateKey(d) && d > dayKey)
  );

  /* The day after the cut is the new beginning — unless the document already
     began later than that, in which case clearing older history says nothing
     about when you started and the date stays where it is. */
  const start = keyOf(addDays(parseKey(dayKey), 1));
  const createdKey = doc.createdAt ? keyOf(new Date(doc.createdAt)) : start;
  const createdAt = createdKey > start ? doc.createdAt : parseKey(start).toISOString();

  return {
    ...doc,
    createdAt,
    log: keep(doc.log),
    notes: keep(doc.notes),
    plans: keep(doc.plans),
  };
}

/* The weekdays a target is planned for, for showing and for editing. */
export function plannedDays(t) {
  return ALL_DAYS.filter((d) => planEntry(t, d).planned);
}

/* Sets or clears a whole-target plan for one weekday. Only meaningful without
   types; a typed target's plan is per type. */
export function setPlannedDay(t, dowIndex, on) {
  const plan = { ...(t.plan || {}) };
  if (on) plan[dowIndex] = true;
  else delete plan[dowIndex];
  return { ...t, plan };
}

/* What the plan expected against what actually happened. A day still to come
   is never "missed" — it is simply ahead of you. */
export function planStatus(t, dayKey, log, plans) {
  const planned = plannedOn(t, dayKey, plans);
  const done = typesOn(log, t.id, dayKey);

  // Without types there is nothing to list, so the question is simply whether
  // the day was planned and whether anything was logged against it.
  if (!hasTypes(t)) {
    const asked = isPlannedOn(t, dayKey, plans);
    const did = valueOn(log, t.id, dayKey) > 0;
    return {
      planned: [], done: [], kept: [],
      askedFor: asked,
      missed: asked && !did && !isFuture(dayKey) ? ["*"] : [],
      extra: [],
    };
  }

  return {
    planned,
    done,
    askedFor: planned.length > 0,
    kept: planned.filter((id) => done.includes(id)),
    missed: isFuture(dayKey) ? [] : planned.filter((id) => !done.includes(id)),
    extra: done.filter((id) => !planned.includes(id)),
  };
}

/* Drops every target's recurring weekday plan.

   The targets, their goals, their end dates and everything ever logged are
   left exactly as they are — this clears only the weekdays the plan suggests
   them on. Date-specific decisions live in doc.plans and are deliberately not
   touched: those were made about one particular day, not about the rhythm. */
export const clearWeeklyPlans = (targets) => (targets || []).map((t) => ({ ...t, plan: {} }));

/* How many targets currently ask for particular weekdays, for saying out loud
   what clearing them would cost. */
export const plannedCount = (targets) => (targets || []).filter(hasPlan).length;

/* Does this target have any plan at all? Drives whether the week view bothers
   showing ghosts for what was intended. */
export const hasPlan = (t) =>
  !!t.plan && Object.values(t.plan).some((v) => v === true || (Array.isArray(v) && v.length));

export const typeName = (t, id) => {
  const found = (t.types || []).find((x) => x.id === id);
  return found ? found.name : id;
};

export const uid = (p) => p + Math.random().toString(36).slice(2, 9);
