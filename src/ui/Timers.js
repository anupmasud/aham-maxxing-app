/* ==========================================================================
   Interval timers: the list, the editor, and the thing that actually runs.

   Running one records nothing. There is no log write anywhere in this file
   and there should never be — the whole point of a utility is that it does
   not have an opinion about your week.

   Three decisions worth knowing about:

   Time comes from the clock, not from a counter. `tick` only forces a
   re-render; where the session is comes from `Date.now()` measured against
   the moment it started. Miss a hundred frames and the timer is still right.

   Pausing is done by moving the start time rather than by freezing a number,
   so resuming is arithmetic and there is no second source of truth to keep
   in step.

   There is no sound. Adding one means a native audio dependency, a rebuild,
   and a new way for the web build to break — so this leans on a full-screen
   colour change and a vibration at every transition. On a phone in your hand
   that is enough; it is honestly less good than a beep across a room.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, Vibration, View } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { C, S, Btn, CatHeader, Note, Sheet } from "./kit";
import * as W from "../model/timers";

export const TIMER_GROUP = {
  name: "Timers",
  emoji: "⏱",
  color: "#2F6D8C",
  note: "interval timers — the setup is saved, using one records nothing",
};

/* A phase's colour carries the instruction, so the screen can be read from
   across a room without the words being legible. */
const TONE = {
  lead: C.warn,
  work: C.good,
  rest: C.accent,
  setRest: C.ink2,
  done: C.ink,
};

/* -------------------------------------------------------------- the card -- */

