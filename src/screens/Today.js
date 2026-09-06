/* Today — the day's ring, a week strip, and every target grouped by category. */

import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { C, S, Bar, Btn, CatHeader, Ring, Stepper, Tick } from "../ui/kit";
import * as M from "../model/targets";

const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

export default function Today({ doc, update, day, setDay }) {
  const [editing, setEditing] = useState(null);   // { target, dayKey }
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
          <Text style={S.h1}>
            {diff === 0 ? "Today" : diff === -1 ? "Yesterday" : diff === 1 ? "Tomorrow" : fmtDay(date)}
          </Text>
          <Text style={[S.tiny, { marginTop: 2 }]}>{fmtDay(date)}</Text>
        </View>
        <Arrow glyph="›" onPress={() => setDay(M.keyOf(M.addDays(date, 1)))} disabled={diff >= 0} />
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
                <TargetRow
                  t={t} day={day} log={log}
                  onToggle={() => setLog((l) => M.toggle(l, t, day))}
                  onStep={(delta) => setLog((l) => M.step(l, t, day, delta))}
                  onEdit={() => setEditing({ target: t, dayKey: day })}
                />
              </View>
            ))}
          </View>
        );
      })}

      <AmountModal
        editing={editing}
        log={log}
        onClose={() => setEditing(null)}
        onSave={(value) => {
          setLog((l) => M.setValue(l, editing.target.id, editing.dayKey,
            editing.target.kind === "tick" ? (value ? true : 0) : value));
          setEditing(null);
        }}
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

/* --------------------------------------------------------------- modal --- */

function AmountModal({ editing, log, onClose, onSave }) {
  const [text, setText] = useState("");
  const t = editing?.target;

  // Seed the field each time a different row is opened.
  const key = editing ? `${t.id}:${editing.dayKey}` : null;
  const [seeded, setSeeded] = useState(null);
  if (editing && seeded !== key) {
    const v = M.valueOn(log, t.id, editing.dayKey);
    setSeeded(key);
    setText(v ? String(v) : "");
  }
  if (!editing && seeded !== null) setSeeded(null);

  if (!editing) return null;

  const quick = [...new Set([t.step, t.goal, M.round2(t.goal / 2)].filter((n) => n > 0))].sort((a, b) => a - b);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(20,16,12,0.44)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: C.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 30 }}
        >
          <Text style={[S.h1, { fontSize: 20, marginBottom: 4 }]}>{t.name}</Text>
          <Text style={[S.muted, { marginBottom: 14 }]}>
            {M.parseKey(editing.dayKey).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            {"  ·  "}{M.describe(t)}
          </Text>

          <Text style={S.label}>Logged{t.unit ? ` (${t.unit})` : ""}</Text>
          <TextInput
            style={S.input}
            keyboardType="decimal-pad"
            value={text}
            onChangeText={setText}
            placeholder="0"
            autoFocus
          />

          <View style={[S.row, { flexWrap: "wrap", marginTop: 10, gap: 7 }]}>
            <Btn small label="Clear" onPress={() => setText("")} />
            {quick.map((q) => (
              <Btn key={q} small label={`${M.fmtNum(q)}${t.unit ? " " + t.unit : ""}`} onPress={() => setText(String(q))} />
            ))}
          </View>

          <View style={[S.row, { gap: 9, marginTop: 16 }]}>
            <Btn label="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <Btn
              primary label="Save" style={{ flex: 1 }}
              onPress={() => {
                const n = Number(text);
                onSave(!text || isNaN(n) || n <= 0 ? 0 : M.round2(n));
              }}
            />
          </View>
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
