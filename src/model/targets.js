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

/* Does this target apply on this date at all? Weekly targets are eligible on
   any of their chosen days; daily ones are scheduled on theirs. */
export function appliesOn(t, dayKey) {
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
    let monday = startOfWeek(new Date());
    if (!progress(t, keyOf(monday), log).met) monday = addDays(monday, -7);
    let n = 0;
    for (let i = 0; i < 260; i++) {
      if (daysBetween(floor, keyOf(addDays(monday, 6))) < 0) break;
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
    const mondays = [...new Set(keys.map((k) => keyOf(startOfWeek(parseKey(k)))))];
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

  if (t.period === "week") {
    if (t.dir === "at_most") return `No more than ${fmtNum(t.goal)}${unit} a week`;
    const base = t.kind === "tick" ? `${fmtNum(t.goal)}× a week` : `At least ${fmtNum(t.goal)}${unit} a week`;
    return hasTypes(t) ? `${base} · ${t.types.length} types` : base;
  }
  if (t.kind === "tick") return `Every day${days}`;
  if (t.dir === "at_most") return `No more than ${fmtNum(t.goal)}${unit} a day${days}`;
  return `At least ${fmtNum(t.goal)}${unit} a day${days}`;
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

/* The type ids planned for a day. Empty for a target without types, which is
   why isPlannedOn exists alongside it. */
export function plannedOn(t, dayKey) {
  return planEntry(t, dow(parseKey(dayKey))).types;
}

/* Whether the plan asked for this target at all on this day. */
export function isPlannedOn(t, dayKey) {
  return planEntry(t, dow(parseKey(dayKey))).planned;
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
export function planStatus(t, dayKey, log) {
  const planned = plannedOn(t, dayKey);
  const done = typesOn(log, t.id, dayKey);

  // Without types there is nothing to list, so the question is simply whether
  // the day was planned and whether anything was logged against it.
  if (!hasTypes(t)) {
    const asked = isPlannedOn(t, dayKey);
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

/* Does this target have any plan at all? Drives whether the week view bothers
   showing ghosts for what was intended. */
export const hasPlan = (t) =>
  !!t.plan && Object.values(t.plan).some((v) => v === true || (Array.isArray(v) && v.length));

export const typeName = (t, id) => {
  const found = (t.types || []).find((x) => x.id === id);
  return found ? found.name : id;
};

export const uid = (p) => p + Math.random().toString(36).slice(2, 9);
