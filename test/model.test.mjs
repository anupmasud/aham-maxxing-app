/* Tests the domain model in plain Node.
   The model is deliberately free of React, Drive and the DOM, so it can be
   loaded straight from source and exercised without a simulator. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, "..", "src", "model", f), "utf8");

// seed.js imports from targets.js; concatenating gives one self-contained module.
const source = read("targets.js") + "\n" + read("seed.js").replace(/^import .*$/m, "");
const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

/* Dates relative to now, so the suite does not rot. */
const K = (offset) => M.keyOf(M.addDays(new Date(), offset));
const TODAY = M.todayKey();
const monday = M.keyOf(M.startOfWeek(new Date()));
const thisWeek = M.weekKeys(M.parseKey(monday));

const T = {
  walk:   { id: "walk",   kind: "amount", dir: "at_least", period: "day",  goal: 30,   unit: "min",   step: 5,   days: M.ALL_DAYS },
  steps:  { id: "steps",  kind: "amount", dir: "at_least", period: "day",  goal: 8000, unit: "steps", step: 500, days: M.ALL_DAYS },
  gym:    { id: "gym",    kind: "tick",   dir: "at_least", period: "week", goal: 4,    unit: "",      step: 1,   days: M.ALL_DAYS },
  booze:  { id: "booze",  kind: "amount", dir: "at_most",  period: "week", goal: 6,    unit: "units", step: 1,   days: M.ALL_DAYS },
  coffee: { id: "coffee", kind: "amount", dir: "at_most",  period: "day",  goal: 2,    unit: "cups",  step: 1,   days: M.ALL_DAYS },
  floss:  { id: "floss",  kind: "tick",   dir: "at_least", period: "day",  goal: 1,    unit: "",      step: 1,   days: [0, 2, 4] },
};
const ALL = Object.values(T);

console.log("\n1. progress across the three axes");
{
  const log = { [TODAY]: { walk: 30, steps: 5000, coffee: 3 } };
  eq("daily amount met exactly", M.progress(T.walk, TODAY, log).met, true);
  eq("daily amount short", M.progress(T.steps, TODAY, log).met, false);
  eq("ratio drives the bar", Math.round(M.progress(T.steps, TODAY, log).ratio * 100), 63);
  eq("daily ceiling exceeded", M.progress(T.coffee, TODAY, log).over, true);
  eq("unlogged ceiling is kept", M.progress(T.booze, TODAY, {}).met, true);
}

console.log("\n2. weekly targets sum across the whole week");
{
  const log = {};
  thisWeek.slice(0, 3).forEach((k) => { log[k] = { gym: true }; });
  eq("3 of 4 sessions, not yet met", M.progress(T.gym, TODAY, log).total, 3);
  eq("weekly not met", M.progress(T.gym, TODAY, log).met, false);
  log[thisWeek[3]] = { gym: true };
  eq("fourth session meets it", M.progress(T.gym, TODAY, log).met, true);

  const drink = { [thisWeek[0]]: { booze: 4 }, [thisWeek[4]]: { booze: 3 } };
  eq("weekly ceiling sums to 7", M.progress(T.booze, TODAY, drink).total, 7);
  eq("weekly ceiling over", M.progress(T.booze, TODAY, drink).over, true);
}

console.log("\n3. scheduled days");
{
  const monKey = thisWeek[0], tueKey = thisWeek[1];
  eq("applies on Monday", M.appliesOn(T.floss, monKey), true);
  eq("not on Tuesday", M.appliesOn(T.floss, tueKey), false);
  eq("no days set means every day", M.appliesOn({ ...T.floss, days: [] }, tueKey), true);
}

console.log("\n4. the day ring counts floors only");
{
  const log = { [TODAY]: { walk: 30, coffee: 9 } };
  const s = M.dayScore(TODAY, [T.walk, T.steps, T.gym, T.booze, T.coffee], log);
  eq("weekly target excluded from the ring", s.due, 2);      // walk + steps
  eq("one of two done", s.done, 1);
  eq("ceilings counted separately", s.limits, 2);            // booze + coffee
  eq("one ceiling broken", s.broken, 1);
}

