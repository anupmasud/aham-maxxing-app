/* One-off tasks: the day they belong to, rollover, and the promise that
   nothing here can ever reach a score.

   That last one is the whole reason tasks are a separate collection, so it is
   tested directly rather than assumed: a document full of tasks must score
   exactly the same as one with none. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, "..", "src", "model", f), "utf8");

const strip = (f) => read(f)
  .replace(/^import .*$/gm, "")
  .replace(/^export \{[^}]*\}( from .*)?;$/gm, "");
const source = ["targets.js", "tasks.js"].map(strip).join("\n");
const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

const names = (list) => list.map((t) => t.name);
const today = M.todayKey();

/* Built by hand rather than through addTask so the ids are predictable. */
const task = (id, day, name, done = false, order = 0) => ({ id, day, name, done, note: "", order });

console.log("\n1. a task belongs to exactly one day");
{
  const list = [
    task("a", "2026-09-16", "Colonoscopy", false, 0),
    task("b", "2026-09-16", "Ring landlord", false, 1),
    task("c", "2026-09-17", "Collect parcel", false, 0),
  ];
  eq("that day's tasks", names(M.tasksOn(list, "2026-09-16")), ["Colonoscopy", "Ring landlord"]);
  eq("the next day's", names(M.tasksOn(list, "2026-09-17")), ["Collect parcel"]);
  eq("a day with none", M.tasksOn(list, "2026-09-18"), []);
  eq("order decides, not insertion",
     names(M.tasksOn([task("b", "2026-09-16", "Second", false, 1), task("a", "2026-09-16", "First", false, 0)], "2026-09-16")),
     ["First", "Second"]);
}

console.log("\n2. a task with no usable date falls back to today rather than vanishing");
{
  eq("missing date", M.dayOf({ id: "x", name: "Orphan" }), today);
  eq("nonsense date", M.dayOf({ id: "x", day: "not a date" }), today);
  eq("a real one is kept", M.dayOf({ id: "x", day: "2026-01-02" }), "2026-01-02");
  eq("it is therefore findable", names(M.tasksOn([{ id: "x", name: "Orphan" }], today)), ["Orphan"]);
}

console.log("\n3. unfinished tasks roll forward, finished ones stay put");
{
  const list = [
    task("a", "2026-09-14", "Monday thing", false),
    task("b", "2026-09-15", "Tuesday thing", false),
    task("c", "2026-09-15", "Tuesday done", true),
    task("d", "2026-09-16", "Today", false),
  ];
  eq("oldest first", names(M.overdueBefore(list, "2026-09-16")), ["Monday thing", "Tuesday thing"]);
  eq("a completed one is not chased", M.overdueBefore(list, "2026-09-16").some((t) => t.id === "c"), false);
  eq("today's own task is not overdue", M.overdueBefore(list, "2026-09-16").some((t) => t.id === "d"), false);
  eq("nothing is overdue at the start", M.overdueBefore(list, "2026-09-14"), []);
  eq("how late", M.daysLate(list[0], "2026-09-16"), 2);
  eq("not late at all", M.daysLate(list[3], "2026-09-16"), 0);
}

console.log("\n4. rollover shows the task, it does not move it");
{
  const list = [task("a", "2026-09-14", "Monday thing", false)];
  const seen = M.overdueBefore(list, "2026-09-16");
  eq("it still carries its own date", seen[0].day, "2026-09-14");
  eq("the stored list is untouched", list[0].day, "2026-09-14");
}

