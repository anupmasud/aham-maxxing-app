/* Setup — categories, targets, reminders and the Drive connection. */

import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { C, S, Btn, CatHeader, Chip, Confirm, Note, Seg, Select } from "../ui/kit";
import * as M from "../model/targets";
import {
  CATEGORY_COLORS, TEMPLATES, UNITS, addTemplateCategories, suggestionsFor, templateById,
} from "../model/seed";
import { guessCategory } from "../model/templates";
import { GROUP_MODES, groupTargets } from "../model/grouping";
import { applyImport, readImport } from "../model/csv";
import { CONFIG } from "../config";

export default function Setup({
  doc, update, user, folderUrl, sheetUrl, signOut, disconnect, exportCsvFile,
}) {
  const [editTarget, setEditTarget] = useState(null);   // { target } | { catId }
  const [editCat, setEditCat] = useState(null);         // { cat } | {}
  const [confirming, setConfirming] = useState(null);   // { title, message, onConfirm }
  const [reorganising, setReorganising] = useState(false);
  const [transferring, setTransferring] = useState(false);

  /* A lens, not a preference: it changes how the list in front of you is
     arranged and nothing about the document, so it is not written to Drive. */
  const [grouping, setGrouping] = useState("category");

  const cats = (doc.categories || []).slice().sort((a, b) => a.order - b.order);
  const groups = groupTargets(doc, grouping);
  const catById = {};
  cats.forEach((c) => { catById[c.id] = c; });

  const nextOrder = (list) => (list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0);

  const addSuggestion = (catId, s) =>
    update((d) => ({
      ...d,
      targets: [...d.targets, {
        ...s, id: M.uid("t_"), catId, archived: false, until: "", note: "",
        days: [...M.ALL_DAYS], order: nextOrder(d.targets.filter((t) => t.catId === catId)),
      }],
    }));

  /* The confirm button says Delete unless told otherwise, which is right for
     the three things here that really do delete and wrong for anything else —
     a dialog that says Delete when nothing is being deleted reads as a threat. */
  const confirm = (title, message, onConfirm, confirmLabel) =>
    setConfirming({ title, message, onConfirm, confirmLabel });

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]} keyboardShouldPersistTaps="handled">
      <View style={[S.row, { marginBottom: 14 }]}>
        <Text style={[S.h1, { flex: 1 }]}>Setup</Text>
        <Btn small label="+ Category" onPress={() => setEditCat({})} />
      </View>

      {/* Two arrangements of the same list. By area is how you built it; by
          cadence is how you find out you have promised twelve things a day. */}
      <View style={[S.row, { gap: 6, marginBottom: 14 }]}>
        {GROUP_MODES.map((m) => (
          <Seg key={m.id} on={grouping === m.id} label={m.label} sub={m.sub}
               onPress={() => setGrouping(m.id)} />
        ))}
      </View>

      {groups.map((g) => {
        const ts = g.targets;
        const chips = g.catId ? suggestionsFor(doc, g.catId) : [];
        const live = ts.filter((t) => !t.archived).length;
        return (
          <View key={g.id} style={S.card}>
            <CatHeader
              cat={{ name: g.name, emoji: g.emoji, color: g.color || TONE[g.tone] }}
              right={g.catId ? (
                <View style={[S.row, { gap: 4 }]}>
                  <Mini glyph="✎" onPress={() => setEditCat({ cat: catById[g.catId] })} />
                  <Mini glyph="✕" danger onPress={() => confirm(
                    `Delete "${g.name}"?`,
                    ts.length ? `Its ${ts.length} target${ts.length > 1 ? "s" : ""} and their history go too.` : "",
                    () => update((d) => {
                      const ids = new Set(d.targets.filter((t) => t.catId === g.catId).map((t) => t.id));
                      const log = {};
                      Object.entries(d.log || {}).forEach(([k, v]) => {
                        const day = Object.fromEntries(Object.entries(v).filter(([id]) => !ids.has(id)));
                        if (Object.keys(day).length) log[k] = day;
                      });
                      const targets = d.targets.filter((t) => t.catId !== g.catId);
                      return {
                        ...d, log, targets,
                        categories: d.categories.filter((c) => c.id !== g.catId),
                        notes: M.pruneNotes(d.notes, targets),
                      };
                    })
                  )} />
                </View>
              ) : (
                <Text style={[S.tiny, { fontVariant: ["tabular-nums"] }]}>{live}</Text>
              )}
            />

            {!!g.note && (
              <Text style={[S.tiny, { paddingHorizontal: 13, paddingTop: 9, paddingBottom: 3 }]}>
                {g.note}
              </Text>
            )}

            {/* A category's own notes, shown in full: it is one heading rather
                than one of twenty rows, so there is room for it. */}
            {!!(g.catId && catById[g.catId]?.note) && (
              <Note text={catById[g.catId].note} full
                    style={{ paddingHorizontal: 13, paddingTop: 9, marginTop: 0 }} />
            )}

            {ts.map((t, i) => {
              const cat = catById[t.catId];
              return (
                <View key={t.id}>
                  {i > 0 && <View style={S.rule} />}
                  <View style={[S.row, { paddingVertical: 10, paddingHorizontal: 13, gap: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        // Struck through only when paused. A target that reached
                        // its end date finished rather than being abandoned, so
                        // it dims without being crossed out.
                        fontSize: 14, color: t.archived || M.hasEnded(t) ? C.ink3 : C.ink,
                        textDecorationLine: t.archived ? "line-through" : "none",
                      }}>{t.name}</Text>
                      <Text style={[S.tiny, { marginTop: 2 }]}>
                        {/* Which area it came from, but only when the heading is
                            not already saying it. */}
                        {!g.catId && cat ? `${cat.emoji} ${cat.name} · ` : ""}
                        {M.describe(t)}{t.archived ? " · paused" : ""}
                      </Text>
                      <Note text={t.note} />
                    </View>
                    <Mini glyph={t.archived ? "▶" : "❚❚"} onPress={() => update((d) => ({
                      ...d, targets: d.targets.map((x) => x.id === t.id ? { ...x, archived: !x.archived } : x),
                    }))} />
                    <Mini glyph="✎" onPress={() => setEditTarget({ target: t })} />
                    <Mini glyph="✕" danger onPress={() => confirm(
                      `Delete "${t.name}"?`,
                      "Its logged history goes too. To keep the history, pause it instead.",
                      () => update((d) => {
                        const log = {};
                        Object.entries(d.log || {}).forEach(([k, v]) => {
                          const { [t.id]: _drop, ...rest } = v;
                          if (Object.keys(rest).length) log[k] = rest;
                        });
                        const targets = d.targets.filter((x) => x.id !== t.id);
                        return { ...d, log, targets, notes: M.pruneNotes(d.notes, targets) };
                      })
                    )} />
                  </View>
                </View>
              );
            })}

            <View style={{ paddingHorizontal: 13, paddingBottom: 12, paddingTop: ts.length ? 8 : 0 }}>
              <View style={[S.row, { flexWrap: "wrap" }]}>
                {/* Adding from inside a cadence starts the new target at that
                    cadence — the category is the first field in the form, and
                    the suggestions belong to a category so they wait for one. */}
                <Chip label="+ New target"
                      onPress={() => setEditTarget({ catId: g.catId || cats[0]?.id, seed: g.seed })} />
                {chips.map((s) => (
                  <Chip key={s.name} label={`+ ${s.name}`} onPress={() => addSuggestion(g.catId, s)} />
                ))}
              </View>
            </View>
          </View>
        );
      })}

      {M.plannedCount(doc.targets) > 0 && (
        <View style={[S.card, S.cardPad]}>
          <Text style={[S.h2, { marginBottom: 6 }]}>Weekly plan</Text>
          <Text style={S.muted}>
            {M.plannedCount(doc.targets)} of your targets currently suggest particular
            weekdays. Clearing that leaves every target, every goal and everything you
            have logged exactly as it is — it only stops the plan proposing days you
            did not choose.
          </Text>
          <Btn label="Clear every recurring plan" onPress={() => confirm(
            "Clear the weekly plan?",
            `${M.plannedCount(doc.targets)} target${M.plannedCount(doc.targets) > 1 ? "s" : ""} will stop asking for particular weekdays. ` +
            "No target is removed, no goal changes, and nothing you have logged is touched. " +
            "Plans you made for one particular date are kept.",
            () => update((d) => ({ ...d, targets: M.clearWeeklyPlans(d.targets) })),
            "Clear the plan"
          )} />
        </View>
      )}

      <ClearHistory doc={doc} update={update} confirm={confirm} />

      <View style={[S.card, S.cardPad]}>
        <Text style={[S.h2, { marginBottom: 6 }]}>Starting set</Text>
        <Text style={S.muted}>
          Currently {templateById(doc.template).name.toLowerCase()}. Reorganising moves
          the targets you already have into a different set of categories — nothing is
          deleted and nothing you have logged is touched.
        </Text>
        <Btn label="Reorganise into another set" onPress={() => setReorganising(true)} />
      </View>

      <View style={[S.card, S.cardPad]}>
        <Text style={[S.h2, { marginBottom: 6 }]}>Opens on</Text>
        <Text style={S.muted}>
          Which screen you land on when you open the app.
        </Text>
        <View style={[S.row, { gap: 6, marginTop: 12 }]}>
          <Seg on={(doc.homeTab || "insights") === "insights"}
               label="This week" sub="where you are"
               onPress={() => update((d) => ({ ...d, homeTab: "insights" }))} />
          <Seg on={doc.homeTab === "today"}
               label="Today" sub="what is left"
               onPress={() => update((d) => ({ ...d, homeTab: "today" }))} />
        </View>
      </View>

      <View style={[S.card, S.cardPad]}>
        <Text style={[S.h2, { marginBottom: 6 }]}>Import and export</Text>
        <Text style={S.muted}>
          Bring history in from another habit app, or take everything out as a
          plain CSV that anything can read.
        </Text>
        <Btn label="Import or export data" onPress={() => setTransferring(true)} />
      </View>

      <Reminders doc={doc} update={update} />

      <View style={[S.card, S.cardPad]}>
        <Text style={[S.h2, { marginBottom: 8 }]}>Your data</Text>
        <Text style={S.muted}>
          Signed in as {user?.email}. Everything lives in a spreadsheet in{" "}
          {CONFIG.folderPath.join(" / ")} on your Drive — four tabs you can read,
          sort, chart or edit by hand. Change a goal there and the app picks it up.
        </Text>
        {!!sheetUrl && (
          <Pressable onPress={() => Linking.openURL(sheetUrl)} style={{ marginTop: 10 }}>
            <Text style={{ color: C.accent, fontSize: 14 }}>Open the spreadsheet</Text>
          </Pressable>
        )}
        {!!folderUrl && (
          <Pressable onPress={() => Linking.openURL(folderUrl)} style={{ marginTop: 6 }}>
            <Text style={{ color: C.accent, fontSize: 14 }}>Open the folder in Drive</Text>
          </Pressable>
        )}
        <Btn label="Sign out" onPress={signOut} />
        <Btn danger label="Disconnect this app from Google" onPress={disconnect} />
      </View>

      <TargetEditor
        state={editTarget} doc={doc} update={update}
        onClose={() => setEditTarget(null)} nextOrder={nextOrder}
      />
      <CategoryEditor
        state={editCat} update={update}
        onClose={() => setEditCat(null)} nextOrder={nextOrder}
      />
      <Confirm state={confirming} onClose={() => setConfirming(null)} />
      {reorganising && (
        <Reorganise doc={doc} update={update} onClose={() => setReorganising(false)} />
      )}
      {transferring && (
        <Transfer doc={doc} update={update} exportCsvFile={exportCsvFile}
                  onClose={() => setTransferring(false)} />
      )}
    </ScrollView>
  );
}

