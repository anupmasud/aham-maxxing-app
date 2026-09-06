/* Insights — hit rates, streaks, limit trends and a day-by-day heatmap. */

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { C, S } from "../ui/kit";
import * as M from "../model/targets";

const RANGES = [{ d: 28, label: "4 weeks" }, { d: 84, label: "12 weeks" }, { d: 365, label: "1 year" }];

export default function Insights({ doc }) {
  const [days, setDays] = useState(28);

  const targets = M.liveTargets(doc.targets || []);
  const log = doc.log || {};
  const from = doc.createdAt ? M.keyOf(new Date(doc.createdAt)) : M.todayKey();

  /* The range never reaches back past the day you started, so early weeks do
     not read as a wall of failure you never had the chance to log. */
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = M.keyOf(M.addDays(new Date(), -i));
    if (M.daysBetween(from, k) >= 0) keys.push(k);
  }
  if (!keys.length) keys.push(M.todayKey());

  if (!targets.length) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]}>
        <Text style={S.empty}>Add some targets in Setup and the analysis builds itself.</Text>
      </ScrollView>
    );
  }

  const stat = (t) => {
    if (t.period === "week") {
      const mondays = [...new Set(keys.map((k) => M.keyOf(M.startOfWeek(M.parseKey(k)))))];
      const done = mondays.filter((m) => M.progress(t, m, log).met).length;
      return { n: mondays.length, done, pct: mondays.length ? done / mondays.length : 0, unit: "weeks" };
    }
    const sched = keys.filter((k) => M.appliesOn(t, k));
    const done = sched.filter((k) => M.progress(t, k, log).met).length;
    return { n: sched.length, done, pct: sched.length ? done / sched.length : 0, unit: "days" };
  };

  const scores = keys.map((k) => M.dayScore(k, targets, log)).filter((s) => s.due > 0);
  const avg = scores.length ? scores.reduce((a, s) => a + s.pct, 0) / scores.length : 0;
  const perfect = scores.filter((s) => s.pct >= 1 && s.broken === 0).length;

  // A ceiling's "streak" is only days you have not broken it, which is not the
  // same kind of achievement, so the headline reports floors only.
  const floors = targets.filter((t) => t.dir === "at_least");
  const best = floors.reduce((acc, t) => Math.max(acc, M.streak(t, log, from)), 0);

  const ceilings = targets.filter((t) => t.dir === "at_most");

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]}>
      <View style={[S.row, { marginBottom: 14 }]}>
        <Text style={[S.h1, { flex: 1 }]}>Insights</Text>
        <View style={[S.row, { gap: 6 }]}>
          {RANGES.map((r) => (
            <Pressable key={r.d} onPress={() => setDays(r.d)}
              style={{
                paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
                borderColor: days === r.d ? C.ink : C.rule,
                backgroundColor: days === r.d ? C.ink : "transparent",
              }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: days === r.d ? C.paper : C.ink2 }}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[S.row, { gap: 10, marginBottom: 14 }]}>
        <Stat value={`${Math.round(avg * 100)}%`} label="targets kept" />
        <Stat value={perfect} label="full days" />
        <Stat value={best} label="best streak" />
      </View>

      {/* by category */}
      <Card title="By category" sub="share of targets kept">
        {(doc.categories || []).slice().sort((a, b) => a.order - b.order).map((cat) => {
          const ts = targets.filter((t) => t.catId === cat.id);
          if (!ts.length) return null;
          const s = ts.map(stat);
          const n = s.reduce((a, x) => a + x.n, 0);
          const done = s.reduce((a, x) => a + x.done, 0);
          return (
            <BarRow key={cat.id} label={`${cat.emoji} ${cat.name}`}
                    sub={`${ts.length} target${ts.length > 1 ? "s" : ""}`}
                    pct={n ? done / n : 0} color={cat.color} />
          );
        })}
      </Card>

      {/* every floor */}
      <Card title="Targets" sub="hit rate">
        {floors.map((t) => {
          const s = stat(t);
          const st = M.streak(t, log, from);
          return (
            <BarRow key={t.id} label={t.name}
                    sub={`${s.done}/${s.n} ${s.unit}${st ? ` · streak ${st}` : ""}`}
                    pct={s.pct} color={C.good} />
          );
        })}
      </Card>

      {/* ceilings get a trend, not a hit rate: the interesting question about
          alcohol is which way the amount is moving. */}
      {ceilings.map((t) => {
        const mondays = [...new Set(keys.map((k) => M.keyOf(M.startOfWeek(M.parseKey(k)))))];
        const series = mondays.map((m) =>
          t.period === "week"
            ? M.progress(t, m, log).total
            : M.round2(M.weekKeys(M.parseKey(m)).reduce((a, k) => a + M.valueOn(log, t.id, k), 0))
        );
        const weekGoal = t.period === "week" ? t.goal : t.goal * 7;
        const kept = series.filter((v) => v <= weekGoal).length;
        const mean = series.length ? M.round2(series.reduce((a, b) => a + b, 0) / series.length) : 0;
        return (
          <Card key={t.id} title={t.name}
                sub={`${M.fmtNum(mean)} ${t.unit}/week average, limit ${M.fmtNum(weekGoal)}`}>
            <Spark series={series} goal={weekGoal} />
            <Text style={[S.muted, { marginTop: 8 }]}>
              Within the limit in <Text style={{ fontWeight: "700", color: C.ink }}>{kept} of {series.length}</Text> weeks.
            </Text>
          </Card>
        );
      })}

      <Card title="Every day" sub="Mon to Sun, week by week">
        <Heat keys={keys} targets={targets} log={log} />
      </Card>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ bits -- */

const Stat = ({ value, label }) => (
  <View style={[S.card, S.cardPad, { flex: 1, alignItems: "center", marginBottom: 0 }]}>
    <Text style={{ fontSize: 22, fontWeight: "700", color: C.ink }}>{value}</Text>
    <Text style={[S.tiny, { marginTop: 3, textAlign: "center" }]}>{label}</Text>
  </View>
);

const Card = ({ title, sub, children }) => (
  <View style={[S.card, S.cardPad]}>
    <Text style={[S.h2, { marginBottom: 10 }]}>
      {title}
      {!!sub && <Text style={{ fontWeight: "400", fontSize: 12, color: C.ink2 }}>{`  — ${sub}`}</Text>}
    </Text>
    {children}
  </View>
);

const BarRow = ({ label, sub, pct, color }) => (
  <View style={[S.row, { paddingVertical: 7, gap: 10 }]}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 13.5, color: C.ink }} numberOfLines={1}>{label}</Text>
      {!!sub && <Text style={[S.tiny, { marginTop: 1 }]}>{sub}</Text>}
    </View>
    <View style={{ width: 84, height: 7, borderRadius: 4, backgroundColor: C.ruleSoft, overflow: "hidden" }}>
      <View style={{ height: "100%", width: `${Math.round(pct * 100)}%`, backgroundColor: color, borderRadius: 4 }} />
    </View>
    <Text style={{ width: 38, textAlign: "right", fontSize: 12.5, fontWeight: "600", color: C.ink }}>
      {Math.round(pct * 100)}%
    </Text>
  </View>
);

