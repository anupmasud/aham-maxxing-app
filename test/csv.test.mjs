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
  eq("header", rows[0], ["date", "category", "target", "value", "unit", "kinds", "note"]);
  eq("three entries", rows.length - 1, 3);
  eq("an amount keeps its unit", rows.find((r) => r[2] === "Walk" && r[0] === "2026-09-01"),
     ["2026-09-01", "Movement", "Walk", "45", "min", "", ""]);
  eq("a tick with kinds names them",
     rows.find((r) => r[2] === "Strength"), ["2026-09-01", "Movement", "Strength", "1", "", "Arms", ""]);
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

console.log("\n9. day notes go out and come back");
{
  const doc = {
    categories: [{ id: "c", name: "Movement" }],
    targets: [
      { id: "t_walk", catId: "c", name: "Walk", kind: "amount", dir: "at_least",
        period: "day", goal: 30, unit: "min", step: 5, types: [] },
      { id: "t_gym", catId: "c", name: "Gym", kind: "tick", dir: "at_least",
        period: "week", goal: 3, unit: "", step: 1, types: [] },
    ],
    log: { "2026-09-01": { t_walk: 45 } },
    notes: {
      "2026-09-01": { t_walk: "Windy, went the long way." },
      // A note on a day nothing was logged: the case worth not losing.
      "2026-09-02": { t_gym: "Skipped, back was sore." },
    },
  };

  const rows = M.parseCsv(M.exportCsv(doc));
  eq("a note column", rows[0][6], "note");
  eq("three rows: one entry, one entry+note, one note alone", rows.length - 1, 2);
  eq("the note rides with its entry", rows[1], ["2026-09-01", "Movement", "Walk", "45", "min", "", "Windy, went the long way."]);
  eq("and a note with no entry still gets a row",
     rows[2], ["2026-09-02", "Movement", "Gym", "", "", "", "Skipped, back was sore."]);

  // Straight back in.
  const empty = { ...doc, log: {}, notes: {} };
  const read = M.readImport(M.exportCsv(doc), empty);
  eq("it reads", read.ok, true);
  eq("one value", read.entries, 1);
  eq("two notes", read.notes, 2);
  eq("nothing new invented", read.created.length, 0);

  const back = M.applyImport(empty, read);
  eq("the value is back", back.log["2026-09-01"].t_walk, 45);
  eq("the note beside it", back.notes["2026-09-01"].t_walk, "Windy, went the long way.");
  eq("and the one that stood alone", back.notes["2026-09-02"].t_gym, "Skipped, back was sore.");
  eq("without inventing an entry for it", (back.log["2026-09-02"] || {}).t_gym, undefined);

  // What is already written wins, the same as entries do.
  const held = { ...empty, notes: { "2026-09-01": { t_walk: "mine" } } };
  eq("an existing note is not overwritten",
     M.applyImport(held, M.readImport(M.exportCsv(doc), held)).notes["2026-09-01"].t_walk, "mine");

  // A file from anywhere else, with no note column, still imports.
  const plain = "date,habit,value\n2026-09-03,Walk,20\n";
  const r2 = M.readImport(plain, empty);
  eq("no note column is not a problem", r2.entries, 1);
  eq("and no notes are invented", r2.notes, 0);
}

console.log("\n10. an exported cell cannot be read as a formula");
{
  const doc = {
    categories: [{ id: "c", name: "Movement" }],
    targets: [{ id: "t", catId: "c", name: "Walk", kind: "amount", dir: "at_least",
                period: "day", goal: 30, unit: "min", step: 5, types: [] }],
    log: { "2026-09-01": { t: 30 } },
    notes: { "2026-09-01": { t: '=HYPERLINK("http://example.test","click me")' } },
  };
  const rows = M.parseCsv(M.exportCsv(doc));
  eq("a formula is written as text",
     rows[1][6], '\'=HYPERLINK("http://example.test","click me")');

  const cell = (note) => M.parseCsv(M.exportCsv({ ...doc, notes: { "2026-09-01": { t: note } } }))[1][6];
  eq("+ too", cell("+1+1"), "'+1+1");
  eq("@ too", cell("@SUM(A1)"), "'@SUM(A1)");
  eq("and a tab", cell("\tx"), "'\tx");
  eq("ordinary prose is untouched", cell("Windy, went the long way."), "Windy, went the long way.");
  eq("so is a note that merely contains one", cell("goal = 3L"), "goal = 3L");

  // Numbers keep their sign; only a dash that is not a number is suspect.
  eq("a negative number stays a number", M.parseCsv(M.toCsvText([[-3]]))[0][0], "-3");
  eq("a decimal stays a number", M.parseCsv(M.toCsvText([["-2.5"]]))[0][0], "-2.5");
  // "-1+1" is arithmetic to a spreadsheet, not a number, so it is quoted.
  eq("a dash-led formula is neutralised", M.parseCsv(M.toCsvText([["-1+1"]]))[0][0], "'-1+1");
  eq("as is the classic command payload",
     M.parseCsv(M.toCsvText([["-2+3+cmd|' /C calc'!A0"]]))[0][0], "'-2+3+cmd|' /C calc'!A0");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
