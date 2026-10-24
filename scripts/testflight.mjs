/* ==========================================================================
   TestFlight chores, as one command.

     node scripts/testflight.mjs status
     node scripts/testflight.mjs invite <email> [...]
     node scripts/testflight.mjs release <buildNumber> <notesFile>

   `release` waits for Apple to finish processing the build, attaches it to the
   external group, sets its release notes, and submits it for beta review —
   the four things that otherwise get done by hand and half-forgotten.
   ========================================================================== */

import fs from "node:fs";
import { APP_ID, api, buildByVersion, externalGroup, fail } from "./asc.mjs";

const [, , cmd, ...args] = process.argv;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function status() {
  const groups = await api("GET", `/v1/apps/${APP_ID}/betaGroups`);
  for (const g of groups.json.data) {
    const t = await api("GET", `/v1/betaGroups/${g.id}/betaTesters?limit=100`);
    console.log(`\n${g.attributes.name}  (${g.attributes.isInternalGroup ? "internal" : "external"})`);
    (t.json?.data || []).forEach((x) =>
      console.log(`  ${x.attributes.email.padEnd(32)} ${x.attributes.state || "invited"}`));
  }
  const builds = await api("GET", `/v1/builds?filter%5Bapp%5D=${APP_ID}&limit=5`);
  console.log("");
  for (const b of builds.json.data) {
    const d = await api("GET", `/v1/builds/${b.id}/buildBetaDetail`);
    const a = d.json?.data?.attributes || {};
    console.log(`build ${String(b.attributes.version).padEnd(3)} ${b.attributes.processingState.padEnd(10)} internal=${a.internalBuildState}  external=${a.externalBuildState}`);
  }
}

async function invite(emails) {
  const group = await externalGroup();
  if (!group) { console.error("no external group"); process.exit(1); }
  for (const email of emails) {
    const r = await api("POST", "/v1/betaTesters", {
      data: {
        type: "betaTesters",
        attributes: { email },
        relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } },
      },
    });
    console.log(`${email.padEnd(32)} ${r.status}  ${r.ok ? (r.json.data.attributes.state || "invited") : fail(r)}`);
  }
}

async function release(version, notesFile) {
  const whatsNew = fs.readFileSync(notesFile, "utf8").trim();
  const group = await externalGroup();

  let build = null;
  for (let i = 0; i < 40; i++) {
    build = await buildByVersion(version);
    if (build && build.attributes.processingState === "VALID") break;
    process.stdout.write(build ? `\r${build.attributes.processingState}…   ` : "\rwaiting for the build…   ");
    await sleep(30000);
  }
  if (!build || build.attributes.processingState !== "VALID") {
    console.error(`\nbuild ${version} is not VALID yet`);
    process.exit(1);
  }
  console.log(`\nbuild ${version} is VALID`);

  const ex = await api("GET", `/v1/builds/${build.id}/betaBuildLocalizations`);
  const existing = (ex.json?.data || []).find((l) => l.attributes.locale === "en-US");
  const notes = existing
    ? await api("PATCH", `/v1/betaBuildLocalizations/${existing.id}`,
        { data: { type: "betaBuildLocalizations", id: existing.id, attributes: { whatsNew } } })
    : await api("POST", "/v1/betaBuildLocalizations",
        { data: { type: "betaBuildLocalizations", attributes: { locale: "en-US", whatsNew },
                  relationships: { build: { data: { type: "builds", id: build.id } } } } });
  console.log(`release notes        ${notes.status} ${notes.ok ? "ok" : fail(notes)}`);

  if (group) {
    const add = await api("POST", `/v1/betaGroups/${group.id}/relationships/builds`,
      { data: [{ type: "builds", id: build.id }] });
    console.log(`attached to ${group.attributes.name.padEnd(9)}${add.status} ${add.ok ? "ok" : fail(add)}`);
  }

  const sub = await api("POST", "/v1/betaAppReviewSubmissions",
    { data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: build.id } } } } });
  console.log(`beta review          ${sub.status} ${sub.ok ? sub.json.data.attributes.betaReviewState : fail(sub)}`);
}

if (cmd === "status") await status();
else if (cmd === "invite") await invite(args);
else if (cmd === "release") await release(args[0], args[1]);
else {
  console.error("usage: testflight.mjs status | invite <email…> | release <buildNumber> <notesFile>");
  process.exit(1);
}
