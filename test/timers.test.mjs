/* Interval timers: the schedule, and where you are in it.

   Worth testing hard because the failure mode is quiet. A rest in the wrong
   place or an off-by-one round is not a crash — it is a workout that is
   subtly the wrong shape, noticed on the fourth set by someone out of breath
   and in no position to report it precisely. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, "..", "src", "model", f), "utf8");
const strip = (f) => read(f)
  .replace(/^import .*$/gm, "")
  .replace(/^export \{[^}]*\}( from .*)?;$/gm, "");
const source = ["targets.js", "timers.js"].map(strip).join("\n");
const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

/* The one from the request: 3 sets of 4 rounds, 45 seconds a round. */
const T = { sets: 3, rounds: 4, work: 45, rest: 15, setRest: 60, leadIn: 10 };
const shape = (p) => `${p.kind}${p.set}.${p.round}`;

console.log("\n1. the schedule, end to end");
{
  const p = M.phases(T);
  // lead, then per set: work,rest,work,rest,work,rest,work  (7) + set break
  eq("phase count", p.length, 1 + (3 * 7) + 2);
  eq("starts with the lead-in", shape(p[0]), "lead1.0");
  eq("then the first round", shape(p[1]), "work1.1");
  eq("then a rest", shape(p[2]), "rest1.1");
  eq("last round of set 1", shape(p[7]), "work1.4");
  eq("no rest after it — a set break instead", shape(p[8]), "setRest1.4");
  eq("set 2 begins", shape(p[9]), "work2.1");
  eq("and the very last phase is work, not a rest", shape(p[p.length - 1]), "work3.4");
}

console.log("\n2. rests only ever sit between things");
{
  const p = M.phases(T);
  eq("no rest is last", p[p.length - 1].kind, "work");
  const setRests = p.filter((x) => x.kind === "setRest").length;
  eq("two breaks for three sets", setRests, 2);
  const rests = p.filter((x) => x.kind === "rest").length;
  eq("three rests per set, three sets", rests, 9);
}

console.log("\n3. totals");
{
  // work 12×45=540, rests 9×15=135, set breaks 2×60=120, lead 10 → 805s
  eq("whole session", M.totalMs(T), 805000);
  eq("just the work", M.workMs(T), 540000);
  eq("readable", M.fmtLength(M.totalMs(T)), "13 min");
}

console.log("\n4. zeroes drop the phase rather than leaving a 0-second one");
{
  const noRest = M.phases({ ...T, rest: 0, setRest: 0, leadIn: 0 });
  eq("only work is left", noRest.every((p) => p.kind === "work"), true);
  eq("twelve rounds", noRest.length, 12);
  eq("and the total is just work", M.totalMs({ ...T, rest: 0, setRest: 0, leadIn: 0 }), 540000);
}

console.log("\n5. where you are, computed from elapsed time");
{
  const at = (s) => { const p = M.phaseAt(T, s * 1000); return `${p.kind}${p.set}.${p.round}`; };
  eq("at the very start", at(0), "lead1.0");
  eq("still leading in", at(9.9), "lead1.0");
  eq("first round begins at 10s", at(10), "work1.1");
  eq("still round 1 at 54s", at(54), "work1.1");
  eq("rest begins at 55s", at(55), "rest1.1");
  eq("round 2 at 70s", at(70), "work2".replace("2", "1.2"));
  // set 1 ends at 10 + 4*45 + 3*15 = 235s, then a 60s break
  eq("last round of set 1", at(234), "work1.4");
  eq("set break at 235s", at(235), "setRest1.4");
  eq("set 2 starts at 295s", at(295), "work2.1");
}

console.log("\n6. the boundaries");
{
  const total = M.totalMs(T);
  eq("before the end it is still running", M.phaseAt(T, total - 1).done, false);
  eq("at the end it is done", M.phaseAt(T, total).done, true);
  eq("and stays done", M.phaseAt(T, total + 99999).done, true);
  eq("negative elapsed is treated as the start", M.phaseAt(T, -500).kind, "lead");
  eq("nonsense elapsed too", M.phaseAt(T, undefined).kind, "lead");
  eq("remaining never goes negative", M.phaseAt(T, total + 5000).remaining, 0);
}

