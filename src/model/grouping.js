/* ==========================================================================
   How the target list is arranged on screen.

   It has always been grouped by category, which answers "what am I doing
   about my sleep". It cannot answer "what have I promised to do every single
   day", because that answer is spread across every category there is — and
   that is the question worth asking before adding one more, since a daily
   commitment is a promise made seven times a week.

   Two arrangements of the same targets, no change to any of them. Pure, so
   the arrangement can be tested without a screen.
   ========================================================================== */

export const GROUP_MODES = [
  { id: "category", label: "By area", sub: "what it is about" },
  { id: "cadence", label: "By cadence", sub: "how often" },
];

/* Cadence is the period — daily or weekly — but a ceiling is not a thing you
   do at all, it is a thing you stay under, and the rest of the app already
   keeps the two apart: limits are left out of the day ring and out of the hit
   rates, and given their own trend in Insights. Listing "no more than 2 units
   a week" among the fourteen things to get done this week would undo that, so
   they get a group of their own and carry their period in their description. */
const CADENCE = [
  {
    id: "day",
    name: "Every day",
    note: "asked of you seven times a week",
    tone: "good",
    seed: { period: "day", dir: "at_least" },
    match: (t) => t.period === "day" && t.dir !== "at_most",
  },
  {
    id: "week",
    name: "Every week",
    note: "a count to reach before Sunday",
    tone: "accent",
    seed: { period: "week", dir: "at_least" },
    match: (t) => t.period === "week" && t.dir !== "at_most",
  },
  {
    id: "limits",
    name: "Limits",
    note: "kept under, daily or weekly",
    tone: "over",
    seed: { period: "week", dir: "at_most" },
    match: (t) => t.dir === "at_most",
  },
];

export const isGroupMode = (id) => GROUP_MODES.some((m) => m.id === id);

/* Groups ready to render: a heading and the targets under it.

   `catId` is the category a group belongs to, or null when the group is not a
   category at all — which is also what tells the screen whether it can offer
   suggestions and a category's own edit and delete. `seed` is what a new
   target added from inside the group should start as, so adding one from
   "Every day" gives you a daily target rather than the default. */
export function groupTargets(doc, mode = "category") {
  const targets = doc.targets || [];
  const categories = (doc.categories || []).slice().sort((a, b) => a.order - b.order);

  if (mode !== "cadence") {
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      tone: null,
      note: "",
      catId: c.id,
      seed: {},
      // Empty categories stay: an empty one is somewhere to add to, and
      // hiding it would make a category you just created disappear.
      targets: targets.filter((t) => t.catId === c.id).sort((a, b) => a.order - b.order),
    }));
  }

  /* Within a cadence, keep each category's targets together and in the order
     they already have. Sorting by name instead would shuffle the four
     strength sessions apart from each other for no reason. */
  const rank = {};
  categories.forEach((c, i) => { rank[c.id] = i; });
  const byCategoryThenOrder = (a, b) =>
    (rank[a.catId] ?? 999) - (rank[b.catId] ?? 999) || a.order - b.order;

  return CADENCE
    .map((g) => ({
      id: g.id,
      name: g.name,
      emoji: "",
      color: null,
      tone: g.tone,
      note: g.note,
      catId: null,
      seed: g.seed,
      targets: targets.filter(g.match).sort(byCategoryThenOrder),
    }))
    // An empty cadence is not somewhere to add to — there is no such thing as
    // "the weekly category" — so an empty one is simply not a heading.
    .filter((g) => g.targets.length);
}

/* How many live targets each cadence holds, for saying it out loud. Archived
   ones are excluded: a paused target is not a promise you are currently
   making, and counting it would overstate the load. */
export function cadenceCounts(doc) {
  const live = (doc.targets || []).filter((t) => !t.archived);
  const counts = {};
  CADENCE.forEach((g) => { counts[g.id] = live.filter(g.match).length; });
  return counts;
}
