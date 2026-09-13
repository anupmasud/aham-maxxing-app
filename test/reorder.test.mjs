/* Where a dragged row lands, and how the others move out of its way.

   Pulled out of the component because it is pure arithmetic over real row
   heights, and because being one place out is the failure mode here — it
   looks almost right, so it survives being tried once. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "..", "src", "ui", "Reorder.js"), "utf8");
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const source = grab("export function slotFor", "export function Grip")
  .replace(/^export /gm, "") + "\nexport { slotFor, shiftFor };";
const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

/* Deliberately uneven, which is what the real lists look like: a target with
   a note is taller than one without. */
const H = [60, 100, 40, 80, 50];

console.log("\n1. a row not moved far enough stays put");
{
  eq("no movement", M.slotFor(0, 0, H), 0);
  eq("a nudge down", M.slotFor(0, 10, H), 0);
  eq("a nudge up", M.slotFor(4, -10, H), 4);
  // Row 1 below is 100 tall: it takes 50 to claim its place, not 30.
  eq("just short of halfway", M.slotFor(0, 49, H), 0);
  eq("just past halfway", M.slotFor(0, 51, H), 1);
}

console.log("\n2. dragging down, over rows of different heights");
{
  // past row1 (100) needs 50; then past row2 (40) needs 100 + 20 = 120
  eq("over the tall one", M.slotFor(0, 60, H), 1);
  eq("not yet over the short one", M.slotFor(0, 119, H), 1);
  eq("over the short one", M.slotFor(0, 121, H), 2);
  // then past row3 (80): 100 + 40 + 40 = 180
  eq("over the next", M.slotFor(0, 181, H), 3);
  eq("all the way to the end", M.slotFor(0, 999, H), 4);
  eq("and no further", M.slotFor(0, 99999, H), 4);
}

console.log("\n3. dragging up");
{
  // from row 4: past row3 (80) needs 40; then past row2 (40) needs 80 + 20 = 100
  eq("over the one above", M.slotFor(4, -41, H), 3);
  eq("not yet over the next", M.slotFor(4, -99, H), 3);
  eq("over the next", M.slotFor(4, -101, H), 2);
  eq("all the way to the top", M.slotFor(4, -999, H), 0);
  eq("and no further", M.slotFor(4, -99999, H), 0);
}

console.log("\n4. the rows that are not being dragged move out of the way");
{
  const drag = 100;   // the height of the row being held
  // Dragging row 0 down to slot 2: rows 1 and 2 come up by its height.
  eq("passed rows come up", [0, 1, 2, 3, 4].map((i) => M.shiftFor(i, 0, 2, drag)),
     [0, -drag, -drag, 0, 0]);
  // Dragging row 3 up to slot 1: rows 1 and 2 go down.
  eq("passed rows go down", [0, 1, 2, 3, 4].map((i) => M.shiftFor(i, 3, 1, drag)),
     [0, drag, drag, 0, 0]);
  eq("nothing moves when the slot is unchanged",
     [0, 1, 2, 3, 4].map((i) => M.shiftFor(i, 2, 2, drag)), [0, 0, 0, 0, 0]);
  eq("the dragged row is never shifted", M.shiftFor(1, 1, 4, drag), 0);
}

console.log("\n5. a list of one, and other degenerate shapes");
{
  eq("single row has nowhere to go", M.slotFor(0, 500, [70]), 0);
  eq("nor upwards", M.slotFor(0, -500, [70]), 0);
  eq("an unmeasured row does not throw", M.slotFor(0, 50, [60, undefined, 40]), 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
