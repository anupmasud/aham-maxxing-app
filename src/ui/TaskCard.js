/* ==========================================================================
   The To Do tasks card, and the sheet for editing one.

   It sits below the target groups on Today, looks like one more category, and
   behaves nothing like one: a task has no goal, no streak and no bearing on
   the ring above it. That difference is stated in the card rather than left
   for someone to work out from the absence of a percentage — "not counted"
   under the heading, once.

   Two lists in one card. The day's own tasks, and above them anything still
   open from before, because a to-do list that hides Tuesday's unfinished
   errand on Wednesday is not doing its job. The overdue block only appears
   when you are looking at today: on Tuesday itself the task is simply
   Tuesday's, and on a day last March a backlog from this week would be
   nonsense.

   A task can be moved to any day — "›" on the row shunts it to the next one
   without opening anything, and the sheet has the rest: a day either side,
   today, tomorrow, or a date typed in.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { C, S, Btn, CatHeader, Chip, LinkText, Note, Sheet, Tick } from "./kit";
import { Reorderable } from "./Reorder";
import * as K from "../model/tasks";
import * as M from "../model/targets";

const fmtShort = (key) =>
  M.parseKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function TaskCard({
  tasks, day, arranging,
  onAdd, onToggle, onOpen, onReorder, onPush,
}) {
  const [typed, setTyped] = useState("");

  const mine = K.tasksOn(tasks, day);
  const counts = K.taskCounts(tasks, day);
  const isToday = day === M.todayKey();
  const overdue = isToday ? K.overdueBefore(tasks, day) : [];

  const add = () => {
    const name = typed.trim();
    if (!name) return;
    onAdd(name);
    setTyped("");
  };

  return (
    <View style={S.card}>
      <CatHeader
        cat={{ name: K.TASK_GROUP.name, emoji: K.TASK_GROUP.emoji, color: K.TASK_GROUP.color }}
        right={<Text style={S.tiny}>{counts.total ? `${counts.done}/${counts.total}` : "—"}</Text>}
      />
      <Note
        text={K.TASK_GROUP.note}
        full
        style={{ paddingHorizontal: 13, paddingTop: 9, marginTop: 0 }}
      />

      {/* ---- still open from earlier ---- */}
      {overdue.length > 0 && (
        <View style={{ backgroundColor: C.sunk }}>
          <Text style={[S.tiny, { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 2, fontWeight: "700" }]}>
            STILL OPEN
          </Text>
          {overdue.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <View style={S.rule} />}
              <TaskRow
                t={t}
                late={K.daysLate(t, day)}
                onToggle={() => onToggle(t.id)}
                onOpen={() => onOpen(t)}
                onPush={() => onPush(t)}
              />
            </View>
          ))}
          <View style={S.rule} />
        </View>
      )}

      {/* ---- this day's own ---- */}
      {mine.length === 0 && overdue.length === 0 && (
        <Text style={[S.muted, { paddingHorizontal: 13, paddingTop: 12 }]}>
          Nothing on the list for this day.
        </Text>
      )}

      <Reorderable
        items={mine}
        onReorder={arranging && mine.length > 1 ? onReorder : () => {}}
        keyOf={(t) => t.id}
      >
        {(t, i, grip) => (
          <View>
            {(i > 0 || overdue.length > 0) && <View style={S.rule} />}
            <TaskRow
              t={t}
              grip={arranging && mine.length > 1 ? grip : null}
              onToggle={() => onToggle(t.id)}
              onOpen={() => onOpen(t)}
              onPush={() => onPush(t)}
            />
          </View>
        )}
      </Reorderable>

      {/* ---- add ---- */}
      <View style={[S.row, { gap: 8, padding: 11, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.ruleSoft }]}>
        <TextInput
          style={[S.input, { flex: 1, paddingVertical: 8 }]}
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder="Add a task for this day"
          placeholderTextColor={C.ink3}
        />
        <Btn label="Add" small primary onPress={add} disabled={!typed.trim()} />
      </View>
    </View>
  );
}

/* One line. The whole row is pressable rather than only the name, because the
   text on it can be two words long and a two-word tap target on a phone is a
   miss waiting to happen — the tick keeps its own hit area inside it.

   The "›" pushes the task to the next day in one tap. Putting it on the row
   rather than only in the sheet is deliberate: shunting an unfinished thing
   to tomorrow is the single most common thing anyone does to a to-do list,
   and it should not cost a modal. */
