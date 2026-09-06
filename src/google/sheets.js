/* ==========================================================================
   The document, stored as a Google Sheet in the app's own Drive folder.

   The Sheets API accepts the drive.file scope for spreadsheets the app itself
   created, so keeping the data in a spreadsheet costs no extra permission —
   this app still cannot see anything in your Drive it did not make.

   Shape lives in model/sheetFormat.js, which is pure and tested. This file is
   only the transport: find or create the spreadsheet, read four tabs, write
   four tabs.
   ========================================================================== */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAccessToken } from "./auth";
import { resolveFolder, folderUrl } from "./drive";
import { CONFIG } from "../config";
import { TABS, docToSheets, sheetsToDoc } from "../model/sheetFormat";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const FILES = "https://www.googleapis.com/drive/v3/files";
const SHEET_CACHE = "ahammaxxing:sheetId";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

const TITLE = CONFIG.sheetName || "AhamMaxxing";
/* What the spreadsheet used to be called, before it was named after the app
   rather than after the file it replaced. Looked up so an existing sheet is
   renamed rather than abandoned with a second one created beside it. */
const OLD_TITLE = CONFIG.fileName.replace(/\.json$/i, "");
const ORDER = [TABS.CATS, TABS.TARGETS, TABS.TYPES, TABS.LOG];

/* Every call goes through here so the stale-token retry lives in one place. */
async function req(url, opts = {}, retry = true) {
  const token = await getAccessToken({ forceFresh: !retry });
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401 && retry) return req(url, opts, false);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Sheets ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const q = encodeURIComponent;
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/* ---------------------------------------------------------- the workbook -- */

async function findSheet(folderId) {
  const names = [TITLE, OLD_TITLE].filter(Boolean).map((n) => `name = '${esc(n)}'`).join(" or ");
  const params = new URLSearchParams({
    q: `(${names}) and mimeType = '${SHEET_MIME}' and trashed = false and '${folderId}' in parents`,
    spaces: "drive",
    fields: "files(id, name, modifiedTime)",
    pageSize: "5",
  });
  const data = await req(`${FILES}?${params}`);
  const files = data.files || [];
  const found = files.find((f) => f.name === TITLE) || files[0] || null;

  // Bring a sheet created under the old name up to date rather than stranding
  // it and quietly starting a second one.
  if (found && found.name !== TITLE) {
    await req(`${FILES}/${found.id}?fields=id`, {
      method: "PATCH",
      body: JSON.stringify({ name: TITLE }),
    }).catch(() => {});
  }
  return found;
}

async function createSheet(folderId) {
  const made = await req(SHEETS, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: TITLE },
      sheets: ORDER.map((title, i) => ({
        properties: { title, index: i, gridProperties: { frozenRowCount: title === TABS.LOG ? 2 : 1 } },
      })),
    }),
  });
  // A spreadsheet is created in My Drive; move it beside everything else.
  await req(`${FILES}/${made.spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id`, {
    method: "PATCH",
    body: "{}",
  }).catch(() => {});
  return made.spreadsheetId;
}

/* Adds any tab that has been deleted, so a missing one is recoverable rather
   than fatal. */
async function ensureTabs(id) {
  const meta = await req(`${SHEETS}/${id}?fields=sheets.properties`);
  const have = new Set((meta.sheets || []).map((s) => s.properties.title));
  const missing = ORDER.filter((t) => !have.has(t));
  if (!missing.length) return;
  await req(`${SHEETS}/${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: missing.map((title) => ({
        addSheet: { properties: { title, gridProperties: { frozenRowCount: title === TABS.LOG ? 2 : 1 } } },
      })),
    }),
  });
}

async function sheetId(folderId) {
  try {
    const cached = await AsyncStorage.getItem(SHEET_CACHE);
    if (cached) {
      const meta = await req(`${FILES}/${cached}?fields=id,trashed`).catch(() => null);
      if (meta && !meta.trashed) return cached;
      await AsyncStorage.removeItem(SHEET_CACHE);
    }
  } catch (_) { /* resolve properly below */ }

  const found = await findSheet(folderId);
  const id = found ? found.id : await createSheet(folderId);
  try { await AsyncStorage.setItem(SHEET_CACHE, id); } catch (_) {}
  return id;
}

/* ------------------------------------------------------------------ read -- */

export async function loadDoc() {
  const folderId = await resolveFolder();
  const id = await sheetId(folderId);
  await ensureTabs(id);

  const ranges = ORDER.map((t) => `ranges=${q(`${t}!A1:ZZ100000`)}`).join("&");
  const res = await req(`${SHEETS}/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);
  const tabs = {};
  ORDER.forEach((t, i) => { tabs[t] = ((res.valueRanges || [])[i] || {}).values || []; });

  const meta = await req(`${FILES}/${id}?fields=modifiedTime`);
  const empty = !(tabs[TABS.TARGETS] || []).slice(1).some((r) => r && r[0]);

  return {
    id, folderId,
    doc: empty ? null : sheetsToDoc(tabs),
    modifiedTime: meta.modifiedTime,
    empty,
  };
}

/* ----------------------------------------------------------------- write -- */

async function writeTabs(id, tabs) {
  await req(`${SHEETS}/${id}/values:batchClear`, {
    method: "POST",
    body: JSON.stringify({ ranges: ORDER.map((t) => `${t}!A1:ZZ100000`) }),
  });
  await req(`${SHEETS}/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: ORDER.filter((t) => (tabs[t] || []).length)
        .map((t) => ({ range: `${t}!A1`, values: tabs[t] })),
    }),
  });
}

/* Refuses to overwrite work done elsewhere, the same advisory check the JSON
   store used: compare the modifiedTime this device last saw against the one
   the sheet has now. */
export async function saveDoc(id, doc, baseModifiedTime, { force = false } = {}) {
  if (!force && baseModifiedTime) {
    const meta = await req(`${FILES}/${id}?fields=modifiedTime`);
    if (meta.modifiedTime && meta.modifiedTime !== baseModifiedTime) {
      const err = new Error("This sheet changed somewhere else since you last loaded it.");
      err.conflict = true;
      throw err;
    }
  }
  await writeTabs(id, docToSheets(doc));
  const after = await req(`${FILES}/${id}?fields=modifiedTime`);
  return { modifiedTime: after.modifiedTime };
}

export const sheetUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
export { folderUrl };
