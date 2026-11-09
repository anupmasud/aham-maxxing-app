/* Saving must never pass through a state where the spreadsheet is empty.

   The bug this guards against: saving was a clear followed by a write, two
   separate requests. A save interrupted between them left every tab blank,
   and the sync logic afterwards could not tell an accident from an intention.
   Two months of logged days were lost that way, on a phone that went offline
   mid-save.

   So the test that matters is structural, not cosmetic: whatever else these
   requests do, there must be no way to apply a clear without the matching
   write, which means exactly one atomic batch and no clear request of its
   own. */

import { cell, writeRequests } from "../src/model/sheetWrite.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

const props = [
  { title: "Log", sheetId: 11, gridProperties: { rowCount: 1000, columnCount: 26 } },
  { title: "Tasks", sheetId: 12, gridProperties: { rowCount: 1000, columnCount: 26 } },
  { title: "Settings", sheetId: 13, gridProperties: { rowCount: 1000, columnCount: 26 } },
];
const ORDER = ["Log", "Tasks", "Settings"];

console.log("\n1. clearing and writing are the same operation");
{
  const reqs = writeRequests(ORDER, { Log: [["Date"], ["2026-11-08"]], Tasks: [], Settings: [] }, props);

  // Nothing may empty a tab except the request that also fills it.
  eq("no standalone clear request",
     reqs.some((r) => r.clear || r.deleteRange || r.deleteDimension), false);
  eq("every request is an updateCells or a grid resize",
     reqs.every((r) => r.updateCells || r.updateSheetProperties), true);

  /* The whole point: a tab's old contents and its new contents move together.
     An updateCells whose range covers the tab clears what the rows do not
     reach, so there is no instant where the old is gone and the new is not
     there yet. */
  const log = reqs.find((r) => r.updateCells && r.updateCells.range.sheetId === 11);
  eq("the range is the whole tab, not just the rows written",
     log.updateCells.range, { sheetId: 11 });
  eq("and fields names what gets cleared",
     log.updateCells.fields, "userEnteredValue");
}

console.log("\n2. a tab with nothing in it is emptied, not skipped");
{
  // The old write filtered empty tabs out of the update and relied on the
  // separate clear to empty them. With no separate clear, skipping them would
  // leave stale rows behind for ever.
  const reqs = writeRequests(ORDER, { Log: [], Tasks: [], Settings: [] }, props);
  eq("every tab still gets a request", reqs.filter((r) => r.updateCells).length, 3);
  const tasks = reqs.find((r) => r.updateCells.range.sheetId === 12);
  eq("with no rows, which clears it", tasks.updateCells.rows, []);
}

console.log("\n3. a tab the spreadsheet does not have is left alone");
{
  // Guessing a sheetId would write into whichever tab owned that number.
  const reqs = writeRequests(["Log", "Ghost"], { Log: [["a"]], Ghost: [["x"]] }, props);
  eq("only the tab that exists", reqs.length, 1);
  eq("and it is the right one", reqs[0].updateCells.range.sheetId, 11);
}

console.log("\n4. the grid is grown before it is written into");
{
  const tall = [{ title: "Log", sheetId: 11, gridProperties: { rowCount: 3, columnCount: 2 } }];
  const rows = [["a", "b", "c"], ["d"], ["e"], ["f"]];   // 4 rows, 3 columns
  const reqs = writeRequests(["Log"], { Log: rows }, tall);

  eq("resize comes first", !!reqs[0].updateSheetProperties, true);
  eq("big enough for the data", reqs[0].updateSheetProperties.properties.gridProperties,
     { rowCount: 4, columnCount: 3 });
  eq("then the write", !!reqs[1].updateCells, true);
  // Both in the same batch, so the sheet is never grown-but-unwritten either.
  eq("still one atomic batch", reqs.length, 2);
}
{
  const reqs = writeRequests(["Log"], { Log: [["a"]] }, props);
  eq("no resize when it already fits", reqs.some((r) => r.updateSheetProperties), false);
}

console.log("\n5. values keep the types the sheet used to store");
{
  // The old write used RAW: strings stayed strings, numbers stayed numbers.
  eq("text", cell("Steps"), { userEnteredValue: { stringValue: "Steps" } });
  eq("a count", cell(8000), { userEnteredValue: { numberValue: 8000 } });
  eq("zero is a value, not a blank", cell(0), { userEnteredValue: { numberValue: 0 } });
  eq("a date stays text", cell("2026-11-08"),
     { userEnteredValue: { stringValue: "2026-11-08" } });
  eq("a flag", cell(true), { userEnteredValue: { boolValue: true } });

  // An empty cell has no value at all, which is how the grid API clears one.
  eq("empty string", cell(""), {});
  eq("undefined", cell(undefined), {});
  eq("null", cell(null), {});
  eq("NaN is not a number the sheet can hold", cell(NaN),
     { userEnteredValue: { stringValue: "NaN" } });
}

console.log("\n6. a row shorter than its neighbours does not shift cells left");
{
  const reqs = writeRequests(["Log"], { Log: [["a", "b", "c"], ["d", "", "f"]] }, props);
  const [first, second] = reqs[0].updateCells.rows;
  eq("full row", first.values.length, 3);
  eq("gap kept in place", second.values, [
    { userEnteredValue: { stringValue: "d" } }, {}, { userEnteredValue: { stringValue: "f" } },
  ]);
}

console.log("\n7. the transport sends one mutating request, so there is no gap to fall into");
{
  /* The unit tests above describe the requests. This one is about the call
     that carries them: the whole point is that a save cannot be half-applied,
     and that is only true while writeTabs makes exactly one write. A second
     one creeping back in — a clear, a tidy-up, a resize done separately —
     would quietly reopen the window that lost two months. */
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(dir, "..", "src", "google", "sheets.js"), "utf8");
  const body = src.slice(src.indexOf("async function writeTabs"), src.indexOf("export async function saveDoc"));

  const mutating = (body.match(/method:\s*"(POST|PUT|PATCH|DELETE)"/g) || []).length;
  eq("exactly one mutating request", mutating, 1);
  eq("and it is a spreadsheets batchUpdate", /:batchUpdate`/.test(body), true);
  eq("the values clear endpoint is gone for good", /values:batchClear/.test(body), false);
  eq("so is the separate values write", /values:batchUpdate/.test(body), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
