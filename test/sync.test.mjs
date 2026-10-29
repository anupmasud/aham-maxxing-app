/* Offline behaviour: whose copy wins when Drive answers.

   The case that matters is the one that used to lose data — entries made with
   no signal, the app closed, then opened again on wifi. Drive's copy is older
   but arrives with authority, and the old code took it. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "..", "src", "model", "sync.js"), "utf8");
const M = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

const T1 = "2026-09-18T09:00:00.000Z";
const T2 = "2026-09-18T11:30:00.000Z";

console.log("\n1. nothing local to protect — Drive wins");
{
  eq("no cache at all",
     M.decideOnLoad({ hasCache: false, dirty: false, base: null, remoteTime: T1 }),
     { use: "remote", action: "none" });
  eq("a cache that is already synced",
     M.decideOnLoad({ hasCache: true, dirty: false, base: T1, remoteTime: T1 }),
     { use: "remote", action: "none" });
  eq("synced locally but Drive moved on — another device's work is taken",
     M.decideOnLoad({ hasCache: true, dirty: false, base: T1, remoteTime: T2 }),
     { use: "remote", action: "none" });
}

console.log("\n2. edits made offline are never silently discarded");
{
  // The plane case: logged with no signal, app closed, reopened on wifi.
  // Drive is exactly where this device left it, so local is simply ahead.
  const d = M.decideOnLoad({ hasCache: true, dirty: true, base: T1, remoteTime: T1 });
  eq("the local copy is kept", d.use, "local");
  eq("and pushed up", d.action, "push");
  eq("for the right reason", d.why, "ahead");
}

console.log("\n3. both sides moved — a person decides, nothing is guessed");
{
  const d = M.decideOnLoad({ hasCache: true, dirty: true, base: T1, remoteTime: T2 });
  eq("local is still held on to", d.use, "local");
  eq("raised as a conflict", d.action, "conflict");
  eq("for the right reason", d.why, "both-moved");
}

console.log("\n4. unsynced work with no known base is treated as a conflict");
{
  const d = M.decideOnLoad({ hasCache: true, dirty: true, base: null, remoteTime: T2 });
  eq("not thrown away", d.use, "local");
  eq("not pushed blindly either", d.action, "conflict");
  eq("for the right reason", d.why, "unknown-base");
}

console.log("\n5. the cache envelope, including caches written before it existed");
{
  const doc = { categories: [], targets: [], log: {} };

  const fresh = M.envelope(doc, { dirty: true, base: T1 });
  eq("version stamped", fresh.v, M.ENVELOPE);
  eq("carries the document", fresh.doc, doc);
  eq("and the flag", [fresh.dirty, fresh.base], [true, T1]);

  const back = M.readEnvelope(fresh);
  eq("round-trips", [back.dirty, back.base, back.doc], [true, T1, doc]);

  // Version 1 was the bare document. Reading one as unsynced would push a
  // stale copy over a good one, so it must come back clean.
  const legacy = M.readEnvelope(doc);
  eq("a legacy cache is recognised", legacy.doc, doc);
  eq("and treated as already synced", legacy.dirty, false);
  eq("with no base to reason from", legacy.base, null);

  eq("junk is ignored", M.readEnvelope(null), null);
  eq("so is a stray object", M.readEnvelope({ hello: "there" }), null);
  eq("and a string", M.readEnvelope("nope"), null);
}

console.log("\n6. a legacy cache cannot cause a bogus push");
{
  const legacy = M.readEnvelope({ categories: [], targets: [], log: {} });
  eq("Drive wins, as it did before",
     M.decideOnLoad({ hasCache: true, dirty: legacy.dirty, base: legacy.base, remoteTime: T1 }),
     { use: "remote", action: "none" });
}

console.log("\n7. retry backs off, then holds at a minute");
{
  eq("first retry is prompt", M.retryDelay(0), 5000);
  eq("then longer", [M.retryDelay(1), M.retryDelay(2)], [15000, 30000]);
  eq("and caps", [M.retryDelay(3), M.retryDelay(9), M.retryDelay(999)], [60000, 60000, 60000]);
  eq("a nonsense attempt is safe", M.retryDelay(-5), 5000);
}

console.log("\n8. how long something has been waiting, coarsely");
{
  const now = new Date("2026-09-18T12:00:00.000Z").getTime();
  const ago = (ms) => M.waitingFor(new Date(now - ms).toISOString(), now);
  eq("seconds", ago(20 * 1000), "just now");
  eq("minutes", ago(7 * 60000), "7 min");
  eq("just under an hour", ago(59 * 60000), "59 min");
  eq("hours", ago(3 * 3600000), "3 hr");
  eq("a day", ago(26 * 3600000), "1 day");
  eq("days", ago(3 * 86400000), "3 days");
  eq("nothing waiting", M.waitingFor(null, now), "");
  eq("a clock that went backwards", M.waitingFor(new Date(now + 60000).toISOString(), now), "");
}

console.log("\n9. identical copies are not a conflict, whatever the clock says");
{
  const doc = {
    createdAt: "2026-01-01T00:00:00.000Z",
    categories: [{ id: "c1", name: "Movement", order: 0 }],
    targets: [{ id: "t1", name: "Walk", goal: 1 }],
    log: { "2026-09-20": { t1: true } },
    notes: {}, plans: {}, breaks: [], tasks: [], timers: [],
    reminders: { enabled: true, hour: 20, minute: 0 },
  };

  // The same content, built in a different key order — which is what happens
  // when one copy comes from the spreadsheet and the other from memory.
  const other = {
    timers: [], tasks: [], breaks: [], plans: {}, notes: {},
    log: { "2026-09-20": { t1: true } },
    targets: [{ goal: 1, name: "Walk", id: "t1" }],
    categories: [{ order: 0, name: "Movement", id: "c1" }],
    createdAt: "2026-05-05T00:00:00.000Z",
    reminders: { minute: 30, hour: 7, enabled: false },
  };

  eq("same content despite key order", M.sameDoc(doc, other), true);
  eq("settings differing is not a content difference", M.sameDoc(doc, other), true);

  eq("a changed log entry is a real difference",
     M.sameDoc(doc, { ...other, log: { "2026-09-20": { t1: false } } }), false);
  eq("an added target is a real difference",
     M.sameDoc(doc, { ...other, targets: [...other.targets, { id: "t2", name: "Swim" }] }), false);
  eq("an added task is a real difference",
     M.sameDoc(doc, { ...other, tasks: [{ id: "k1", name: "Call", day: "2026-09-20" }] }), false);
  eq("a new timer is a real difference",
     M.sameDoc(doc, { ...other, timers: [{ id: "w1", name: "Circuit" }] }), false);

  eq("a missing side is never 'same'", M.sameDoc(doc, null), false);
  eq("neither side", M.sameDoc(null, null), false);
}

console.log("\n10. stable stringify, the thing that makes the comparison honest");
{
  eq("keys are sorted", M.stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  eq("nested too", M.stableStringify({ z: { d: 1, c: 2 } }), '{"z":{"c":2,"d":1}}');
  eq("arrays keep their order", M.stableStringify([3, 1, 2]), "[3,1,2]");
  eq("null", M.stableStringify(null), "null");
  eq("undefined members are dropped", M.stableStringify({ a: undefined, b: 1 }), '{"b":1}');
  eq("primitives", [M.stableStringify(5), M.stableStringify("x"), M.stableStringify(true)],
     ["5", '"x"', "true"]);
}

console.log("\n11. two devices that each know something the other does not");
{
  const base = {
    categories: [{ id: "c1", name: "Movement", order: 0 }],
    targets: [{ id: "t1", name: "Walk" }],
    timers: [], breaks: [], tasks: [], plans: {}, notes: {},
  };
  const mine = { ...base, log: { "2026-10-26": { t1: true } } };
  const theirs = { ...base, log: { "2026-10-25": { t1: true } } };

  const m = M.mergeDocs(mine, theirs);
  eq("both days survive", Object.keys(m.log).sort(), ["2026-10-25", "2026-10-26"]);
  eq("nobody is asked anything", m !== null, true);
  eq("the originals are untouched", Object.keys(mine.log), ["2026-10-26"]);
}

console.log("\n12. the same day, different targets, is still not a disagreement");
{
  const base = { categories: [], targets: [], timers: [], breaks: [], tasks: [], plans: {}, notes: {} };
  const mine = { ...base, log: { "2026-10-26": { t1: true } } };
  const theirs = { ...base, log: { "2026-10-26": { t2: 8000 } } };
  const m = M.mergeDocs(mine, theirs);
  eq("both entries kept", m.log["2026-10-26"], { t2: 8000, t1: true });
}

console.log("\n13. a real disagreement stops and asks");
{
  const base = { categories: [], targets: [], timers: [], breaks: [], tasks: [], plans: {}, notes: {} };
  const mine = { ...base, log: { "2026-10-26": { t1: 3 } } };
  const theirs = { ...base, log: { "2026-10-26": { t1: 5 } } };
  eq("same target, same day, two values", M.mergeDocs(mine, theirs), null);

  // Identical values are not a disagreement.
  eq("the same value on both sides is fine",
     M.mergeDocs(mine, { ...base, log: { "2026-10-26": { t1: 3 } } }) !== null, true);
}

console.log("\n14. changes to the targets themselves are never merged");
{
  const mk = (targets) => ({
    categories: [], targets, timers: [], breaks: [], tasks: [], plans: {}, notes: {}, log: {},
  });
  eq("a target added on one side",
     M.mergeDocs(mk([{ id: "t1" }, { id: "t2" }]), mk([{ id: "t1" }])), null);
  eq("a target deleted on one side — union would undo the deletion",
     M.mergeDocs(mk([{ id: "t1" }]), mk([{ id: "t1" }, { id: "t2" }])), null);
  eq("a renamed target",
     M.mergeDocs(mk([{ id: "t1", name: "Walk" }]), mk([{ id: "t1", name: "Walking" }])), null);
  eq("identical targets merge fine",
     M.mergeDocs(mk([{ id: "t1" }]), mk([{ id: "t1" }])) !== null, true);
}

console.log("\n15. notes, plans and tasks fold together on the same rules");
{
  const base = { categories: [], targets: [], timers: [], breaks: [], log: {} };
  const mine = { ...base, plans: {}, notes: { "2026-10-26": { t1: "felt strong" } },
                 tasks: [{ id: "k1", day: "2026-10-26", name: "Call" }] };
  const theirs = { ...base, plans: {}, notes: { "2026-10-25": { t1: "sore" } },
                   tasks: [{ id: "k2", day: "2026-10-25", name: "Post" }] };
  const m = M.mergeDocs(mine, theirs);
  eq("both notes", Object.keys(m.notes).sort(), ["2026-10-25", "2026-10-26"]);
  eq("both tasks", m.tasks.map((t) => t.id).sort(), ["k1", "k2"]);

  eq("the same note written two ways is a disagreement",
     M.mergeDocs({ ...mine, notes: { "2026-10-26": { t1: "a" } } },
                 { ...theirs, notes: { "2026-10-26": { t1: "b" } } }), null);
  eq("the same task edited on both sides is a disagreement",
     M.mergeDocs({ ...mine, tasks: [{ id: "k1", name: "Call", done: true }] },
                 { ...theirs, tasks: [{ id: "k1", name: "Call", done: false }] }), null);
}

console.log("\n16. Drive is the base when something has to win");
{
  const base = { categories: [], targets: [], timers: [], breaks: [], tasks: [], plans: {}, notes: {}, log: {} };
  const m = M.mergeDocs({ ...base, createdAt: "mine", homeTab: "today" },
                        { ...base, createdAt: "theirs", homeTab: "insights" });
  eq("settings come from Drive", [m.createdAt, m.homeTab], ["theirs", "insights"]);
  eq("a missing side cannot merge", M.mergeDocs(null, base), null);
  eq("nor the other way", M.mergeDocs(base, null), null);
}

console.log("\n17. Drive wins, but nothing that can be kept is discarded");
{
  const base = {
    categories: [{ id: "c1" }], targets: [{ id: "t1" }],
    timers: [], breaks: [], tasks: [], plans: {}, notes: {},
  };

  // A day only this device knows about is kept — it costs nothing.
  const mine = { ...base, log: { "2026-10-28": { t1: true }, "2026-10-29": { t1: 5 } } };
  const theirs = { ...base, log: { "2026-10-28": { t1: true } } };
  const r = M.preferDrive(mine, theirs);
  eq("the day Drive never saw survives", Object.keys(r.doc.log).sort(), ["2026-10-28", "2026-10-29"]);
  eq("nothing was dropped", r.dropped, 0);

  // A genuine clash: Drive's value is taken, and it is counted.
  const clash = M.preferDrive(
    { ...base, log: { "2026-10-28": { t1: 3 } } },
    { ...base, log: { "2026-10-28": { t1: 9 } } });
  eq("Drive's value wins", clash.doc.log["2026-10-28"].t1, 9);
  eq("and the loss is counted, not silent", clash.dropped, 1);

  // Entries for other targets on the same day are untouched by that.
  const mixed = M.preferDrive(
    { ...base, log: { "2026-10-28": { t1: 3, t2: 1 } } },
    { ...base, log: { "2026-10-28": { t1: 9 } } });
  eq("the other entry is kept", mixed.doc.log["2026-10-28"], { t1: 9, t2: 1 });
  eq("one clash counted", mixed.dropped, 1);
}

console.log("\n18. targets come from Drive, so a deletion is not undone");
{
  const mk = (targets) => ({
    categories: [], targets, timers: [], breaks: [], tasks: [], plans: {}, notes: {}, log: {},
  });
  const r = M.preferDrive(mk([{ id: "t1" }, { id: "t2" }]), mk([{ id: "t1" }]));
  eq("a target deleted elsewhere stays deleted", r.doc.targets.map((t) => t.id), ["t1"]);
}

console.log("\n19. tasks fold in the same way");
{
  const base = { categories: [], targets: [], timers: [], breaks: [], plans: {}, notes: {}, log: {} };
  const r = M.preferDrive(
    { ...base, tasks: [{ id: "k1", name: "Call", done: true }, { id: "k2", name: "Post" }] },
    { ...base, tasks: [{ id: "k1", name: "Call", done: false }] });
  eq("the task only this device had is kept", r.doc.tasks.map((t) => t.id).sort(), ["k1", "k2"]);
  eq("Drive's version of the shared one wins", r.doc.tasks.find((t) => t.id === "k1").done, false);
  eq("counted", r.dropped, 1);
}

console.log("\n20. the edges");
{
  const base = { categories: [], targets: [], timers: [], breaks: [], tasks: [], plans: {}, notes: {}, log: {} };
  eq("no Drive copy means no answer", M.preferDrive(base, null), null);
  eq("no local copy is simply Drive's", M.preferDrive(null, base), { doc: base, dropped: 0 });
}

console.log("\n21. a save carries only this device's own changes");
{
  const mk = (log, targets = [{ id: "t1" }], tasks = []) => ({
    categories: [], targets, timers: [], breaks: [], tasks,
    plans: {}, notes: {}, log,
  });

  /* The case that cost real data: this device has an older copy, Drive has
     days it has never seen. A plain write removes them. */
  const base   = mk({ "2026-10-27": { t1: 1 } });
  const mine   = mk({ "2026-10-27": { t1: 1 }, "2026-10-29": { t1: 1 } });
  const theirs = mk({ "2026-10-27": { t1: 1 }, "2026-10-28": { t1: 1 } });

  const out = M.threeWay(base, mine, theirs);
  eq("Drive's day this device never saw survives",
     Object.keys(out.log).sort(), ["2026-10-27", "2026-10-28", "2026-10-29"]);
  eq("and this device's new day is carried up", out.log["2026-10-29"], { t1: 1 });
}

