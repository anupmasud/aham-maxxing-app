/* Today — the day's ring, a week strip, and every target grouped by category. */

import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { C, S, Bar, Btn, CatHeader, Note, Ring, Seg, Stepper, Tick } from "../ui/kit";
import { LogSheet } from "../ui/LogSheet";
import { GROUP_MODES, groupTargets } from "../model/grouping";
import * as M from "../model/targets";

/* The model names a tone; the palette stays here. */
const TONE = { good: C.good, accent: C.accent, over: C.over };

const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const fmtBrief = (d) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function Today({ doc, update, day, setDay }) {
  const [editing, setEditing] = useState(null);   // { target, dayKey }
  const [planning, setPlanning] = useState(null); // { target, dayKey }
  const [noting, setNoting] = useState(null);     // { target, dayKey }

  /* The same lens Setup offers, over the same targets. Kept per screen rather
     than shared: organising is a job you do by area, and getting through the
     day can reasonably be a different one. */
  const [grouping, setGrouping] = useState("category");
  const log = doc.log || {};
  const notes = doc.notes || {};
  const targets = doc.targets || [];

  const diff = M.daysBetween(M.todayKey(), day);
  const date = M.parseKey(day);
  const score = M.dayScore(day, targets, log);

  const setLog = (fn) => update((d) => ({ ...d, log: fn(d.log || {}) }));
  const writeNote = (target, dayKey, text) =>
    update((d) => ({ ...d, notes: M.setDayNote(d.notes || {}, target.id, dayKey, text) }));

  /* Only what this day actually asks for, then arranged. Grouping the whole
     library and filtering afterwards would leave headings with nothing under
     them on a day the category is not scheduled. */
  const dueToday = targets.filter((t) => !t.archived && M.appliesOn(t, day));
  const catById = {};
  (doc.categories || []).forEach((c) => { catById[c.id] = c; });

  const groups = groupTargets({ ...doc, targets: dueToday }, grouping)
    .filter((g) => g.targets.length);

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]} keyboardShouldPersistTaps="handled">
      {/* ---- day navigation ---- */}
      <View style={[S.row, { marginBottom: 12 }]}>
        <Arrow glyph="‹" onPress={() => setDay(M.keyOf(M.addDays(date, -1)))} />
        <View style={{ flex: 1, alignItems: "center" }}>
          {/* A far-off date gets the short form as its heading, because the long
              one wraps on a phone — and the line beneath then says how far back
              you are rather than repeating the date word for word. */}
          <Text style={S.h1} numberOfLines={1}>
            {diff === 0 ? "Today" : diff === -1 ? "Yesterday" : diff === 1 ? "Tomorrow" : fmtBrief(date)}
          </Text>
          <Text style={[S.tiny, { marginTop: 2 }]}>
            {Math.abs(diff) <= 1
              ? fmtDay(date)
              : `${diff < 0 ? `${-diff} days ago` : `in ${diff} days`} · ${
                  date.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`}
          </Text>
        </View>
        <Arrow glyph="›" onPress={() => setDay(M.keyOf(M.addDays(date, 1)))} />
      </View>

      {/* ---- score ---- */}
      <View style={[S.card, S.cardPad, S.row, { gap: 15 }]}>
        <Ring pct={score.pct}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: C.ink }}>
            {score.due ? `${Math.round(score.pct * 100)}%` : "—"}
          </Text>
          <Text style={{ fontSize: 10, color: C.ink3 }}>
            {score.due ? `${score.done} of ${score.due}` : "nothing due"}
          </Text>
        </Ring>

        <View style={{ flex: 1 }}>
          <WeekStrip doc={doc} day={day} setDay={setDay} />
          {score.limits > 0 && (
            <Text style={[S.muted, { marginTop: 8 }]}>
              <Text style={{ color: score.broken ? C.over : C.good, fontWeight: "700" }}>
                {score.broken ? `${score.broken} limit${score.broken > 1 ? "s" : ""} over` : "Limits: all clear"}
              </Text>
              {`  ·  ${score.limits} tracked`}
            </Text>
          )}
        </View>
      </View>

      {/* ---- targets ---- */}
      {M.isFuture(day) && (
        <Text style={[S.muted, { textAlign: "center", marginBottom: 12, color: C.warn }]}>
          A day still to come. Dashed outlines are what the plan asks for — you can
          tick them off when it arrives.
        </Text>
      )}

      {groups.length === 0 && (
        <Text style={S.empty}>Nothing scheduled for this day.{"\n"}Add targets in Setup.</Text>
      )}

      {/* Worth offering only once there is enough here for the arrangement to
          make a difference. */}
      {dueToday.length > 3 && (
        <View style={[S.row, { gap: 6, marginBottom: 12 }]}>
          {GROUP_MODES.map((m) => (
            <Seg key={m.id} on={grouping === m.id} label={m.label} sub={m.sub}
                 onPress={() => setGrouping(m.id)} />
          ))}
        </View>
      )}

      {groups.map((g) => {
        const rows = g.targets;
        const cat = g.catId ? catById[g.catId] : null;
        const done = rows.filter((t) => M.progress(t, day, log).met).length;
        return (
          <View key={g.id} style={S.card}>
            <CatHeader
              cat={{ name: g.name, emoji: g.emoji, color: g.color || TONE[g.tone] }}
              right={<Text style={S.tiny}>{done}/{rows.length}</Text>}
            />
            {/* Whatever belongs to the whole area — the warm-up everything here
                starts with, the videos you follow — read before the first row
                rather than repeated on each one. Only a real category has one. */}
            {!!cat && (
              <Note text={cat.note} full style={{ paddingHorizontal: 13, paddingTop: 9, marginTop: 0 }} />
            )}
            {rows.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <View style={S.rule} />}
                {M.isFuture(day) ? (
                  <PlannedRow t={t} day={day} plans={doc.plans}
                              badge={!g.catId ? (catById[t.catId] || {}).emoji : ""}
                              onPress={() => setPlanning({ target: t, dayKey: day })} />
                ) : M.hasTypes(t) ? (
                  <TypedRow
                    t={t} day={day} log={log}
                    badge={!g.catId ? (catById[t.catId] || {}).emoji : ""}
                    note={M.dayNote(notes, t.id, day)}
                    onNote={() => setNoting({ target: t, dayKey: day })}
                    onToggleType={(id) => setLog((l) => M.toggleType(l, t, day, id))}
                  />
                ) : (
                  <TargetRow
                    t={t} day={day} log={log}
                    badge={!g.catId ? (catById[t.catId] || {}).emoji : ""}
                    note={M.dayNote(notes, t.id, day)}
                    onNote={() => setNoting({ target: t, dayKey: day })}
                    onToggle={() => setLog((l) => M.toggle(l, t, day))}
                    onStep={(delta) => setLog((l) => M.step(l, t, day, delta))}
                    onEdit={() => setEditing({ target: t, dayKey: day })}
                  />
                )}
              </View>
            ))}
          </View>
        );
      })}

      <PlanSheet
        state={planning}
        doc={doc}
        update={update}
        onClose={() => setPlanning(null)}
      />

      <LogSheet
        target={editing?.target}
        dayKey={editing?.dayKey}
        log={log}
        note={editing ? M.dayNote(notes, editing.target.id, editing.dayKey) : ""}
        onChangeNote={(text) => editing && writeNote(editing.target, editing.dayKey, text)}
        onChangeLog={(next) => setLog(() => next)}
        onClose={() => setEditing(null)}
      />

      <DayNoteSheet
        state={noting}
        note={noting ? M.dayNote(notes, noting.target.id, noting.dayKey) : ""}
        onSave={(text) => writeNote(noting.target, noting.dayKey, text)}
        onClose={() => setNoting(null)}
      />
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ rows -- */

