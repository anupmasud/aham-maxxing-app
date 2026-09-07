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

/* Columns are addressed by header name here for the same reason the reader
   looks them up that way: a test that counts from the left has to be edited
   every time the format grows, and quietly asserts the wrong cell if it is not. */
const col = (name) => M.TGT_HEAD.indexOf(name);

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
      period: "day", goal: 3, unit: "L", step: 0.25, days: [0,1,2,3,4,5,6], until: "", order: 0,
      archived: false, note: "", types: [], plan: {} },
    { id: "t_str", catId: "c_move", name: "Strength training", kind: "tick", dir: "at_least",
      period: "week", goal: 5, unit: "", step: 1, days: [0,1,2,3,4,5,6], until: "", order: 1, archived: false,
      note: 'Hamstring curls x15, glute bridges x20.\nSay "slow" on the way down.',
      types: [{ id: "ty_lymph", name: "Lymph drainage", goal: 5 }, { id: "ty_arms", name: "Arms", goal: 2 }],
      plan: { 0: ["ty_lymph", "ty_arms"], 2: ["ty_lymph"] } },
    { id: "t_floss", catId: "c_move", name: "Floss", kind: "tick", dir: "at_least",
      period: "day", goal: 1, unit: "", step: 1, days: [0,2,4], until: "2026-12-31", order: 2,
      archived: true, note: "", types: [], plan: {} },
    { id: "t_booze", catId: "c_limits", name: "Alcohol", kind: "amount", dir: "at_most",
      period: "week", goal: 6, unit: "units", step: 1, days: [0,1,2,3,4,5,6], until: "", order: 3,
      archived: false, note: "", types: [], plan: {} },
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
  eq("six tabs", Object.keys(tabs).sort(),
     ["Categories", "Log", "Plan", "Settings", "Targets", "Types"]);
  eq("targets carry the category by name", tabs.Targets[1][col("category")], "Movement");
  eq("restricted days written as names", tabs.Targets[3][col("days")], "Mon, Wed, Fri");
  eq("every day written as All", tabs.Targets[1][col("days")], "All");
  eq("archived flagged", tabs.Targets[3][col("archived")], "TRUE");
  eq("an end date written as a date key", tabs.Targets[3][col("until")], "2026-12-31");
  eq("no end leaves the column blank", tabs.Targets[1][col("until")], "");
  eq("an unplanned target leaves the column blank", tabs.Targets[1][col("planned")], "");
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
  renamed.Targets[1][col("name")] = "Hydration";
  const r1 = M.sheetsToDoc(renamed, doc);
  eq("rename follows the id", r1.targets.find((t) => t.id === "t_water").name, "Hydration");
  eq("its history is intact", r1.log["2026-09-01"].t_water, 2.75);

  // Editing a goal by hand takes effect.
  const regoaled = JSON.parse(JSON.stringify(tabs));
  regoaled.Targets[1][col("goal")] = 4;
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

console.log("\n4b. a plan for a target without types");
{
  const planned = {
    ...doc,
    targets: doc.targets.map((t) =>
      t.id === "t_water" ? { ...t, plan: { 0: true, 2: true, 4: true } } : t),
  };
  const tabs = M.docToSheets(planned);
  const row = tabs.Targets.find((r) => r[0] === "t_water");
  eq("written as weekday names", row[col("planned")], "Mon, Wed, Fri");

  const back = M.sheetsToDoc(tabs, planned);
  eq("read back", back.targets.find((t) => t.id === "t_water").plan, { 0: true, 2: true, 4: true });

  // A typed target keeps its per-type plan and does not gain a whole-target one.
  eq("typed target's plan untouched",
     back.targets.find((t) => t.id === "t_str").plan, { 0: ["ty_lymph", "ty_arms"], 2: ["ty_lymph"] });

  // Blank must mean "nothing planned", not "every day".
  eq("blank is not every day", back.targets.find((t) => t.id === "t_floss").plan, {});

  // Hand-editable, like everything else.
  const edited = M.docToSheets(planned);
  edited.Targets = edited.Targets.map((r) => (r[0] === "t_water" ? [...r.slice(0, 10), "Tue", ...r.slice(11)] : r));
  eq("a hand-edited plan takes effect",
     M.sheetsToDoc(edited, planned).targets.find((t) => t.id === "t_water").plan, { 1: true });
}

