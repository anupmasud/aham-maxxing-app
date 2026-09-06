/* ==========================================================================
   Starting sets of categories.

   A template is only ever a starting point: pick one, get its categories and a
   library of suggested targets, then change whatever you like. Nothing here is
   a mode the app runs in afterwards.

   Category ids are prefixed per template so several can coexist in one
   document — which matters, because reorganising into a new set keeps the
   targets you already had and only moves them.
   ========================================================================== */

/* ------------------------------------------------------------- the default -- */

const DEFAULT_CATEGORIES = [
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

/* ------------------------------------------------------------- the niyamas --
   The five observances of the Yoga Sutras — the second limb, and the one about
   what you do rather than what you refrain from. Translations vary; these are
   the common English renderings.                                            */

const NIYAMA_CATEGORIES = [
  { id: "c_niy_saucha",   name: "Saucha · Cleanliness",   emoji: "🧼", color: "#2F6D8C",
    match: ["shower", "tidy", "clean", "floss", "skincare", "mask", "bed", "laundry", "declutter", "face", "led", "yoga - "] },
  { id: "c_niy_santosha", name: "Santosha · Contentment", emoji: "🌾", color: "#8C6D2F",
    match: ["grateful", "gratitude", "friend", "family", "call", "message", "restaurant", "cafe", "record", "art", "paint", "good things", "meal prep"] },
  { id: "c_niy_tapas",    name: "Tapas · Discipline",     emoji: "🔥", color: "#B4443A",
    match: ["strength", "training", "walk", "steps", "run", "cycle", "swim", "gym", "core", "body", "alarm", "cold", "exercise", "physio", "alcohol", "meat", "fish", "sugar", "dessert", "takeaway", "water"] },
  { id: "c_niy_svadhyaya",name: "Svadhyaya · Self-study", emoji: "📖", color: "#7A5EA8",
    match: ["read", "journal", "spanish", "language", "study", "course", "learn", "review", "write"] },
  { id: "c_niy_ishvara",  name: "Ishvarapranidhana · Surrender", emoji: "🕊️", color: "#4A5F9E",
    match: ["meditat", "breath", "pranayama", "outdoors", "daylight", "sleep", "slept", "lights out", "screens", "phone", "rest", "still"] },
];

/* ------------------------------------------------------- franklin's virtues --
   Franklin kept these in a ruled notebook, a column per day, marking a dot for
   every fault — and gave one virtue his full attention each week while merely
   noting the rest. That is the same grid as the Week screen, two centuries
   early, and the reason this template has thirteen categories rather than a
   comfortable five.

   The descriptions are shortened from his own precepts. Chastity is included
   because it is one of the thirteen and quietly dropping it would be editing
   history; delete it if it is not for you.                                   */

const FRANKLIN_CATEGORIES = [
  { id: "c_bf_temperance",  name: "Temperance",   emoji: "🍽", color: "#5E8C3F" },
  { id: "c_bf_silence",     name: "Silence",      emoji: "🤐", color: "#6B7280" },
  { id: "c_bf_order",       name: "Order",        emoji: "🗂", color: "#8C6D2F" },
  { id: "c_bf_resolution",  name: "Resolution",   emoji: "🎯", color: "#B4443A" },
  { id: "c_bf_frugality",   name: "Frugality",    emoji: "🪙", color: "#3F7D5B" },
  { id: "c_bf_industry",    name: "Industry",     emoji: "🛠", color: "#2F6D8C" },
  { id: "c_bf_sincerity",   name: "Sincerity",    emoji: "🤝", color: "#C1663F" },
  { id: "c_bf_justice",     name: "Justice",      emoji: "⚖️", color: "#4A5F9E" },
  { id: "c_bf_moderation",  name: "Moderation",   emoji: "⚖", color: "#7A5EA8" },
  { id: "c_bf_cleanliness", name: "Cleanliness",  emoji: "🧼", color: "#2F6D8C" },
  { id: "c_bf_tranquillity",name: "Tranquillity", emoji: "🕊", color: "#4A5F9E" },
  { id: "c_bf_chastity",    name: "Chastity",     emoji: "🤍", color: "#9E4A7C" },
  { id: "c_bf_humility",    name: "Humility",     emoji: "🙇", color: "#7E7264" },
];

/* ---------------------------------------------------------------- dinacharya --
   The Ayurvedic daily routine, organised by the shape of a day rather than by
   area of life. A traditional practice, not medical advice.                  */

const DINACHARYA_CATEGORIES = [
  { id: "c_din_morning",  name: "Morning ritual", emoji: "🌅", color: "#8C6D2F",
    match: ["morning", "sunrise", "alarm", "tongue", "oil", "shower", "skincare", "mask", "face"] },
  { id: "c_din_agni",     name: "Digestion",      emoji: "🍲", color: "#B4443A",
    match: ["water", "meal", "eat", "food", "breakfast", "supper", "dinner", "meat", "fish", "sugar", "dessert", "alcohol", "takeaway", "veg", "protein", "caffeine"] },
  { id: "c_din_movement", name: "Movement",       emoji: "🚶", color: "#3F7D5B",
    match: ["walk", "steps", "yoga", "strength", "training", "core", "body", "run", "cycle", "swim", "stretch", "physio", "exercise"] },
  { id: "c_din_stillness",name: "Stillness",      emoji: "🧘", color: "#7A5EA8",
    match: ["meditat", "breath", "pranayama", "journal", "outdoors", "daylight", "read", "spanish", "language", "record", "art", "paint"] },
  { id: "c_din_evening",  name: "Wind-down",      emoji: "🌙", color: "#4A5F9E",
    match: ["sleep", "slept", "lights out", "screens", "bed", "evening", "night", "phone", "wind"] },
];

/* ------------------------------------------------------------ apple health --
   Named after the categories in Apple Health's Browse tab, because it is the
   one taxonomy in this space that is actually standard — and because HealthKit
   was the reason to build a native app at all. When steps and sleep start
   filling themselves in, a category called Activity mapping to Apple's
   Activity is obvious rather than arbitrary.

   Only the categories describing things you *do* are here. Heart, Respiratory,
   Vitals, Hearing, Mobility and Cycle Tracking are readings a device takes,
   not targets you can hit, and a habit tracker has nothing useful to say about
   them.                                                                      */

const HEALTH_CATEGORIES = [
  { id: "c_ah_activity", name: "Activity", emoji: "🏃", color: "#3F7D5B",
    match: ["step", "walk", "run", "cycle", "swim", "exercise", "workout", "strength", "training",
            "yoga", "stretch", "move", "stand", "distance", "physio", "core", "body"] },
  { id: "c_ah_nutrition", name: "Nutrition", emoji: "🥗", color: "#5E8C3F",
    match: ["water", "protein", "veg", "fruit", "meal", "breakfast", "dinner", "supper", "eat",
            "food", "calorie", "caffeine", "alcohol", "sugar", "dessert", "meat", "fish", "takeaway"] },
  { id: "c_ah_sleep", name: "Sleep", emoji: "🌙", color: "#4A5F9E",
    match: ["sleep", "slept", "bed", "lights out", "nap", "wake", "screens"] },
  { id: "c_ah_mindfulness", name: "Mindfulness", emoji: "🧘", color: "#7A5EA8",
    match: ["meditat", "mindful", "breath", "pranayama", "still", "quiet"] },
  { id: "c_ah_mental", name: "Mental Wellbeing", emoji: "💚", color: "#C1663F",
    match: ["mood", "journal", "gratitude", "good things", "daylight", "outdoors", "friend",
            "family", "call", "message", "read", "spanish", "language", "art", "paint", "record"] },
  { id: "c_ah_medications", name: "Medications", emoji: "💊", color: "#2F6D8C",
    match: ["medic", "vitamin", "supplement", "pill", "dose"] },
  { id: "c_ah_body", name: "Body Measurements", emoji: "⚖️", color: "#8C6D2F",
    match: ["weight", "waist", "measure", "bmi", "skincare", "mask", "face", "floss", "shower"] },
];

/* ------------------------------------------------------------- suggestions -- */

const tick = (name, period = "day", goal = 1) =>
  ({ name, kind: "tick", dir: "at_least", period, goal, unit: "", step: 1 });
const amount = (name, goal, unit, step = 1, period = "day") =>
  ({ name, kind: "amount", dir: "at_least", period, goal, unit, step });
const limit = (name, goal, unit, period = "week", step = 1) =>
  ({ name, kind: "amount", dir: "at_most", period, goal, unit, step });

export const SUGGESTIONS = {
  /* ---- default ---- */
  c_move: [
    amount("Walk", 30, "min", 5), amount("Steps", 8000, "steps", 500),
    tick("Strength training", "week", 4), amount("Stretch / mobility", 10, "min", 5),
    tick("Rest day", "week", 1), tick("Cycle or swim", "week", 2),
  ],
  c_food: [
    amount("Water", 3, "L", 0.25), amount("Portions of veg", 5, "portions"),
    amount("Protein", 70, "g", 10), tick("Home-cooked dinner", "week", 5), tick("Breakfast"),
  ],
  c_limits: [
    limit("Alcohol", 6, "units"), limit("Meat", 3, "meals"), limit("Takeaway", 1, "meals"),
    limit("Caffeine", 2, "cups", "day"), limit("Dessert", 2, "times"), limit("Added sugar", 3, "treats"),
  ],
  c_sleep: [tick("Lights out by 11"), amount("Hours slept", 7.5, "h", 0.5), tick("No screens before bed")],
  c_mind: [amount("Meditate", 10, "min", 5), tick("Journal"), amount("Daylight outdoors", 20, "min", 10), tick("Three good things")],
  c_health: [tick("Vitamins"), tick("Physio exercises", "week", 3), tick("Floss"), tick("Skincare")],
  c_learn: [amount("Read", 20, "pages", 5), tick("Language practice"), amount("Course or project", 3, "h", 0.5, "week")],
  c_connect: [tick("Call family", "week", 2), tick("See a friend", "week", 1), tick("Message someone")],
  c_play: [tick("Listen to a full record", "week", 2), amount("Instrument practice", 20, "min", 10), tick("Draw or write", "week", 2)],
  c_home: [tick("Tidy 15 minutes"), tick("Meal prep", "week", 1), tick("Review finances", "week", 1)],
  c_digital: [limit("Social media", 30, "min", "day", 15), tick("No phone at meals"), tick("Phone out of bedroom")],

  /* ---- niyamas ---- */
  c_niy_saucha: [
    tick("Shower"), tick("Tidy 15 minutes"), tick("Make the bed"), tick("Skincare"), tick("Floss"),
    tick("Clear one surface"), limit("Takeaway", 1, "meals"),
  ],
  c_niy_santosha: [
    tick("Three good things"), tick("Eat one meal without a screen"), tick("Message a friend"),
    limit("Non-essential purchases", 1, "times"), tick("Notice one thing you already have"),
  ],
  c_niy_tapas: [
    tick("Strength training", "week", 4), amount("Walk", 30, "min", 5), amount("Steps", 8000, "steps", 500),
    tick("Up on the first alarm"), tick("Hard thing before noon"), tick("Cold shower"),
  ],
  c_niy_svadhyaya: [
    amount("Read", 20, "pages", 5), tick("Journal"), tick("Review the day"),
    tick("Language practice"), amount("Study", 3, "h", 0.5, "week"),
  ],
  c_niy_ishvara: [
    amount("Meditate", 10, "min", 5), amount("Breathwork", 5, "min"),
    amount("Daylight outdoors", 20, "min", 10), tick("An hour without the phone"),
    tick("One thing done with no outcome in mind"),
  ],

  /* ---- franklin ---- */
  c_bf_temperance:  [limit("Alcohol", 6, "units"), tick("Stop eating before full"), limit("Dessert", 2, "times")],
  c_bf_silence:     [tick("Listened more than spoke"), tick("No idle gossip"), tick("An hour of quiet")],
  c_bf_order:       [tick("Plan tomorrow tonight"), tick("Everything back in its place"), tick("Inbox cleared")],
  c_bf_resolution:  [tick("Did what I said I would"), tick("Finished what I started")],
  c_bf_frugality:   [limit("Non-essential purchases", 1, "times"), tick("Cooked rather than bought")],
  c_bf_industry:    [amount("Deep work", 90, "min", 15), tick("No time lost to the phone")],
  c_bf_sincerity:   [tick("Said nothing I did not mean"), tick("Kept a promise")],
  c_bf_justice:     [tick("Owned a mistake"), tick("Gave someone credit")],
  c_bf_moderation:  [tick("Let a small annoyance go"), tick("Avoided an extreme")],
  c_bf_cleanliness: [tick("Shower"), tick("Tidy 15 minutes"), tick("Clean clothes")],
  c_bf_tranquillity:[amount("Meditate", 10, "min", 5), tick("Not disturbed at trifles"), tick("Slept well")],
  c_bf_chastity:    [tick("Faithful to my own standard")],
  c_bf_humility:    [tick("Asked rather than told"), tick("Learned something from someone else")],

  /* ---- apple health ---- */
  c_ah_activity: [
    amount("Steps", 8000, "steps", 500), amount("Exercise minutes", 30, "min", 5),
    tick("Strength training", "week", 3), amount("Walk", 30, "min", 5),
    tick("Stand every hour"),
  ],
  c_ah_nutrition: [
    amount("Water", 2, "L", 0.25), amount("Protein", 70, "g", 10),
    amount("Portions of veg", 5, "portions"), limit("Alcohol", 6, "units"),
    limit("Caffeine", 2, "cups", "day"),
  ],
  c_ah_sleep: [
    amount("Hours slept", 7.5, "h", 0.5), tick("In bed by 11"), tick("No screens before bed"),
  ],
  c_ah_mindfulness: [
    amount("Mindful minutes", 10, "min", 5), amount("Breathwork", 5, "min"),
  ],
  c_ah_mental: [
    amount("Time in daylight", 20, "min", 10), tick("Logged how I feel"),
    tick("Journal"), tick("Spoke to someone I care about"),
  ],
  c_ah_medications: [tick("Medications"), tick("Vitamins")],
  c_ah_body: [amount("Weight", 1, "times", 1, "week"), tick("Skincare")],

  /* ---- dinacharya ---- */
  c_din_morning: [
    tick("Up before sunrise"), tick("Warm water on waking"), tick("Tongue scraping"),
    tick("Oil pulling"), tick("Abhyanga · self-massage", "week", 3),
  ],
  c_din_agni: [
    tick("Largest meal at midday"), tick("Light supper before dark"), amount("Water", 3, "L", 0.25),
    limit("Eating between meals", 1, "times", "day"), tick("Warm, cooked food"),
  ],
  c_din_movement: [
    amount("Yoga", 20, "min", 5), amount("Walk", 30, "min", 5), amount("Steps", 8000, "steps", 500),
    tick("Strength training", "week", 3),
  ],
  c_din_stillness: [
    amount("Meditate", 10, "min", 5), amount("Pranayama", 10, "min", 5), tick("Sat outside"),
  ],
  c_din_evening: [
    tick("Screens off an hour before bed"), tick("Lights out by 10"),
    amount("Hours slept", 7.5, "h", 0.5), tick("Oiled the feet"),
  ],
};

/* ----------------------------------------------------------------- the set -- */

export const TEMPLATES = [
  {
    id: "default",
    name: "A bit of everything",
    blurb: "Eleven areas of life — movement, food, sleep, mind, limits and the rest. The broadest starting point, and the easiest to whittle down.",
    categories: DEFAULT_CATEGORIES,
    starters: ["c_move", "c_food", "c_limits"],
  },
  {
    id: "niyamas",
    name: "The Niyamas",
    blurb: "The five observances of the Yoga Sutras — cleanliness, contentment, discipline, self-study, surrender. Fewer categories, each asking something different of you.",
    categories: NIYAMA_CATEGORIES,
    starters: ["c_niy_tapas", "c_niy_saucha"],
  },
  {
    id: "franklin",
    name: "Franklin's thirteen virtues",
    blurb: "Benjamin Franklin ruled a grid of these in a notebook and marked a dot for every fault, giving one virtue his full attention each week. It is the same grid as the Week screen, two centuries early.",
    categories: FRANKLIN_CATEGORIES,
    starters: ["c_bf_temperance", "c_bf_order", "c_bf_industry"],
  },
  {
    id: "health",
    name: "Apple Health categories",
    blurb: "Named after the categories in Apple Health — Activity, Nutrition, Sleep, Mindfulness and the rest. The one standard taxonomy in this space, and the one that will line up if steps and sleep ever fill themselves in.",
    categories: HEALTH_CATEGORIES,
    starters: ["c_ah_activity", "c_ah_nutrition"],
  },
  {
    id: "dinacharya",
    name: "Dinacharya",
    blurb: "The Ayurvedic daily routine, organised by the shape of a day rather than by area of life: morning ritual, digestion, movement, stillness, wind-down.",
    categories: DINACHARYA_CATEGORIES,
    starters: ["c_din_morning", "c_din_movement"],
  },
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

/* Guesses which category of a template a target belongs in, by looking for
   keywords in its name.

   Only ever a first pass — reorganising twenty targets by hand is tedious
   enough that a rough answer you correct beats a blank slate you fill. Every
   guess is shown and changeable before anything is applied. */
export function guessCategory(templateId, targetName) {
  const template = templateById(templateId);
  const name = String(targetName || "").toLowerCase();
  let best = null;
  let bestLen = 0;
  template.categories.forEach((c) => {
    (c.match || []).forEach((word) => {
      // The longest matching keyword wins, so "strength training" beats "train".
      if (name.includes(word) && word.length > bestLen) { best = c.id; bestLen = word.length; }
    });
  });
  return best || template.categories[0].id;
}

export const UNITS = ["", "min", "h", "steps", "L", "ml", "g", "km", "pages",
                      "units", "meals", "cups", "portions", "treats", "times"];

export const CATEGORY_COLORS = [
  "#3F7D5B", "#5E8C3F", "#B4443A", "#4A5F9E", "#7A5EA8",
  "#2F6D8C", "#8C6D2F", "#C1663F", "#9E4A7C", "#6B7280",
];
