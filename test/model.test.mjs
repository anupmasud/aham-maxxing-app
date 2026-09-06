/* Tests the domain model in plain Node.
   The model is deliberately free of React, Drive and the DOM, so it can be
   loaded straight from source and exercised without a simulator. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, "..", "src", "model", f), "utf8");

/* The model is split across three files that import each other. Concatenating
   them with their imports and re-exports stripped gives one self-contained
   module a data: URL can load, which keeps the suite dependency-free. */
const strip = (f) => read(f)
  .replace(/^import .*$/gm, "")
  .replace(/^export \{[^}]*\}( from .*)?;$/gm, "");
const source = ["targets.js", "templates.js", "seed.js"].map(strip).join("\n");
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

console.log("\n11. types on a target, and older log shapes still readable");
{
  const strength = {
    id: "str", kind: "tick", dir: "at_least", period: "week", goal: 4, unit: "", step: 1, days: M.ALL_DAYS,
    types: [
      { id: "lymph", name: "Lymph drainage", goal: 5 },
      { id: "full",  name: "Full body",      goal: 2 },
      { id: "waist", name: "Waist" },
      { id: "arms",  name: "Arms",           goal: 2 },
    ],
    plan: { 0: ["arms"], 2: ["full"], 4: ["lymph", "waist"] },
  };

  eq("target reports having types", M.hasTypes(strength), true);
  eq("a plain target does not", M.hasTypes(T.walk), false);

  let log = {};
  log = M.toggleType(log, strength, thisWeek[0], "arms");
  eq("one type done is one session", M.valueOn(log, "str", thisWeek[0]), 1);
  eq("and it is recorded", M.typesOn(log, "str", thisWeek[0]), ["arms"]);

  log = M.toggleType(log, strength, thisWeek[0], "lymph");
  eq("two types on a day count as two", M.valueOn(log, "str", thisWeek[0]), 2);

  log = M.toggleType(log, strength, thisWeek[0], "arms");
  eq("toggling off removes just that type", M.typesOn(log, "str", thisWeek[0]), ["lymph"]);

  log = M.toggleType(log, strength, thisWeek[0], "lymph");
  eq("removing the last type clears the day", Object.keys(log).length, 0);

  // Older documents stored ticks as `true` and amounts as numbers.
  const legacy = { [thisWeek[1]]: { str: true, walk: 45 } };
  eq("legacy tick still reads as one", M.valueOn(legacy, "str", thisWeek[1]), 1);
  eq("legacy tick has no types", M.typesOn(legacy, "str", thisWeek[1]), []);
  eq("legacy number still reads", M.valueOn(legacy, "walk", thisWeek[1]), 45);

  // Per-type counts across the week.
  let wk = {};
  ["lymph", "lymph", "lymph", "arms"].forEach((id, i) => { wk = M.toggleType(wk, strength, thisWeek[i], id); });
  eq("lymph counted three times", M.typeProgress(strength, strength.types[0], thisWeek[0], wk).total, 3);
  eq("its own goal of 5 not met", M.typeProgress(strength, strength.types[0], thisWeek[0], wk).met, false);
  eq("a type with no goal reports none", M.typeProgress(strength, strength.types[2], thisWeek[0], wk).met, null);
  eq("parent total counts every session", M.progress(strength, thisWeek[0], wk).total, 4);
  eq("parent goal of 4 met", M.progress(strength, thisWeek[0], wk).met, true);
}

console.log("\n12. the weekly plan");
{
  const strength = {
    id: "str", kind: "tick", dir: "at_least", period: "week", goal: 4, days: M.ALL_DAYS,
    types: [{ id: "arms", name: "Arms" }, { id: "full", name: "Full body" }],
    plan: { 0: ["arms"], 2: ["full"] },
  };

  eq("Monday plans arms", M.plannedOn(strength, thisWeek[0]), ["arms"]);
  eq("Tuesday plans nothing", M.plannedOn(strength, thisWeek[1]), []);
  eq("target reports having a plan", M.hasPlan(strength), true);
  eq("a target without one does not", M.hasPlan({ ...strength, plan: {} }), false);

  const done = M.toggleType({}, strength, thisWeek[0], "arms");
  const kept = M.planStatus(strength, thisWeek[0], done);
  eq("planned and done is kept", kept.kept, ["arms"]);
  eq("nothing missed", kept.missed, []);

  const swapped = M.toggleType({}, strength, thisWeek[0], "full");
  const st = M.planStatus(strength, thisWeek[0], swapped);
  eq("planned but not done is missed", st.missed, ["arms"]);
  eq("done but not planned is extra", st.extra, ["full"]);

  // A day still ahead of you is not a failure.
  const future = M.keyOf(M.addDays(new Date(), 3));
  const futurePlan = { ...strength, plan: { [M.dow(M.parseKey(future))]: ["arms"] } };
  eq("a future day is never missed", M.planStatus(futurePlan, future, {}).missed, []);
  eq("but it is still planned", M.planStatus(futurePlan, future, {}).planned, ["arms"]);
}