function TargetRow({ t, day, log, note, badge, onNote, onToggle, onStep, onEdit }) {
  const p = M.progress(t, day, log);
  const today = M.valueOn(log, t.id, day);
  const weekly = t.period === "week";
  const ceiling = t.dir === "at_most";

  let meta;
  if (t.kind === "tick" && !weekly) {
    meta = p.met ? <Text style={{ color: C.good, fontWeight: "600" }}>Done</Text> : "Not yet";
  } else if (weekly) {
    const label = `${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)}${t.unit ? " " + t.unit : ""} this week`;
    meta = (
      <>
        <Text style={{ color: p.over ? C.over : p.met && !ceiling ? C.good : C.ink2, fontWeight: p.over || p.met ? "600" : "400" }}>
          {label}
        </Text>
        {ceiling ? (p.over ? " · over" : " · within limit") : ""}
        {today ? ` · ${M.fmtNum(today)} today` : ""}
      </>
    );
  } else {
    meta = (
      <>
        <Text style={{ color: p.over ? C.over : p.met && !ceiling ? C.good : C.ink2, fontWeight: p.over || p.met ? "600" : "400" }}>
          {`${M.fmtNum(p.total)} / ${M.fmtNum(p.goal)}${t.unit ? " " + t.unit : ""}`}
        </Text>
        {ceiling ? " max" : ""}
      </>
    );
  }

  return (
    <View style={[S.row, { paddingVertical: 11, paddingHorizontal: 13, gap: 11 }]}>
      <Tick
        on={ceiling ? !p.over : p.met}
        over={ceiling && p.over}
        disabled={ceiling}
        onPress={onToggle}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, color: p.met && !ceiling ? C.ink2 : C.ink }}>
          {/* Grouped by cadence the heading no longer says which area this is,
              so the row carries its category's mark. */}
          {badge ? `${badge}  ` : ""}{t.name}
        </Text>
        <Text style={[S.tiny, { marginTop: 2 }]}>{meta}</Text>
        {(t.kind === "amount" || weekly) && (
          <Bar ratio={p.ratio} over={p.over} warn={ceiling && p.ratio > 0.75} />
        )}
        <Note text={t.note} />
        <DayNote text={note} onPress={onNote} />
      </View>
      {t.kind === "amount" && (
        <Stepper
          label={M.fmtNum(today)}
          onLess={() => onStep(-1)}
          onMore={() => onStep(1)}
          onPress={onEdit}
        />
      )}
      <NoteButton on={!!note} onPress={onNote} />
    </View>
  );
}