console.log("\n5. adding, toggling, renaming, removing");
{
  let list = M.addTask([], { day: "2026-09-16", name: "Colonoscopy" });
  list = M.addTask(list, { day: "2026-09-16", name: "Ring landlord" });
  eq("appended in order", list.map((t) => t.order), [0, 1]);
  eq("both on the day", names(M.tasksOn(list, "2026-09-16")), ["Colonoscopy", "Ring landlord"]);

  const id = list[0].id;
  list = M.toggleTask(list, id);
  eq("toggled on", M.isDone(list[0]), true);
  list = M.toggleTask(list, id);
  eq("toggled off again", M.isDone(list[0]), false);

  list = M.renameTask(list, id, "Book colonoscopy");
  eq("renamed", list[0].name, "Book colonoscopy");
  list = M.renameTask(list, id, "   ");
  eq("a blank rename is refused", list[0].name, "Book colonoscopy");

  list = M.setTaskNote(list, id, "iMed, 9am");
  eq("note kept", list[0].note, "iMed, 9am");

  list = M.removeTask(list, id);
  eq("removed", names(list), ["Ring landlord"]);
  eq("removing a stranger is harmless", M.removeTask(list, "nope").length, 1);
}

console.log("\n6. a new day's numbering starts again");
{
  let list = M.addTask([], { day: "2026-09-16", name: "One" });
  list = M.addTask(list, { day: "2026-09-16", name: "Two" });
  list = M.addTask(list, { day: "2026-09-17", name: "Other day" });
  eq("its own day's positions", M.tasksOn(list, "2026-09-16").map((t) => t.order), [0, 1]);
  eq("the next day restarts", M.tasksOn(list, "2026-09-17").map((t) => t.order), [0]);
}

console.log("\n7. moving a task to another day puts it last there");
{
  let list = [
    task("a", "2026-09-16", "Move me", false, 0),
    task("b", "2026-09-17", "Already there", false, 0),
  ];
  list = M.moveTaskToDay(list, "a", "2026-09-17");
  eq("gone from the old day", M.tasksOn(list, "2026-09-16"), []);
  eq("at the end of the new one", names(M.tasksOn(list, "2026-09-17")), ["Already there", "Move me"]);
  eq("a bad date changes nothing", names(M.moveTaskToDay(list, "a", "nope")), names(list));
}

console.log("\n8. reordering happens inside one day only");
{
  const list = [
    task("a", "2026-09-16", "First", false, 0),
    task("b", "2026-09-16", "Second", false, 1),
    task("c", "2026-09-16", "Third", false, 2),
    task("z", "2026-09-17", "Elsewhere", false, 0),
  ];
  const moved = M.reorderTasksOn(list, "2026-09-16", 2, 0);
  eq("dragged to the top", names(M.tasksOn(moved, "2026-09-16")), ["Third", "First", "Second"]);
  eq("the other day is untouched", names(M.tasksOn(moved, "2026-09-17")), ["Elsewhere"]);
  eq("the original is untouched", names(M.tasksOn(list, "2026-09-16")), ["First", "Second", "Third"]);
  eq("an out-of-range drag is ignored",
     names(M.tasksOn(M.reorderTasksOn(list, "2026-09-16", 0, 9), "2026-09-16")),
     ["First", "Second", "Third"]);
}

console.log("\n9. the count is about this day, not the backlog");
{
  const list = [
    task("old", "2026-09-14", "Overdue", false),
    task("a", "2026-09-16", "One", true),
    task("b", "2026-09-16", "Two", false),
    task("c", "2026-09-16", "Three", true),
  ];
  eq("done of total", M.taskCounts(list, "2026-09-16"), { total: 3, done: 2 });
  eq("a day with nothing", M.taskCounts(list, "2026-09-20"), { total: 0, done: 0 });
}

console.log("\n10. days that have tasks, for marking a calendar");
{
  const list = [
    task("a", "2026-09-17", "b"),
    task("b", "2026-09-16", "a"),
    task("c", "2026-09-16", "c"),
  ];
  eq("sorted and deduplicated", M.taskDays(list), ["2026-09-16", "2026-09-17"]);
}

