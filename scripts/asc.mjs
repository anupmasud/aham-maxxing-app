/* ==========================================================================
   App Store Connect API, as little of it as this project needs.

   Lives in the repository rather than in a scratch directory, which gets
   cleaned between sessions — it has been rewritten from memory three times,
   which is three chances to get the issuer id subtly wrong.

   The key id and issuer id are identifiers, not secrets. The private key is
   the secret, it stays in ~/.appstoreconnect/private_keys, and it is never
   read anywhere but here.
   ========================================================================== */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

export const APP_ID = "6812502682";
const KEY_ID = "GN26L5JP38";
const ISSUER = "cdd15929-0ce3-4b94-8cb4-64ac9f1cb326";

const KEY_PATH = `${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

/* Apple wants ES256 with the signature as raw r||s, not the DER that
   crypto.sign hands back by default — hence `ieee-p1363`. Getting that wrong
   produces a 401 that says nothing about signatures. */
export function token() {
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(`App Store Connect key not found at ${KEY_PATH}`);
  }
  const pem = fs.readFileSync(KEY_PATH, "utf8");
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const body = b64({ iss: ISSUER, iat: now, exp: now + 600, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), {
    key: crypto.createPrivateKey(pem), dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

export async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, text };
}

export const fail = (r) => (r.json?.errors?.[0]?.detail || r.text || String(r.status)).slice(0, 300);

/* The external group, looked up by shape rather than by a stored id — ids do
   not survive a rebuilt scratch directory either. */
export async function externalGroup() {
  const r = await api("GET", `/v1/apps/${APP_ID}/betaGroups`);
  return (r.json?.data || []).find((g) => !g.attributes.isInternalGroup) || null;
}

export async function buildByVersion(version) {
  const r = await api("GET", `/v1/builds?filter%5Bapp%5D=${APP_ID}&limit=10`);
  return (r.json?.data || []).find((b) => b.attributes.version === String(version)) || null;
}