/* What you wrote about this target on this day, shown where you can read it
   without opening anything. Tapping it reopens the note to change it.

   Set apart from the target's own notes by the accent rule and by being
   italic: one is a standing instruction, the other is what happened once,
   and a row that shows both should not read as two halves of one sentence. */
function DayNote({ text, onPress }) {
  if (!text) return null;
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <View style={{ flexDirection: "row", gap: 7, marginTop: 5 }}>
        <View style={{ width: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: C.accent }} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: C.ink2, fontStyle: "italic" }}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

/* Quiet until it has something in it. A row with nothing written on it should
   not be shouting about the possibility.

   A pencil rather than a plus: an amount row already has a stepper whose "+"
   sits directly beside this, and two plus signs in a row is a question about
   which one adds what. */
function NoteButton({ on, onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}
      style={({ pressed }) => [{
        width: 30, height: 30, borderRadius: 8, borderWidth: 1,
        borderColor: on ? C.accent : C.ruleSoft,
        backgroundColor: on ? C.card : "transparent",
        alignItems: "center", justifyContent: "center",
        opacity: pressed ? 0.55 : 1,
      }]}>
      <Text style={{ fontSize: 13, color: on ? C.accent : C.ink3 }}>✎</Text>
    </Pressable>
  );
}

/* Writing about one target on one day. Deliberately its own sheet rather than
   part of logging: most of these are written on days the thing did not happen,
   which is exactly when there is no number to type. */
