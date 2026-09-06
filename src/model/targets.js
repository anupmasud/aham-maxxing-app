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

/* Ticks are stored as true, amounts as numbers; both read out as a number. */
export function valueOn(log, targetId, dayKey) {
  const day = log[dayKey];
  if (!day) return 0;
  const v = day[targetId];
  if (v === true) return 1;
  if (v === false || v == null) return 0;
  return Number(v) || 0;
}

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

  const goal = Number(t.goal) || 1;
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
    return t.kind === "tick" ? `${fmtNum(t.goal)}× a week` : `At least ${fmtNum(t.goal)}${unit} a week`;
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

export const uid = (p) => p + Math.random().toString(36).slice(2, 9);
