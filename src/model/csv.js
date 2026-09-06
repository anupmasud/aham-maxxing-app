/* ==========================================================================
   Getting data in and out as CSV.

   Export is one flat file — a row per entry — because that is what every
   spreadsheet, script and other app can read without being told anything.

   Import does not pretend to know any particular app's schema. Habit trackers
   do not share one: some export a column per habit with a row per date, others
   a row per entry, and the header names differ everywhere. Rather than write a
   reader per app and guess at columns I cannot verify, this detects which of
   the two shapes a file is in and maps the columns it finds. That handles
   Loop, Habitify, spreadsheet templates and anything assembled by hand, and it
   does not quietly break when one of them changes their format.
   ========================================================================== */

import { ALL_DAYS, isDateKey, keyOf, round2, uid } from "./targets";

/* ----------------------------------------------------------------- parse -- */

/* A small RFC-4180 reader: quoted fields, escaped quotes, embedded newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  const src = String(text || "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((v) => v.trim()));
}

const quote = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsvText = (rows) => rows.map((r) => r.map(quote).join(",")).join("\n");

/* ----------------------------------------------------------------- dates -- */

/* Accepts the date formats these exports actually use. Ambiguous d/m vs m/d is
   resolved in favour of the unambiguous reading where one exists, and left
   alone where it does not — a wrong guess there is silent and unfixable. */
export function toDateKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (isDateKey(s)) return s;

  // Formatting goes through the model's own keyOf so there is one definition
  // of what a date key looks like, not two that can drift apart.
  const ymd = (y, mo, d) => keyOf(new Date(Number(y), Number(mo) - 1, Number(d)));

  let m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (m) return ymd(m[1], m[2], m[3]);

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // Only one reading can be a month when a value exceeds twelve.
    const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
    return ymd(m[3], month, day);
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : keyOf(parsed);
}

/* ---------------------------------------------------------------- export -- */

/* One row per logged entry. Deliberately long rather than wide: a wide file
   needs a column per target and breaks the moment one is added, where this
   shape survives anything. */
export function exportCsv(doc) {
  const catName = (id) => (doc.categories.find((c) => c.id === id) || {}).name || "";
  const byId = {};
  doc.targets.forEach((t) => { byId[t.id] = t; });

  const rows = [["date", "category", "target", "value", "unit", "kinds"]];
  Object.keys(doc.log || {}).filter(isDateKey).sort().forEach((date) => {
    Object.entries(doc.log[date]).forEach(([id, raw]) => {
      const t = byId[id];
      if (!t) return;
      let value = raw;
      let kinds = "";
      if (raw === true) value = 1;
      else if (raw && typeof raw === "object") {
        value = Number(raw.n) || (raw.v || []).length;
        kinds = (raw.v || [])
          .map((v) => ((t.types || []).find((x) => x.id === v) || {}).name || v)
          .join("; ");
      }
      rows.push([date, catName(t.catId), t.name, value, t.unit || "", kinds]);
    });
  });
  return toCsvText(rows);
}

/* ---------------------------------------------------------------- import -- */

const lower = (v) => String(v == null ? "" : v).trim().toLowerCase();
const DATE_WORDS = ["date", "day", "timestamp", "when"];
const NAME_WORDS = ["habit", "target", "name", "task", "activity"];
const VALUE_WORDS = ["value", "count", "amount", "done", "completed", "quantity", "checkmark"];

const TRUTHY = ["1", "true", "yes", "y", "x", "✓", "done", "completed"];
const isTruthy = (v) => TRUTHY.includes(lower(v));

/* Which of the two shapes is this? A file with a date column and a name column
   is a row per entry; a file whose header is mostly habit names is a row per
   date with a column each. */
export function detectShape(rows) {
  if (!rows.length) return { shape: "empty" };
  const head = rows[0].map(lower);

  const dateCol = head.findIndex((h) => DATE_WORDS.includes(h));
  const nameCol = head.findIndex((h) => NAME_WORDS.includes(h));
  const valueCol = head.findIndex((h) => VALUE_WORDS.includes(h));

  if (dateCol >= 0 && nameCol >= 0) return { shape: "long", dateCol, nameCol, valueCol };

  // Otherwise: first column dates, remaining headers are target names.
  const looksDated = rows.slice(1, 6).filter((r) => toDateKey(r[0])).length;
  if (looksDated && rows[0].length > 1) return { shape: "wide", dateCol: 0 };

  return { shape: "unknown" };
}

