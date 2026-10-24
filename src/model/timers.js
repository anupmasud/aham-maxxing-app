/* ==========================================================================
   Interval timers: sets, rounds, and the rests between them.

   Three sets of four rounds, forty-five seconds a round. A utility rather
   than a target — the timer you set up is saved, and running it records
   nothing at all. That is deliberate and it is what was asked for: a timer is
   a stopwatch, not a claim about your week, and logging every time you
   started one would quietly turn a tool into a scoreboard.

   Rests are part of the definition rather than an extra. "Three sets of
   exercises which are timed" is unusable as twelve unbroken rounds — the gap
   between rounds and the longer gap between sets are the shape of the
   session, so they are configurable and default to something sane.

   The important decision is in `phaseAt`: where you are is computed from how
   much time has passed, against a schedule worked out up front. Nothing
   counts down. A timer that decrements a number every second drifts whenever
   the phone throttles the app — which is exactly what happens when the screen
   dims mid-workout — and it drifts silently, so a forty-five second round
   quietly becomes fifty. Reading the wall clock instead means the app can
   miss a hundred frames and still be right.
   ========================================================================== */

import { uid } from "./targets";

export const TIMER_LIMITS = {
  sets:    { min: 1, max: 20,   d: 3  },
  rounds:  { min: 1, max: 50,   d: 4  },
  work:    { min: 1, max: 3600, d: 45 },
  rest:    { min: 0, max: 3600, d: 15 },
  setRest: { min: 0, max: 3600, d: 60 },
  leadIn:  { min: 0, max: 60,   d: 10 },
};

const clampField = (key, value) => {
  const { min, max, d } = TIMER_LIMITS[key];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
};

const clean = (s) => String(s == null ? "" : s).trim();

/* Every number is clamped on the way in rather than trusted.

   These come from a text field and from a spreadsheet anybody can type into,
   and a zero-second round or a thousand sets is not a preference — it is a
   schedule with no end, built on the phone of somebody about to exercise. */
export function clampTimer(t = {}) {
  return {
    ...t,
    name: clean(t.name) || "Timer",
    sets: clampField("sets", t.sets),
    rounds: clampField("rounds", t.rounds),
    work: clampField("work", t.work),
    rest: clampField("rest", t.rest),
    setRest: clampField("setRest", t.setRest),
    leadIn: clampField("leadIn", t.leadIn),
  };
}

export function makeTimer(input = {}) {
  const base = {};
  Object.keys(TIMER_LIMITS).forEach((k) => { base[k] = TIMER_LIMITS[k].d; });
  return { id: uid("w_"), order: 0, ...base, name: "Timer", ...clampTimer({ ...base, ...input }) };
}

export const timerList = (timers) => (Array.isArray(timers) ? timers : []);

export const PHASES = {
  lead: { id: "lead", label: "Get ready" },
  work: { id: "work", label: "Go" },
  rest: { id: "rest", label: "Rest" },
  setRest: { id: "setRest", label: "Set break" },
};

/* The whole session laid out end to end, in order.

   A rest is only ever *between* things: no rest after the last round of a
   set, no set break after the last set. Getting that wrong leaves you staring
   at a fifteen-second rest after the session has finished, which is the kind
   of thing that reads as a bug the very first time anyone uses it. */
export function phases(timer) {
  const t = clampTimer(timer);
  const out = [];
  if (t.leadIn > 0) out.push({ kind: "lead", set: 1, round: 0, ms: t.leadIn * 1000 });

  for (let s = 1; s <= t.sets; s++) {
    for (let r = 1; r <= t.rounds; r++) {
      out.push({ kind: "work", set: s, round: r, ms: t.work * 1000 });
      if (r < t.rounds && t.rest > 0) {
        out.push({ kind: "rest", set: s, round: r, ms: t.rest * 1000 });
      }
    }
    if (s < t.sets && t.setRest > 0) {
      out.push({ kind: "setRest", set: s, round: t.rounds, ms: t.setRest * 1000 });
    }
  }
  return out;
}