console.log("\n22. deleting still works, because the base says it was deliberate");
{
  const mk = (log) => ({ categories: [], targets: [], timers: [], breaks: [], tasks: [], plans: {}, notes: {}, log });
  const base   = mk({ "2026-10-27": { t1: 1, t2: 1 } });
  const mine   = mk({ "2026-10-27": { t1: 1 } });            // unticked t2
  const theirs = mk({ "2026-10-27": { t1: 1, t2: 1 } });

  const out = M.threeWay(base, mine, theirs);
  eq("the untick sticks", out.log["2026-10-27"], { t1: 1 });

  // A whole day cleared here is removed there.
  const cleared = M.threeWay(mk({ "2026-10-27": { t1: 1 } }), mk({}), mk({ "2026-10-27": { t1: 1 } }));
  eq("a cleared day goes", Object.keys(cleared.log), []);
}

console.log("\n23. an entry changed in both places takes this device's change");
{
  const mk = (log) => ({ categories: [], targets: [], timers: [], breaks: [], tasks: [], plans: {}, notes: {}, log });
  const out = M.threeWay(
    mk({ "2026-10-27": { t1: 1 } }),
    mk({ "2026-10-27": { t1: 5 } }),
    mk({ "2026-10-27": { t1: 9 } }));
  eq("the edit made here wins", out.log["2026-10-27"].t1, 5);

  // Untouched here: Drive's version stands.
  const untouched = M.threeWay(
    mk({ "2026-10-27": { t1: 1 } }),
    mk({ "2026-10-27": { t1: 1 } }),
    mk({ "2026-10-27": { t1: 9 } }));
  eq("what this device did not touch is left alone", untouched.log["2026-10-27"].t1, 9);
}