/* -------------------------------------------------------------- transfer --
   Moving history in from another app, and taking it out again.

   Pasting the file rather than picking it is deliberate: one code path for the
   phone and the browser, no document-picker dependency, and no way to fail on
   a permission for reading local files. Habit exports are small text.

   Nothing is applied until it has been read and described. Importing a year of
   somebody's history is not a thing to do silently and let them discover
   afterwards. */

function Transfer({ doc, update, exportCsvFile, onClose }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [exported, setExported] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cats = doc.categories.slice().sort((a, b) => a.order - b.order);
  const [catId, setCatId] = useState((cats[0] || {}).id);

  const read = () => {
    setError("");
    const result = readImport(text, doc, { defaultCatId: catId });
    if (!result.ok) {
      setPreview(null);
      setError(
        result.reason === "empty"
          ? "Nothing to read — paste the contents of a CSV file above."
          : "That does not look like a habit export. It needs either a date column and a habit column, or a first column of dates with a column per habit."
      );
      return;
    }
    setPreview(result);
  };

  const doExport = async () => {
    setBusy(true); setError("");
    try { setExported(await exportCsvFile()); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <Sheet title="Import and export" onClose={onClose}>
      <Text style={[S.h2, { fontSize: 15, marginBottom: 6 }]}>Take your data out</Text>
      <Text style={S.muted}>
        Writes a CSV beside your spreadsheet — one row per entry, with the date,
        category, target, value and unit. Anything can read it.
      </Text>
      <Btn label={busy ? "Writing…" : "Export to CSV"} onPress={doExport} disabled={busy} />
      {!!exported && (
        <Pressable onPress={() => Linking.openURL(exported.url)} style={{ marginTop: 8 }}>
          <Text style={{ color: C.accent, fontSize: 14 }}>Open “{exported.name}” in Drive</Text>
        </Pressable>
      )}

      <View style={[S.rule, { marginVertical: 18 }]} />

      <Text style={[S.h2, { fontSize: 15, marginBottom: 6 }]}>Bring data in</Text>
      <Text style={S.muted}>
        Export from your other app, open the file, and paste the whole thing here.
        Both common shapes are understood: a date column with a habit column, or
        a first column of dates with a column per habit.
      </Text>

      <Text style={[S.label, { marginTop: 12 }]}>New targets go in</Text>
      <Select value={catId} onChange={setCatId}
              options={cats.map((c) => ({ value: c.id, label: `${c.emoji}  ${c.name}` }))} />

      <Text style={[S.label, { marginTop: 12 }]}>Paste the CSV</Text>
      <TextInput
        style={[S.input, { minHeight: 110, textAlignVertical: "top", fontSize: 12 }]}
        multiline
        value={text}
        onChangeText={(v) => { setText(v); setPreview(null); }}
        placeholder={"date,habit,value\n2026-01-01,Walk,30"}
      />
      <Btn label="Read it" onPress={read} />

      {!!error && <Text style={S.error}>{error}</Text>}

      {!!preview && (
        <View style={[S.card, S.cardPad, { marginTop: 14 }]}>
          <Text style={[S.h2, { fontSize: 14, marginBottom: 6 }]}>What this would add</Text>
          <Text style={S.body}>
            {preview.entries} entr{preview.entries === 1 ? "y" : "ies"}
            {preview.notes ? ` and ${preview.notes} note${preview.notes === 1 ? "" : "s"}` : ""}
            {preview.first ? `, ${preview.first} to ${preview.last}` : ""}.
          </Text>
          {preview.matched.length > 0 && (
            <Text style={[S.muted, { marginTop: 6 }]}>
              Matched to targets you already have: {preview.matched.join(", ")}.
            </Text>
          )}
          {preview.created.length > 0 && (
            <Text style={[S.muted, { marginTop: 6 }]}>
              New targets: {preview.created.map((t) => `${t.name} (${t.kind})`).join(", ")}.
            </Text>
          )}
          <Text style={[S.tiny, { marginTop: 8 }]}>
            Days you have already recorded are left exactly as they are — this fills
            gaps rather than overwriting.
          </Text>
          <Btn primary
               label={preview.entries
                 ? `Add ${preview.entries} entries`
                 : `Add ${preview.notes} note${preview.notes === 1 ? "" : "s"}`}
               onPress={() => {
            update((d) => applyImport(d, preview));
            onClose();
          }} />
        </View>
      )}

      <Btn label="Close" onPress={onClose} />
    </Sheet>
  );
}

/* ------------------------------------------------------------ reorganise --
   Moving an existing document into a different set of categories.

   Every target is listed with a proposed home, guessed from its name, and
   every guess is changeable before anything happens. Re-filing twenty targets
   from a blank slate is tedious enough that people would rather not — a rough
   answer they correct is far more likely to actually get used. */

function Reorganise({ doc, update, onClose }) {
  const [templateId, setTemplateId] = useState(
    TEMPLATES.find((t) => t.id !== doc.template)?.id || "niyamas"
  );
  const [map, setMap] = useState(null);
  const [seeded, setSeeded] = useState(null);

  // Re-guess whenever a different set is chosen.
  if (seeded !== templateId) {
    setSeeded(templateId);
    const next = {};
    doc.targets.forEach((t) => { next[t.id] = guessCategory(templateId, t.name); });
    setMap(next);
  }
  if (!map) return null;

  const template = templateById(templateId);
  const options = template.categories.map((c) => ({ value: c.id, label: `${c.emoji}  ${c.name}` }));

  const apply = () => {
    update((d) => {
      const withCats = addTemplateCategories(d, templateId);
      const targets = withCats.targets.map((t) => ({ ...t, catId: map[t.id] || t.catId }));

      /* Old categories left holding nothing are dropped, so Setup does not end
         up showing both sets side by side. Any that still hold a target stay —
         losing a target to tidiness would be a poor trade. */
      const keep = new Set(template.categories.map((c) => c.id));
      const used = new Set(targets.map((t) => t.catId));
      const categories = withCats.categories
        .filter((c) => keep.has(c.id) || used.has(c.id))
        .map((c, i) => ({ ...c, order: i }));

      return { ...withCats, categories, targets };
    });
    onClose();
  };

  return (
    <Sheet title="Reorganise" onClose={onClose}>
      <Text style={S.muted}>
        Pick a set, check where each target lands, then apply. Nothing you have
        logged is affected — only which category a target sits in.
      </Text>

      <View style={{ marginTop: 12, marginBottom: 4 }}>
        {TEMPLATES.map((t) => {
          const on = templateId === t.id;
          return (
            <Pressable key={t.id} onPress={() => setTemplateId(t.id)}
              style={({ pressed }) => [{
                borderWidth: on ? 2 : 1, borderColor: on ? C.ink : C.rule,
                backgroundColor: on ? C.sunk : C.card, borderRadius: 10,
                padding: 11, marginBottom: 8, opacity: pressed ? 0.75 : 1,
              }]}>
              <Text style={{ fontSize: 14.5, fontWeight: "700", color: C.ink }}>{t.name}</Text>
              <Text style={[S.tiny, { marginTop: 3 }]}>
                {t.categories.map((c) => c.emoji).join(" ")}  ·  {t.categories.length} categories
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[S.label, { marginTop: 10 }]}>Where each target goes</Text>
      {doc.targets.map((t) => (
        <View key={t.id} style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 13.5, color: C.ink, marginBottom: 4 }} numberOfLines={1}>{t.name}</Text>
          <Select
            value={map[t.id]}
            options={options}
            onChange={(v) => setMap((m) => ({ ...m, [t.id]: v }))}
          />
        </View>
      ))}

      <View style={[S.row, { gap: 9, marginTop: 14 }]}>
        <Btn label="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <Btn primary label="Apply" onPress={apply} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------- reminders -- */

function Reminders({ doc, update }) {
  const r = doc.reminders || { enabled: false, hour: 20, minute: 0 };
  const set = (patch) => update((d) => ({ ...d, reminders: { ...r, ...patch } }));
  const hh = String(r.hour).padStart(2, "0");
  const mm = String(r.minute).padStart(2, "0");

  return (
    <View style={[S.card, S.cardPad]}>
      <View style={[S.row, { marginBottom: 6 }]}>
        <Text style={[S.h2, { flex: 1 }]}>Daily reminder</Text>
        <Switch value={!!r.enabled} onValueChange={(v) => set({ enabled: v })} />
      </View>
      <Text style={S.muted}>
        A single nudge listing what is still open. It says what is left, not how
        long your streak is.
      </Text>
      {r.enabled && (
        <View style={[S.row, { marginTop: 12, gap: 8, alignItems: "center" }]}>
          <Text style={S.label}>At</Text>
          <Btn small label="−1h" onPress={() => set({ hour: (r.hour + 23) % 24 })} />
          <Text style={{ fontSize: 17, fontWeight: "700", color: C.ink, minWidth: 58, textAlign: "center" }}>
            {hh}:{mm}
          </Text>
          <Btn small label="+1h" onPress={() => set({ hour: (r.hour + 1) % 24 })} />
          <Btn small label={mm === "00" ? ":30" : ":00"} onPress={() => set({ minute: r.minute === 0 ? 30 : 0 })} />
        </View>
      )}
    </View>
  );
}

/* --------------------------------------------------------- target editor -- */

/* An end date for a target that repeats.

   Typed rather than picked from a calendar: there is no date picker that
   behaves the same in a browser and on the phone without pulling in a native
   module, and the presets answer almost every real case — the field is there
   for the one that needs a particular day.

   What you type is kept exactly as typed and only interpreted when you save,
   so a half-finished date is never guessed at. The line underneath says what
   the app has understood, which is the part worth being sure about. */
function EndDate({ form, set }) {
  const typed = form.until || "";
  const end = M.endOf(form);
  const today = new Date();
  const on = (d) => set({ until: M.keyOf(d) });

  const echo = !typed
    ? "No end — repeats for as long as you keep it."
    : end
      ? `${M.hasEnded(form) ? "Ended" : "Runs until"} ${M.parseKey(end).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${M.hasEnded(form) ? "" : ", inclusive"}.`
      : "Not a date yet — use YYYY-MM-DD. Saving now would leave it with no end.";

  return (
    <>
      <Text style={[S.label, { marginTop: 16 }]}>Runs until (optional)</Text>
      <Text style={[S.tiny, { marginBottom: 2 }]}>
        The last day this is asked of you. After it, the target stops appearing
        and stops counting — everything you already logged stays exactly as it is.
      </Text>
      <View style={[S.row, { flexWrap: "wrap", marginBottom: 9 }]}>
        <Chip label="End of this month"
              onPress={() => on(new Date(today.getFullYear(), today.getMonth() + 1, 0))} />
        <Chip label="In 4 weeks" onPress={() => on(M.addDays(today, 28))} />
        <Chip label="In 3 months"
              onPress={() => on(new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()))} />
        {!!typed && <Chip label="✕  Clear" onPress={() => set({ until: "" })} />}
      </View>
      <TextInput
        style={S.input}
        value={typed}
        onChangeText={(v) => set({ until: v })}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[S.tiny, { marginTop: 5, color: typed && !end ? C.warn : C.ink3 }]}>{echo}</Text>
    </>
  );
}

function TargetEditor({ state, doc, update, onClose, nextOrder }) {
  const existing = state?.target;
  const [form, setForm] = useState(null);

  const key = state
    ? (existing?.id || `new:${state.catId}:${JSON.stringify(state.seed || {})}`)
    : null;
  const [seeded, setSeeded] = useState(null);
  if (state && seeded !== key) {
    setSeeded(key);
    setForm(existing ? { ...existing } : {
      name: "", catId: state.catId, kind: "tick", dir: "at_least", period: "day",
      goal: 1, unit: "", step: 1, days: [...M.ALL_DAYS], until: "", note: "", archived: false,
      // Started from inside a cadence, it begins at that cadence.
      ...(state.seed || {}),
    });
  }
  if (!state && seeded !== null) setSeeded(null);
  if (!state || !form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const needsGoal = form.kind === "amount" || form.period === "week";

  const save = () => {
    const name = (form.name || "").trim();
    if (!name) return;
    const types = (form.types || [])
      .map((t) => ({ ...t, name: (t.name || "").trim(), goal: Number(t.goal) || 0 }))
      .filter((t) => t.name);
    const keep = new Set(types.map((t) => t.id));
    const plan = M.prunePlan(form.plan, keep);

    const clean = {
      ...form, name, types, plan,
      // A daily tick has no goal to set — the form hides the field, so anything
      // left in it from a previous shape of the target would be invisible.
      goal: form.kind === "tick" && form.period === "day" ? 1 : Math.max(0, Number(form.goal) || 1),
      step: Math.max(0.01, Number(form.step) || 1),
      unit: form.kind === "amount" ? form.unit : "",
      days: form.period === "week" ? [...M.ALL_DAYS] : (form.days.length ? form.days : [...M.ALL_DAYS]),
      // Whatever is in the box is only a date if it reads as one; anything
      // else means no end rather than an end nobody can interpret.
      until: M.endOf(form),
      note: (form.note || "").trim(),
    };
    update((d) => existing
      ? { ...d, targets: d.targets.map((t) => (t.id === existing.id ? { ...t, ...clean } : t)) }
      : { ...d, targets: [...d.targets, { ...clean, id: M.uid("t_"), order: nextOrder(d.targets.filter((t) => t.catId === clean.catId)) }] });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title={existing ? "Edit target" : "New target"}>
      <Text style={S.label}>Name</Text>
      <TextInput style={S.input} value={form.name} onChangeText={(v) => set({ name: v })}
                 placeholder="e.g. Strength training" />

      <Text style={[S.label, { marginTop: 12 }]}>Category</Text>
      <Select
        value={form.catId}
        onChange={(v) => set({ catId: v })}
        options={(doc.categories || []).slice().sort((a, b) => a.order - b.order)
          .map((c) => ({ value: c.id, label: `${c.emoji}  ${c.name}` }))}
      />

      <NoteField
        value={form.note}
        onChange={(v) => set({ note: v })}
        hint="The detail the name leaves out — what the session actually is, what counts, what to remember. It shows wherever you tick this off."
        placeholder={"e.g. Hamstring curls x15, glute bridges x20, bird dog x10 each side\nhttps://youtube.com/watch?v=..."}
      />

      <Text style={[S.label, { marginTop: 12 }]}>What are you tracking?</Text>
      <View style={[S.row, { gap: 6 }]}>
        <Seg on={form.kind === "tick"} label="Did it" sub="a tick" onPress={() => set({ kind: "tick" })} />
        <Seg on={form.kind === "amount"} label="An amount" sub="a number you log" onPress={() => set({ kind: "amount" })} />
      </View>

      <Text style={[S.label, { marginTop: 12 }]}>Aiming to…</Text>
      <View style={[S.row, { gap: 6 }]}>
        <Seg on={form.dir === "at_least"} label="Reach it" sub="at least" onPress={() => set({ dir: "at_least" })} />
        <Seg on={form.dir === "at_most"} label="Stay under" sub="at most" onPress={() => set({ dir: "at_most" })} />
      </View>

      <Text style={[S.label, { marginTop: 12 }]}>Measured…</Text>
      <View style={[S.row, { gap: 6 }]}>
        <Seg on={form.period === "day"} label="Each day" onPress={() => set({ period: "day" })} />
        <Seg on={form.period === "week"} label="Across the week" onPress={() => set({ period: "week" })} />
      </View>

      {needsGoal && (
        <View style={[S.row, { gap: 10, marginTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.label}>Goal</Text>
            <TextInput style={S.input} keyboardType="decimal-pad"
                       value={String(form.goal)} onChangeText={(v) => set({ goal: v })} />
          </View>
          {form.kind === "amount" && (
            <View style={{ flex: 1 }}>
              <Text style={S.label}>Tap size</Text>
              <TextInput style={S.input} keyboardType="decimal-pad"
                         value={String(form.step)} onChangeText={(v) => set({ step: v })} />
            </View>
          )}
        </View>
      )}

      {form.kind === "amount" && (
        <>
          <Text style={[S.label, { marginTop: 12 }]}>Unit</Text>
          <Select
            value={form.unit}
            onChange={(v) => set({ unit: v })}
            placeholder="No unit"
            options={UNITS.map((u) => ({ value: u, label: u || "— no unit —" }))}
          />
        </>
      )}

      {form.period === "day" && (
        <>
          <Text style={[S.label, { marginTop: 12 }]}>Which days</Text>
          <View style={[S.row, { gap: 5 }]}>
            {M.ALL_DAYS.map((i) => {
              const on = form.days.includes(i);
              return (
                <Pressable key={i} onPress={() => {
                  const next = on ? form.days.filter((d) => d !== i) : [...form.days, i];
                  set({ days: next.length ? next : form.days });   // never allow zero days
                }}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, alignItems: "center",
                    borderColor: on ? C.ink : C.rule, backgroundColor: on ? C.ink : C.card,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: on ? C.paper : C.ink2 }}>
                    {M.DOW_LETTER[i]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {form.kind === "tick" && (
        <TypesEditor form={form} set={set} />
      )}

      {/* A target with types plans which kind falls on which day, and gets that
          grid inside the types editor. Everything else only needs "which days do
          I mean to do this". */}
      {!(form.types || []).length && (
        <>
          <Text style={[S.label, { marginTop: 16 }]}>Plan the week (optional)</Text>
          <Text style={[S.tiny, { marginBottom: 8 }]}>
            The days you intend to do this. It repeats every week, shows as an
            outline until you tick it, and never counts as done on its own.
          </Text>
          <View style={[S.row, { gap: 5 }]}>
            {M.ALL_DAYS.map((i) => {
              const on = M.planEntry(form, i).planned;
              return (
                <Pressable key={i}
                  onPress={() => set(M.setPlannedDay(form, i, !on))}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, alignItems: "center",
                    borderColor: on ? C.good : C.rule, backgroundColor: on ? C.good : C.card,
                  }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#fff" : C.ink2 }}>
                    {M.DOW_LETTER[i]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <EndDate form={form} set={set} />

      <Text style={[S.tiny, { marginTop: 12 }]}>{M.describe({ ...form, goal: Number(form.goal) || 1 })}</Text>

      <View style={[S.row, { gap: 9, marginTop: 14 }]}>
        <Btn label="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <Btn primary label="Save" onPress={save} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

/* ---------------------------------------------------------- types + plan --
   Types belong to tick targets only. "Did you do it, and which kind" is a
   sensible question; "how many minutes, and which kind" is two measurements
   wearing one coat, so the editor keeps them apart rather than pretending. */

function TypesEditor({ form, set }) {
  const types = form.types || [];
  const plan = form.plan || {};

  const addType = () => set({
    types: [...types, { id: M.uid("ty_"), name: "", goal: 0 }],
  });

  const patchType = (id, patch) =>
    set({ types: types.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const removeType = (id) => set({
    types: types.filter((t) => t.id !== id),
    plan: M.prunePlan(plan, types.filter((t) => t.id !== id).map((t) => t.id)),
  });

  const togglePlan = (dayIndex, typeId) => {
    const current = M.planTypes(plan, dayIndex);
    const next = current.includes(typeId)
      ? current.filter((x) => x !== typeId)
      : [...current, typeId];
    set({ plan: { ...plan, [dayIndex]: next } });
  };

  return (
    <View style={{ marginTop: 16 }}>
      <View style={[S.row, { marginBottom: 4 }]}>
        <Text style={[S.label, { flex: 1, marginBottom: 0 }]}>Types (optional)</Text>
        <Btn small label="+ Type" onPress={addType} />
      </View>
      <Text style={[S.tiny, { marginBottom: 8 }]}>
        Break one target into kinds — lymph drainage, full body, arms. Each kind
        you tick counts as one session towards the target above, and can carry
        its own weekly minimum.
      </Text>

      {types.map((ty) => (
        <View key={ty.id} style={[S.row, { gap: 8, marginBottom: 8 }]}>
          <TextInput
            style={[S.input, { flex: 1 }]}
            value={ty.name}
            placeholder="e.g. Lymph drainage"
            onChangeText={(v) => patchType(ty.id, { name: v })}
          />
          <View style={{ width: 74 }}>
            <TextInput
              style={[S.input, { textAlign: "center" }]}
              keyboardType="number-pad"
              value={ty.goal ? String(ty.goal) : ""}
              placeholder="×/wk"
              onChangeText={(v) => patchType(ty.id, { goal: Number(v) || 0 })}
            />
          </View>
          <Mini glyph="✕" danger onPress={() => removeType(ty.id)} />
        </View>
      ))}

      {types.length > 0 && (
        <>
          <Text style={[S.label, { marginTop: 12 }]}>Plan the week (optional)</Text>
          <Text style={[S.tiny, { marginBottom: 8 }]}>
            Pencil each kind onto the days you intend to do it. This repeats every
            week, so it carries forward without retyping — and a planned day you
            miss is only marked once it has actually passed.
          </Text>

          <View style={[S.row, { paddingLeft: 96, marginBottom: 3 }]}>
            {M.ALL_DAYS.map((i) => (
              <Text key={i} style={[S.tiny, { flex: 1, textAlign: "center", fontWeight: "700" }]}>
                {M.DOW_LETTER[i]}
              </Text>
            ))}
          </View>

          {types.map((ty) => (
            <View key={ty.id} style={[S.row, { marginBottom: 4 }]}>
              <Text style={{ width: 92, fontSize: 12, color: C.ink }} numberOfLines={1}>
                {ty.name || "Untitled"}
              </Text>
              {M.ALL_DAYS.map((i) => {
                const on = M.planTypes(plan, i).includes(ty.id);
                return (
                  <Pressable key={i} onPress={() => togglePlan(i, ty.id)}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
                    <View style={{
                      width: 26, height: 26, borderRadius: 7, borderWidth: 1,
                      borderColor: on ? C.good : C.rule,
                      backgroundColor: on ? C.good : C.card,
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Text style={{ color: on ? "#fff" : "transparent", fontSize: 12, fontWeight: "700" }}>✓</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------- category editor -- */

function CategoryEditor({ state, update, onClose, nextOrder }) {
  const existing = state?.cat;
  const [form, setForm] = useState(null);
  const [seeded, setSeeded] = useState(null);
  const key = state ? (existing?.id || "new") : null;
  if (state && seeded !== key) {
    setSeeded(key);
    setForm(existing ? { ...existing } : { name: "", emoji: "⭐", color: CATEGORY_COLORS[0], note: "" });
  }
  if (!state && seeded !== null) setSeeded(null);
  if (!state || !form) return null;

  const save = () => {
    const name = (form.name || "").trim();
    if (!name) return;
    const clean = { ...form, name, note: (form.note || "").trim() };
    update((d) => existing
      ? { ...d, categories: d.categories.map((c) => (c.id === existing.id ? { ...c, ...clean } : c)) }
      : { ...d, categories: [...d.categories, { ...clean, id: M.uid("c_"), order: nextOrder(d.categories) }] });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title={existing ? "Edit category" : "New category"}>
      <View style={[S.row, { gap: 10 }]}>
        <View style={{ width: 74 }}>
          <Text style={S.label}>Icon</Text>
          <TextInput style={[S.input, { textAlign: "center", fontSize: 18 }]} maxLength={4}
                     value={form.emoji} onChangeText={(v) => setForm((f) => ({ ...f, emoji: v }))} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.label}>Name</Text>
          <TextInput style={S.input} value={form.name} placeholder="e.g. Physical health"
                     onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
        </View>
      </View>

      <NoteField
        value={form.note}
        onChange={(v) => setForm((f) => ({ ...f, note: v }))}
        hint="Anything that belongs to the whole area rather than one target — a routine, a rule of thumb, links to the videos you follow."
        placeholder={"e.g. Warm-up routine\nhttps://youtube.com/watch?v=..."}
      />

      <Text style={[S.label, { marginTop: 12 }]}>Colour</Text>
      <View style={[S.row, { gap: 6, flexWrap: "wrap" }]}>
        {CATEGORY_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setForm((f) => ({ ...f, color: c }))}
            style={{
              width: 34, height: 34, borderRadius: 8, backgroundColor: c,
              borderWidth: form.color === c ? 3 : 0, borderColor: C.ink,
            }} />
        ))}
      </View>

      <View style={[S.row, { gap: 9, marginTop: 16 }]}>
        <Btn label="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <Btn primary label="Save" onPress={save} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ bits -- */

function Sheet({ title, onClose, children }) {
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(20,16,12,0.44)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18,
          maxHeight: "92%", paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28,
        }}>
          <Text style={[S.h1, { fontSize: 20, marginBottom: 14 }]}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* Only ever two or three options wide — the long lists became dropdowns. */
/* The model names a tone rather than a colour, so the palette stays in the
   one place that owns it. */
const TONE = { good: C.good, accent: C.accent, over: C.over };

/* Throwing away the days before you really started.

   Typed rather than picked, for the same reason the end date is, and shown
   with the count of what would actually go rather than a bare "are you sure":
   the number is the thing that tells you whether the date in the box is the
   one you meant. */
function ClearHistory({ doc, update, confirm }) {
  const [typed, setTyped] = useState("");
  const cut = M.isDateKey(typed) ? typed : "";
  const found = M.historyBefore(doc, cut);

  const logged = Object.keys(doc.log || {}).filter(M.isDateKey).sort();
  if (!logged.length) return null;

  const pretty = (k) =>
    M.parseKey(k).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  const bits = [
    found.entries ? `${found.entries} entr${found.entries === 1 ? "y" : "ies"}` : "",
    found.notes ? `${found.notes} note${found.notes === 1 ? "" : "s"}` : "",
    found.plans ? `${found.plans} planned day${found.plans === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return (
    <View style={[S.card, S.cardPad]}>
      <Text style={[S.h2, { marginBottom: 6 }]}>Clear earlier history</Text>
      <Text style={S.muted}>
        For when the first days were you trying the app out rather than counting.
        Everything up to and including the date below is removed, and the start
        date moves with it so the emptied days stop being counted as missed.
        Targets, goals and notes attached to a target are not touched.
      </Text>

      <Text style={[S.label, { marginTop: 12 }]}>Remove everything up to and including</Text>
      <View style={[S.row, { flexWrap: "wrap", marginBottom: 8 }]}>
        <Chip label="Yesterday"
              onPress={() => setTyped(M.keyOf(M.addDays(new Date(), -1)))} />
        <Chip label="Before this week"
              onPress={() => setTyped(M.keyOf(M.addDays(M.startOfWeek(new Date()), -1)))} />
        {!!typed && <Chip label="✕  Clear" onPress={() => setTyped("")} />}
      </View>
      <TextInput
        style={S.input}
        value={typed}
        onChangeText={setTyped}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[S.tiny, { marginTop: 5, color: typed && !cut ? C.warn : C.ink3 }]}>
        {!typed
          ? `You have logged ${logged.length} day${logged.length === 1 ? "" : "s"}, ${pretty(logged[0])} onwards.`
          : !cut
            ? "Not a date yet — use YYYY-MM-DD."
            : found.days
              ? `${found.days} day${found.days === 1 ? "" : "s"} would go — ${bits.join(", ")} — ${pretty(found.first)} to ${pretty(found.last)}.`
              : "Nothing recorded on or before that date."}
      </Text>

      <Btn
        danger
        disabled={!cut || !found.days}
        label={found.days ? `Delete ${found.days} day${found.days === 1 ? "" : "s"}` : "Delete"}
        onPress={() => confirm(
          `Delete everything up to ${pretty(cut)}?`,
          `${bits.join(", ")} across ${found.days} day${found.days === 1 ? "" : "s"} will be removed, ` +
          "and this cannot be undone from inside the app. Your targets and their settings stay exactly as they are. " +
          "Export a CSV first if you want a copy.",
          () => { update((d) => M.clearHistoryBefore(d, cut)); setTyped(""); },
          "Delete history"
        )}
      />
    </View>
  );
}

/* The notes box, identical for a target and for a category. It sits high in
   both forms rather than at the end: a note is a description, it belongs
   beside the name, and buried under the plan grid nobody finds it. */
const NoteField = ({ value, onChange, hint, placeholder }) => (
  <>
    <Text style={[S.label, { marginTop: 12 }]}>Notes (optional)</Text>
    <Text style={[S.tiny, { marginBottom: 6 }]}>{hint}</Text>
    <TextInput
      style={[S.input, { minHeight: 78, textAlignVertical: "top" }]}
      multiline
      value={value || ""}
      onChangeText={onChange}
      placeholder={placeholder}
      autoCapitalize="sentences"
    />
    <Text style={[S.tiny, { marginTop: 4 }]}>
      Links beginning http:// or https:// become tappable.
    </Text>
  </>
);

const Mini = ({ glyph, onPress, danger }) => (
  <Pressable onPress={onPress} hitSlop={6}
    style={({ pressed }) => [{
      width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: C.rule,
      backgroundColor: C.card, alignItems: "center", justifyContent: "center",
      opacity: pressed ? 0.6 : 1,
    }]}>
    <Text style={{ fontSize: 12, color: danger ? C.over : C.ink2 }}>{glyph}</Text>
  </Pressable>
);
