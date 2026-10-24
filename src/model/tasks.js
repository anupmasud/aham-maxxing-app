/* ==========================================================================
   One-off tasks for a particular day.

   Everything else in this app is a promise you make repeatedly — every day,
   four times a week, no more than two a month. A task is the opposite: book
   the colonoscopy, ring the landlord, collect the parcel. It happens once, on
   a day you choose, and then it is over.

   They are kept apart from targets rather than added as a kind of target, and
   the reason is the one thing that was asked for: no analytics. A flag on a
   target saying "do not count me" has to be remembered by `dayScore`,
   `dayLimitsBroken`, `targetStats`, `periodStats`, `streak`, the week trends,
   the CSV export — and by whatever scoring function gets written next year by
   someone who never heard of the flag. Tasks are simply not in `doc.targets`,
   so no scoring code can reach them: the exclusion is structural rather than
   remembered, and it cannot rot.

   The cost of that choice is that tasks do not get the target machinery for
   free — no goals, no units, no streaks, no plan. Which is right. A task is
   done or it is not.

   Rollover is the one piece of behaviour beyond storing them. A to-do list
   that quietly forgets Tuesday's unfinished task on Wednesday morning is not
   a to-do list, so anything still open from an earlier day is surfaced on
   today rather than lost. It is surfaced, not moved: the task keeps the date
   you gave it, because "I meant to do this on Tuesday" is information.
   ========================================================================== */

import { isDateKey, todayKey, uid } from "./targets";

/* Not a real category and deliberately not stored as one.

   A row in `doc.categories` would be editable, deletable, reorderable and
   assignable as a target's home — and a target sitting in "To Do tasks" would
   be counted in every score, which is the one thing this whole arrangement
   exists to prevent. The heading is a constant the screen renders; the
   categories a person owns stay exactly as they were. */
export const TASK_GROUP = {
  id: "__tasks",
  name: "To Do tasks",
  emoji: "📋",
  color: "#6B6055",
  note: "one-off things for a particular day — not scored, not counted",
};

const clean = (s) => String(s == null ? "" : s).trim();

export const taskList = (tasks) => (Array.isArray(tasks) ? tasks : []);

/* The day a task belongs to, falling back to today for a row that lost its
   date — a task with no date is unreachable in a day-by-day screen, which is
   a worse outcome than one that shows up in the wrong place and can be moved. */
export const dayOf = (t) => (isDateKey(t && t.day) ? t.day : todayKey());

export const isDone = (t) => !!(t && t.done);

export function makeTask({ day, name, note = "", order = 0 } = {}) {
  return {
    id: uid("k_"),
    day: isDateKey(day) ? day : todayKey(),
    name: clean(name) || "Untitled",
    note: clean(note),
    done: false,
    order,
  };
}

const byOrder = (a, b) => (a.order - b.order) || a.id.localeCompare(b.id);

/* The tasks written against this exact date, in the order they were put in. */
export const tasksOn = (tasks, dayKey) =>
  taskList(tasks).filter((t) => dayOf(t) === dayKey).sort(byOrder);

/* Still-open tasks from before this date — Tuesday's unfinished errand, seen
   on Wednesday. Finished ones stay in the past where they happened; carrying
   those forward would turn every completed task into permanent furniture.

   Oldest first: the thing that has been waiting longest is the thing most
   worth doing, and it reads as a queue rather than a pile. */
export const overdueBefore = (tasks, dayKey) =>
  taskList(tasks)
    .filter((t) => !isDone(t) && dayOf(t) < dayKey)
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || byOrder(a, b));

/* How many days late a task is, for saying so beside it. */
export const daysLate = (t, dayKey) => {
  const from = new Date(dayOf(t));
  const to = new Date(dayKey);
  return Math.max(0, Math.round((to - from) / 86400000));
};

export function addTask(tasks, { day, name, note = "" } = {}) {
  const list = taskList(tasks);
  const key = isDateKey(day) ? day : todayKey();
  const last = tasksOn(list, key).reduce((max, t) => Math.max(max, t.order), -1);
  return [...list, makeTask({ day: key, name, note, order: last + 1 })];
}

const edit = (tasks, id, change) =>
  taskList(tasks).map((t) => (t.id === id ? { ...t, ...change(t) } : t));

export const toggleTask = (tasks, id) => edit(tasks, id, (t) => ({ done: !t.done }));

export const setTaskDone = (tasks, id, done) => edit(tasks, id, () => ({ done: !!done }));

/* An empty name is a slip rather than an instruction — it would leave a row
   that cannot be identified or found again, so the old name stands. */
export const renameTask = (tasks, id, name) =>
  edit(tasks, id, (t) => ({ name: clean(name) || t.name }));

export const setTaskNote = (tasks, id, note) => edit(tasks, id, () => ({ note: clean(note) }));

/* Moving a task to another day puts it at the end of that day's list, since
   its old position was a position among different neighbours. */
export function moveTaskToDay(tasks, id, dayKey) {
  if (!isDateKey(dayKey)) return taskList(tasks);
  const list = taskList(tasks);
  const last = tasksOn(list, dayKey).reduce((max, t) => Math.max(max, t.order), -1);
  return list.map((t) => (t.id === id ? { ...t, day: dayKey, order: last + 1 } : t));
}

export const removeTask = (tasks, id) => taskList(tasks).filter((t) => t.id !== id);

/* Reordering within one day. The dragged task's neighbours on other days are
   untouched, so the `order` numbers only ever have to make sense inside a
   single date — which is why two tasks on different days may share one. */
export function reorderTasksOn(tasks, dayKey, from, to) {
  const day = tasksOn(tasks, dayKey);
  if (from === to || from < 0 || to < 0 || from >= day.length || to >= day.length) {
    return taskList(tasks);
  }
  const moved = day.slice();
  moved.splice(to, 0, moved.splice(from, 1)[0]);

  const rank = {};
  moved.forEach((t, i) => { rank[t.id] = i; });
  return taskList(tasks).map((t) => (rank[t.id] === undefined ? t : { ...t, order: rank[t.id] }));
}

/* For the heading: "2 of 5 done". Counts this day's own tasks only — overdue
   ones are shown on today but belong to the day they were set for, and
   folding them into today's count would make a tally that never settles. */
export function taskCounts(tasks, dayKey) {
  const day = tasksOn(tasks, dayKey);
  return { total: day.length, done: day.filter(isDone).length };
}

/* Days that have any task at all, for marking them in a calendar. */
export const taskDays = (tasks) =>
  Array.from(new Set(taskList(tasks).map(dayOf))).sort();

/* Clearing old history takes tasks with it, but that filter lives in
   `historyBefore` / `clearHistoryBefore` beside the log's, so that "before
   this date" is decided in one place rather than two. */
