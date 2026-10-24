/* ==========================================================================
   The whole pattern, as one hook.

     const { doc, update, status, user, signIn, signOut } = useCloudDoc();

   Local-first: the cached copy paints immediately, so the app is usable on a
   train. Drive is the durable copy and the thing that survives a lost phone.

   The cache is keyed by account, so signing in as someone else on a shared
   device never shows them the previous person's data.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CONFIG, isAllowed } from "../config";
import * as Auth from "../google/auth";
import * as Drive from "../google/drive";
import { exportCsv } from "../model/csv";
import * as Sheets from "../google/sheets";
import { decideOnLoad, envelope, readEnvelope, retryDelay, sameDoc } from "../model/sync";

const SAVE_DELAY = 1200;
const cacheKey = (email) => `ahammaxxing:doc:${email || "anon"}`;

export function useCloudDoc() {
  const [user, setUser] = useState(null);
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState("starting");  // starting | signed-out | not-allowed
                                                     // | loading | ready | saving | offline
                                                     // | conflict | error
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(null);    // { mine, theirs }

  const fileId = useRef(null);
  const folderId = useRef(null);
  const baseTime = useRef(null);     // modifiedTime this device last saw
  const timer = useRef(null);
  const latest = useRef(null);       // newest doc, even mid-render
  const dirty = useRef(false);       // holds work Drive has not got
  const since = useRef(null);        // when the oldest unsent change was made
  const attempt = useRef(0);         // consecutive failed pushes, for backoff
  const retry = useRef(null);
  /* `load` needs to push, and `push` is defined below it. A ref keeps the two
     out of each other's dependency lists without reordering the file. */
  const pushRef = useRef(null);
  const [pending, setPending] = useState(null);   // { since } while unsent

  /* ------------------------------------------------------------- helpers -- */

  /* The cache is written with the document, whether Drive has it yet, and the
     Drive timestamp this device last agreed with. All three are needed after
     the app has been closed: without the flag, work done offline is
     indistinguishable from a stale copy, and the next load overwrites it. */
  const cache = useCallback(async (email, value, { dirty: d = false, base = null } = {}) => {
    try {
      await AsyncStorage.setItem(
        cacheKey(email),
        JSON.stringify(envelope(value, { dirty: d, base, at: since.current })),
      );
    } catch (_) {}
  }, []);

  const readCache = useCallback(async (email) => {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(email));
      return raw ? readEnvelope(JSON.parse(raw)) : null;
    } catch (_) { return null; }
  }, []);

  const markPending = useCallback((on) => {
    dirty.current = on;
    if (on && !since.current) since.current = new Date().toISOString();
    if (!on) { since.current = null; attempt.current = 0; }
    setPending(on ? { since: since.current } : null);
  }, []);

  /* --------------------------------------------------------------- load -- */

  const load = useCallback(async (u, createIn = null, template = "default") => {
    if (!isAllowed(u.email)) { setStatus("not-allowed"); return; }

    // Paint from cache first so there is no blank screen while Drive answers.
    const held = await readCache(u.email);
    const cached = held ? held.doc : null;
    if (cached) { setDoc(cached); latest.current = cached; }
    if (held && held.dirty) {
      since.current = held.at || new Date().toISOString();
      markPending(true);
    }
    setStatus(cached ? "ready" : "loading");

    try {
      const found = await Sheets.loadDoc({ createIn, email: u.email });

      /* Nothing exists yet and nobody has said where it should go. Ask, rather
         than quietly creating a spreadsheet somewhere in their Drive and
         mentioning it afterwards. */
      if (found.needsLocation) { setStatus("choose-location"); return; }

      const { id, folderId: fid, doc: remote, modifiedTime, empty } = found;
      fileId.current = id;
      folderId.current = fid;

      /* A brand-new spreadsheet is filled from whatever already exists: the
         JSON document if this is the switch from the old store, otherwise a
         starting set of targets. The JSON is read, never deleted — it costs
         nothing to leave behind and it is the way back. */
      let doc = remote;
      if (empty) {
        doc = (await Drive.readJsonIfExists()) || cached || CONFIG.emptyDoc(template);
        const saved = await Sheets.saveDoc(id, doc, null, { force: true });
        baseTime.current = saved.modifiedTime;
        setDoc(doc);
        latest.current = doc;
        markPending(false);
        await cache(u.email, doc, { base: baseTime.current });
        setStatus("ready");
        setError("");
        return;
      }

      /* The sheet exists, and this device may be holding entries it never
         managed to send. Taking Drive's copy here is what used to lose a day
         logged on a plane, so the decision is made explicitly. */
      const verdict = decideOnLoad({
        hasCache: !!cached,
        dirty: !!(held && held.dirty),
        base: held ? held.base : null,
        remoteTime: modifiedTime,
      });

      if (verdict.use === "local" && verdict.action === "conflict") {
        /* The timestamps disagree, but that is only ever a hint. If the two
           copies hold the same thing there is nothing to choose between them
           — so take the new timestamp, drop the unsent flag, and say nothing.
           Asking someone to pick between two identical documents is the most
           annoying possible way to be careful. */
        if (sameDoc(cached, remote)) {
          baseTime.current = modifiedTime;
          markPending(false);
          await cache(u.email, remote, { base: modifiedTime });
          setDoc(remote);
          latest.current = remote;
          setStatus("ready");
          setError("");
          return;
        }
        baseTime.current = modifiedTime;
        setConflict({ mine: cached, theirs: remote });
        setStatus("conflict");
        return;
      }

      if (verdict.use === "local") {
        // Ahead of Drive and nobody else has touched it — send it up.
        baseTime.current = modifiedTime;
        setDoc(cached);
        latest.current = cached;
        setStatus("ready");
        setError("");
        if (pushRef.current) await pushRef.current();
        return;
      }

      baseTime.current = modifiedTime;
      setDoc(doc);
      latest.current = doc;
      markPending(false);
      await cache(u.email, doc, { base: baseTime.current });
      setStatus("ready");
      setError("");
    } catch (e) {
      // With a cached copy in hand this is a soft failure: keep working
      // offline and let the next save try again.
      setError(e.message);
      setStatus(
        e.setup ? "error"
        : e.needsScope || e.missingScope ? "needs-permission"
        : e.needsSignIn ? "expired"
        : cached ? "offline" : "error"
      );
    }
  }, [cache, readCache, markPending]);

  /* --------------------------------------------------------------- boot -- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await Auth.restoreSession();
      if (!alive) return;
      if (!u) { setStatus("signed-out"); return; }
      setUser(u);
      await load(u);
    })();
    return () => { alive = false; };
  }, [load]);

  /* --------------------------------------------------------------- save -- */

  const push = useCallback(async () => {
    if (!fileId.current || !latest.current || !user) return;
    clearTimeout(retry.current);
    setStatus("saving");
    try {
      const { modifiedTime } = await Sheets.saveDoc(fileId.current, latest.current, baseTime.current);
      baseTime.current = modifiedTime;
      markPending(false);
      await cache(user.email, latest.current, { base: modifiedTime });
      setStatus("ready");
      setError("");
    } catch (e) {
      if (e.conflict) {
        // Fetch the other side so the user can actually compare, rather than
        // being asked to choose blind.
        try {
          const { doc: theirs, modifiedTime } = await Sheets.loadDoc({ email: user?.email });

          /* Drive's modification time moves on its own — it settles after a
             write, and adding a tab bumps it — so "changed elsewhere" is
             regularly a false alarm. Only a real difference in content is
             worth stopping for; otherwise adopt the newer timestamp and let
             the save go through next time. */
          if (sameDoc(latest.current, theirs)) {
            baseTime.current = modifiedTime;
            markPending(false);
            await cache(user.email, latest.current, { base: modifiedTime });
            setStatus("ready");
            setError("");
            return;
          }
          setConflict({ mine: latest.current, theirs });
        } catch (_) {
          setConflict({ mine: latest.current, theirs: null });
        }
        setStatus("conflict");
        return;
      }
      setError(e.message);
      const next = e.needsScope ? "needs-permission" : e.needsSignIn ? "expired" : "offline";
      setStatus(next);

      /* Offline is the recoverable one, and the only one worth retrying by
         itself — a missing scope or an expired session needs a person. The
         work is already in the cache marked unsent, so a retry that also
         fails costs nothing. */
      if (next === "offline") {
        const wait = retryDelay(attempt.current);
        attempt.current += 1;
        clearTimeout(retry.current);
        retry.current = setTimeout(() => { if (dirty.current) push(); }, wait);
      }
    }
  }, [cache, markPending, user]);

  // Kept current so `load` can reach it without a circular dependency.
  pushRef.current = push;

  const update = useCallback((mutator) => {
    setDoc((prev) => {
      const next = typeof mutator === "function" ? mutator(prev) : mutator;
      latest.current = next;
      markPending(true);
      if (user) cache(user.email, next, { dirty: true, base: baseTime.current });
      clearTimeout(timer.current);
      timer.current = setTimeout(push, SAVE_DELAY);
      return next;
    });
  }, [cache, markPending, push, user]);

  /* Retry after an offline stretch, or force a fresh pull. */
  const syncNow = useCallback(async () => {
    if (!user) return;
    clearTimeout(timer.current);
    // An expired browser token can only be renewed from a real click, and this
    // is one — so reconnecting is the right thing to do rather than retrying.
    if (status === "expired") {
      try {
        const { cancelled } = await Auth.reconnect();
        if (cancelled) return;
      } catch (e) { setError(e.message); return; }
    }
    attempt.current = 0;
    if ((status === "offline" || dirty.current) && latest.current) await push();
    else await load(user);
  }, [load, push, status, user]);

  const resolveConflict = useCallback(async (keep) => {
    if (!conflict) return;
    if (keep === "theirs" && conflict.theirs) {
      setDoc(conflict.theirs);
      latest.current = conflict.theirs;
      if (user) await cache(user.email, conflict.theirs);
      const fresh = await Sheets.loadDoc({ email: user?.email });
      baseTime.current = fresh.modifiedTime;
      markPending(false);
      await cache(user.email, conflict.theirs, { base: baseTime.current });
      setConflict(null);
      setStatus("ready");
      return;
    }
    // Keeping mine means deliberately overwriting the other side.
    setConflict(null);
    setStatus("saving");
    try {
      const { modifiedTime } = await Sheets.saveDoc(fileId.current, latest.current, null, { force: true });
      baseTime.current = modifiedTime;
      markPending(false);
      await cache(user.email, latest.current, { base: modifiedTime });
      setStatus("ready");
    } catch (e) {
      setError(e.message);
      setStatus("offline");
    }
  }, [cache, conflict, markPending, user]);

  /* ------------------------------------------------------------ session -- */

  const signIn = useCallback(async (opts = {}) => {
    setError("");
    try {
      const { cancelled, user: u } = await Auth.signIn(opts);
      if (cancelled || !u) return;
      setUser(u);
      await load(u);
    } catch (e) {
      setError(e.message);
      // Approving sign-in but declining Drive is a specific, recoverable state,
      // not a generic failure — it deserves its own screen and its own way out.
      setStatus(e.missingScope ? "needs-permission" : "error");
    }
  }, [load]);

  /* Asks again with the consent screen forced. Google remembers a refusal and
     stops offering, so an ordinary sign-in will not get the scope back. */
  const grantAccess = useCallback(() => signIn({ force: true }), [signIn]);

  /* Writes a CSV of everything logged into the app's own Drive folder, and
     hands back a link to it. */
  const exportCsvFile = useCallback(async () => {
    if (!latest.current || !folderId.current) throw new Error("Nothing to export yet");
    const name = `${CONFIG.sheetName || "AhamMaxxing"} export.csv`;
    const id = await Drive.writeTextFile(folderId.current, name, exportCsv(latest.current));
    return { name, url: Drive.fileUrl(id) };
  }, []);

  /* Creates the spreadsheet in the folder they chose. */
  const createIn = useCallback(async (path, template) => {
    if (!user) return;
    setStatus("loading");
    await load(user, path && path.length ? path : CONFIG.folderPath, template);
  }, [load, user]);

  /* The reliable last resort: hand the authorisation back, then start over.
     Nothing is deleted — the spreadsheet stays in Drive either way. */
  const resetPermissions = useCallback(async () => {
    setError("");
    try {
      await Auth.revokeAccess();
      setUser(null);
      setDoc(null);
      latest.current = null;
      setStatus("signed-out");
    } catch (e) {
      setError(e.message);
    }
  }, []);

  /* Signing out takes the copy on this device with it.

     It used to clear only what was in memory, leaving the whole document in
     local storage under the address it was cached at — fine for one person on
     their own phone, wrong the moment "sign out" is something you do so
     somebody else can sign in. On the web that storage is readable by anything
     running on the page, so the copy outliving the session is the copy worth
     removing. Disconnect already did this; sign-out should not be the weaker
     of the two. */
  const signOut = useCallback(async () => {
    clearTimeout(timer.current);
    clearTimeout(retry.current);
    markPending(false);
    if (user) {
      try { await AsyncStorage.removeItem(cacheKey(user.email)); } catch (_) {}
      await Sheets.forgetSheet(user.email);
    }
    await Auth.signOut();
    setUser(null);
    setDoc(null);
    latest.current = null;
    fileId.current = null;
    folderId.current = null;
    baseTime.current = null;
    setConflict(null);
    setStatus("signed-out");
  }, [markPending, user]);

  /* Cuts the app's Drive access off at Google's end, not just locally. */
  const disconnect = useCallback(async () => {
    clearTimeout(timer.current);
    clearTimeout(retry.current);
    markPending(false);
    if (user) {
      try { await AsyncStorage.removeItem(cacheKey(user.email)); } catch (_) {}
      await Sheets.forgetSheet(user.email);
    }
    await Auth.revokeAccess();
    setUser(null);
    setDoc(null);
    latest.current = null;
    setStatus("signed-out");
  }, [user]);

  /* Start again: bin the spreadsheet and go back to the first screen.

     The ordinary ways out are all the wrong shape for this. Signing out keeps
     the file, so signing back in finds it. Disconnecting keeps it too, and
     reconnecting reloads the same twenty-eight targets. Clearing history keeps
     the targets. None of them let you change your mind about the whole system,
     which is a thing people do most in the first fortnight.

     Landing on "choose-location" rather than "signed-out" is the point: with
     no spreadsheet to find, the next load asks which set of categories to
     begin with, which is the screen worth getting back to. */
  const startOver = useCallback(async () => {
    clearTimeout(timer.current);
    clearTimeout(retry.current);
    markPending(false);
    setStatus("loading");
    try {
      if (fileId.current) await Sheets.trashSheet(fileId.current);
    } catch (e) {
      setError(e.message || "Could not remove the spreadsheet.");
      setStatus("error");
      return;
    }
    if (user) {
      try { await AsyncStorage.removeItem(cacheKey(user.email)); } catch (_) {}
      await Sheets.forgetSheet(user.email);
    }
    setDoc(null);
    latest.current = null;
    fileId.current = null;
    folderId.current = null;
    baseTime.current = null;
    setConflict(null);
    setError("");
    setStatus("choose-location");
  }, [user]);

  /* Catching up without being asked.

     A backoff timer alone is not enough: a phone that lost signal in a lift
     and was then put in a pocket has nothing running worth waiting on. The
     two moments a connection has most likely returned are the app coming back
     to the foreground, and — on the web — the browser saying so outright.
     Both are free to listen for and neither needs a native dependency.

     Only fires when something is actually waiting, so the common case of
     opening the app with everything saved costs no requests. */
  useEffect(() => {
    const catchUp = () => {
      if (!dirty.current || !user || !fileId.current) return;
      attempt.current = 0;
      if (pushRef.current) pushRef.current();
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") catchUp();
    });

    let offOnline;
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("online", catchUp);
      offOnline = () => window.removeEventListener("online", catchUp);
    }

    return () => {
      if (sub && sub.remove) sub.remove();
      if (offOnline) offOnline();
    };
  }, [user]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    clearTimeout(retry.current);
  }, []);

  return {
    user, doc, status, error, conflict, pending,
    update, syncNow, resolveConflict,
    signIn, signOut, disconnect, grantAccess, resetPermissions, createIn, exportCsvFile,
    startOver,
    sheetUrl: fileId.current ? Sheets.sheetUrl(fileId.current) : null,
    folderUrl: folderId.current ? Drive.folderUrl(folderId.current) : null,
    configured: !!(CONFIG.iosClientId || CONFIG.webClientId),
  };
}
