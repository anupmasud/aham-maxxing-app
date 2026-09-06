/* Setup — categories, targets, reminders and the Drive connection. */

import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { C, S, Btn, CatHeader, Chip, Confirm, Select } from "../ui/kit";
import * as M from "../model/targets";
import { CATEGORY_COLORS, SUGGESTIONS, UNITS } from "../model/seed";
import { CONFIG } from "../config";

export default function Setup({ doc, update, user, folderUrl, sheetUrl, signOut, disconnect }) {
  const [editTarget, setEditTarget] = useState(null);   // { target } | { catId }
  const [editCat, setEditCat] = useState(null);         // { cat } | {}
  const [confirming, setConfirming] = useState(null);   // { title, message, onConfirm }

  const cats = (doc.categories || []).slice().sort((a, b) => a.order - b.order);
  const targetsIn = (id) => (doc.targets || []).filter((t) => t.catId === id).sort((a, b) => a.order - b.order);

  const nextOrder = (list) => (list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0);

  const addSuggestion = (catId, s) =>
    update((d) => ({
      ...d,
      targets: [...d.targets, {
        ...s, id: M.uid("t_"), catId, archived: false,
        days: [...M.ALL_DAYS], order: nextOrder(d.targets.filter((t) => t.catId === catId)),
      }],
    }));

  const confirm = (title, message, onConfirm) => setConfirming({ title, message, onConfirm });

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]} keyboardShouldPersistTaps="handled">
      <View style={[S.row, { marginBottom: 14 }]}>
        <Text style={[S.h1, { flex: 1 }]}>Setup</Text>
        <Btn small label="+ Category" onPress={() => setEditCat({})} />
      </View>

      {cats.map((cat) => {
        const ts = targetsIn(cat.id);
        const used = new Set(ts.map((t) => t.name.toLowerCase()));
        const chips = (SUGGESTIONS[cat.id] || []).filter((s) => !used.has(s.name.toLowerCase()));
        return (
          <View key={cat.id} style={S.card}>
            <CatHeader cat={cat} right={
              <View style={[S.row, { gap: 4 }]}>
                <Mini glyph="✎" onPress={() => setEditCat({ cat })} />
                <Mini glyph="✕" danger onPress={() => confirm(
                  `Delete "${cat.name}"?`,
                  ts.length ? `Its ${ts.length} target${ts.length > 1 ? "s" : ""} and their history go too.` : "",
                  () => update((d) => {
                    const ids = new Set(d.targets.filter((t) => t.catId === cat.id).map((t) => t.id));
                    const log = {};
                    Object.entries(d.log || {}).forEach(([k, v]) => {
                      const day = Object.fromEntries(Object.entries(v).filter(([id]) => !ids.has(id)));
                      if (Object.keys(day).length) log[k] = day;
                    });
                    return {
                      ...d, log,
                      categories: d.categories.filter((c) => c.id !== cat.id),
                      targets: d.targets.filter((t) => t.catId !== cat.id),
                    };
                  })
                )} />
              </View>
            } />

            {ts.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <View style={S.rule} />}
                <View style={[S.row, { paddingVertical: 10, paddingHorizontal: 13, gap: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 14, color: t.archived ? C.ink3 : C.ink,
                      textDecorationLine: t.archived ? "line-through" : "none",
                    }}>{t.name}</Text>
                    <Text style={[S.tiny, { marginTop: 2 }]}>
                      {M.describe(t)}{t.archived ? " · paused" : ""}
                    </Text>
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
                      return { ...d, log, targets: d.targets.filter((x) => x.id !== t.id) };
                    })
                  )} />
                </View>
              </View>
            ))}

            <View style={{ paddingHorizontal: 13, paddingBottom: 12, paddingTop: ts.length ? 8 : 0 }}>
              <View style={[S.row, { flexWrap: "wrap" }]}>
                <Chip label="+ New target" onPress={() => setEditTarget({ catId: cat.id })} />
                {chips.map((s) => (
                  <Chip key={s.name} label={`+ ${s.name}`} onPress={() => addSuggestion(cat.id, s)} />
                ))}
              </View>
            </View>
          </View>
        );
      })}

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
    </ScrollView>
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

function TargetEditor({ state, doc, update, onClose, nextOrder }) {
  const existing = state?.target;
  const [form, setForm] = useState(null);

  const key = state ? (existing?.id || `new:${state.catId}`) : null;
  const [seeded, setSeeded] = useState(null);
  if (state && seeded !== key) {
    setSeeded(key);
    setForm(existing ? { ...existing } : {
      name: "", catId: state.catId, kind: "tick", dir: "at_least", period: "day",
      goal: 1, unit: "", step: 1, days: [...M.ALL_DAYS], archived: false,
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
    const plan = Object.fromEntries(
      Object.entries(form.plan || {})
        .map(([d, ids]) => [d, (ids || []).filter((id) => keep.has(id))])
        .filter(([, ids]) => ids.length)
    );

    const clean = {
      ...form, name, types, plan,
      // A daily tick has no goal to set — the form hides the field, so anything
      // left in it from a previous shape of the target would be invisible.
      goal: form.kind === "tick" && form.period === "day" ? 1 : Math.max(0, Number(form.goal) || 1),
      step: Math.max(0.01, Number(form.step) || 1),
      unit: form.kind === "amount" ? form.unit : "",
      days: form.period === "week" ? [...M.ALL_DAYS] : (form.days.length ? form.days : [...M.ALL_DAYS]),
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
    plan: Object.fromEntries(
      Object.entries(plan).map(([d, ids]) => [d, (ids || []).filter((x) => x !== id)])
    ),
  });

  const togglePlan = (dayIndex, typeId) => {
    const current = plan[dayIndex] || [];
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
                const on = (plan[i] || []).includes(ty.id);
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
    setForm(existing ? { ...existing } : { name: "", emoji: "⭐", color: CATEGORY_COLORS[0] });
  }
  if (!state && seeded !== null) setSeeded(null);
  if (!state || !form) return null;

  const save = () => {
    const name = (form.name || "").trim();
    if (!name) return;
    update((d) => existing
      ? { ...d, categories: d.categories.map((c) => (c.id === existing.id ? { ...c, ...form, name } : c)) }
      : { ...d, categories: [...d.categories, { ...form, name, id: M.uid("c_"), order: nextOrder(d.categories) }] });
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
const Seg = ({ on, label, sub, onPress }) => (
  <Pressable onPress={onPress}
    style={{
      flex: 1, borderWidth: 1, borderRadius: 9, alignItems: "center",
      paddingVertical: 9, paddingHorizontal: 6,
      borderColor: on ? C.ink : C.rule, backgroundColor: on ? C.ink : C.card,
    }}>
    <Text style={{ fontSize: 13, fontWeight: "600", color: on ? C.paper : C.ink2 }}>{label}</Text>
    {!!sub && <Text style={{ fontSize: 10, color: on ? C.paper : C.ink3, opacity: 0.8, marginTop: 1 }}>{sub}</Text>}
  </Pressable>
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