function DayNoteSheet({ state, note, onSave, onClose }) {
  const [text, setText] = useState("");
  const [seeded, setSeeded] = useState(null);
  const key = state ? `${state.target.id}:${state.dayKey}` : null;
  if (state && seeded !== key) { setSeeded(key); setText(note || ""); }
  if (!state && seeded !== null) setSeeded(null);
  if (!state) return null;

  const save = () => { onSave(text); onClose(); };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(20,16,12,0.44)", justifyContent: "flex-end" }}>
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: C.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18,
            padding: 18, paddingBottom: 30,
          }}>
          <Text style={[S.h1, { fontSize: 20, marginBottom: 3 }]}>{state.target.name}</Text>
          <Text style={[S.muted, { marginBottom: 14 }]}>
            {M.parseKey(state.dayKey).toLocaleDateString(undefined,
              { weekday: "long", day: "numeric", month: "long" })}
          </Text>

          {/* The standing note, if there is one, so you can write against it. */}
          <Note text={state.target.note} full style={{ marginTop: 0, marginBottom: 14 }} />

          <Text style={S.label}>How did it go?</Text>
          <TextInput
            style={[S.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Anything worth remembering about today — how it felt, what you changed, why you skipped it."
          />
          <Text style={[S.tiny, { marginTop: 5 }]}>
            Kept against this day only. Clear the box to remove it.
          </Text>

          <View style={[S.row, { gap: 9, marginTop: 14 }]}>
            <Btn label="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <Btn primary label="Save" onPress={save} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* A day that has not happened yet. It shows what the plan asked for and
   nothing else — no circle to tap, because recording a session before it has
   happened would put work into the week's totals that nobody has done. */
function PlannedRow({ t, day, plans, badge, onPress }) {
  const p = M.planFor(t, day, plans);

  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [S.row, {
        paddingVertical: 11, paddingHorizontal: 13, gap: 11,
        opacity: pressed ? 0.6 : p.planned ? 1 : 0.5,
      }]}>
      <View style={{
        width: 27, height: 27, borderRadius: 14, borderWidth: 2, borderStyle: "dashed",
        borderColor: p.planned ? C.ink2 : C.rule,
      }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, color: C.ink }}>{badge ? `${badge}  ` : ""}{t.name}</Text>
        <Text style={[S.tiny, { marginTop: 2 }]}>
          {p.planned
            ? (p.types.length ? `Planned: ${p.types.map((id) => M.typeName(t, id)).join(", ")}` : "Planned")
            : M.describe(t)}
          {p.source === "override" ? " · this week only" : p.source === "recurring" ? " · every week" : ""}
        </Text>
      </View>
      <Text style={{ fontSize: 20, color: C.ink3 }}>›</Text>
    </Pressable>
  );
}

/* A target with types: the weekly total, then one chip per type. Chips the
   plan asked for today are outlined, so the row reads as "here is what you
   said you would do" before it reads as a list of options. */