console.log("\n13. hit rates are measured in each target's own unit");
{
  const week = thisWeek;                       // Mon..Sun of the current week
  const log = {};
  // Walk met on 3 of the 7 days; steps on 1.
  [0, 1, 2].forEach((i) => { log[week[i]] = { ...(log[week[i]] || {}), walk: 30 }; });
  log[week[0]] = { ...log[week[0]], steps: 9000 };
  // Strength met this week (4 sessions).
  [0, 1, 2, 3].forEach((i) => { log[week[i]] = { ...(log[week[i]] || {}), gym: true }; });

  eq("a daily target counts days", M.targetStats(T.walk, week, log), { n: 7, done: 3, pct: 3 / 7, unit: "days" });
  eq("a weekly target counts weeks", M.targetStats(T.gym, week, log), { n: 1, done: 1, pct: 1, unit: "weeks" });
  eq("scheduled days only", M.targetStats(T.floss, week, log).n, 3);   // Mon, Wed, Fri

  const daily = M.periodStats([T.walk, T.steps, T.gym, T.booze], week, log, "day");
  eq("daily pooled across targets", { n: daily.n, done: daily.done, unit: daily.unit },
     { n: 14, done: 4, unit: "days" });                                 // 7+7 due, 3+1 met
  eq("ceilings excluded from the rate", daily.targets, 2);

  const weekly = M.periodStats([T.walk, T.steps, T.gym, T.booze], week, log, "week");
  eq("weekly pooled in weeks", { n: weekly.n, done: weekly.done, unit: weekly.unit },
     { n: 1, done: 1, unit: "weeks" });

  // Pooling, not an average of daily percentages: a light day must not weigh
  // the same as a heavy one.
  const lopsided = { [week[0]]: { steps: 9000 } };                      // Mon: steps only
  const pooled = M.periodStats([T.walk, T.steps], week, lopsided, "day");
  eq("one hit out of fourteen target-days", Math.round(pooled.pct * 100), 7);
}

console.log("\n14. a daily tick can only ever be one");
{
  // Switching a target from "4x a week" to a daily tick left the 4 behind in a
  // field the form no longer shows, so it could be done every day and still
  // read 0%. The goal is clamped when read, which repairs saved documents.
  const stale = { id: "msg", kind: "tick", dir: "at_least", period: "day", goal: 4, days: M.ALL_DAYS };
  eq("goal clamps to one", M.goalOf(stale), 1);
  const log = M.toggle({}, stale, TODAY);
  eq("ticking it meets it", M.progress(stale, TODAY, log).met, true);
  eq("and reads as one of one", M.progress(stale, TODAY, log).total, 1);

  const week = { ...stale, period: "week" };
  eq("a weekly tick keeps its goal", M.goalOf(week), 4);
  const amount = { ...stale, kind: "amount", goal: 4 };
  eq("an amount keeps its goal", M.goalOf(amount), 4);

  // Seven days ticked should be seven of seven, not zero.
  let wk = {};
  thisWeek.forEach((k) => { wk = M.toggle(wk, stale, k); });
  const s = M.targetStats(stale, thisWeek, wk);
  eq("every day ticked is a full week", { done: s.done, n: s.n }, { done: 7, n: 7 });
}

console.log("\n15. starting sets");
{
  eq("five to choose from", M.TEMPLATES.map((t) => t.id),
     ["default", "niyamas", "franklin", "health", "dinacharya"]);

  // The Health set exists to line up with Apple's own categories, so its names
  // must stay as Apple writes them.
  eq("health names match Apple's Browse categories",
     M.templateById("health").categories.map((c) => c.name),
     ["Activity", "Nutrition", "Sleep", "Mindfulness", "Mental Wellbeing",
      "Medications", "Body Measurements"]);

  M.TEMPLATES.forEach((t) => {
    const doc = M.docFromTemplate(t.id);
    eq(`${t.id}: categories match the template`, doc.categories.length, t.categories.length);
    eq(`${t.id}: every category has suggestions`,
       t.categories.every((c) => (M.SUGGESTIONS[c.id] || []).length > 0), true);
    eq(`${t.id}: starter targets have a real category`,
       doc.targets.every((x) => doc.categories.some((c) => c.id === x.catId)), true);
    eq(`${t.id}: something to do on day one`, doc.targets.length > 0, true);
    eq(`${t.id}: the set is recorded`, doc.template, t.id);
  });

  // Ids must not collide, or reorganising would merge two templates' categories.
  const ids = M.TEMPLATES.flatMap((t) => t.categories.map((c) => c.id));
  eq("category ids are unique across sets", ids.length, new Set(ids).size);
}

console.log("\n16. reorganising keeps everything");
{
  const doc = M.docFromTemplate("default");
  const before = doc.targets.length;
  const moved = M.addTemplateCategories(doc, "niyamas");
  eq("both sets of categories present", moved.categories.length, 11 + 5);
  eq("no target lost", moved.targets.length, before);
  eq("running it twice adds nothing", M.addTemplateCategories(moved, "niyamas").categories.length, 16);

  eq("strength lands in Tapas", M.guessCategory("niyamas", "Upper Body Strength Training"), "c_niy_tapas");
  eq("journal lands in Svadhyaya", M.guessCategory("niyamas", "Journal"), "c_niy_svadhyaya");
  eq("face mask lands in Saucha", M.guessCategory("niyamas", "Face and Eye Mask"), "c_niy_saucha");
  eq("meditation lands in Surrender", M.guessCategory("niyamas", "Meditate 10 min"), "c_niy_ishvara");
  eq("an unknown name still lands somewhere",
     M.TEMPLATES[1].categories.some((c) => c.id === M.guessCategory("niyamas", "Zzzz")), true);
  eq("the longest keyword wins", M.guessCategory("dinacharya", "Lights out by 11"), "c_din_evening");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
