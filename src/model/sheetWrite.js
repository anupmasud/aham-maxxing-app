/* ==========================================================================
   Turning a set of tabs into one atomic spreadsheet write.

   This exists because of the way saving used to work, which was two requests:

       values:batchClear   — empty every tab
       values:batchUpdate  — write the new contents

   Between those two calls the spreadsheet held nothing at all. That window is
   short on a good connection and unbounded on a bad one, and a save is most
   likely to be attempted exactly when the connection is worst — coming out of
   a tunnel, leaving the house, waking the phone. If the clear landed and the
   write never did, the sheet stayed empty, and nothing afterwards knew that
   the emptiness was an accident rather than a decision. Two months of logged
   days went that way.

   A spreadsheets.batchUpdate is applied as a unit: either every request in it
   takes effect or none of them do. One UpdateCells per tab, with `range`
   covering the whole tab and `fields` naming the value, both clears what is
   there and writes what should be — because cells inside the range that the
   supplied rows do not cover are cleared. So there is no moment when the data
   is gone, and a save that fails leaves the sheet exactly as it was.

   Pure on purpose: the shape of the request is the part worth testing, and it
   can be tested without a network or a spreadsheet.
   ========================================================================== */

/* One cell, in the grid API's shape.

   The old write used valueInputOption RAW, which stores what it is given
   without parsing it: a string stays a string, a number stays a number. These
   mappings say the same thing explicitly. A blank is written as a cell with no
   value at all, which — with `fields` set to userEnteredValue — is how the
   grid API spells "empty this". */
export function cell(value) {
  if (value === null || value === undefined || value === "") return {};
  if (typeof value === "number" && Number.isFinite(value)) {
    return { userEnteredValue: { numberValue: value } };
  }
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  return { userEnteredValue: { stringValue: String(value) } };
}

const widthOf = (rows) => rows.reduce((w, r) => Math.max(w, (r || []).length), 0);

/* The requests for one spreadsheets.batchUpdate.

   `order`  — tab titles, in the order they should be written
   `tabs`   — { title: rows }, rows being arrays of plain values
   `props`  — [{ title, sheetId, gridProperties }] as the API reports them

   A tab the spreadsheet does not have is skipped rather than guessed at;
   ensureTabs adds missing ones before a write, and inventing a sheetId here
   would write into whichever tab happened to hold that number. */
export function writeRequests(order, tabs, props) {
  const byTitle = new Map((props || []).map((p) => [p.title, p]));
  const requests = [];

  for (const title of order) {
    const p = byTitle.get(title);
    if (!p || p.sheetId === undefined || p.sheetId === null) continue;

    const rows = (tabs && tabs[title]) || [];
    const grid = p.gridProperties || {};
    const needRows = rows.length;
    const needCols = widthOf(rows);

    /* The grid has to be big enough before anything is written into it. The
       values API used to grow the sheet on its own; the grid API does not, so
       growing it is part of the same atomic call rather than a request before
       it that could succeed alone. */
    const rowCount = grid.rowCount || 0;
    const columnCount = grid.columnCount || 0;
    if (needRows > rowCount || needCols > columnCount) {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: p.sheetId,
            gridProperties: {
              rowCount: Math.max(rowCount, needRows),
              columnCount: Math.max(columnCount, needCols),
            },
          },
          fields: "gridProperties.rowCount,gridProperties.columnCount",
        },
      });
    }

    /* `range` with only a sheetId means the whole tab. Rows beyond the ones
       supplied fall inside the range and outside the data, so they are
       cleared — which is the half that used to be a separate request. */
    requests.push({
      updateCells: {
        range: { sheetId: p.sheetId },
        rows: rows.map((row) => ({ values: (row || []).map(cell) })),
        fields: "userEnteredValue",
      },
    });
  }

  return requests;
}
