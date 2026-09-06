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

export const TABS = {
  CATS: "Categories", TARGETS: "Targets", TYPES: "Types",
  LOG: "Log", PLAN: "Plan", SETTINGS: "Settings",
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

/* --------------------------------------------------------------- headers -- */

export const CAT_HEAD = ["id", "name", "emoji", "colour", "order"];
export const TGT_HEAD = ["id", "category", "name", "kind", "direction", "period",
                         "goal", "unit", "step", "days", "planned", "order", "archived"];
export const TYPE_HEAD = ["targetId", "target", "typeId", "type", "perWeek", ...DOW];
export const SETTINGS_HEAD = ["setting", "value"];
export const PLAN_HEAD = ["date", "target", "targetId", "planned", "kinds"];

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
    t.goal, t.unit || "", t.step, daysOut(t.days),
    // A typed target's plan lives per type in the Types tab; this column is for
    // the rest, where the plan is only ever "which days I mean to do this".
    (t.types || []).length ? "" : plannedOut(t),
    t.order, t.archived ? "TRUE" : "FALSE",
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

export const docToSheets = (doc) => ({
  [TABS.CATS]: categoriesOut(doc),
  [TABS.TARGETS]: targetsOut(doc),
  [TABS.TYPES]: typesOut(doc),
  [TABS.LOG]: logOut(doc),
  [TABS.PLAN]: planOut(doc),
  [TABS.SETTINGS]: settingsOut(doc),
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
      order: num(r[11], i),
      archived: bool(r[12]),
      types: [],
      plan: planIn(r[10]),
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
      if (!bool(r[5 + d])) return;
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

  /* Settings read from the sheet win; whatever was in memory is only a
     fallback for a document written before this tab existed. */
  const setting = {};
  rows(TABS.SETTINGS).forEach((r) => { setting[lower(r[0])] = norm(r[1]); });
  const pick = (key, fallback) => (setting[lower(key)] !== undefined && setting[lower(key)] !== ""
    ? setting[lower(key)] : fallback);

  const baseReminders = base.reminders || {};
  return {
    version: 1,
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
