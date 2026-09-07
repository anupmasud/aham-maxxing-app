/* Today — the day's ring, a week strip, and every target grouped by category. */

import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { C, S, Bar, Btn, CatHeader, Note, Ring, Stepper, Tick } from "../ui/kit";
import { LogSheet } from "../ui/LogSheet";
import * as M from "../model/targets";

const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const fmtBrief = (d) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function Today({ doc, update, day, setDay }) {
  const [editing, setEditing] = useState(null);   // { target, dayKey }
  const [planning, setPlanning] = useState(null); // { target, dayKey }
  const log = doc.log || {};
  const targets = doc.targets || [];

  const diff = M.daysBetween(M.todayKey(), day);
  const date = M.parseKey(day);
  const score = M.dayScore(day, targets, log);

  const setLog = (fn) => update((d) => ({ ...d, log: fn(d.log || {}) }));

  const cats = (doc.categories || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => ({
      cat,
      rows: targets
        .filter((t) => t.catId === cat.id && !t.archived && M.appliesOn(t, day))
        .sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.rows.length);

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

      {cats.length === 0 && (
        <Text style={S.empty}>Nothing scheduled for this day.{"\n"}Add targets in Setup.</Text>
      )}

      {cats.map(({ cat, rows }) => {
        const done = rows.filter((t) => M.progress(t, day, log).met).length;
        return (
          <View key={cat.id} style={S.card}>
            <CatHeader
              cat={cat}
              right={<Text style={S.tiny}>{done}/{rows.length}</Text>}
            />
            {rows.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <View style={S.rule} />}
                {M.isFuture(day) ? (
                  <PlannedRow t={t} day={day} plans={doc.plans}
                              onPress={() => setPlanning({ target: t, dayKey: day })} />
                ) : M.hasTypes(t) ? (
                  <TypedRow
                    t={t} day={day} log={log}
                    onToggleType={(id) => setLog((l) => M.toggleType(l, t, day, id))}
                  />
                ) : (
                  <TargetRow
                    t={t} day={day} log={log}
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
        onChangeLog={(next) => setLog(() => next)}
        onClose={() => setEditing(null)}
      />
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ rows -- */

function TargetRow({ t, day, log, onToggle, onStep, onEdit }) {
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
        <Text style={{ fontSize: 14.5, color: p.met && !ceiling ? C.ink2 : C.ink }}>{t.name}</Text>
        <Text style={[S.tiny, { marginTop: 2 }]}>{meta}</Text>
        {(t.kind === "amount" || weekly) && (
          <Bar ratio={p.ratio} over={p.over} warn={ceiling && p.ratio > 0.75} />
        )}
        <Note text={t.note} />
      </View>
      {t.kind === "amount" && (
        <Stepper
          label={M.fmtNum(today)}
          onLess={() => onStep(-1)}
          onMore={() => onStep(1)}
          onPress={onEdit}
        />
      )}
    </View>
  );
}

/* A day that has not happened yet. It shows what the plan asked for and
   nothing else — no circle to tap, because recording a session before it has
   happened would put work into the week's totals that nobody has done. */
function PlannedRow({ t, day, plans, onPress }) {
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
        <Text style={{ fontSize: 14.5, color: C.ink }}>{t.name}</Text>
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
function TypedRow({ t, day, log, onToggleType }) {
  const p = M.progress(t, day, log);
  const done = M.typesOn(log, t.id, day);
  const planned = M.plannedOn(t, day);

  return (
    <View style={{ paddingVertical: 11, paddingHorizontal: 13 }}>
      <View style={[S.row, { gap: 11 }]}>
        <Tick on={p.met} onPress={() => {}} disabled />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, color: p.met ? C.ink2 : C.ink }}>{t.name}</Text>
          <Text style={[S.tiny, { marginTop: 2 }]}>
            <Text style={{ color: p.met ? C.good : C.ink2, fontWeight: p.met ? "600" : "400" }}>
              {`${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)} this week`}
            </Text>
            {planned.length ? `  ·  ${planned.length} planned today` : ""}
          </Text>
          <Bar ratio={p.ratio} />
          <Note text={t.note} />
        </View>
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
