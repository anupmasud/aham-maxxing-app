/* ==========================================================================
   AhamMaxxing — targets by category, checked off daily.

   Data lives in one JSON file in the signed-in person's own Google Drive, so
   there is no backend and no shared store to leak between accounts.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";

import { useCloudDoc } from "./src/store/useCloudDoc";
import { CONFIG } from "./src/config";
import { C, S, Btn } from "./src/ui/kit";
import { TEMPLATES } from "./src/model/seed";
import * as M from "./src/model/targets";
import * as Reminders from "./src/reminders";

import Today from "./src/screens/Today";
import Week from "./src/screens/Week";
import Insights from "./src/screens/Insights";
import Setup from "./src/screens/Setup";

const TABS = [
  { key: "today", label: "Today", icon: "◉" },
  { key: "week", label: "Week", icon: "▦" },
  { key: "insights", label: "Insights", icon: "◔" },
  { key: "setup", label: "Setup", icon: "⚙" },
];

const STATUS = {
  starting: "Starting…",
  loading: "Loading…",
  saving: "Saving…",
  ready: "Saved",
  offline: "Offline",
  expired: "Tap to reconnect",
  conflict: "Changed elsewhere",
  error: "Problem",
};

export default function App() {
  const {
    user, doc, status, error, conflict, configured,
    update, syncNow, resolveConflict, signIn, signOut, disconnect,
    grantAccess, resetPermissions, createIn, folderUrl, sheetUrl,
  } = useCloudDoc();
  const [folder, setFolder] = useState(CONFIG.folderPath.join(" / "));
  const [template, setTemplate] = useState("default");

  const [tab, setTab] = useState("insights");

  /* Which screen the app opens on is a preference, and people genuinely differ:
     some want "where am I this week" before anything else, others open the app
     to tick one thing off and want to be there already. Applied once, when the
     document first arrives — after that, moving between tabs is theirs. */
  const openedOn = useRef(false);
  useEffect(() => {
    if (!doc || openedOn.current) return;
    openedOn.current = true;
    setTab(doc.homeTab === "today" ? "today" : "insights");
  }, [doc]);
  const [day, setDay] = useState(M.todayKey());

  /* Reschedule whenever the reminder settings change, or when what is still
     outstanding changes — the notification text is written at scheduling time,
     so it would otherwise go stale the moment you ticked something off. */
  const today = M.todayKey();
  const outstandingKey = doc
    ? (() => { const s = M.dayScore(today, doc.targets || [], doc.log || {}); return `${s.due}:${s.done}:${s.broken}`; })()
    : "";
  const reminderKey = doc ? JSON.stringify(doc.reminders || {}) : "";

  useEffect(() => {
    if (!doc || !Reminders.available) return;
    Reminders.sync(doc).catch(() => {});
  }, [reminderKey, outstandingKey]);

  /* ------------------------------------------------------------ gateways -- */

  if (!configured) {
    return (
      <Gate title="Almost there">
        <Text style={S.body}>
          Add your Google OAuth client IDs to src/config.js, then rebuild.
          The README walks through creating them.
        </Text>
      </Gate>
    );
  }

  if (status === "signed-out" || status === "starting") {
    return (
      <Gate title="AhamMaxxing" tagline="Set the targets. Own the week.">
        <Text style={S.body}>
          Sign in with Google. Everything is kept in a spreadsheet in{" "}
          {CONFIG.folderPath.join(" / ")} on your own Drive — this app can only
          see files it created there, nothing else.
        </Text>
        {/* Google leaves the Drive checkbox unticked and gives an app no way to
            pre-select it, so the only thing that helps is saying so first. */}
        <Text style={[S.muted, { marginTop: 12, color: C.warn }]}>
          Google will show a tick box for Drive access. Please tick it — without
          it there is nowhere to save.
        </Text>
        {status === "starting"
          ? <ActivityIndicator style={{ marginTop: 22 }} />
          : <Btn primary label="Sign in with Google" onPress={signIn} />}
        {!!error && <Text style={S.error}>{error}</Text>}
      </Gate>
    );
  }

  /* Signing in while declining Drive leaves the app with an account and
     nowhere to save. Google then remembers the refusal and stops offering, so
     signing out and back in changes nothing — which is a genuinely stuck place
     to be without a button that forces the question again. */
  if (status === "needs-permission") {
    return (
      <Gate title="One permission missing">
        <Text style={S.body}>
          {user?.email ? `${user.email} is signed in, but ` : ""}AhamMaxxing has not
          been allowed to create its spreadsheet. There is nowhere to save without it.
        </Text>
        <Text style={[S.muted, { marginTop: 10 }]}>
          It only ever touches files it made itself — it cannot see anything else
          in your Drive.
        </Text>
        {!!error && <Text style={S.error}>{error}</Text>}
        <Btn primary label="Allow Drive access" onPress={grantAccess} />
        <Btn label="Start the permission over" onPress={resetPermissions} />
        <Text style={[S.tiny, { marginTop: 12 }]}>
          Still stuck? Remove AhamMaxxing at myaccount.google.com/permissions and
          sign in again — that clears Google's memory of the refusal.
        </Text>
      </Gate>
    );
  }

  /* Where someone's data lands is their decision, and they should be told
     which account it is going into — especially when people have more than one
     Google account and the one they signed in with is not always the one they
     expected. */
  if (status === "choose-location") {
    return (
      <Gate title="Choose a starting set" scroll>
        <Text style={S.body}>
          Categories to begin with. Every one of them can be renamed, removed or
          added to afterwards — this only decides what is there on day one.
        </Text>

        <View style={{ marginTop: 14 }}>
          {TEMPLATES.map((t) => {
            const on = template === t.id;
            return (
              <Pressable key={t.id} onPress={() => setTemplate(t.id)}
                style={({ pressed }) => [{
                  borderWidth: on ? 2 : 1, borderColor: on ? C.ink : C.rule,
                  backgroundColor: on ? C.sunk : C.card, borderRadius: 12,
                  padding: 14, marginBottom: 10, opacity: pressed ? 0.75 : 1,
                }]}>
                <Text style={{ fontSize: 15.5, fontWeight: "700", color: C.ink }}>{t.name}</Text>
                <Text style={[S.muted, { marginTop: 4 }]}>{t.blurb}</Text>
                <Text style={[S.tiny, { marginTop: 6 }]}>
                  {t.categories.map((c) => c.emoji).join(" ")}  ·  {t.categories.length} categories
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[S.body, { marginTop: 6 }]}>
          Everything you log is kept in a spreadsheet in{" "}
          <Text style={{ fontWeight: "700", color: C.ink }}>{user?.email}</Text>’s
          Google Drive. Nobody else can see it, including whoever made this app.
        </Text>

        <Text style={[S.label, { marginTop: 18 }]}>Folder</Text>
        <TextInput
          style={S.input}
          value={folder}
          onChangeText={setFolder}
          autoCapitalize="words"
          placeholder="Apps / AhamMaxxing"
        />
        <Text style={[S.tiny, { marginTop: 6 }]}>
          Separate folders with “/”. The app creates them — it cannot list folders
          you already have, because it can only ever see files it made itself.
          You can move the spreadsheet anywhere afterwards and it will still be found.
        </Text>

        {!!error && <Text style={S.error}>{error}</Text>}
        <Btn primary label="Create it there"
             onPress={() => createIn(folder.split("/").map((p) => p.trim()).filter(Boolean), template)} />
        <Btn label="Sign in as someone else" onPress={signOut} />
      </Gate>
    );
  }

  if (status === "not-allowed") {
    return (
      <Gate title="Not on the list">
        <Text style={S.body}>{user?.email} isn’t one of the accounts this build allows.</Text>
        <Btn label="Sign out" onPress={signOut} />
      </Gate>
    );
  }

  if (status === "conflict") {
    return (
      <Gate title="Two versions">
        <Text style={S.body}>
          This changed somewhere else — another device, or an edit made directly
          in Drive — since this device last loaded it. Nothing has been overwritten.
        </Text>
        <Compare label="On this device" doc={conflict?.mine} />
        <Compare label="In Drive" doc={conflict?.theirs} />
        <Btn primary label="Keep this device’s version" onPress={() => resolveConflict("mine")} />
        <Btn label="Use the version in Drive" onPress={() => resolveConflict("theirs")} />
      </Gate>
    );
  }

  if (!doc) {
    return (
      <Gate title={status === "expired" ? "Session expired" : status === "error" ? "Couldn’t load" : "Loading…"}>
        {status === "error" || status === "expired" ? (
          <>
            <Text style={S.body}>Signed in as {user?.email || "—"}.</Text>
            {!!error && <Text style={S.error}>{error}</Text>}
            <Btn primary label={status === "expired" ? "Reconnect" : "Try again"} onPress={syncNow} />
            <Btn label="Sign out" onPress={signOut} />
          </>
        ) : <ActivityIndicator style={{ marginTop: 8 }} />}
      </Gate>
    );
  }

  /* ---------------------------------------------------------------- app -- */

  const outstanding = (() => {
    const s = M.dayScore(M.todayKey(), doc.targets || [], doc.log || {});
    if (s.broken) return { text: `${s.broken} limit${s.broken > 1 ? "s" : ""} over`, tone: C.over };
    if (s.due - s.done > 0) return { text: `${s.due - s.done} left today`, tone: C.warn };
    if (s.due > 0) return { text: "Day complete", tone: C.good };
    return null;
  })();

  const props = {
    doc, update, day, setDay, tab, setTab, user, status, error,
    syncNow, signOut, disconnect, folderUrl, sheetUrl,
  };

  return (
    <SafeAreaView style={S.screen}>
      <StatusBar barStyle="dark-content" />

      <View style={[S.row, a.top]}>
        <Text style={a.brand}>AhamMaxxing</Text>
        <View style={{ flex: 1 }} />
        {!!outstanding && (
          <View style={[a.pill, { backgroundColor: outstanding.tone + "1A" }]}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: outstanding.tone }}>{outstanding.text}</Text>
          </View>
        )}
        <Pressable onPress={syncNow} hitSlop={8} style={{ marginLeft: 8 }}>
          <Text style={{
            fontSize: 11, fontWeight: "600",
            color: status === "ready" ? C.good : status === "error" ? C.over : C.ink2,
          }}>
            {STATUS[status] || status}
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "today" && <Today {...props} />}
        {tab === "week" && <Week {...props} />}
        {tab === "insights" && <Insights {...props} />}
        {tab === "setup" && <Setup {...props} />}
      </View>

      <View style={a.tabbar}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={a.tab}>
            <Text style={{ fontSize: 17, color: tab === t.key ? C.ink : C.ink3 }}>{t.icon}</Text>
            <Text style={{ fontSize: 10.5, fontWeight: "600", color: tab === t.key ? C.ink : C.ink3 }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ bits -- */

function Gate({ title, tagline, children, scroll }) {
  const Inner = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={S.screen}>
      <StatusBar barStyle="dark-content" />
      <Inner
        style={scroll ? S.screen : undefined}
        contentContainerStyle={scroll ? [S.pad, { paddingVertical: 26 }] : undefined}
        {...(scroll ? {} : { style: [S.pad, { flex: 1, justifyContent: "center" }] })}
      >
        <Text style={[S.h1, { fontSize: 32 }]}>{title}</Text>
        {!!tagline && <Text style={[S.muted, { marginTop: 4, marginBottom: 16 }]}>{tagline}</Text>}
        <View style={{ height: 10 }} />
        {children}
      </Inner>
    </SafeAreaView>
  );
}

function Compare({ label, doc }) {
  const n = doc ? (doc.targets || []).length : 0;
  const days = doc ? Object.keys(doc.log || {}).length : 0;
  return (
    <View style={[S.card, S.cardPad, { marginTop: 10 }]}>
      <Text style={S.label}>{label}</Text>
      <Text style={S.body}>{doc ? `${n} targets · ${days} days logged` : "Could not be read"}</Text>
    </View>
  );
}

const a = StyleSheet.create({
  top: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.ruleSoft, backgroundColor: C.paper,
  },
  brand: { fontSize: 17, fontWeight: "700", color: C.ink, letterSpacing: -0.2 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tabbar: {
    flexDirection: "row", borderTopWidth: 1, borderTopColor: C.rule,
    backgroundColor: C.paper, paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, gap: 2 },
});