export const totalMs = (timer) => phases(timer).reduce((sum, p) => sum + p.ms, 0);

/* Time spent actually working, which is the honest answer to "how long is
   this" for someone deciding whether to start it. */
export const workMs = (timer) => {
  const t = clampTimer(timer);
  return t.sets * t.rounds * t.work * 1000;
};

/* Where the session is, `elapsed` milliseconds in.

   Computed by walking the schedule rather than by counting down. Before the
   start and past the end are both real states a screen has to render, so they
   are returned rather than treated as impossible. */
export function phaseAt(timer, elapsed) {
  const list = phases(timer);
  const total = list.reduce((sum, p) => sum + p.ms, 0);
  const at = Math.max(0, Number(elapsed) || 0);

  if (at >= total) {
    const last = list[list.length - 1] || { set: 1, round: 1 };
    return {
      done: true, kind: "done", index: list.length,
      set: last.set, round: last.round,
      remaining: 0, elapsedInPhase: 0, phaseMs: 0,
      total, elapsed: total, count: list.length,
    };
  }

  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (at < acc + p.ms) {
      return {
        done: false, kind: p.kind, index: i,
        set: p.set, round: p.round,
        elapsedInPhase: at - acc,
        remaining: acc + p.ms - at,
        phaseMs: p.ms,
        total, elapsed: at, count: list.length,
      };
    }
    acc += p.ms;
  }

  // Unreachable while `at < total`, but a loop that can fall out needs an answer.
  return {
    done: true, kind: "done", index: list.length, set: 1, round: 1,
    remaining: 0, elapsedInPhase: 0, phaseMs: 0, total, elapsed: total, count: list.length,
  };
}

/* Which rounds of work are behind you — for "round 7 of 12" rather than
   "phase 13 of 23", which is true and useless. */
export function workDone(timer, elapsed) {
  const t = clampTimer(timer);
  const here = phaseAt(timer, elapsed);
  if (here.done) return t.sets * t.rounds;
  const before = (here.set - 1) * t.rounds;
  // Mid-round counts as not yet finished; a rest means the round before it is.
  return before + (here.kind === "work" ? here.round - 1 : here.round);
}

/* m:ss, always, so the digits do not jump around as the number shrinks.
   Rounds up, because a clock reading 0:00 for a whole second while something
   is still running is the one thing people notice. */
export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* A minutes-and-seconds summary for a list row. */
export function fmtLength(ms) {
  const secs = Math.round((Number(ms) || 0) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.round(secs / 60);
  return `${m} min`;
}

export const describeTimer = (timer) => {
  const t = clampTimer(timer);
  const bits = [`${t.sets} × ${t.rounds} × ${t.work}s`];
  if (t.rest > 0) bits.push(`${t.rest}s rest`);
  if (t.setRest > 0 && t.sets > 1) bits.push(`${t.setRest}s between sets`);
  return bits.join("  ·  ");
};

/* ------------------------------------------------------------ the list -- */

export const sortTimers = (timers) =>
  timerList(timers).slice().sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));

export function addTimer(timers, input = {}) {
  const list = timerList(timers);
  const last = list.reduce((max, t) => Math.max(max, t.order || 0), -1);
  return [...list, makeTimer({ ...input, order: last + 1 })];
}

export const saveTimer = (timers, id, change) =>
  timerList(timers).map((t) => (t.id === id ? clampTimer({ ...t, ...change }) : t));

export const removeTimer = (timers, id) => timerList(timers).filter((t) => t.id !== id);

export function reorderTimers(timers, from, to) {
  const list = sortTimers(timers);
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return timerList(timers);
  }
  const moved = list.slice();
  moved.splice(to, 0, moved.splice(from, 1)[0]);
  return moved.map((t, i) => ({ ...t, order: i }));
}
