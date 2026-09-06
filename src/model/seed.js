/* ==========================================================================
   Building a starting document from a template.

   A template supplies categories and a library of suggestions; the document it
   builds carries a couple of obvious targets in one or two categories so the
   first screen is not blank, and leaves the rest empty.

   Those starter targets are drawn from the template's own suggestions rather
   than written by hand, so nobody inherits somebody else's goals — a starting
   set should be a floor to build on, not a stranger's routine.

   Categories seeded empty are not clutter: Today and Week only render
   categories that have targets scheduled, so an untouched one is visible in
   Setup alone, where its suggestions are a tap away.
   ========================================================================== */

import { ALL_DAYS, uid } from "./targets";
import { SUGGESTIONS, TEMPLATES, templateById } from "./templates";

export { SUGGESTIONS, TEMPLATES, templateById };
export { UNITS, CATEGORY_COLORS } from "./templates";

/* Two is enough to show what a target looks like without presuming much. */
const STARTERS_PER_CATEGORY = 2;

export function docFromTemplate(templateId) {
  const template = templateById(templateId);
  const categories = template.categories.map((c, i) => ({ ...c, order: i }));

  const targets = [];
  (template.starters || []).forEach((catId) => {
    (SUGGESTIONS[catId] || []).slice(0, STARTERS_PER_CATEGORY).forEach((s) => {
      targets.push({
        ...s, id: uid("t_"), catId, order: targets.length,
        archived: false, days: [...ALL_DAYS], types: [], plan: {},
      });
    });
  });

  return {
    version: 1,
    template: template.id,
    createdAt: new Date().toISOString(),
    categories,
    targets,
    log: {},
    reminders: { enabled: false, hour: 20, minute: 0 },
  };
}

/* Adds a template's categories to a document that already exists, leaving
   every target and everything logged exactly where it is. Categories already
   present are not duplicated, so this is safe to run twice. */
export function addTemplateCategories(doc, templateId) {
  const template = templateById(templateId);
  const have = new Set(doc.categories.map((c) => c.id));
  const next = doc.categories.slice();
  template.categories.forEach((c) => {
    if (!have.has(c.id)) next.push({ ...c, order: next.length });
  });
  return { ...doc, template: template.id, categories: next };
}

/* Two names count as the same target if they differ only in case, spacing or
   punctuation. Deliberately not cleverer than that: "Walk" and "Walking" are
   plausibly two different things to somebody, and wrongly hiding a suggestion
   is harder to notice than seeing one you did not need. */
export const normaliseName = (name) =>
  String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* Which of a category's suggestions are still worth offering.

   Checked against every target in the document, not just this category's.
   Having moved "Listen to a full record" into Creative & play, being offered
   it again under Connection is the app forgetting what you have already told
   it. */
export function suggestionsFor(doc, catId) {
  const taken = new Set((doc.targets || []).map((t) => normaliseName(t.name)));
  return (SUGGESTIONS[catId] || []).filter((s) => !taken.has(normaliseName(s.name)));
}

export const seededDoc = () => docFromTemplate("default");
export const emptyDoc = () => ({
  version: 1,
  createdAt: new Date().toISOString(),
  categories: [], targets: [], log: {},
  reminders: { enabled: false, hour: 20, minute: 0 },
});