console.log("\n5. a blown weekly ceiling does not redden every day");
{
  const log = { [thisWeek[4]]: { booze: 9 } };
  eq("weekly breach is not a per-day breach", M.dayLimitsBroken(thisWeek[0], ALL, log), 0);
  const daily = { [TODAY]: { coffee: 5 } };
  eq("daily breach is", M.dayLimitsBroken(TODAY, ALL, daily), 1);
}

console.log("\n6. streaks are bounded by the day you started");
{
  const from = K(-3);
  eq("ceiling with no history does not streak forever", M.streak(T.booze, {}, from) <= 1, true);

  const log = {};
  [1, 2, 3].forEach((d) => { log[K(-d)] = { walk: 30 }; });
  eq("three past days counted", M.streak(T.walk, log, from), 3);
  eq("today unmet does not break it", M.streak(T.walk, log, TODAY === K(0) ? from : from), 3);

  log[TODAY] = { walk: 30 };
  eq("today met extends it", M.streak(T.walk, log, from), 4);

  const older = { [K(-30)]: { walk: 30 } };
  eq("history before the start day is ignored", M.streak(T.walk, older, K(-3)), 0);
}

console.log("\n7. plain-English descriptions of every combination");
{
  eq("daily amount floor", M.describe(T.walk), "At least 30 min a day");
  eq("daily amount ceiling", M.describe(T.coffee), "No more than 2 cups a day");
  eq("weekly tick floor", M.describe(T.gym), "4× a week");
  eq("weekly amount ceiling", M.describe(T.booze), "No more than 6 units a week");
  eq("restricted days", M.describe(T.floss), "Every day on Mon, Wed, Fri");
  eq("weekly amount floor", M.describe({ ...T.walk, period: "week", goal: 3, unit: "h" }), "At least 3 h a week");
}

console.log("\n8. tapping and stepping");
{
  let log = {};
  log = M.toggle(log, T.walk, TODAY);
  eq("tap fills exactly the goal", M.valueOn(log, "walk", TODAY), 30);
  log = M.toggle(log, T.walk, TODAY);
  eq("tapping again clears the day", M.valueOn(log, "walk", TODAY), 0);
  eq("cleared days leave no empty object", Object.keys(log).length, 0);

  log = M.toggle(log, T.gym, TODAY);
  eq("tick toggles on", M.valueOn(log, "gym", TODAY), 1);

  eq("a ceiling cannot be ticked", M.toggle({}, T.booze, TODAY), {});

  let l2 = {};
  l2 = M.step(l2, { ...T.walk, step: 0.25, id: "water" }, TODAY, 1);
  l2 = M.step(l2, { ...T.walk, step: 0.25, id: "water" }, TODAY, 1);
  eq("decimal steps do not drift", M.valueOn(l2, "water", TODAY), 0.5);
  l2 = M.step(l2, { ...T.walk, step: 0.25, id: "water" }, TODAY, -5);
  eq("stepping never goes below zero", M.valueOn(l2, "water", TODAY), 0);
}

console.log("\n9. weekly amount tap fills only what is still needed");
{
  const log = { [thisWeek[0]]: { hours: 2 } };
  const t = { id: "hours", kind: "amount", dir: "at_least", period: "week", goal: 3, unit: "h", step: 0.5, days: M.ALL_DAYS };
  const after = M.toggle(log, t, thisWeek[1]);
  eq("tops up to the weekly goal", M.valueOn(after, "hours", thisWeek[1]), 1);
}

console.log("\n10. seed data is coherent");
{
  const doc = M.seededDoc();
  eq("eleven categories", doc.categories.length, 11);
  eq("six seeded targets", doc.targets.length, 6);
  eq("every target has a real category",
     doc.targets.every((t) => doc.categories.some((c) => c.id === t.catId)), true);
  eq("every target has an id and days",
     doc.targets.every((t) => t.id && Array.isArray(t.days) && t.days.length === 7), true);
  eq("suggestions exist for every category",
     doc.categories.every((c) => Array.isArray(M.SUGGESTIONS[c.id]) && M.SUGGESTIONS[c.id].length), true);
  const kinds = new Set(Object.values(M.SUGGESTIONS).flat().map((s) => s.kind));
  eq("suggestions only use known kinds", [...kinds].sort(), ["amount", "tick"]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