console.log("\n11. tasks cannot reach a score — the point of the whole arrangement");
{
  /* A real scoring surface: one daily target, done, plus a pile of tasks on
     the same day, all unfinished. If tasks leaked into scoring, the ring
     would drop below 1/1. */
  const targets = [
    { id: "t1", name: "Walk", kind: "tick", dir: "at_least", period: "day",
      goal: 1, step: 1, days: M.ALL_DAYS, archived: false, types: [], plan: {} },
  ];
  const log = { "2026-09-16": { t1: true } };

  const bare = M.dayScore("2026-09-16", targets, log, []);
  eq("one of one before tasks exist", [bare.due, bare.done], [1, 1]);

  /* Tasks are not targets, so the only way to ask the question is to try to
     pass them where targets go — which is exactly what a future scoring
     function would do by accident if they shared a collection. */
  const asIfTargets = [
    ...targets,
    task("k1", "2026-09-16", "Colonoscopy", false),
    task("k2", "2026-09-16", "Ring landlord", false),
  ];
  const leaked = M.dayScore("2026-09-16", asIfTargets, log, []);
  eq("a task has no period, so it is not due", leaked.due, 1);
  eq("and cannot drag the score down", leaked.done, 1);

  eq("nor is one ever a limit", M.dayLimitsBroken("2026-09-16", asIfTargets, log, []), 0);
}

console.log("\n12. clearing old history takes tasks with it, on the same boundary as the log");
{
  const doc = {
    createdAt: "2026-08-01T00:00:00.000Z",
    log: { "2026-09-01": { t1: true }, "2026-09-20": { t1: true } },
    notes: {}, plans: {},
    tasks: [
      task("old", "2026-08-30", "Long gone", true),
      task("edge", "2026-09-10", "On the boundary", false),
      task("new", "2026-09-20", "Still here", false),
    ],
  };

  const before = M.historyBefore(doc, "2026-09-10");
  eq("counted, including the boundary day", before.tasks, 2);

  const after = M.clearHistoryBefore(doc, "2026-09-10");
  eq("the boundary day goes too, as it does for the log",
     names(after.tasks), ["Still here"]);
  eq("the log used the same cut", Object.keys(after.log), ["2026-09-20"]);
  eq("the original is untouched", doc.tasks.length, 3);

  eq("a document with no tasks is unharmed",
     M.clearHistoryBefore({ log: {}, notes: {}, plans: {} }, "2026-09-10").tasks, []);
}