/* A weekly-total line with the limit drawn across it as a dashed rule. */
function Spark({ series, goal }) {
  if (!series.length) return null;
  const W = 300, H = 52, pad = 5;
  const max = Math.max(goal * 1.15, ...series, 1);
  const x = (i) => (series.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (series.length - 1));
  const y = (v) => H - pad - (v / max) * (H - pad * 2);

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Line x1={pad} y1={y(goal)} x2={W - pad} y2={y(goal)}
            stroke={C.over} strokeWidth={1.5} strokeDasharray="3 3" />
      <Polyline
        points={series.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
      />
      {series.map((v, i) => (
        <Circle key={i} cx={x(i)} cy={y(v)} r={v > goal ? 3.5 : 2.5} fill={v > goal ? C.over : C.accent} />
      ))}
    </Svg>
  );
}

function Heat({ keys, targets, log }) {
  const first = M.startOfWeek(M.parseKey(keys[0]));
  const last = M.startOfWeek(M.parseKey(keys[keys.length - 1]));
  const weeks = Math.round(M.daysBetween(M.keyOf(first), M.keyOf(last)) / 7);

  const rows = [];
  for (let w = 0; w <= weeks; w++) {
    const monday = M.addDays(first, w * 7);
    rows.push(
      <View key={w} style={[S.row, { gap: 3, marginBottom: 3 }]}>
        <Text style={{ width: 20, fontSize: 9, color: C.ink3, fontWeight: "600" }}>{monday.getDate()}</Text>
        {M.weekKeys(monday).map((k) => {
          const outside = M.isFuture(k) || M.daysBetween(keys[0], k) < 0;
          const s = outside ? null : M.dayScore(k, targets, log);
          const broken = !outside && M.dayLimitsBroken(k, targets, log);
          let bg = C.ruleSoft, opacity = 1;
          if (outside) opacity = 0.3;
          else if (s.due) {
            bg = broken ? C.over : C.good;
            opacity = broken ? 0.35 + s.pct * 0.6 : 0.15 + s.pct * 0.85;
          }
          return <View key={k} style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: bg, opacity }} />;
        })}
      </View>
    );
  }

  return (
    <View>
      {rows}
      <View style={[S.row, { gap: 5, marginTop: 8, alignItems: "center" }]}>
        <Text style={S.tiny}>less</Text>
        {[0.25, 0.6, 1].map((o) => (
          <View key={o} style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: C.good, opacity: o }} />
        ))}
        <Text style={S.tiny}>more</Text>
        <View style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: C.over, marginLeft: 8 }} />
        <Text style={S.tiny}>limit broken</Text>
      </View>
    </View>
  );
}