console.log("\n7. remaining counts down within the phase");
{
  eq("10s lead, 1s in", M.phaseAt(T, 1000).remaining, 9000);
  eq("45s round, just begun", M.phaseAt(T, 10000).remaining, 45000);
  eq("45s round, 44s in", M.phaseAt(T, 54000).remaining, 1000);
  eq("phase length is reported", M.phaseAt(T, 10000).phaseMs, 45000);
}

console.log("\n8. rounds completed — the number a person wants to see");
{
  eq("during the lead-in", M.workDone(T, 0), 0);
  eq("during round 1", M.workDone(T, 20000), 0);
  eq("during the rest after round 1", M.workDone(T, 56000), 1);
  eq("during round 2", M.workDone(T, 71000), 1);
  eq("during the set break after set 1", M.workDone(T, 240000), 4);
  eq("at the very end", M.workDone(T, M.totalMs(T)), 12);
}

console.log("\n9. values are clamped, because a spreadsheet can say anything");
{
  eq("zero rounds becomes one", M.clampTimer({ rounds: 0 }).rounds, 1);
  eq("a zero-second round becomes one second", M.clampTimer({ work: 0 }).work, 1);
  eq("negatives too", M.clampTimer({ sets: -4 }).sets, 1);
  eq("absurd counts are capped", M.clampTimer({ sets: 9999 }).sets, 20);
  eq("text falls back to the default", M.clampTimer({ work: "abc" }).work, 45);
  eq("a decimal is rounded", M.clampTimer({ work: 45.6 }).work, 46);
  eq("rest may legitimately be zero", M.clampTimer({ rest: 0 }).rest, 0);
  eq("an empty name gets one", M.clampTimer({ name: "   " }).name, "Timer");

  // The clamp is what stops a schedule with no end being built.
  eq("a clamped timer always has phases", M.phases({ sets: 0, rounds: 0, work: 0 }).length > 0, true);
}

console.log("\n10. the clock");
{
  eq("rounds up so 0:00 means finished", M.fmtClock(45000), "0:45");
  eq("mid-second", M.fmtClock(44100), "0:45");
  eq("just over zero still shows a second", M.fmtClock(1), "0:01");
  eq("zero", M.fmtClock(0), "0:00");
  eq("minutes", M.fmtClock(65000), "1:05");
  eq("padded", M.fmtClock(605000), "10:05");
  eq("negative is clamped", M.fmtClock(-5000), "0:00");
}

console.log("\n11. describing one in a list");
{
  eq("the full shape", M.describeTimer(T), "3 × 4 × 45s  ·  15s rest  ·  60s between sets");
  eq("no rests to mention", M.describeTimer({ sets: 1, rounds: 5, work: 30, rest: 0, setRest: 0, leadIn: 0 }),
     "1 × 5 × 30s");
  eq("one set needs no set break", M.describeTimer({ sets: 1, rounds: 3, work: 60, rest: 20, setRest: 60, leadIn: 0 }),
     "1 × 3 × 60s  ·  20s rest");
}

console.log("\n12. the list: adding, editing, removing, reordering");
{
  let list = M.addTimer([], { name: "Tabata", work: 20, rest: 10, rounds: 8, sets: 1 });
  list = M.addTimer(list, { name: "Strength" });
  eq("both there, in order", list.map((t) => [t.name, t.order]), [["Tabata", 0], ["Strength", 1]]);
  eq("defaults filled in", list[1].work, 45);
  eq("given values kept", [list[0].work, list[0].rest, list[0].rounds], [20, 10, 8]);

  const id = list[0].id;
  list = M.saveTimer(list, id, { work: 25, name: "Tabata+" });
  eq("edited", [list[0].name, list[0].work], ["Tabata+", 25]);
  list = M.saveTimer(list, id, { work: 0 });
  eq("edits are clamped too", list[0].work, 1);

  const moved = M.reorderTimers(list, 1, 0);
  eq("reordered", M.sortTimers(moved).map((t) => t.name), ["Strength", "Tabata+"]);
  eq("an impossible move changes nothing",
     M.sortTimers(M.reorderTimers(list, 0, 9)).map((t) => t.name), ["Tabata+", "Strength"]);

  eq("removed", M.removeTimer(list, id).map((t) => t.name), ["Strength"]);
  eq("removing a stranger is harmless", M.removeTimer(list, "nope").length, 2);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
