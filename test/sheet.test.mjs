/* Round-trips a document through the spreadsheet format.
   This is the layer where data goes missing if anything is wrong, so it is
   tested against a document shaped like a real one — types, a plan, decimals,
   restricted days, an archived target and a ceiling. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, "..", "src", "model", f), "utf8");
const source = read("targets.js") + "\n" + read("sheetFormat.js").replace(/^import .*$/m, "");
const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

const doc = {
  version: 1,
  template: "default",
  createdAt: "2026-08-01T00:00:00.000Z",
  reminders: { enabled: true, hour: 20, minute: 30 },
  categories: [
    { id: "c_move", name: "Movement", emoji: "🚶", color: "#3F7D5B", order: 0 },
    { id: "c_limits", name: "Limits", emoji: "🍷", color: "#B4443A", order: 1 },
  ],
  targets: [
    { id: "t_water", catId: "c_move", name: "Water", kind: "amount", dir: "at_least",
      period: "day", goal: 3, unit: "L", step: 0.25, days: [0,1,2,3,4,5,6], order: 0,
      archived: false, types: [], plan: {} },
    { id: "t_str", catId: "c_move", name: "Strength training", kind: "tick", dir: "at_least",
      period: "week", goal: 5, unit: "", step: 1, days: [0,1,2,3,4,5,6], order: 1, archived: false,
      types: [{ id: "ty_lymph", name: "Lymph drainage", goal: 5 }, { id: "ty_arms", name: "Arms", goal: 2 }],
      plan: { 0: ["ty_lymph", "ty_arms"], 2: ["ty_lymph"] } },
    { id: "t_floss", catId: "c_move", name: "Floss", kind: "tick", dir: "at_least",
      period: "day", goal: 1, unit: "", step: 1, days: [0,2,4], order: 2, archived: true,
      types: [], plan: {} },
    { id: "t_booze", catId: "c_limits", name: "Alcohol", kind: "amount", dir: "at_most",
      period: "week", goal: 6, unit: "units", step: 1, days: [0,1,2,3,4,5,6], order: 3,
      archived: false, types: [], plan: {} },
  ],
  log: {
    "2026-09-01": { t_water: 2.75, t_str: { n: 2, v: ["ty_lymph", "ty_arms"] }, t_floss: true },
    "2026-09-02": { t_water: 3, t_booze: 4 },
    "2026-09-04": { t_str: { n: 1, v: ["ty_lymph"] } },
  },
};

console.log("\n1. what the tabs look like");
{
  const tabs = M.docToSheets(doc);
  eq("five tabs", Object.keys(tabs).sort(), ["Categories", "Log", "Settings", "Targets", "Types"]);
  eq("targets carry the category by name", tabs.Targets[1][1], "Movement");
  eq("restricted days written as names", tabs.Targets[3][9], "Mon, Wed, Fri");
  eq("every day written as All", tabs.Targets[1][9], "All");
  eq("archived flagged", tabs.Targets[3][11], "TRUE");
  eq("a type row carries its weekly minimum", tabs.Types[1].slice(0, 5),
     ["t_str", "Strength training", "ty_lymph", "Lymph drainage", 5]);
  eq("the plan is days beside the type", tabs.Types[1].slice(5), ["TRUE", "", "TRUE", "", "", "", ""]);
  eq("log row 1 is names", tabs.Log[0], ["Date", "Water", "Strength training", "Floss", "Alcohol"]);
  eq("log row 2 is ids", tabs.Log[1], ["id", "t_water", "t_str", "t_floss", "t_booze"]);
  eq("kinds are written by name, not a count", tabs.Log[2][2], "Lymph drainage, Arms");
  eq("a decimal survives", tabs.Log[2][1], 2.75);
  eq("a plain tick is a 1", tabs.Log[2][3], 1);
  eq("nothing logged is blank", tabs.Log[3][3], "");
}

console.log("\n2. the round trip loses nothing");
{
  const back = M.sheetsToDoc(M.docToSheets(doc), doc);
  eq("categories", back.categories, doc.categories);
  eq("targets", back.targets, doc.targets);
  eq("log", back.log, doc.log);
  eq("reminders carried through", back.reminders, doc.reminders);
  eq("the starting set is remembered", back.template, doc.template);
}

console.log("\n5. preferences survive a device that has never seen them");
{
  const tabs = M.docToSheets({ ...doc, homeTab: "today" });

  // Read with no in-memory fallback at all — a fresh install, a second phone.
  const cold = M.sheetsToDoc(tabs);
  eq("reminder time is not lost", cold.reminders, { enabled: true, hour: 20, minute: 30 });
  eq("which screen it opens on", cold.homeTab, "today");
  eq("the starting set", cold.template, "default");
  eq("the creation date", cold.createdAt, doc.createdAt);

  // Defaults, for a document written before the Settings tab existed.
  const legacy = M.docToSheets(doc);
  delete legacy.Settings;
  const old = M.sheetsToDoc(legacy);
  eq("no settings tab falls back sanely", old.reminders, { enabled: false, hour: 20, minute: 0 });
  eq("and opens on insights", old.homeTab, "insights");

  // Someone editing the sheet by hand.
  const edited = M.docToSheets(doc);
  edited.Settings = edited.Settings.map((r) =>
    r[0] === "reminderHour" ? ["reminderHour", 7] : r[0] === "opensOn" ? ["opensOn", "today"] : r);
  const read = M.sheetsToDoc(edited);
  eq("a hand-edited reminder hour takes effect", read.reminders.hour, 7);
  eq("a hand-edited home screen takes effect", read.homeTab, "today");
}

console.log("\n3. it survives the things a person does to a spreadsheet");
{
  const tabs = M.docToSheets(doc);

  // Renaming a target in the sheet renames it in the app, not orphans it.
  const renamed = JSON.parse(JSON.stringify(tabs));
  renamed.Targets[1][2] = "Hydration";
  const r1 = M.sheetsToDoc(renamed, doc);
  eq("rename follows the id", r1.targets.find((t) => t.id === "t_water").name, "Hydration");
  eq("its history is intact", r1.log["2026-09-01"].t_water, 2.75);

  // Editing a goal by hand takes effect.
  const regoaled = JSON.parse(JSON.stringify(tabs));
  regoaled.Targets[1][6] = 4;
  eq("goal edited by hand", M.sheetsToDoc(regoaled, doc).targets[0].goal, 4);

  // A junk row is skipped, not fatal.
  const junk = JSON.parse(JSON.stringify(tabs));
  junk.Targets.splice(2, 0, ["", "", "notes to self"]);
  junk.Log.splice(3, 0, ["not a date", "x"]);
  const r2 = M.sheetsToDoc(junk, doc);
  eq("junk target row ignored", r2.targets.length, 4);
  eq("junk log row ignored", Object.keys(r2.log).sort(), ["2026-09-01", "2026-09-02", "2026-09-04"]);

  // Someone deletes the id row from Log; fall back to matching names.
  const noIds = JSON.parse(JSON.stringify(tabs));
  noIds.Log.splice(1, 1);
  const r3 = M.sheetsToDoc(noIds, doc);
  eq("log recovered from the name row", r3.log["2026-09-02"].t_water, 3);

  // Days typed as numbers, and TRUE spelled differently.
  const loose = JSON.parse(JSON.stringify(tabs));
  loose.Targets[3][9] = "0, 2, 4";
  loose.Targets[3][11] = "yes";
  const r4 = M.sheetsToDoc(loose, doc);
  const floss = r4.targets.find((t) => t.id === "t_floss");
  eq("numeric days parsed", floss.days, [0, 2, 4]);
  eq("yes counts as archived", floss.archived, true);
}

console.log("\n4. a kind renamed in the sheet keeps its history");
{
  const tabs = M.docToSheets(doc);
  tabs.Types[1][3] = "Lymphatic drainage";          // renamed kind
  const back = M.sheetsToDoc(tabs, doc);
  const str = back.targets.find((t) => t.id === "t_str");
  eq("kind renamed", str.types[0].name, "Lymphatic drainage");
  eq("plan still points at it", str.plan[0], ["ty_lymph", "ty_arms"]);
  // The log cell still says the old name, so that entry cannot be matched —
  // the count is what survives, and the app must not crash on it.
  eq("unmatched kind does not lose the day", Object.keys(back.log).includes("2026-09-01"), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
