/* CSV in and out. The import has to cope with files written by other apps, so
   most of this is about shapes and edge cases rather than the happy path. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const strip = (f) => fs.readFileSync(path.join(dir, "..", "src", "model", f), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/^export \{[^}]*\}( from .*)?;$/gm, "");
const source = ["targets.js", "csv.js"].map(strip).join("\n");
const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

const doc = {
  categories: [{ id: "c_move", name: "Movement", order: 0 }],
  targets: [
    { id: "t_walk", catId: "c_move", name: "Walk", kind: "amount", dir: "at_least",
      period: "day", goal: 30, unit: "min", step: 5, days: [0,1,2,3,4,5,6], order: 0,
      archived: false, types: [], plan: {} },
    { id: "t_str", catId: "c_move", name: "Strength", kind: "tick", dir: "at_least",
      period: "week", goal: 3, unit: "", step: 1, days: [0,1,2,3,4,5,6], order: 1,
      archived: false, types: [{ id: "ty_arms", name: "Arms" }], plan: {} },
  ],
  log: {
    "2026-09-01": { t_walk: 45, t_str: { n: 1, v: ["ty_arms"] } },
    "2026-09-02": { t_walk: 20 },
  },
};

console.log("\n1. the reader handles real CSV, not just simple CSV");
{
  eq("quoted commas", M.parseCsv('a,"b,c",d')[0], ["a", "b,c", "d"]);
  eq("escaped quotes", M.parseCsv('"say ""hi""",x')[0], ['say "hi"', "x"]);
  eq("blank lines dropped", M.parseCsv("a,b\n\n\nc,d").length, 2);
  eq("windows line endings", M.parseCsv("a,b\r\nc,d").length, 2);
  eq("embedded newline in a field", M.parseCsv('"one\ntwo",x')[0][0], "one\ntwo");
}

console.log("\n2. dates in the formats exports actually use");
{
  eq("iso", M.toDateKey("2026-09-01"), "2026-09-01");
  eq("slashes", M.toDateKey("2026/9/1"), "2026-09-01");
  eq("day first, unambiguous", M.toDateKey("25/12/2026"), "2026-12-25");
  eq("month first, unambiguous", M.toDateKey("12/25/2026"), "2026-12-25");
  eq("nonsense is refused", M.toDateKey("not a date"), null);
  eq("empty is refused", M.toDateKey(""), null);
}

console.log("\n3. export is one row per entry");
{
  const rows = M.parseCsv(M.exportCsv(doc));
  eq("header", rows[0], ["date", "category", "target", "value", "unit", "kinds"]);
  eq("three entries", rows.length - 1, 3);
  eq("an amount keeps its unit", rows.find((r) => r[2] === "Walk" && r[0] === "2026-09-01"),
     ["2026-09-01", "Movement", "Walk", "45", "min", ""]);
  eq("a tick with kinds names them",
     rows.find((r) => r[2] === "Strength"), ["2026-09-01", "Movement", "Strength", "1", "", "Arms"]);
}

console.log("\n4. importing a column-per-habit file (Loop's shape)");
{
  const csv = "Date,Walk,Meditate,Read\n2026-08-01,45,1,20\n2026-08-02,,1,\n2026-08-03,30,,15";
  const r = M.readImport(csv, doc, { defaultCatId: "c_move" });
  eq("shape detected", r.shape, "wide");
  eq("Walk matched to the existing target", r.matched, ["Walk"]);
  eq("two new targets", r.created.map((t) => t.name), ["Meditate", "Read"]);
  eq("ticks stay ticks", r.created.find((t) => t.name === "Meditate").kind, "tick");
  eq("numbers become amounts", r.created.find((t) => t.name === "Read").kind, "amount");
  eq("blank cells skipped", r.entries, 6);
  eq("date range", [r.first, r.last], ["2026-08-01", "2026-08-03"]);
  eq("existing target keeps its id", r.log["2026-08-01"].t_walk, 45);
}

console.log("\n5. importing a row-per-entry file");
{
  const csv = "date,habit,value\n2026-08-01,Walk,45\n2026-08-01,Floss,yes\n2026-08-02,Floss,x";
  const r = M.readImport(csv, doc, { defaultCatId: "c_move" });
  eq("shape detected", r.shape, "long");
  eq("three entries", r.entries, 3);
  eq("truthy words count as done", r.log["2026-08-01"][r.created[0].id], true);
  eq("only Floss is new", r.created.map((t) => t.name), ["Floss"]);
}

console.log("\n6. files it cannot make sense of");
{
  eq("empty", M.readImport("", doc).ok, false);
  eq("no dates anywhere", M.readImport("a,b\nx,y", doc).reason, "unknown");
  eq("header only", M.readImport("Date,Walk", doc).ok, false);
}

console.log("\n7. applying an import fills gaps rather than overwriting");
{
  const csv = "Date,Walk\n2026-09-01,10\n2026-09-05,25";
  const r = M.readImport(csv, doc, { defaultCatId: "c_move" });
  const after = M.applyImport(doc, r);
  eq("a day already recorded is left alone", after.log["2026-09-01"].t_walk, 45);
  eq("a day not recorded is filled", after.log["2026-09-05"].t_walk, 25);
  eq("untouched days survive", after.log["2026-09-02"].t_walk, 20);
  eq("no target duplicated", after.targets.length, 2);
}

console.log("\n8. a full round trip through export and back");
{
  const empty = { ...doc, log: {}, targets: [] };
  const r = M.readImport(M.exportCsv(doc), empty, { defaultCatId: "c_move" });
  eq("every entry survives", r.entries, 3);
  eq("targets recreated", r.created.map((t) => t.name).sort(), ["Strength", "Walk"]);
  const walk = r.created.find((t) => t.name === "Walk");
  eq("Walk read back as an amount", walk.kind, "amount");
  eq("its values", [r.log["2026-09-01"][walk.id], r.log["2026-09-02"][walk.id]], [45, 20]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