console.log("\n4c. plans for particular dates");
{
  const withPlans = {
    ...doc,
    plans: {
      "2026-09-15": { t_water: true, t_floss: false },
      "2026-09-16": { t_str: ["ty_arms"] },
    },
  };
  const tabs = M.docToSheets(withPlans);
  eq("a row per date and target", tabs.Plan.length - 1, 3);
  eq("a refusal is recorded, not omitted",
     tabs.Plan.find((r) => r[2] === "t_floss").slice(0, 4), ["2026-09-15", "Floss", "t_floss", "FALSE"]);
  eq("kinds written by name", tabs.Plan.find((r) => r[2] === "t_str")[4], "Arms");

  const back = M.sheetsToDoc(tabs, withPlans);
  eq("round trip", back.plans, withPlans.plans);

  // A document from before the tab existed.
  const legacy = M.docToSheets(withPlans);
  delete legacy.Plan;
  eq("no plan tab is simply no plans", M.sheetsToDoc(legacy).plans, {});
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

console.log("\n7. columns are found by name, not by counting from the left");
{
  /* The sheet as it was written before the `planned` and `until` columns
     existed. Read positionally, `order` landed where `planned` now sits and
     every target came back with a plan derived from its sort order — a target
     ordered third was planned every Thursday, and one ordered seventh every
     day of the week. This is that sheet. */
  const old12 = {
    Categories: [["id", "name", "emoji", "colour", "order"],
                 ["c_move", "Movement", "🚶", "#3F7D5B", 0]],
    Targets: [
      ["id", "category", "name", "kind", "direction", "period",
       "goal", "unit", "step", "days", "order", "archived"],
      ["t_steps", "Movement", "Steps", "amount", "at least", "day", 8000, "steps", 500, "All", 3, "FALSE"],
      ["t_msg", "Movement", "Message a friend", "tick", "at least", "day", 1, "", 1, "All", 7, "TRUE"],
    ],
    Types: [], Log: [], Plan: [], Settings: [],
  };
  const back = M.sheetsToDoc(old12);
  const steps = back.targets.find((t) => t.id === "t_steps");
  const msg = back.targets.find((t) => t.id === "t_msg");

  eq("a missing column reads as absent, not as its neighbour", steps.plan, {});
  eq("nor does the seventh become every day", msg.plan, {});
  eq("order is still the order", steps.order, 3);
  eq("and archived is still archived", msg.archived, true);
  eq("with no end date invented", steps.until, "");

  // Columns moved around by hand, and one unknown column added.
  const shuffled = {
    ...old12,
    Targets: [
      ["archived", "name", "note", "id", "category", "days", "period", "direction", "kind", "goal", "unit", "step", "order"],
      ["FALSE", "Steps", "ignore me", "t_steps", "Movement", "Mon, Fri", "day", "at least", "amount", 8000, "steps", 500, 3],
    ],
  };
  const moved = M.sheetsToDoc(shuffled).targets[0];
  eq("a reordered header still reads", moved.name, "Steps");
  eq("including the days", moved.days, [0, 4]);
  eq("and an unknown column is ignored", moved.goal, 8000);

  /* A header row overwritten with data. Row one is always spent as the header
     whatever it holds, so that row is lost either way — what the fallback
     saves is every row beneath it, which would otherwise be read through a
     header of garbage and come back as nothing recognisable. */
  const headless = {
    ...old12,
    Targets: [
      ["t_steps", "Movement", "Steps", "amount", "at least", "day", 8000, "steps", 500, "All", "", "", 3, "FALSE"],
      ["t_water", "Movement", "Water", "amount", "at least", "day", 3, "L", 0.25, "All", "", "", 4, "FALSE"],
    ],
  };
  const fallen = M.sheetsToDoc(headless).targets;
  eq("the rows below a lost header are still read", fallen.length, 1);
  eq("in the canonical column order", fallen[0].name, "Water");
  eq("goal and all", fallen[0].goal, 3);
}

console.log("\n8. end dates survive the round trip");
{
  eq("a date key passes through", M.untilIn("2026-12-31"), "2026-12-31");
  eq("blank means no end", M.untilIn(""), "");
  eq("so does nonsense", M.untilIn("whenever"), "");
  // Editing the cell by hand in Sheets turns it into a serial number.
  eq("a Sheets date serial is understood", M.untilIn(46387), "2026-12-31");
  eq("as is a written-out date", M.untilIn("31 December 2026"), "2026-12-31");

  const back = M.sheetsToDoc(M.docToSheets(doc), doc);
  eq("the end date comes back", back.targets.find((t) => t.id === "t_floss").until, "2026-12-31");
  eq("and the others have none", back.targets.find((t) => t.id === "t_water").until, "");
}

console.log("\n9. notes ride along with the target");
{
  const tabs = M.docToSheets(doc);
  const row = tabs.Targets.find((r) => r[0] === "t_str");
  eq("written to its own column",
     row[col("note")], 'Hamstring curls x15, glute bridges x20.\nSay "slow" on the way down.');
  eq("and last, after archived", col("note"), M.TGT_HEAD.length - 1);
  eq("a target with no note leaves it blank",
     tabs.Targets.find((r) => r[0] === "t_water")[col("note")], "");

  const back = M.sheetsToDoc(tabs, doc);
  eq("newlines and quotes survive the round trip",
     back.targets.find((t) => t.id === "t_str").note,
     'Hamstring curls x15, glute bridges x20.\nSay "slow" on the way down.');
  eq("and no note stays no note", back.targets.find((t) => t.id === "t_water").note, "");

  // A sheet written before notes existed reads as no note, not as a neighbour.
  const older = JSON.parse(JSON.stringify(tabs));
  older.Targets = older.Targets.map((r) => r.slice(0, M.TGT_HEAD.length - 1));
  const noNotes = M.sheetsToDoc(older, doc);
  eq("an older sheet has no notes", noNotes.targets.map((t) => t.note), ["", "", "", ""]);
  eq("and everything else is intact", noNotes.targets.map((t) => t.goal), [3, 5, 1, 6]);
  eq("including the column before it", noNotes.targets.map((t) => t.archived),
     [false, false, true, false]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
