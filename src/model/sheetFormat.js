/* ==========================================================================
   The document as six tabs of a spreadsheet, and back.

   Pure functions, no network — which is what lets the round trip be tested
   properly, because this is the layer where data gets lost if anything is
   wrong.

     Categories  id · name · emoji · colour · order · note
     Targets     id · category · name · kind · direction · period · goal ·
                 unit · step · days · planned · until · order · archived · note
     Types       one row per kind, with its weekly minimum and planned days
     Log         one row per date, one column per target
     Plan        one row per date-specific decision, including the noes
     Notes       one row per day you wrote something about a target
     Settings    one row per setting

   Two principles throughout:

   Ids are authoritative, names are for you. Every tab carries the id, so
   renaming "Water" to "Hydration" in the sheet renames it in the app rather
   than orphaning a column.

   Reading is forgiving, writing is strict. A sheet is far easier to break by
   hand than JSON — a sorted range, an inserted column, a deleted row — so
   anything unreadable is skipped rather than allowed to throw away the rest.
   ========================================================================== */

import { ALL_DAYS, DOW, isDateKey, round2 } from "./targets";

export const TABS = {
  CATS: "Categories", TARGETS: "Targets", TYPES: "Types",
  LOG: "Log", PLAN: "Plan", NOTES: "Notes", SETTINGS: "Settings",
};

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
/* An empty cell means nothing is planned, which is different from "every day"
   — so this cannot go through daysIn, whose empty case is All. */