function TaskRow({ t, late, grip, onToggle, onOpen, onPush }) {
  const done = K.isDone(t);
  return (
    <View style={[S.row, { paddingVertical: 11, paddingHorizontal: 13, gap: 11 }]}>
      <Tick on={done} onPress={onToggle} />
      <Pressable style={{ flex: 1 }} onPress={onOpen} hitSlop={4}>
        <Text
          style={{
            fontSize: 15,
            color: done ? C.ink3 : C.ink,
            textDecorationLine: done ? "line-through" : "none",
          }}
          numberOfLines={2}
        >
          {t.name}
        </Text>
        {late > 0 && (
          <Text style={[S.tiny, { marginTop: 3 }]}>
            {`${fmtShort(K.dayOf(t))} · ${late} day${late === 1 ? "" : "s"} late`}
          </Text>
        )}
        {/* Links in a task note are tappable for the same reason they are in a
            day note: that is usually the whole point of writing one. */}
        <LinkText
          text={t.note}
          style={{ fontSize: 11, lineHeight: 16, color: C.ink3, marginTop: 3 }}
          numberOfLines={2}
        />
      </Pressable>

      {!done && !!onPush && (
        <Pressable
          onPress={onPush}
          hitSlop={8}
          style={({ pressed }) => [{
            width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: C.rule,
            alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1,
          }]}
        >
          <Text style={{ fontSize: 16, lineHeight: 19, color: C.ink2 }}>›</Text>
        </Pressable>
      )}
      {grip}
    </View>
  );
}

/* ------------------------------------------------------------------ sheet -- */

export function TaskSheet({ task, day, onSave, onMove, onDelete, onClose }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");

  /* Reloaded whenever a different task is opened: the sheet is one component
     reused for every row, so without this it would show the last one's text. */
  useEffect(() => {
    setName(task ? task.name : "");
    setNote(task ? task.note || "" : "");
    setWhen(task ? K.dayOf(task) : "");
  }, [task && task.id]);

  if (!task) return null;

  const own = K.dayOf(task);
  const shift = (from, n) => M.keyOf(M.addDays(M.parseKey(from), n));
  const today = M.todayKey();

  const move = (to) => { onMove(to); onClose(); };

  const save = () => {
    onSave({ name, note });
    // A date typed by hand is applied on save; anything unparseable is ignored
    // rather than silently sending the task to 1970.
    if (M.isDateKey(when) && when !== own) onMove(when);
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <Text style={[S.h2, { marginBottom: 3 }]}>Task</Text>
      <Text style={[S.tiny, { marginBottom: 14 }]}>
        {M.parseKey(own).toLocaleDateString(undefined,
          { weekday: "long", day: "numeric", month: "long" })}
        {K.isDone(task) ? "  ·  done" : ""}
      </Text>

      <Text style={S.label}>WHAT</Text>
      <TextInput
        style={S.input}
        value={name}
        onChangeText={setName}
        placeholder="Book the appointment"
        placeholderTextColor={C.ink3}
      />

      <Text style={[S.label, { marginTop: 14 }]}>NOTE</Text>
      <TextInput
        style={[S.input, { minHeight: 74, textAlignVertical: "top" }]}
        multiline
        value={note}
        onChangeText={setNote}
        placeholder="Address, phone number, a link"
        placeholderTextColor={C.ink3}
      />

      {/* ---- which day ---- */}
      <Text style={[S.label, { marginTop: 16 }]}>MOVE TO</Text>
      <View style={[S.row, { flexWrap: "wrap", marginBottom: 6 }]}>
        <Chip label="← Day before" onPress={() => move(shift(own, -1))} />
        <Chip label="Next day →" onPress={() => move(shift(own, 1))} />
        {own !== today && <Chip label="Today" onPress={() => move(today)} />}
        {own !== shift(today, 1) && (
          <Chip label="Tomorrow" onPress={() => move(shift(today, 1))} />
        )}
      </View>
      <TextInput
        style={S.input}
        value={when}
        onChangeText={setWhen}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={C.ink3}
        autoCapitalize="none"
      />
      <Text style={[S.tiny, { marginTop: 5 }]}>
        A chip moves it straight away. A date typed here is applied when you save.
      </Text>

      <View style={[S.row, { gap: 10, marginTop: 18 }]}>
        <View style={{ flex: 1 }}>
          <Btn label="Save" primary onPress={save} disabled={!name.trim()} />
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
