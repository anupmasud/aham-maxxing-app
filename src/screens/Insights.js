/* Insights — hit rates, streaks, limit trends and a day-by-day heatmap. */

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { C, S, Ring } from "../ui/kit";
import * as M from "../model/targets";

const RANGES = [
  { d: 0, label: "This week" },      // 0 means the current week, not a rolling window
  { d: 28, label: "4 weeks" },
  { d: 84, label: "12 weeks" },
  { d: 365, label: "1 year" },
];

export default function Insights({ doc, setDay, setTab }) {
  const [days, setDays] = useState(0);

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

  if (days === 0) {
    return (
      <ThisWeek doc={doc} targets={targets} log={log}
                setDays={setDays} setDay={setDay} setTab={setTab} />
    );
  }

  const stat = (t) => M.targetStats(t, keys, log);

  /* Daily targets are counted in days and weekly ones in weeks, never mixed:
     dividing a count of days by a count of weeks is not a percentage of
     anything. */
  const daily = M.periodStats(targets, keys, log, "day");
  const weekly = M.periodStats(targets, keys, log, "week");

  const scores = keys.map((k) => M.dayScore(k, targets, log)).filter((s) => s.due > 0);
  const perfect = scores.filter((s) => s.pct >= 1 && s.broken === 0).length;

  const floors = targets.filter((t) => t.dir === "at_least");
  const ceilings = targets.filter((t) => t.dir === "at_most");

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]}>
      <Text style={[S.h1, { marginBottom: 10 }]}>Insights</Text>
      <RangePicker active={days} setDays={setDays} />

      <View style={[S.row, { gap: 10, marginBottom: 14 }]}>
        {daily.targets > 0 && (
          <Stat value={`${Math.round(daily.pct * 100)}%`}
                label={`of ${daily.n} target-days`} />
        )}
        {weekly.targets > 0 && (
          <Stat value={`${Math.round(weekly.pct * 100)}%`}
                label={`of ${weekly.n} target-weeks`} />
        )}
        <Stat value={perfect} label="full days" />
      </View>

      {/* by category */}
      {/* Averaged across the category's targets rather than pooled, because a
          category can hold both daily and weekly targets and their counts are
          in different units. */}
      <Card title="By category" sub="average across its targets">
        {(doc.categories || []).slice().sort((a, b) => a.order - b.order).map((cat) => {
          const ts = targets.filter((t) => t.catId === cat.id && t.dir === "at_least");
          if (!ts.length) return null;
          const rates = ts.map((t) => stat(t)).filter((x) => x.n > 0);
          const pct = rates.length ? rates.reduce((a, x) => a + x.pct, 0) / rates.length : 0;
          return (
            <BarRow key={cat.id} label={`${cat.emoji} ${cat.name}`}
                    sub={`${ts.length} target${ts.length > 1 ? "s" : ""}`}
                    pct={pct} color={cat.color} />
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

/* ---------------------------------------------------------- this week ----
   The dashboard: where the current week stands, mid-week, while there is still
   time to do something about it. Deliberately forward-looking — "2 to go, 3
   days left" is actionable in a way that "40% kept" is not.                */

function ThisWeek({ doc, targets, log, setDays, setDay, setTab }) {
  const today = M.todayKey();
  const monday = M.startOfWeek(new Date());
  const keys = M.weekKeys(monday);
  const elapsed = M.dow(new Date()) + 1;        // days of this week gone, today included
  const left = 7 - elapsed;

  const openDay = (k) => { setDay(k); setTab("today"); };

  /* Days so far, not the whole week: judging Wednesday against seven days
     would make every week look like a failure until Sunday night. */
  const past = keys.slice(0, elapsed);
  const scores = past.map((k) => M.dayScore(k, targets, log)).filter((s) => s.due > 0);
  const done = scores.reduce((a, s) => a + s.done, 0);
  const due = scores.reduce((a, s) => a + s.due, 0);

  const groups = (doc.categories || [])
    .slice().sort((a, b) => a.order - b.order)
    .map((cat) => ({ cat, rows: targets.filter((t) => t.catId === cat.id) }))
    .filter((g) => g.rows.length);

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, S.scrollPad]}>
      <Text style={[S.h1, { marginBottom: 10 }]}>This week</Text>
      <RangePicker active={0} setDays={setDays} />

      <View style={[S.card, S.cardPad, S.row, { gap: 15 }]}>
        <Ring pct={due ? done / due : 0}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: C.ink }}>
            {due ? `${Math.round((done / due) * 100)}%` : "—"}
          </Text>
          <Text style={{ fontSize: 10, color: C.ink3 }}>
            {due ? `${done}/${due} days` : "nothing due"}
          </Text>
        </Ring>
        <View style={{ flex: 1 }}>
          <Text style={S.h2}>
            {M.parseKey(keys[0]).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            {" – "}
            {M.parseKey(keys[6]).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </Text>
          <Text style={[S.muted, { marginTop: 3 }]}>
            Day {elapsed} of 7{left > 0 ? ` · ${left} day${left > 1 ? "s" : ""} to go` : " · last day"}
          </Text>
          <View style={[S.row, { gap: 4, marginTop: 8 }]}>
            {keys.map((k, i) => {
              const s = M.dayScore(k, targets, log);
              const future = M.isFuture(k);
              return (
                <Pressable key={k} onPress={() => openDay(k)} style={{ flex: 1, opacity: future ? 0.35 : 1 }}>
                  <Text style={[S.tiny, { textAlign: "center", fontWeight: "700" }]}>{M.DOW_LETTER[i]}</Text>
                  <View style={{
                    height: 18, borderRadius: 5, marginTop: 3, backgroundColor: C.ruleSoft,
                    overflow: "hidden", justifyContent: "flex-end",
                    borderWidth: k === today ? 2 : 0, borderColor: C.ink,
                  }}>
                    <View style={{ height: `${Math.round(s.pct * 100)}%`, backgroundColor: C.good }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {groups.map(({ cat, rows }) => (
        <View key={cat.id} style={[S.card, S.cardPad]}>
          <Text style={[S.h2, { marginBottom: 4 }]}>{cat.emoji} {cat.name}</Text>
          {rows.map((t) => <WeekRow key={t.id} t={t} log={log} keys={keys} elapsed={elapsed} left={left} />)}
        </View>
      ))}

      <Text style={[S.tiny, { textAlign: "center", marginTop: 4 }]}>
        Tap any day above to log or correct it.
      </Text>
    </ScrollView>
  );
}

/* One target's standing this week, phrased as what is still to do. */
function WeekRow({ t, log, keys, elapsed, left }) {
  const ceiling = t.dir === "at_most";
  const today = M.todayKey();

  let line, ratio, tone = C.good;

  if (t.period === "week") {
    const p = M.progress(t, today, log);
    ratio = p.ratio;
    if (ceiling) {
      const remaining = M.round2(p.goal - p.total);
      tone = p.over ? C.over : p.ratio > 0.75 ? C.warn : C.good;
      line = p.over
        ? `${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)}${t.unit ? " " + t.unit : ""} — ${M.fmtNum(-remaining)} over`
        : `${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)}${t.unit ? " " + t.unit : ""} used · ${M.fmtNum(remaining)} left`;
    } else {
      const togo = Math.max(0, M.round2(p.goal - p.total));
      line = p.met
        ? `${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)} — done`
        : `${M.fmtNum(p.total)} of ${M.fmtNum(p.goal)} · ${M.fmtNum(togo)} to go, ${left} day${left === 1 ? "" : "s"} left`;
      tone = p.met ? C.good : togo > left && left >= 0 ? C.warn : C.good;
    }
  } else {
    const sched = keys.slice(0, elapsed).filter((k) => M.appliesOn(t, k));
    const hit = sched.filter((k) => M.progress(t, k, log).met).length;
    ratio = sched.length ? hit / sched.length : 0;
    if (ceiling) {
      const broken = sched.filter((k) => M.progress(t, k, log).over).length;
      tone = broken ? C.over : C.good;
      line = broken ? `over on ${broken} of ${sched.length} days so far` : `within limit all ${sched.length} days`;
      ratio = sched.length ? (sched.length - broken) / sched.length : 0;
    } else {
      line = `${hit} of ${sched.length} day${sched.length === 1 ? "" : "s"} so far`;
      tone = hit === sched.length ? C.good : C.ink2;
    }
  }

  const types = M.hasTypes(t)
    ? t.types.map((ty) => {
        const tp = M.typeProgress(t, ty, today, log);
        return `${ty.name} ${tp.total}${ty.goal ? "/" + ty.goal : ""}`;
      }).join("  ·  ")
    : null;

  return (
    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.ruleSoft }}>
      <View style={[S.row, { gap: 10 }]}>
        <Text style={{ flex: 1, fontSize: 14, color: C.ink }} numberOfLines={1}>{t.name}</Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: tone }}>{line}</Text>
      </View>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: C.ruleSoft, marginTop: 6, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.min(100, Math.round((ratio || 0) * 100))}%`, backgroundColor: tone }} />
      </View>
      {!!types && <Text style={[S.tiny, { marginTop: 5 }]}>{types}</Text>}
    </View>
  );
}

/* ------------------------------------------------------------------ bits -- */

/* On its own row: four labels and a heading do not fit across a phone, and
   squeezing them wrapped the title onto two lines. */
const RangePicker = ({ active, setDays }) => (
  <View style={[S.row, { gap: 6, marginBottom: 14, flexWrap: "wrap" }]}>
    {RANGES.map((r) => {
      const on = active === r.d;
      return (
        <Pressable key={r.d} onPress={() => setDays(r.d)}
          style={{
            paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
            borderColor: on ? C.ink : C.rule, backgroundColor: on ? C.ink : "transparent",
          }}>
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: on ? C.paper : C.ink2 }}>
            {r.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

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
