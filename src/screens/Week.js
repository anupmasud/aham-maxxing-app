/* Week — the whole week as a grid, targets × days. Every cell is editable. */

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { C, S } from "../ui/kit";
import * as M from "../model/targets";

const fmtShort = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function Week({ doc, update, day, setDay }) {
  const [monday, setMonday] = useState(M.keyOf(M.startOfWeek(M.parseKey(day))));
  const keys = M.weekKeys(M.parseKey(monday));
  const thisMonday = M.keyOf(M.startOfWeek(new Date()));
  const offset = Math.round(M.daysBetween(thisMonday, monday) / 7);

  const log = doc.log || {};
  const setLog = (fn) => update((d) => ({ ...d, log: fn(d.log || {}) }));

  const groups = (doc.categories || [])
    .slice().sort((a, b) => a.order - b.order)
    .map((cat) => ({
      cat,
      rows: (doc.targets || []).filter((t) => t.catId === cat.id && !t.archived).sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.rows.length);

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]}>
      <View style={[S.row, { marginBottom: 14 }]}>
        <Arrow glyph="‹" onPress={() => setMonday(M.keyOf(M.addDays(M.parseKey(monday), -7)))} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={S.h1}>
            {offset === 0 ? "This week" : offset === -1 ? "Last week" : offset === 1 ? "Next week"
              : `Week of ${fmtShort(M.parseKey(monday))}`}
          </Text>
          <Text style={[S.tiny, { marginTop: 2 }]}>
            {fmtShort(M.parseKey(keys[0]))} – {fmtShort(M.parseKey(keys[6]))}
          </Text>
        </View>
        <Arrow glyph="›" disabled={offset >= 0}
               onPress={() => setMonday(M.keyOf(M.addDays(M.parseKey(monday), 7)))} />
      </View>

      {groups.length === 0 && <Text style={S.empty}>No targets yet. Add some in Setup.</Text>}

      {groups.map(({ cat, rows }) => (
        <View key={cat.id} style={{ marginBottom: 18 }}>
          <View style={[S.row, { gap: 7, marginBottom: 7 }]}>
            <Text style={{ fontSize: 14 }}>{cat.emoji}</Text>
            <Text style={S.h2}>{cat.name}</Text>
          </View>

          <View style={[S.row, { paddingLeft: 108 }]}>
            {keys.map((k, i) => (
              <View key={k} style={{ flex: 1, alignItems: "center" }}>
                <Text style={[S.tiny, { fontWeight: "700", color: k === M.todayKey() ? C.ink : C.ink3 }]}>
                  {M.DOW_LETTER[i]}
                </Text>
              </View>
            ))}
          </View>

          {rows.map((t) => (
            <Row key={t.id} t={t} keys={keys} log={log} setLog={setLog} setDay={setDay} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function Row({ t, keys, log, setLog, setDay }) {
  const p = M.progress(t, keys[0], log);
  const ceiling = t.dir === "at_most";

  let goalLabel, goalColor = C.ink3;
  if (t.period === "week") {
    goalLabel = ceiling
      ? `${M.fmtNum(p.total)} / ${M.fmtNum(p.goal)}${t.unit ? " " + t.unit : ""} max`
      : `${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)}${t.unit ? " " + t.unit : ""}`;
    goalColor = p.over ? C.over : p.met && !ceiling ? C.good : C.ink3;
  } else {
    const sched = keys.filter((k) => M.appliesOn(t, k) && !M.isFuture(k));
    const hits = sched.filter((k) => M.progress(t, k, log).met).length;
    goalLabel = `${ceiling ? "max " : ""}${M.fmtNum(t.goal)}${t.unit ? " " + t.unit : ""}/day · ${hits}/${sched.length}`;
    goalColor = sched.length && hits === sched.length ? C.good : C.ink3;
  }

  return (
    <View style={[S.row, { paddingVertical: 4 }]}>
      <View style={{ width: 104, paddingRight: 6 }}>
        <Text style={{ fontSize: 13, color: C.ink }} numberOfLines={2}>{t.name}</Text>
        <Text style={{ fontSize: 10, color: goalColor, marginTop: 1 }} numberOfLines={1}>{goalLabel}</Text>
      </View>
      {keys.map((k) => (
        <Cell key={k} t={t} dayKey={k} log={log} setLog={setLog} setDay={setDay} />
      ))}
    </View>
  );
}

function Cell({ t, dayKey, log, setLog, setDay }) {
  const applies = M.appliesOn(t, dayKey);
  const v = M.valueOn(log, t.id, dayKey);
  const future = M.isFuture(dayKey);
  const today = dayKey === M.todayKey();

  if (!applies) {
    return (
      <View style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: C.ruleSoft, opacity: 0.5 }} />
      </View>
    );
  }

  let bg = C.card, border = C.ruleSoft, fg = C.ink3, label = "";

  if (t.kind === "tick") {
    if (v) { bg = C.good; border = C.good; fg = "#fff"; label = "✓"; }
  } else if (v) {
    // Round to a whole "k" only above 10k; below that, rounding could show
    // 7,500 steps as "8k" against an 8,000 goal, which reads as a hit.
    label = v >= 10000 ? `${Math.round(v / 1000)}k`
          : v >= 1000 ? `${(Math.floor(v / 100) / 10).toFixed(1).replace(/\.0$/, "")}k`
          : M.fmtNum(v);
    if (t.dir === "at_most") {
      const over = t.period === "day" ? v > t.goal : M.progress(t, dayKey, log).over;
      if (over) { bg = C.over; border = C.over; fg = "#fff"; }
      else { bg = C.goodSoft; border = C.good; fg = C.good; }
    } else if (t.period === "day" && v >= t.goal) {
      bg = C.good; border = C.good; fg = "#fff";
    } else {
      bg = C.goodSoft; border = C.good; fg = C.good;
    }
  }

  return (
    <Pressable
      onPress={() => {
        if (t.kind === "tick") setLog((l) => M.toggle(l, t, dayKey));
        else setDay(dayKey);           // amounts are edited on Today, where there is room
      }}
      style={{ flex: 1, alignItems: "center", paddingVertical: 2, opacity: future ? 0.4 : 1 }}
    >
      <View style={{
        width: 30, height: 30, borderRadius: 8, borderWidth: today ? 2 : 1,
        borderColor: today ? C.ink : border, backgroundColor: bg,
        alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 10.5, fontWeight: "700", color: fg }}>{label}</Text>
      </View>
    </Pressable>
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
