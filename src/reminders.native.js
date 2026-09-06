/* ==========================================================================
   One daily local reminder.

   Local, not push: the phone schedules it itself, so there is no server, no
   device tokens and nothing about your day leaving the device. The cost is
   that the text is written when it is scheduled rather than when it fires, so
   it says what is outstanding *now* and is rescheduled whenever that changes.

   The tone is deliberate. A nudge that says "3 left today" is information; one
   that says "don't break your 12-day streak!" is leverage. This app is not
   trying to make you anxious about a number.
   ========================================================================== */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import * as M from "./model/targets";

const CHANNEL = "daily";

export const available = true;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestPermission() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return !!asked.granted;
}

/* What the reminder should say, given where the day currently stands. */
export function reminderBody(doc) {
  const today = M.todayKey();
  const targets = doc.targets || [];
  const log = doc.log || {};
  const s = M.dayScore(today, targets, log);

  const open = targets.filter(
    (t) => !t.archived && t.period === "day" && t.dir === "at_least" &&
           M.appliesOn(t, today) && !M.progress(t, today, log).met
  );

  if (s.due === 0) return "Nothing scheduled today.";
  if (open.length === 0) {
    return s.broken ? "Everything done — one limit is over." : "Everything done today.";
  }

  const names = open.slice(0, 3).map((t) => t.name).join(", ");
  const more = open.length > 3 ? ` and ${open.length - 3} more` : "";
  return `Still open: ${names}${more}.`;
}

/* Cancels and re-schedules. Called whenever the document changes, so the text
   stays true to what is actually left. */
export async function sync(doc) {
  const r = (doc && doc.reminders) || { enabled: false };

  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  if (!r.enabled) return { scheduled: false };

  const ok = await requestPermission();
  if (!ok) return { scheduled: false, denied: true };

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Daily reminder",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "AhamMaxxing",
      body: reminderBody(doc),
      ...(Platform.OS === "android" ? { channelId: CHANNEL } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: Number(r.hour) || 20,
      minute: Number(r.minute) || 0,
    },
  });

  return { scheduled: true };
}
