/* ==========================================================================
   The document as four tabs of a spreadsheet, and back.

   Pure functions, no network — which is what lets the round trip be tested
   properly, because this is the layer where data gets lost if anything is
   wrong.

     Categories  id · name · emoji · colour · order
     Targets     id · category · name · kind · direction · period · goal ·
                 unit · step · days · order · archived
     Types       one row per kind, with its weekly minimum and planned days
     Log         one row per date, one column per target

   Two principles throughout:

   Ids are authoritative, names are for you. Every tab carries the id, so
   renaming "Water" to "Hydration" in the sheet renames it in the app rather
   than orphaning a column.

   Reading is forgiving, writing is strict. A sheet is far easier to break by
   hand than JSON — a sorted range, an inserted column, a deleted row — so
   anything unreadable is skipped rather than allowed to throw away the rest.
   ========================================================================== */

import { ALL_DAYS, DOW, isDateKey, round2 } from "./targets";

export const TABS = { CATS: "Categories", TARGETS: "Targets", TYPES: "Types", LOG: "Log" };

const norm = (v) => String(v == null ? "" : v).trim();
const lower = (v) => norm(v).toLowerCase().replace(/[\s_-]+/g, "");
const num = (v, fallback = 0) => {
  const n = Number(norm(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v) => ["true", "yes", "y", "1", "✓"].includes(lower(v));

const KIND_OUT = { tick: "tick", amount: "amount" };
const DIR_OUT = { at_least: "at least", at_most: "at most" };
const parseKind = (v) => (lower(v) === "amount" ? "amount" : "tick");
const parseDir = (v) => (["atmost", "max", "atmostper"].includes(lower(v)) ? "at_most" : "at_least");
const parsePeriod = (v) => (["week", "weekly"].includes(lower(v)) ? "week" : "day");

/* Weekdays are written as names and read back from names, numbers, or "All",
   because all three are things a person might reasonably type. */
export function daysOut(days) {
  if (!days || days.length === 0 || days.length === 7) return "All";
  return days.slice().sort((a, b) => a - b).map((d) => DOW[d]).join(", ");
}
export function daysIn(v) {
  const t = norm(v);
  if (!t || ["all", "everyday", "every day"].includes(lower(t))) return [...ALL_DAYS];
  const out = [];
  t.split(/[,;/|]+/).forEach((part) => {
    const p = lower(part);
    if (!p) return;
    if (/^\d$/.test(p)) { const n = Number(p); if (n >= 0 && n <= 6) out.push(n); return; }
    const i = DOW.findIndex((d) => lower(d) === p.slice(0, 3));
    if (i >= 0) out.push(i);
  });
  return out.length ? [...new Set(out)].sort((a, b) => a - b) : [...ALL_DAYS];
}

/* --------------------------------------------------------------- headers -- */

export const CAT_HEAD = ["id", "name", "emoji", "colour", "order"];
export const TGT_HEAD = ["id", "category", "name", "kind", "direction", "period",
                         "goal", "unit", "step", "days", "order", "archived"];
export const TYPE_HEAD = ["targetId", "target", "typeId", "type", "perWeek", ...DOW];

/* ------------------------------------------------------------------ out -- */

export function categoriesOut(doc) {
  return [CAT_HEAD, ...doc.categories
    .slice().sort((a, b) => a.order - b.order)
    .map((c) => [c.id, c.name, c.emoji || "", c.color || "", c.order])];
}

export function targetsOut(doc) {
  const catName = (id) => (doc.categories.find((c) => c.id === id) || {}).name || "";
  return [TGT_HEAD, ...doc.targets.map((t) => [
    t.id, catName(t.catId), t.name,
    KIND_OUT[t.kind] || "tick", DIR_OUT[t.dir] || "at least", t.period,
    t.goal, t.unit || "", t.step, daysOut(t.days), t.order, t.archived ? "TRUE" : "FALSE",
  ])];
}

/* One row per type, carrying both its weekly minimum and the days the plan
   asked for it — the plan is only ever "which kinds on which weekday", so it
   belongs beside the kind rather than in a tab of its own. */
export function typesOut(doc) {
  const rows = [TYPE_HEAD];
  doc.targets.forEach((t) => {
    (t.types || []).forEach((ty) => {
      const plan = t.plan || {};
      rows.push([
        t.id, t.name, ty.id, ty.name, ty.goal || "",
        ...ALL_DAYS.map((d) => ((plan[d] || []).includes(ty.id) ? "TRUE" : "")),
      ]);
    });
  });
  return rows;
}

/* The log is wide — a date per row, a target per column — because that is the
   shape you would build by hand to chart it, and because it makes one day's
   edit a single-row write.

   A target with kinds stores the kinds by name ("Lymph drainage, Arms") rather
   than a bare count, so the sheet says what was actually done. */
export function logOut(doc) {
  const ts = doc.targets;
  const dates = Object.keys(doc.log || {}).filter(isDateKey).sort();
  return [
    ["Date", ...ts.map((t) => t.name)],
    ["id", ...ts.map((t) => t.id)],
    ...dates.map((d) => [d, ...ts.map((t) => cellOut(t, (doc.log[d] || {})[t.id]))]),
  ];
}

function cellOut(t, raw) {
  if (raw == null || raw === false || raw === 0) return "";
  if (raw === true) return 1;
  if (typeof raw === "number") return raw;
  if (typeof raw === "object") {
    const ids = Array.isArray(raw.v) ? raw.v : [];
    if (!ids.length) return Number(raw.n) || "";
    const names = ids.map((id) => {
      const found = (t.types || []).find((x) => x.id === id);
      return found ? found.name : id;
    });
    return names.join(", ");
  }
  return "";
}

export const docToSheets = (doc) => ({
  [TABS.CATS]: categoriesOut(doc),
  [TABS.TARGETS]: targetsOut(doc),
  [TABS.TYPES]: typesOut(doc),
  [TABS.LOG]: logOut(doc),
});

/* ------------------------------------------------------------------- in -- */

/* Rebuilds the document from the four tabs. Anything unreadable is skipped,
   never thrown — one mangled row must not cost you the other three hundred. */
export function sheetsToDoc(tabs, base = {}) {
  const rows = (name) => (tabs[name] || []).slice(1).filter((r) => r && norm(r[0]));

  const categories = rows(TABS.CATS).map((r, i) => ({
    id: norm(r[0]),
    name: norm(r[1]) || "Untitled",
    emoji: norm(r[2]) || "⭐",
    color: norm(r[3]) || "#3F7D5B",
    order: num(r[4], i),
  }));

  const byCatName = {};
  categories.forEach((c) => { byCatName[lower(c.name)] = c.id; });

  const targets = rows(TABS.TARGETS).map((r, i) => {
    const catId = byCatName[lower(r[1])] || norm(r[1]);
    return {
      id: norm(r[0]),
      catId,
      name: norm(r[2]) || "Untitled",
      kind: parseKind(r[3]),
      dir: parseDir(r[4]),
      period: parsePeriod(r[5]),
      goal: num(r[6], 1) || 1,
      unit: norm(r[7]),
      step: num(r[8], 1) || 1,
      days: daysIn(r[9]),
      order: num(r[10], i),
      archived: bool(r[11]),
      types: [],
      plan: {},
    };
  }).filter((t) => categories.some((c) => c.id === t.catId));

  const byId = {};
  targets.forEach((t) => { byId[t.id] = t; });

  rows(TABS.TYPES).forEach((r) => {
    const t = byId[norm(r[0])];
    if (!t) return;
    const id = norm(r[2]) || `ty_${lower(r[3])}`;
    const name = norm(r[3]);
    if (!name) return;
    t.types.push({ id, name, goal: num(r[4], 0) });
    ALL_DAYS.forEach((d) => {
      if (bool(r[5 + d])) t.plan[d] = [...(t.plan[d] || []), id];
    });
  });

  /* The log's second row holds the target ids. If it has been deleted or
     sorted away, fall back to matching the first row's names — imperfect, but
     better than discarding every entry. */
  const logRows = tabs[TABS.LOG] || [];
  const names = logRows[0] || [];
  const idRow = logRows[1] || [];
  const looksLikeIds = norm(idRow[0]).toLowerCase() === "id";
  const columns = (looksLikeIds ? idRow : names).slice(1).map((cell, i) => {
    const v = norm(cell);
    if (byId[v]) return v;
    const byName = targets.find((t) => lower(t.name) === lower(looksLikeIds ? names[i + 1] : cell));
    return byName ? byName.id : null;
  });

  const log = {};
  logRows.slice(looksLikeIds ? 2 : 1).forEach((r) => {
    const date = norm(r[0]);
    if (!isDateKey(date)) return;
    const day = {};
    columns.forEach((id, c) => {
      if (!id) return;
      const t = byId[id];
      const parsed = cellIn(t, r[c + 1]);
      if (parsed !== null) day[id] = parsed;
    });
    if (Object.keys(day).length) log[date] = day;
  });

  return {
    version: 1,
    createdAt: base.createdAt || new Date().toISOString(),
    reminders: base.reminders || { enabled: false, hour: 20, minute: 0 },
    categories,
    targets,
    log,
  };
}

function cellIn(t, raw) {
  const v = norm(raw);
  if (!v) return null;

  // A list of kind names — "Lymph drainage, Arms".
  if (t && (t.types || []).length && /[a-z]/i.test(v)) {
    const ids = v.split(",").map((part) => {
      const found = t.types.find((ty) => lower(ty.name) === lower(part) || lower(ty.id) === lower(part));
      return found ? found.id : null;
    }).filter(Boolean);
    if (ids.length) return { n: ids.length, v: ids };
  }

  if (bool(v)) return t && t.kind === "tick" ? true : 1;
  const n = num(v, NaN);
  if (!Number.isFinite(n) || n === 0) return null;
  return t && t.kind === "tick" && !(t.types || []).length ? true : round2(n);
}
