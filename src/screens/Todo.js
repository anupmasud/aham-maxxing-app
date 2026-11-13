/* To do — every unfinished task in one place.

   Today draws the tasks set for today, plus whatever is overdue. That is the
   right view for working through a day and the wrong one for finding out what
   has gone missing: a task set for a Tuesday you never opened is drawn only
   beside that Tuesday, so it scrolls quietly out of reach. Nothing in the app
   answered "what have I still not done" without stepping through the calendar
   a day at a time.

   Three groups, because overdue, today and later want different things from
   you — a debt, a plan, and a promise. Each row behaves exactly as it does on
   Today: tick it off, tap it to edit or move it, nudge it to the next day. The
   date is on every row here, which it is not on Today, because away from the
   day it belongs to a task without one is unmoored. */

import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { C, S } from "../ui/kit";
import { TaskRow, TaskSheet, fmtShort } from "../ui/TaskCard";
import * as K from "../model/tasks";
import * as M from "../model/targets";

export default function Todo({ doc, update, day, setDay, setTab }) {
  const [task, setTask] = useState(null);

  const tasks = doc.tasks || [];
  const setTasks = (fn) => update((d) => ({ ...d, tasks: fn(d.tasks || []) }));

  const today = M.todayKey();
  const groups = K.openGroups(tasks, today);
  const count = K.openCount(tasks, today);

  const toggle = (id) => setTasks((list) => K.toggleTask(list, id));
  const push = (t) => setTasks((list) =>
    K.moveTaskToDay(list, t.id, M.keyOf(M.addDays(M.parseKey(K.dayOf(t)), 1))));

  /* Tapping the date takes you to that day rather than opening the editor.
     Half of why you want to see an old task is to see what else was going on
     around it, and that is a different screen. */
  const goTo = (key) => { setDay(key); setTab("today"); };

  return (
    <ScrollView
      style={S.screen}
      contentContainerStyle={[S.pad, S.scrollPad]}
      keyboardDismissMode="on-drag"
    >
      <Text style={S.h1}>To do</Text>
      <Text style={[S.tiny, { marginTop: 2, marginBottom: 16 }]}>
        {count.total === 0
          ? "nothing outstanding"
          : `${count.total} open${count.overdue ? ` · ${count.overdue} overdue` : ""}`}
      </Text>

      {count.total === 0 && (
        /* Worth saying outright rather than showing three empty headings.
           An empty list and a list that will not load look identical. */
        <View style={[S.card, { padding: 22, alignItems: "center" }]}>
          <Text style={{ fontSize: 15, color: C.ink2 }}>Nothing left to do.</Text>
          <Text style={[S.tiny, { marginTop: 6, textAlign: "center" }]}>
            Tasks you add on any day show up here until they are ticked off.
          </Text>
        </View>
      )}

      <Group
        title="Overdue"
        hint="oldest first"
        tone={C.over}
        rows={groups.overdue}
        today={today}
        onToggle={toggle}
        onOpen={setTask}
        onPush={push}
        onDay={goTo}
      />
      <Group
        title="Today"
        rows={groups.today}
        today={today}
        onToggle={toggle}
        onOpen={setTask}
        onPush={push}
        onDay={goTo}
      />
      <Group
        title="Coming up"
        hint="soonest first"
        rows={groups.later}
        today={today}
        onToggle={toggle}
        onOpen={setTask}
        onPush={push}
        onDay={goTo}
      />

      <TaskSheet
        task={task}
        day={task ? K.dayOf(task) : day}
        onSave={({ name, note }) => setTasks((list) =>
          K.setTaskNote(K.renameTask(list, task.id, name), task.id, note))}
        onMove={(to) => setTasks((list) => K.moveTaskToDay(list, task.id, to))}
        onDelete={() => setTasks((list) => K.removeTask(list, task.id))}
        onClose={() => setTask(null)}
      />
    </ScrollView>
  );
}

/* A heading and its rows, or nothing at all. An empty group is not news —
   "Overdue (0)" is a line of furniture on the screen where the good news
   should be. */
function Group({ title, hint, tone, rows, today, onToggle, onOpen, onPush, onDay }) {
  if (!rows.length) return null;

  return (
    <View style={{ marginBottom: 18 }}>
      <View style={[S.row, { marginBottom: 8, gap: 8, alignItems: "baseline" }]}>
        <Text style={[S.h2, tone ? { color: tone } : null]}>{title}</Text>
        <Text style={S.tiny}>{rows.length}{hint ? ` · ${hint}` : ""}</Text>
      </View>

      <View style={S.card}>
        {rows.map((t) => (
          <View key={t.id}>
            <TaskRow
              t={t}
              /* Today's own rows say "late" for nothing, so the date goes
                 below instead — see DayLine. */
              late={0}
              onToggle={() => onToggle(t.id)}
              onOpen={() => onOpen(t)}
              onPush={() => onPush(t)}
            />
            <DayLine dayKey={K.dayOf(t)} today={today} onPress={() => onDay(K.dayOf(t))} />
          </View>
        ))}
      </View>
    </View>
  );
}

/* The day a task belongs to, and how far off it is. Tappable, because the
   answer to "why is this still here" is usually on that day's screen. */
function DayLine({ dayKey, today, onPress }) {
  const late = K.daysLate({ day: dayKey }, today);
  const ahead = Math.max(0, Math.round(
    (M.parseKey(dayKey) - M.parseKey(today)) / 86400000));

  const when =
    dayKey === today ? "today"
    : late > 0 ? `${late} day${late === 1 ? "" : "s"} late`
    : ahead === 1 ? "tomorrow"
    : `in ${ahead} days`;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [{
        paddingHorizontal: 13, paddingBottom: 9, marginTop: -4,
        opacity: pressed ? 0.5 : 1,
      }]}
    >
      <Text style={S.tiny}>{`${fmtShort(dayKey)} · ${when} ›`}</Text>
    </Pressable>
  );
}