console.log("\n13. pushing a task to the next day, repeatedly");
{
  let list = [task("a", "2026-09-16", "Push me", false, 0)];
  const next = (l, id) => {
    const t = l.find((x) => x.id === id);
    const d = new Date(M.dayOf(t));
    d.setDate(d.getDate() + 1);
    return M.moveTaskToDay(l, id, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };
  list = next(list, "a");
  eq("one day on", M.dayOf(list[0]), "2026-09-17");
  list = next(list, "a");
  eq("and again", M.dayOf(list[0]), "2026-09-18");
  eq("still exactly one task", list.length, 1);
  eq("it is no longer where it started", M.tasksOn(list, "2026-09-16"), []);

  // Across a month boundary, which is where naive date arithmetic breaks.
  let edge = [task("m", "2026-09-30", "Month end", false, 0)];
  edge = next(edge, "m");
  eq("30 Sep rolls to 1 Oct", M.dayOf(edge[0]), "2026-10-01");
}

console.log("\n14. a target's notes, newest first, for reading back");
{
  const notes = {
    "2026-09-08": { t_upper: "https://instagram.com/reel/abc" },
    "2026-09-13": { t_upper: "5 minute arms  https://youtu.be/pH5bl36t-ik", t_core: "5 min pilates" },
    "2026-09-11": { t_steps: "6000" },
  };
  eq("newest first", M.targetNotes(notes, "t_upper").map((n) => n.day),
     ["2026-09-13", "2026-09-08"]);
  eq("with their text", M.targetNotes(notes, "t_upper")[0].text,
     "5 minute arms  https://youtu.be/pH5bl36t-ik");
  eq("only this target's", M.targetNotes(notes, "t_core").map((n) => n.day), ["2026-09-13"]);
  eq("a target never written about", M.targetNotes(notes, "t_nope"), []);
  eq("no notes at all", M.targetNotes({}, "t_upper"), []);
}

console.log("\n15. everything still open, wherever it was set");
{
  /* The gap this closes: a task set for a day you never opened is drawn only
     beside that day. Today shows today's plus overdue, so something set for
     next Tuesday and then forgotten is invisible until next Tuesday. */
  const tasks = [
    { id: "a", day: "2026-09-02", name: "old and open", order: 0 },
    { id: "b", day: "2026-09-02", name: "old and done", order: 1, done: true },
    { id: "c", day: "2026-08-20", name: "older still", order: 0 },
    { id: "d", day: "2026-09-10", name: "today's", order: 1 },
    { id: "e", day: "2026-09-10", name: "today's, done", order: 0, done: true },
    { id: "f", day: "2026-09-11", name: "tomorrow", order: 0 },
    { id: "g", day: "2026-12-01", name: "far off", order: 0 },
  ];
  const g = M.openGroups(tasks, "2026-09-10");

  eq("overdue, oldest first", g.overdue.map((t) => t.id), ["c", "a"]);
  eq("today's own", g.today.map((t) => t.id), ["d"]);
  eq("and what is coming, soonest first", g.later.map((t) => t.id), ["f", "g"]);

  // The whole question is "what have I not finished".
  eq("nothing finished appears anywhere",
     [...g.overdue, ...g.today, ...g.later].some((t) => t.done), false);
  eq("a day's completed task is not in today's group",
     g.today.some((t) => t.id === "e"), false);

  // Every open task lands in exactly one group, and none goes missing.
  const seen = [...g.overdue, ...g.today, ...g.later].map((t) => t.id).sort();
  eq("every open task placed once", seen, ["a", "c", "d", "f", "g"]);

  eq("counted", M.openCount(tasks, "2026-09-10"),
     { overdue: 2, today: 1, later: 2, total: 5 });
}

console.log("\n16. the open list agrees with what Today already showed");
{
  /* Two views of the same thing must not disagree — the overdue list on
     Today is the same set as the overdue group here, or one screen is
     quietly lying. */
  const tasks = [
    { id: "a", day: "2026-09-01", name: "one", order: 0 },
    { id: "b", day: "2026-09-03", name: "two", order: 0 },
    { id: "c", day: "2026-09-03", name: "done", order: 1, done: true },
    { id: "d", day: "2026-09-10", name: "today", order: 0 },
  ];
  eq("same overdue set, same order",
     M.openGroups(tasks, "2026-09-10").overdue.map((t) => t.id),
     M.overdueBefore(tasks, "2026-09-10").map((t) => t.id));
  eq("same today set",
     M.openGroups(tasks, "2026-09-10").today.map((t) => t.id),
     M.tasksOn(tasks, "2026-09-10").filter((t) => !M.isDone(t)).map((t) => t.id));
}

console.log("\n17. an empty or odd list does not throw");
{
  eq("no tasks at all", M.openCount([], "2026-09-10"),
     { overdue: 0, today: 0, later: 0, total: 0 });
  eq("undefined", M.openCount(undefined, "2026-09-10"),
     { overdue: 0, today: 0, later: 0, total: 0 });
  eq("not a list", M.openGroups(null, "2026-09-10"),
     { overdue: [], today: [], later: [] });
  // A task with no usable day is treated as today's, the same as everywhere.
  eq("a task with no day is today's",
     M.openGroups([{ id: "x", name: "stray" }], M.todayKey()).today.map((t) => t.id), ["x"]);
  eq("everything done", M.openCount(
     [{ id: "a", day: "2026-09-01", done: true }], "2026-09-10").total, 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