function planIn(v) {
  const t = norm(v);
  if (!t) return {};
  const plan = {};
  daysIn(t).forEach((d) => { plan[d] = true; });
  return plan;
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

/* The last date a target runs, or "" for one that runs indefinitely.

   Written as a plain YYYY-MM-DD string, and RAW input means Sheets stores that
   string rather than converting it. Someone editing the cell by hand in Sheets
   will get a real date though, which comes back as a serial number counting
   from 1899-12-30 — so that is read too, rather than being discarded as
   unparseable and silently un-ending the target. */
export function untilIn(v) {
  const t = norm(v);
  if (!t) return "";
  if (isDateKey(t)) return t;

  const serial = Number(t);
  if (Number.isFinite(serial) && serial > 0) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  const parsed = new Date(t);
  if (isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

/* --------------------------------------------------------------- headers -- */

export const CAT_HEAD = ["id", "name", "emoji", "colour", "order", "note"];
/* `note` sits last on purpose: it is the only free-text column and the only
   one that can run to a paragraph, and a wide cell in the middle pushes every
   short column off the screen. */
export const TGT_HEAD = ["id", "category", "name", "kind", "direction", "period",
                         "goal", "unit", "step", "days", "planned", "until", "order",
                         "archived", "note"];
export const TYPE_HEAD = ["targetId", "target", "typeId", "type", "perWeek", ...DOW];
export const SETTINGS_HEAD = ["setting", "value"];
export const PLAN_HEAD = ["date", "target", "targetId", "planned", "kinds"];
export const NOTE_HEAD = ["date", "target", "targetId", "note"];

/* ------------------------------------------------------------------ out -- */

export function categoriesOut(doc) {
  return [CAT_HEAD, ...doc.categories
    .slice().sort((a, b) => a.order - b.order)
    .map((c) => [c.id, c.name, c.emoji || "", c.color || "", c.order, c.note || ""])];
}

export function targetsOut(doc) {
  const catName = (id) => (doc.categories.find((c) => c.id === id) || {}).name || "";
  return [TGT_HEAD, ...doc.targets.map((t) => [
    t.id, catName(t.catId), t.name,
    KIND_OUT[t.kind] || "tick", DIR_OUT[t.dir] || "at least", t.period,
    t.goal, t.unit || "", t.step, daysOut(t.days),
    // A typed target's plan lives per type in the Types tab; this column is for
    // the rest, where the plan is only ever "which days I mean to do this".
    (t.types || []).length ? "" : plannedOut(t),
    t.until || "",
    t.order, t.archived ? "TRUE" : "FALSE",
    t.note || "",
  ])];
}

/* One row per type, carrying both its weekly minimum and the days the plan
   asked for it — the plan is only ever "which kinds on which weekday", so it
   belongs beside the kind rather than in a tab of its own. */
/* Weekdays a target is planned for. "None" rather than blank when nothing is
   planned, so an empty cell is never mistaken for a column somebody deleted. */
function plannedOut(t) {
  const days = ALL_DAYS.filter((d) => {
    const v = (t.plan || {})[d];
    return v === true || (Array.isArray(v) && v.length);
  });
  if (!days.length) return "";
  return days.length === 7 ? "All" : days.map((d) => DOW[d]).join(", ");
}

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

/* Plans for particular dates, as opposed to the weekly rhythm each target
   carries. One row per date and target, including the ones that say no —
   "not this Tuesday" is a decision worth recording, not an absence. */
export function planOut(doc) {
  const byId = {};
  doc.targets.forEach((t) => { byId[t.id] = t; });

  const rows = [PLAN_HEAD];
  Object.keys(doc.plans || {}).filter(isDateKey).sort().forEach((date) => {
    Object.entries(doc.plans[date]).forEach(([id, value]) => {
      const t = byId[id];
      if (!t) return;
      const ids = Array.isArray(value) ? value : [];
      rows.push([
        date, t.name, id,
        value === false ? "FALSE" : "TRUE",
        ids.map((v) => ((t.types || []).find((x) => x.id === v) || {}).name || v).join("; "),
      ]);
    });
  });
  return rows;
}

/* Preferences, as plain rows.

   These used to live only in memory and be carried from one load to the next,
   which meant they were quietly lost the moment the app was opened somewhere
   it had not been opened before — a reminder set for 7am reverting to a
   default nobody chose. Anything worth setting is worth writing down. */
export function settingsOut(doc) {
  const r = doc.reminders || {};
  return [
    SETTINGS_HEAD,
    ["createdAt", doc.createdAt || ""],
    ["template", doc.template || "default"],
    ["opensOn", doc.homeTab || "insights"],
    ["reminderEnabled", r.enabled ? "TRUE" : "FALSE"],
    ["reminderHour", r.hour == null ? 20 : r.hour],
    ["reminderMinute", r.minute == null ? 0 : r.minute],
  ];
}

/* What happened on a particular day, one row each — a diary in date order,
   which is how you would want to read it in the sheet as well as in the app.
   The target's name rides beside its id so the tab is legible on its own. */
export function notesOut(doc) {
  const byId = {};
  doc.targets.forEach((t) => { byId[t.id] = t; });

  const rows = [NOTE_HEAD];
  Object.keys(doc.notes || {}).filter(isDateKey).sort().forEach((date) => {
    Object.entries(doc.notes[date]).forEach(([id, text]) => {
      const body = norm(text);
      if (!body || !byId[id]) return;
      rows.push([date, byId[id].name, id, body]);
    });
  });
  return rows;
}

export const docToSheets = (doc) => ({
  [TABS.CATS]: categoriesOut(doc),
  [TABS.TARGETS]: targetsOut(doc),
  [TABS.TYPES]: typesOut(doc),
  [TABS.LOG]: logOut(doc),
  [TABS.PLAN]: planOut(doc),
  [TABS.NOTES]: notesOut(doc),
  [TABS.SETTINGS]: settingsOut(doc),
});

/* ------------------------------------------------------------------- in -- */

/* Finds columns by their header rather than by counting from the left.

   A spreadsheet is a document somebody can edit, and a format grows: a column
   is inserted, or the version that wrote the file knew one fewer column than
   the version reading it. Counting positions turns either into silent
   corruption. It already did once — a `planned` column was added between
   `days` and `order`, so in a sheet written before it every target's `order`
   was read as its plan, and a target ordered third came back planned every
   Thursday.

   Reading by name costs one lookup and makes the format additive: an unknown
   column is ignored, a missing one reads as absent, and neither disturbs the
   columns either side. The canonical order is still the fallback, for a sheet
   whose header row has been deleted or overwritten. */
function reader(head, canonical) {
  const fallback = {};
  canonical.forEach((name, i) => { fallback[lower(name)] = i; });

  const found = {};
  (head || []).forEach((cell, i) => {
    const name = lower(cell);
    if (name && found[name] === undefined) found[name] = i;
  });

  // Two recognised headers is enough to trust the row; fewer and it is
  // likelier to be data than a header, so fall back to position.
  const known = canonical.filter((n) => found[lower(n)] !== undefined).length;
  const at = known >= 2 ? found : fallback;
  return (row, name) => (at[lower(name)] === undefined ? undefined : row[at[lower(name)]]);
}

/* Rebuilds the document from the six tabs. Anything unreadable is skipped,
   never thrown — one mangled row must not cost you the other three hundred. */
export function sheetsToDoc(tabs, base = {}) {
  const rows = (name) => (tabs[name] || []).slice(1).filter((r) => r && norm(r[0]));
  const head = (name) => (tabs[name] || [])[0];

  const cat = reader(head(TABS.CATS), CAT_HEAD);
  const categories = rows(TABS.CATS).map((r, i) => ({
    id: norm(cat(r, "id")),
    name: norm(cat(r, "name")) || "Untitled",
    emoji: norm(cat(r, "emoji")) || "⭐",
    color: norm(cat(r, "colour")) || "#3F7D5B",
    order: num(cat(r, "order"), i),
    note: norm(cat(r, "note")),
  }));

  const byCatName = {};
  categories.forEach((c) => { byCatName[lower(c.name)] = c.id; });

  const tgt = reader(head(TABS.TARGETS), TGT_HEAD);
  const targets = rows(TABS.TARGETS).map((r, i) => {
    const catName = tgt(r, "category");
    const catId = byCatName[lower(catName)] || norm(catName);
    return {
      id: norm(tgt(r, "id")),
      catId,
      name: norm(tgt(r, "name")) || "Untitled",
      kind: parseKind(tgt(r, "kind")),
      dir: parseDir(tgt(r, "direction")),
      period: parsePeriod(tgt(r, "period")),
      goal: num(tgt(r, "goal"), 1) || 1,
      unit: norm(tgt(r, "unit")),
      step: num(tgt(r, "step"), 1) || 1,
      days: daysIn(tgt(r, "days")),
      until: untilIn(tgt(r, "until")),
      order: num(tgt(r, "order"), i),
      archived: bool(tgt(r, "archived")),
      note: norm(tgt(r, "note")),
      types: [],
      plan: planIn(tgt(r, "planned")),
    };
  }).filter((t) => categories.some((c) => c.id === t.catId));

  const byId = {};
  targets.forEach((t) => { byId[t.id] = t; });

  const typ = reader(head(TABS.TYPES), TYPE_HEAD);
  rows(TABS.TYPES).forEach((r) => {
    const t = byId[norm(typ(r, "targetId"))];
    if (!t) return;
    const name = norm(typ(r, "type"));
    if (!name) return;
    const id = norm(typ(r, "typeId")) || `ty_${lower(name)}`;
    t.types.push({ id, name, goal: num(typ(r, "perWeek"), 0) });
    ALL_DAYS.forEach((d) => {
      if (!bool(typ(r, DOW[d]))) return;
      // A typed target's plan is per type, so a whole-target flag read from the
      // Targets tab is replaced rather than added to.
      const current = Array.isArray(t.plan[d]) ? t.plan[d] : [];
      t.plan[d] = [...current, id];
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

  const plans = {};
  rows(TABS.PLAN).forEach((r) => {
    const date = norm(r[0]);
    const t = byId[norm(r[2])];
    if (!isDateKey(date) || !t) return;
    const on = bool(r[3]);
    const kinds = norm(r[4])
      .split(";")
      .map((part) => {
        const found = (t.types || []).find((ty) => lower(ty.name) === lower(part));
        return found ? found.id : null;
      })
      .filter(Boolean);
    plans[date] = { ...(plans[date] || {}), [t.id]: !on ? false : (kinds.length ? kinds : true) };
  });

  /* Day notes. Addressed by id, with the name only along for the ride, so
     renaming a target in the sheet keeps its diary attached to it. */
  const note = reader(head(TABS.NOTES), NOTE_HEAD);
  const notes = {};
  rows(TABS.NOTES).forEach((r) => {
    const date = norm(note(r, "date"));
    const t = byId[norm(note(r, "targetId"))];
    const body = norm(note(r, "note"));
    if (!isDateKey(date) || !t || !body) return;
    notes[date] = { ...(notes[date] || {}), [t.id]: body };
  });

  /* Settings read from the sheet win; whatever was in memory is only a
     fallback for a document written before this tab existed. */
  const setting = {};
  rows(TABS.SETTINGS).forEach((r) => { setting[lower(r[0])] = norm(r[1]); });
  const pick = (key, fallback) => (setting[lower(key)] !== undefined && setting[lower(key)] !== ""
    ? setting[lower(key)] : fallback);

  const baseReminders = base.reminders || {};
  return {
    version: 1,
    notes,
    createdAt: pick("createdAt", base.createdAt || new Date().toISOString()),
    template: pick("template", base.template || "default"),
    homeTab: pick("opensOn", base.homeTab || "insights") === "today" ? "today" : "insights",
    reminders: {
      enabled: setting[lower("reminderEnabled")] !== undefined
        ? bool(setting[lower("reminderEnabled")])
        : !!baseReminders.enabled,
      hour: num(pick("reminderHour", baseReminders.hour == null ? 20 : baseReminders.hour), 20),
      minute: num(pick("reminderMinute", baseReminders.minute == null ? 0 : baseReminders.minute), 0),
    },
    categories,
    targets,
    log,
    plans,
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