function TypedRow({ t, day, log, note, badge, onNote, onToggleType }) {
  const p = M.progress(t, day, log);
  const done = M.typesOn(log, t.id, day);
  const planned = M.plannedOn(t, day);

  return (
    <View style={{ paddingVertical: 11, paddingHorizontal: 13 }}>
      <View style={[S.row, { gap: 11 }]}>
        <Tick on={p.met} onPress={() => {}} disabled />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, color: p.met ? C.ink2 : C.ink }}>
            {badge ? `${badge}  ` : ""}{t.name}
          </Text>
          <Text style={[S.tiny, { marginTop: 2 }]}>
            <Text style={{ color: p.met ? C.good : C.ink2, fontWeight: p.met ? "600" : "400" }}>
              {`${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)} this week`}
            </Text>
            {planned.length ? `  ·  ${planned.length} planned today` : ""}
          </Text>
          <Bar ratio={p.ratio} />
          <Note text={t.note} />
          <DayNote text={note} onPress={onNote} />
        </View>
        <NoteButton on={!!note} onPress={onNote} />
      </View>

      <View style={[S.row, { flexWrap: "wrap", marginTop: 9, marginLeft: 38 }]}>
        {t.types.map((ty) => {
          const on = done.includes(ty.id);
          const isPlanned = planned.includes(ty.id);
          const tp = M.typeProgress(t, ty, day, log);
          return (
            <Pressable
              key={ty.id}
              onPress={() => onToggleType(ty.id)}
              style={({ pressed }) => [{
                flexDirection: "row", alignItems: "center", gap: 5,
                borderWidth: isPlanned && !on ? 1.5 : 1,
                borderStyle: isPlanned && !on ? "dashed" : "solid",
                borderColor: on ? C.good : isPlanned ? C.ink2 : C.rule,
                backgroundColor: on ? C.good : "transparent",
                borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11,
                marginRight: 6, marginBottom: 6, opacity: pressed ? 0.6 : 1,
              }]}
            >
              <Text style={{ fontSize: 12.5, fontWeight: "600", color: on ? "#fff" : C.ink }}>
                {ty.name}
              </Text>
              {!!ty.goal && (
                <Text style={{ fontSize: 10.5, color: on ? "rgba(255,255,255,0.85)" : tp.met ? C.good : C.ink3 }}>
                  {tp.total}/{ty.goal}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ----------------------------------------------------------- week strip -- */

function WeekStrip({ doc, day, setDay }) {
  const monday = M.startOfWeek(M.parseKey(day));
  const keys = M.weekKeys(monday);
  const today = M.todayKey();

  return (
    <View style={[S.row, { gap: 5 }]}>
      {keys.map((k, i) => {
        const s = M.dayScore(k, doc.targets || [], doc.log || {});
        const broken = M.dayLimitsBroken(k, doc.targets || [], doc.log || {});
        const future = M.isFuture(k);
        return (
          <Pressable key={k} onPress={() => setDay(k)} style={{ flex: 1, opacity: future ? 0.4 : 1 }}>
            <Text style={[S.tiny, { textAlign: "center", fontWeight: "700", marginBottom: 4 }]}>
              {M.DOW_LETTER[i]}
            </Text>
            <View style={{
              height: 26, borderRadius: 7, backgroundColor: C.ruleSoft, overflow: "hidden",
              justifyContent: "flex-end",
              borderWidth: k === today ? 2 : k === day ? 2 : 0,
              borderColor: k === today ? C.ink : C.accent,
            }}>
              <View style={{
                height: `${Math.round(s.pct * 100)}%`,
                backgroundColor: broken ? C.over : C.good,
              }} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* Planning a future day, and the question that makes it worth having:
   is this just this week, or the way the week normally goes? Asking once, at
   the moment of planning, is far less work than keeping a rhythm and a diary
   as separate ideas people have to hold in their heads. */
function PlanSheet({ state, doc, update, onClose }) {
  if (!state) return null;
  const { target: t, dayKey } = state;
  const p = M.planFor(t, dayKey, doc.plans);
  const weekday = M.DOW[M.dow(M.parseKey(dayKey))];

  const setOnce = (value) =>
    update((d) => ({ ...d, plans: M.setPlanOverride(d.plans || {}, t, dayKey, value) }));

  const setEveryWeek = (on) =>
    update((d) => ({
      ...d,
      // Clearing the one-off too, or the rhythm would be overruled on this very
      // date by the thing it was meant to replace.
      plans: M.setPlanOverride(d.plans || {}, t, dayKey, null),
      targets: d.targets.map((x) =>
        x.id === t.id ? M.setPlannedDay(x, M.dow(M.parseKey(dayKey)), on) : x),
    }));

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(20,16,12,0.44)", justifyContent: "flex-end" }}>
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: C.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18,
            padding: 18, paddingBottom: 30,
          }}>
          <Text style={[S.h1, { fontSize: 20, marginBottom: 3 }]}>{t.name}</Text>
          <Text style={[S.muted, { marginBottom: 16 }]}>
            {M.parseKey(dayKey).toLocaleDateString(undefined,
              { weekday: "long", day: "numeric", month: "long" })}
            {p.planned ? `  ·  currently planned ${p.source === "override" ? "this week only" : "every week"}` : ""}
          </Text>

          {!p.planned ? (
            <>
              <Btn primary label="Plan it, just this week" onPress={() => { setOnce(true); onClose(); }} />
              <Btn label={`Plan it every ${weekday}`} onPress={() => { setEveryWeek(true); onClose(); }} />
            </>
          ) : p.source === "recurring" ? (
            <>
              <Text style={[S.muted, { marginBottom: 8 }]}>
                This comes from the weekly rhythm, so it appears every {weekday}.
              </Text>
              <Btn label="Skip it just this week" onPress={() => { setOnce(false); onClose(); }} />
              <Btn danger label={`Stop planning it on ${weekday}s`}
                   onPress={() => { setEveryWeek(false); onClose(); }} />
            </>
          ) : (
            <>
              <Btn label="Unplan it" onPress={() => { setOnce(null); onClose(); }} />
              <Btn label={`Make it every ${weekday}`} onPress={() => { setEveryWeek(true); onClose(); }} />
            </>
          )}

          <Btn label="Cancel" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Arrow({ glyph, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10}
      style={({ pressed }) => [{ width: 40, height: 40, alignItems: "center", justifyContent: "center",
                                 opacity: disabled ? 0.25 : pressed ? 0.5 : 1 }]}>
      <Text style={{ fontSize: 28, color: C.ink2, lineHeight: 32 }}>{glyph}</Text>
    </Pressable>
  );
}
