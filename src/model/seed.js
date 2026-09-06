/* ==========================================================================
   Starting categories, the targets you actually named, and a suggestion
   library per category.

   Categories seeded empty are not clutter: Today and Week only render
   categories that have targets scheduled, so an untouched category is visible
   in Setup alone, where its suggestions are one tap away.
   ========================================================================== */

import { ALL_DAYS, uid } from "./targets";

export const SEED_CATEGORIES = [
  { id: "c_move",    name: "Movement",          emoji: "🚶", color: "#3F7D5B" },
  { id: "c_food",    name: "Nutrition",         emoji: "🥗", color: "#5E8C3F" },
  { id: "c_limits",  name: "Limits",            emoji: "🍷", color: "#B4443A" },
  { id: "c_sleep",   name: "Sleep & recovery",  emoji: "🌙", color: "#4A5F9E" },
  { id: "c_mind",    name: "Mind",              emoji: "🧘", color: "#7A5EA8" },
  { id: "c_health",  name: "Preventive health", emoji: "💊", color: "#2F6D8C" },
  { id: "c_learn",   name: "Learning",          emoji: "📚", color: "#8C6D2F" },
  { id: "c_connect", name: "Connection",        emoji: "💬", color: "#C1663F" },
  { id: "c_play",    name: "Creative & play",   emoji: "🎧", color: "#9E4A7C" },
  { id: "c_home",    name: "Home & admin",      emoji: "🧺", color: "#6B7280" },
  { id: "c_digital", name: "Digital hygiene",   emoji: "📵", color: "#7E7264" },
];

/* The targets you described, ready to use on first run. */
export const SEED_TARGETS = [
  { catId: "c_move",   name: "Walk",              kind: "amount", dir: "at_least", period: "day",  goal: 30,   unit: "min",   step: 5 },
  { catId: "c_move",   name: "Strength training", kind: "tick",   dir: "at_least", period: "week", goal: 4,    unit: "",      step: 1 },
  { catId: "c_move",   name: "Steps",             kind: "amount", dir: "at_least", period: "day",  goal: 8000, unit: "steps", step: 500 },
  { catId: "c_food",   name: "Water",             kind: "amount", dir: "at_least", period: "day",  goal: 3,    unit: "L",     step: 0.25 },
  { catId: "c_limits", name: "Alcohol",           kind: "amount", dir: "at_most",  period: "week", goal: 6,    unit: "units", step: 1 },
  { catId: "c_limits", name: "Meat",              kind: "amount", dir: "at_most",  period: "week", goal: 3,    unit: "meals", step: 1 },
];

