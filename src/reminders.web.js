/* ==========================================================================
   Reminders — web.

   Deliberately a no-op that reports itself honestly rather than a half-working
   imitation. A browser tab cannot reliably wake itself at 8pm: scheduled local
   notifications need a service worker and, on iOS, the page installed to the
   home screen — and even then delivery is at the browser's discretion.

   So the web build says plainly that reminders are a phone feature, and the
   Setup screen can tell the user where to get them, rather than silently
   failing at the one job a reminder has.
   ========================================================================== */

export const available = false;

export async function requestPermission() {
  return false;
}

export function reminderBody() {
  return "";
}

export async function sync() {
  return { scheduled: false, unsupported: true };
}