console.log("\n24. targets, tasks and the rest follow the same rules");
{
  const mk = (targets, tasks = []) => ({
    categories: [], targets, timers: [], breaks: [], tasks, plans: {}, notes: {}, log: {},
  });
  const base   = mk([{ id: "t1", name: "Walk" }]);
  const mine   = mk([{ id: "t1", name: "Walk" }, { id: "t2", name: "Swim" }]);
  const theirs = mk([{ id: "t1", name: "Walk" }, { id: "t3", name: "Yoga" }]);

  const out = M.threeWay(base, mine, theirs);
  eq("both devices' new targets survive", out.targets.map((t) => t.id).sort(), ["t1", "t2", "t3"]);

  // Deleted here, still in Drive: the deletion is honoured.
  const del = M.threeWay(mk([{ id: "t1" }, { id: "t2" }]), mk([{ id: "t1" }]), mk([{ id: "t1" }, { id: "t2" }]));
  eq("a target deleted here is removed", del.targets.map((t) => t.id), ["t1"]);

  // Renamed here while Drive left it alone.
  const ren = M.threeWay(mk([{ id: "t1", name: "Walk" }]), mk([{ id: "t1", name: "Walking" }]), mk([{ id: "t1", name: "Walk" }]));
  eq("a rename here is carried up", ren.targets[0].name, "Walking");

  // Drive deleted it; adding it back from here would undo their deletion.
  const gone = M.threeWay(mk([{ id: "t1" }, { id: "t2" }]), mk([{ id: "t1" }, { id: "t2" }]), mk([{ id: "t1" }]));
  eq("a target Drive deleted stays deleted", gone.targets.map((t) => t.id), ["t1"]);
}

console.log("\n25. without a base there is nothing to reason from");
{
  const d = { categories: [], targets: [], timers: [], breaks: [], tasks: [], plans: {}, notes: {}, log: {} };
  eq("no base means no answer — the caller decides", M.threeWay(null, d, d), null);
  eq("no local copy is simply Drive's", M.threeWay(d, null, d), d);
  eq("no Drive copy is simply this one", M.threeWay(d, d, null), d);
}

console.log("\n26. the cache remembers what Drive last had");
{
  const doc = { log: { a: 1 } };
  const baseDoc = { log: {} };
  const e = M.envelope(doc, { dirty: true, base: "T", baseDoc });
  eq("stored", e.baseDoc, baseDoc);
  eq("read back", M.readEnvelope(e).baseDoc, baseDoc);
  eq("a cache written before it existed has none",
     M.readEnvelope({ v: 2, doc, dirty: true, base: "T" }).baseDoc, null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