export const SUGGESTIONS = {
  c_move: [
    { name: "Walk",               kind: "amount", dir: "at_least", period: "day",  goal: 30,   unit: "min",   step: 5 },
    { name: "Steps",              kind: "amount", dir: "at_least", period: "day",  goal: 8000, unit: "steps", step: 500 },
    { name: "Strength training",  kind: "tick",   dir: "at_least", period: "week", goal: 4,    unit: "",      step: 1 },
    { name: "Stretch / mobility", kind: "amount", dir: "at_least", period: "day",  goal: 10,   unit: "min",   step: 5 },
    { name: "Rest day",           kind: "tick",   dir: "at_least", period: "week", goal: 1,    unit: "",      step: 1 },
    { name: "Cycle or swim",      kind: "tick",   dir: "at_least", period: "week", goal: 2,    unit: "",      step: 1 },
  ],
  c_food: [
    { name: "Water",              kind: "amount", dir: "at_least", period: "day",  goal: 3,  unit: "L",        step: 0.25 },
    { name: "Portions of veg",    kind: "amount", dir: "at_least", period: "day",  goal: 5,  unit: "portions", step: 1 },
    { name: "Protein",            kind: "amount", dir: "at_least", period: "day",  goal: 70, unit: "g",        step: 10 },
    { name: "Home-cooked dinner", kind: "tick",   dir: "at_least", period: "week", goal: 5,  unit: "",         step: 1 },
    { name: "Breakfast",          kind: "tick",   dir: "at_least", period: "day",  goal: 1,  unit: "",         step: 1 },
  ],
  c_limits: [
    { name: "Alcohol",     kind: "amount", dir: "at_most", period: "week", goal: 6, unit: "units",  step: 1 },
    { name: "Meat",        kind: "amount", dir: "at_most", period: "week", goal: 3, unit: "meals",  step: 1 },
    { name: "Takeaway",    kind: "amount", dir: "at_most", period: "week", goal: 1, unit: "meals",  step: 1 },
    { name: "Caffeine",    kind: "amount", dir: "at_most", period: "day",  goal: 2, unit: "cups",   step: 1 },
    { name: "Added sugar", kind: "amount", dir: "at_most", period: "week", goal: 3, unit: "treats", step: 1 },
  ],
  c_sleep: [
    { name: "Lights out by 11",      kind: "tick",   dir: "at_least", period: "day", goal: 1,   unit: "",  step: 1 },
    { name: "Hours slept",           kind: "amount", dir: "at_least", period: "day", goal: 7.5, unit: "h", step: 0.5 },
    { name: "No screens before bed", kind: "tick",   dir: "at_least", period: "day", goal: 1,   unit: "",  step: 1 },
  ],
  c_mind: [
    { name: "Meditate",          kind: "amount", dir: "at_least", period: "day", goal: 10, unit: "min", step: 5 },
    { name: "Journal",           kind: "tick",   dir: "at_least", period: "day", goal: 1,  unit: "",    step: 1 },
    { name: "Daylight outdoors", kind: "amount", dir: "at_least", period: "day", goal: 20, unit: "min", step: 10 },
    { name: "Three good things", kind: "tick",   dir: "at_least", period: "day", goal: 1,  unit: "",    step: 1 },
  ],
  c_health: [
    { name: "Vitamins",         kind: "tick", dir: "at_least", period: "day",  goal: 1, unit: "", step: 1 },
    { name: "Physio exercises", kind: "tick", dir: "at_least", period: "week", goal: 3, unit: "", step: 1 },
    { name: "Floss",            kind: "tick", dir: "at_least", period: "day",  goal: 1, unit: "", step: 1 },
    { name: "Skincare",         kind: "tick", dir: "at_least", period: "day",  goal: 1, unit: "", step: 1 },
  ],
  c_learn: [
    { name: "Read",              kind: "amount", dir: "at_least", period: "day",  goal: 20, unit: "pages", step: 5 },
    { name: "Language practice", kind: "tick",   dir: "at_least", period: "day",  goal: 1,  unit: "",      step: 1 },
    { name: "Course or project", kind: "amount", dir: "at_least", period: "week", goal: 3,  unit: "h",     step: 0.5 },
  ],
  c_connect: [
    { name: "Call family",     kind: "tick", dir: "at_least", period: "week", goal: 2, unit: "", step: 1 },
    { name: "See a friend",    kind: "tick", dir: "at_least", period: "week", goal: 1, unit: "", step: 1 },
    { name: "Message someone", kind: "tick", dir: "at_least", period: "day",  goal: 1, unit: "", step: 1 },
  ],
  c_play: [
    { name: "Listen to a full record", kind: "tick",   dir: "at_least", period: "week", goal: 2,  unit: "",    step: 1 },
    { name: "Instrument practice",     kind: "amount", dir: "at_least", period: "day",  goal: 20, unit: "min", step: 10 },
    { name: "Draw or write",           kind: "tick",   dir: "at_least", period: "week", goal: 2,  unit: "",    step: 1 },
  ],
  c_home: [
    { name: "Tidy 15 minutes", kind: "tick", dir: "at_least", period: "day",  goal: 1, unit: "", step: 1 },
    { name: "Meal prep",       kind: "tick", dir: "at_least", period: "week", goal: 1, unit: "", step: 1 },
    { name: "Review finances", kind: "tick", dir: "at_least", period: "week", goal: 1, unit: "", step: 1 },
  ],
  c_digital: [
    { name: "Social media",         kind: "amount", dir: "at_most",  period: "day", goal: 30, unit: "min", step: 15 },
    { name: "No phone at meals",    kind: "tick",   dir: "at_least", period: "day", goal: 1,  unit: "",    step: 1 },
    { name: "Phone out of bedroom", kind: "tick",   dir: "at_least", period: "day", goal: 1,  unit: "",    step: 1 },
  ],
};

export const UNITS = ["", "min", "h", "steps", "L", "ml", "g", "km", "pages", "units", "meals", "cups", "portions", "treats", "times"];

export const CATEGORY_COLORS = [
  "#3F7D5B", "#5E8C3F", "#B4443A", "#4A5F9E", "#7A5EA8",
  "#2F6D8C", "#8C6D2F", "#C1663F", "#9E4A7C", "#6B7280",
];

export function seededDoc() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    categories: SEED_CATEGORIES.map((c, i) => ({ ...c, order: i })),
    targets: SEED_TARGETS.map((t, i) => ({
      ...t, id: uid("t_"), order: i, archived: false, days: [...ALL_DAYS],
    })),
    log: {},
    reminders: { enabled: false, hour: 20, minute: 0 },
  };
}

export function emptyDoc() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    categories: [],
    targets: [],
    log: {},
    reminders: { enabled: false, hour: 20, minute: 0 },
  };
}
