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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