export function TimerCard({ timers, onRun, onEdit, onAdd }) {
  /* Shut unless you ask for it.

     A timer is a thing you reach for a few times a week, not something to
     read every morning — and Today is the screen for ticking things off. Left
     open it was a block of text and buttons sitting under the day's targets
     every single day, which is clutter with a tap cost of zero and an
     attention cost that is not zero. One line, and it is still one tap away
     when you are stood in the middle of the room about to start. */
  const [open, setOpen] = useState(false);
  const list = W.sortTimers(timers);

  return (
    <View style={S.card}>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <CatHeader
          cat={{ name: TIMER_GROUP.name, emoji: TIMER_GROUP.emoji, color: TIMER_GROUP.color }}
          right={
            <View style={[S.row, { gap: 8 }]}>
              <Text style={S.tiny}>{list.length || "—"}</Text>
              <Text style={{ fontSize: 13, color: C.ink2 }}>{open ? "⌃" : "⌄"}</Text>
            </View>
          }
        />
      </Pressable>

      {open && (
        <>
          <Note text={TIMER_GROUP.note} full
                style={{ paddingHorizontal: 13, paddingTop: 9, marginTop: 0 }} />

          {list.length === 0 && (
            <Text style={[S.muted, { paddingHorizontal: 13, paddingTop: 12 }]}>
              No timers yet. Three sets of four rounds at 45 seconds is a tap away.
            </Text>
          )}

          {list.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <View style={S.rule} />}
              <View style={[S.row, { paddingVertical: 11, paddingHorizontal: 13, gap: 11 }]}>
                <Pressable style={{ flex: 1 }} onPress={() => onEdit(t)} hitSlop={4}>
                  <Text style={{ fontSize: 15, color: C.ink }} numberOfLines={1}>{t.name}</Text>
                  <Text style={[S.tiny, { marginTop: 3 }]} numberOfLines={2}>
                    {W.describeTimer(t)}
                  </Text>
                  <Text style={[S.tiny, { marginTop: 2, color: C.ink3 }]}>
                    {W.fmtLength(W.totalMs(t))} in total
                  </Text>
                </Pressable>
                <Btn small primary label="Start" onPress={() => onRun(t)} />
              </View>
            </View>
          ))}

          <View style={{ padding: 11, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.ruleSoft }}>
            <Btn small label="+  New timer" onPress={onAdd} />
          </View>
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------- the editor -- */

const FIELDS = [
  { key: "sets",    label: "SETS",            hint: "rounds repeat this many times" },
  { key: "rounds",  label: "ROUNDS PER SET",  hint: "" },
  { key: "work",    label: "SECONDS PER ROUND", hint: "" },
  { key: "rest",    label: "REST BETWEEN ROUNDS (S)", hint: "0 for none" },
  { key: "setRest", label: "BREAK BETWEEN SETS (S)",  hint: "0 for none" },
  { key: "leadIn",  label: "COUNTDOWN BEFORE START (S)", hint: "0 to start immediately" },
];

export function TimerSheet({ timer, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => { setDraft(timer ? { ...timer } : null); }, [timer && timer.id]);

  if (!timer || !draft) return null;

  /* Held as typed rather than clamped on every keystroke: clamping as you
     type means deleting the "4" from "45" turns the field into "1" under your
     finger. The model clamps on save, which is the moment it matters. */
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const preview = W.clampTimer(draft);

  return (
    <Sheet onClose={onClose}>
      <Text style={[S.h2, { marginBottom: 3 }]}>Timer</Text>
      <Text style={[S.tiny, { marginBottom: 14 }]}>
        {W.describeTimer(preview)}{"  ·  "}{W.fmtLength(W.totalMs(preview))}
      </Text>

      <Text style={S.label}>NAME</Text>
      <TextInput
        style={S.input}
        value={String(draft.name ?? "")}
        onChangeText={(v) => set("name", v)}
        placeholder="Upper body circuit"
        placeholderTextColor={C.ink3}
      />

      {FIELDS.map((f) => (
        <View key={f.key}>
          <Text style={[S.label, { marginTop: 14 }]}>{f.label}</Text>
          <TextInput
            style={S.input}
            keyboardType="number-pad"
            value={String(draft[f.key] ?? "")}
            onChangeText={(v) => set(f.key, v.replace(/[^0-9]/g, ""))}
            placeholder={String(W.TIMER_LIMITS[f.key].d)}
            placeholderTextColor={C.ink3}
          />
          {!!f.hint && <Text style={[S.tiny, { marginTop: 4 }]}>{f.hint}</Text>}
        </View>
      ))}

      <Text style={[S.tiny, { marginTop: 14 }]}>
        {preview.sets * preview.rounds} rounds of work, {W.fmtLength(W.workMs(preview))} of it.
        Saved to your spreadsheet; running it records nothing.
      </Text>

      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        <View style={{ flex: 1 }}>
          <Btn label="Save" primary onPress={() => { onSave(draft); onClose(); }} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label="Delete" danger onPress={() => { onDelete(); onClose(); }} />
        </View>
      </View>

      <Pressable onPress={onClose} style={{ marginTop: 14, alignSelf: "center" }} hitSlop={8}>
        <Text style={{ color: C.ink2, fontSize: 14 }}>Cancel</Text>
      </Pressable>
    </Sheet>
  );
}

/* ------------------------------------------------------------- the runner -- */

const buzz = (pattern) => {
  try {
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
      return;
    }
    Vibration.vibrate(pattern);
  } catch (_) { /* a phone that will not buzz is not a reason to stop the timer */ }
};