/* Reads a file into targets and logged days, without touching the document.

   Returns what *would* change so it can be shown before it is applied —
   importing a year of somebody's history is not a thing to do silently and
   find out about afterwards. */
export function readImport(text, doc, { defaultCatId } = {}) {
  const rows = parseCsv(text);
  const found = detectShape(rows);
  if (found.shape === "empty" || found.shape === "unknown") {
    return { ok: false, reason: found.shape, entries: 0, created: [], matched: [], log: {} };
  }

  const catId = defaultCatId || (doc.categories[0] || {}).id;
  const existing = {};
  doc.targets.forEach((t) => { existing[lower(t.name)] = t; });

  const seen = {};        // lower name -> { name, values: [] }
  const raw = [];         // { date, name, value }

  if (found.shape === "long") {
    rows.slice(1).forEach((r) => {
      const date = toDateKey(r[found.dateCol]);
      const name = String(r[found.nameCol] || "").trim();
      if (!date || !name) return;
      const cell = found.valueCol >= 0 ? r[found.valueCol] : "1";
      raw.push({ date, name, cell });
    });
  } else {
    const names = rows[0].slice(1).map((n) => String(n || "").trim());
    rows.slice(1).forEach((r) => {
      const date = toDateKey(r[0]);
      if (!date) return;
      names.forEach((name, i) => {
        if (!name) return;
        const cell = r[i + 1];
        if (cell === undefined || String(cell).trim() === "") return;
        raw.push({ date, name, cell });
      });
    });
  }

  raw.forEach(({ name, cell }) => {
    const key = lower(name);
    seen[key] = seen[key] || { name, values: [] };
    seen[key].values.push(cell);
  });

  /* A column of nothing but ticks is a tick; anything with a real number in it
     is an amount. Guessing wrong here is cheap to correct and much better than
     asking twenty questions before an import. */
  const created = [];
  const matched = [];
  const targetFor = {};

  Object.entries(seen).forEach(([key, info]) => {
    if (existing[key]) { targetFor[key] = existing[key]; matched.push(existing[key].name); return; }
    const numeric = info.values.some((v) => {
      const n = Number(String(v).replace(/,/g, ""));
      return Number.isFinite(n) && n !== 0 && n !== 1;
    });
    const t = {
      id: uid("t_"), catId, name: info.name,
      kind: numeric ? "amount" : "tick",
      dir: "at_least", period: "day",
      goal: 1, unit: "", step: 1,
      days: [...ALL_DAYS], order: doc.targets.length + created.length,
      archived: false, types: [], plan: {},
    };
    targetFor[key] = t;
    created.push(t);
  });

  const log = {};
  let entries = 0;
  raw.forEach(({ date, name, cell }) => {
    const t = targetFor[lower(name)];
    if (!t) return;
    const n = Number(String(cell).replace(/,/g, ""));
    let value = null;
    if (Number.isFinite(n) && n !== 0) value = t.kind === "tick" ? true : round2(n);
    else if (isTruthy(cell)) value = t.kind === "tick" ? true : 1;
    if (value === null) return;
    log[date] = { ...(log[date] || {}), [t.id]: value };
    entries++;
  });

  const dates = Object.keys(log).sort();
  return {
    ok: entries > 0,
    shape: found.shape,
    entries,
    created,
    matched,
    log,
    first: dates[0] || null,
    last: dates[dates.length - 1] || null,
  };
}

/* Merges a read into the document. Existing entries win: an import fills gaps
   rather than overwriting a day you have already recorded, because the thing
   in front of you is likelier to be right than the thing in an old export. */
export function applyImport(doc, result) {
  const log = { ...(doc.log || {}) };
  Object.entries(result.log).forEach(([date, day]) => {
    log[date] = { ...day, ...(log[date] || {}) };
  });
  return { ...doc, targets: [...doc.targets, ...result.created], log };
}
