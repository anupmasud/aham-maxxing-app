# AhamMaxxing

Set targets by category, check them off daily, and see how the week actually went.

*Aham* — Sanskrit for "I". You define the categories, you set the targets, you
decide what counts.

One Expo codebase, two outputs: an **iPhone app** and a **web app**. Your data is
a single JSON file in **your own Google Drive**, under `Apps / AhamMaxxing`.
There is no backend and no shared database, so there is nothing to leak between
accounts and nothing of yours on anyone's server.

Built on [drive-starter](https://github.com/anupmasud/drive-starter).

## The model

Every target is three independent axes. Between them they express every kind of
goal the app needs:

| Axis | Values | Meaning |
|---|---|---|
| `kind` | `tick` / `amount` | a checkbox, or a number you log |
| `dir` | `at_least` / `at_most` | a floor to reach, or a ceiling to stay under |
| `period` | `day` / `week` | judged each day, or across the whole week |

- *8,000 steps every day* → `amount` / `at_least` / `day`
- *Strength training 4× a week* → `tick` / `at_least` / `week`
- *No more than 6 units of alcohol a week* → `amount` / `at_most` / `week`

Daily targets can be limited to particular weekdays. Weekly ones can be done any
day; the week is what's judged.

### Floors and ceilings are scored differently, on purpose

The day ring counts only **daily floors** — things you actively have to do. A
ceiling you simply haven't broken yet would otherwise score 100% for doing
nothing, so limits are reported separately ("Limits: all clear") and get a weekly
trend line in Insights rather than a hit rate. The interesting question about
alcohol isn't *did you pass* but *which way is it moving*.

For the same reason a blown **weekly** ceiling doesn't redden its whole week in
the heatmap — one heavy Friday shouldn't repaint the other six days.

Streaks are bounded by the day you started. Without that, an empty week in the
past trivially satisfies "no more than 6 units", and every ceiling reports a
streak reaching back to 1970.

## Screens

- **Today** — the day's ring, a week strip, every target grouped by category
- **Week** — the whole week as a grid, targets × days, cells editable
- **Insights** — hit rates by category and target, streaks, weekly trend lines
  for each limit, and a day-by-day heatmap
- **Setup** — categories and targets, a suggestion library, reminders, and the
  Drive connection

## Reminders

One daily local notification listing what is still open. Local, not push: the
phone schedules it itself, so there is no server, no device tokens, and nothing
about your day leaves the device.

The text is written when it is scheduled, so the app reschedules whenever what's
outstanding changes. It says "Still open: Walk, Water" — information, not
"don't break your streak", which is leverage.

**Phone only.** A browser tab cannot reliably wake itself at 8pm, so the web
build says so plainly rather than failing silently at the one job a reminder has.

## Setup

1. **Google Cloud** — enable the Drive API, add yourself as a Test user, then
   create an **iOS** client whose bundle ID is `com.anupmasud.ahammaxxing`.
   A Web client is already configured and shared with drive-starter, since
   GitHub Pages project sites share one origin.
2. Paste the iOS client ID into `src/config.js`, and its *reversed* form into
   `app.json` → `iosUrlScheme`
   (`123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`).

## Running it

```bash
npm run web
```

For the phone — Google Sign-In has native code, so Expo Go will not work:

```bash
npx expo run:ios
```

## Tests

The domain model is free of React, Drive and the DOM, so it runs in plain Node:

```bash
node test/model.test.mjs
```

44 assertions covering the three axes, scheduled days, scoring, streak bounds,
every description, and the tap/step behaviour. No dependencies, no test runner.

## Deploying the web build

```bash
npm run deploy:web
```

## Files

| | |
|---|---|
| `src/model/targets.js` | the domain model — pure functions |
| `src/model/seed.js` | starting categories, targets and suggestions |
| `src/screens/` | Today, Week, Insights, Setup |
| `src/ui/kit.js` | shared palette and small components |
| `src/google/` | sign-in (per platform) and Drive |
| `src/store/useCloudDoc.js` | local-first document with Drive sync |
| `src/reminders.*.js` | daily local notification |