export function TimerRunner({ timer, onClose }) {
  /* `startedAt` is the instant the session began, shifted forward by however
     long it has spent paused. Everything else is derived from it. */
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState(null);
  const [, setTick] = useState(0);
  const lastPhase = useRef(-1);

  const running = !timer ? false : pausedAt === null;

  /* A frame every 100ms: fast enough that the seconds change when they should,
     slow enough to be invisible on a battery. */
  useEffect(() => {
    if (!timer || !running) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [timer, running]);

  /* The screen staying on is most of what makes this usable — a timer you
     have to keep waking is not a timer. Released on the way out, including
     when the session ends on its own. */
  useEffect(() => {
    if (!timer) return undefined;
    let active = true;
    activateKeepAwakeAsync("timer").catch(() => {});
    return () => {
      active = false;
      try { deactivateKeepAwake("timer"); } catch (_) {}
      return active;
    };
  }, [timer]);

  useEffect(() => {
    if (timer) {
      setStartedAt(Date.now());
      setPausedAt(null);
      lastPhase.current = -1;
    }
  }, [timer && timer.id]);

  if (!timer) return null;

  const elapsed = (pausedAt === null ? Date.now() : pausedAt) - startedAt;
  const here = W.phaseAt(timer, elapsed);
  const t = W.clampTimer(timer);

  /* One buzz per transition, and a longer one at the end. Driven off the
     phase index rather than a timeout, so a dropped frame cannot skip it and
     a re-render cannot fire it twice. */
  if (here.index !== lastPhase.current) {
    if (lastPhase.current !== -1) buzz(here.done ? [0, 260, 120, 260] : 90);
    lastPhase.current = here.index;
  }

  const tone = TONE[here.kind] || C.ink;
  const label = here.done ? "Done" : (W.PHASES[here.kind] || {}).label || "";
  const roundsDone = W.workDone(timer, elapsed);

  return (
    <Sheet onClose={onClose}>
      <View style={{ alignItems: "center", paddingVertical: 6 }}>
        <Text style={[S.tiny, { marginBottom: 2 }]} numberOfLines={1}>{t.name}</Text>

        <Text style={{ fontSize: 15, fontWeight: "700", color: tone, marginBottom: 6 }}>
          {label}
        </Text>

        <Text style={{
          fontSize: 76, lineHeight: 86, fontWeight: "700", color: tone,
          fontVariant: ["tabular-nums"],
        }}>
          {here.done ? "0:00" : W.fmtClock(here.remaining)}
        </Text>

        {/* A bar for the phase, because a number shrinking is harder to read
            at a glance than a thing emptying. */}
        <View style={{
          height: 6, borderRadius: 3, backgroundColor: C.rule,
          alignSelf: "stretch", marginTop: 10, overflow: "hidden",
        }}>
          <View style={{
            height: 6, borderRadius: 3, backgroundColor: tone,
            width: `${here.phaseMs ? Math.min(100, (here.elapsedInPhase / here.phaseMs) * 100) : 100}%`,
          }} />
        </View>

        {/* Nothing has started during the lead-in, so there is no round to
            name — "round 0 of 4" reads as a bug. It says what is coming
            instead. */}
        <Text style={[S.muted, { marginTop: 12, textAlign: "center" }]}>
          {here.done
            ? `${t.sets * t.rounds} rounds finished`
            : here.kind === "lead"
              ? `${t.sets} set${t.sets === 1 ? "" : "s"}   ·   ${t.sets * t.rounds} rounds   ·   ${t.work}s each`
              : `Set ${here.set} of ${t.sets}   ·   round ${roundsDone + (here.kind === "work" ? 1 : 0)} of ${t.sets * t.rounds}`}
        </Text>
        <Text style={[S.tiny, { marginTop: 3 }]}>
          {W.fmtClock(Math.max(0, here.total - elapsed))} left of {W.fmtLength(here.total)}
        </Text>
      </View>

      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        {!here.done && (
          <View style={{ flex: 1 }}>
            <Btn
              primary={pausedAt !== null}
              label={pausedAt === null ? "Pause" : "Resume"}
              onPress={() => {
                if (pausedAt === null) setPausedAt(Date.now());
                else { setStartedAt((s) => s + (Date.now() - pausedAt)); setPausedAt(null); }
              }}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Btn
            label={here.done ? "Again" : "Restart"}
            onPress={() => { setStartedAt(Date.now()); setPausedAt(null); lastPhase.current = -1; }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Btn primary={here.done} label="Done" onPress={onClose} />
        </View>
      </View>

      <Text style={[S.tiny, { marginTop: 12, textAlign: "center" }]}>
        Nothing here is logged. Close it whenever you like.
      </Text>
    </Sheet>
  );
}
