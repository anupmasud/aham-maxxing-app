/* How a day is painted in the Insights heatmap.

   Lifted out of the component because this is where Insights crashed: a day
   inside a break has no score, and the old code read `.due` off that missing
   score. One holiday anywhere in the selected range and the whole screen went
   white — which is a crash caused by looking at your own history, in an app
   whose breaks feature exists precisely so that time off is normal. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "..", "src", "screens", "Insights.js"), "utf8");

/* Only the pure function is wanted, not the React around it. The palette it
   uses is stubbed, so the test is about structure rather than exact colours. */
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const body = grab("export function heatCell", "function Heat(").replace(/^export /gm, "");
const source = `const C = { ruleSoft: "soft", good: "good", over: "over" };\n${body}\nexport { heatCell };`;
const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

const score = (pct, due = 5) => ({ due, done: Math.round(pct * due), pct, limits: 0, broken: 0 });

console.log("\n1. a day inside a break does not crash, and does not look like a failure");
{
  // This is the bug: away days arrive with score null.
  eq("away with no score at all",
     M.heatCell({ outside: false, away: true, score: null, broken: false }),
     { bg: "soft", opacity: 0.3 });
  eq("faded, not blank — a break is not a day you did nothing",
     M.heatCell({ outside: false, away: true, score: null, broken: false }).opacity, 0.3);
  eq("and not painted as achievement either",
     M.heatCell({ outside: false, away: true, score: null, broken: false }).bg, "soft");
}

console.log("\n2. outside the window behaves the same way");
{
  eq("future days", M.heatCell({ outside: true, away: false, score: null, broken: false }),
     { bg: "soft", opacity: 0.3 });
  eq("days before the range", M.heatCell({ outside: true, away: false, score: null, broken: false }).opacity, 0.3);
  eq("outside wins over everything else",
     M.heatCell({ outside: true, away: false, score: score(1), broken: true }),
     { bg: "soft", opacity: 0.3 });
}

console.log("\n3. an ordinary day with nothing due");
{
  eq("nothing scheduled", M.heatCell({ outside: false, away: false, score: score(0, 0), broken: false }),
     { bg: "soft", opacity: 1 });
  // Defensive: a missing score on a day that is neither away nor outside
  // should still not throw, whatever caused it.
  eq("a missing score never throws", M.heatCell({ outside: false, away: false, score: null, broken: false }),
     { bg: "soft", opacity: 1 });
  eq("an undefined score either", M.heatCell({ outside: false, away: false, broken: false }),
     { bg: "soft", opacity: 1 });
}

console.log("\n4. a day that counted");
{
  eq("nothing done", M.heatCell({ outside: false, away: false, score: score(0), broken: false }),
     { bg: "good", opacity: 0.15 });
  eq("half done", M.heatCell({ outside: false, away: false, score: score(0.5), broken: false }),
     { bg: "good", opacity: 0.575 });
  eq("all done", M.heatCell({ outside: false, away: false, score: score(1), broken: false }),
     { bg: "good", opacity: 1 });
  eq("darker as more is done",
     M.heatCell({ outside: false, away: false, score: score(1), broken: false }).opacity >
     M.heatCell({ outside: false, away: false, score: score(0.2), broken: false }).opacity, true);
}

console.log("\n5. a day a limit was broken");
{
  eq("broken wins over done", M.heatCell({ outside: false, away: false, score: score(1), broken: true }),
     { bg: "over", opacity: 0.95 });
  eq("even with little done", M.heatCell({ outside: false, away: false, score: score(0), broken: true }),
     { bg: "over", opacity: 0.35 });
  eq("but not on an away day",
     M.heatCell({ outside: false, away: true, score: null, broken: true }).bg, "soft");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
