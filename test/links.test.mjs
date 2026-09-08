/* The link detection inside a note.

   Pulled out of the component and tested here because getting it wrong is
   quiet in both directions: a missed link is a note you cannot tap, and an
   over-eager match turns ordinary prose blue and swallows punctuation. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "..", "src", "ui", "kit.js"), "utf8");

/* kit.js is a React module; only the pure link helpers are wanted here, so
   they are lifted out rather than pulling react-native into a Node test. */
const grab = (start, end) => src.slice(src.indexOf(start), src.indexOf(end));
const source = grab("const LINK_RE", "export function Note")
  .replace(/^export /gm, "")
  + "\nexport { LINK_RE, linkParts, isLink, linkLabel };";

const M = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log(`  FAIL ${label}\n         got  ${g}\n         want ${w}`); }
};

console.log("\n1. what counts as a link");
{
  eq("https", M.isLink("https://youtube.com/watch?v=abc"), true);
  eq("http", M.isLink("http://example.com"), true);
  eq("a bare domain is not one", M.isLink("youtube.com/watch"), false);
  eq("nor is prose", M.isLink("Squat, deadlift, bench."), false);
}

console.log("\n2. splitting a note into prose and links");
{
  eq("a note with no link is one part",
     M.linkParts("Hamstring curls x15, glute bridges x20."),
     ["Hamstring curls x15, glute bridges x20."]);

  eq("a link on its own",
     M.linkParts("https://youtube.com/watch?v=abc"),
     ["https://youtube.com/watch?v=abc"]);

  eq("prose either side",
     M.linkParts("Follow https://youtube.com/watch?v=abc for the form."),
     ["Follow ", "https://youtube.com/watch?v=abc", " for the form."]);

  eq("two links",
     M.linkParts("Warm-up https://a.com/x then https://b.com/y"),
     ["Warm-up ", "https://a.com/x", " then ", "https://b.com/y"]);

  eq("one per line",
     M.linkParts("Mobility:\nhttps://a.com/x\nStrength:\nhttps://b.com/y"),
     ["Mobility:\n", "https://a.com/x", "\nStrength:\n", "https://b.com/y"]);
}

console.log("\n3. punctuation stays out of the link");
{
  eq("a full stop ends the sentence, not the url",
     M.linkParts("Watch https://youtube.com/watch?v=abc."),
     ["Watch ", "https://youtube.com/watch?v=abc", "."]);
  eq("so does a comma",
     M.linkParts("See https://a.com/x, then stretch."),
     ["See ", "https://a.com/x", ", then stretch."]);
  eq("and a closing bracket",
     M.linkParts("(https://a.com/x)"),
     ["(", "https://a.com/x", ")"]);
  eq("a trailing slash is part of it",
     M.linkParts("https://a.com/x/"),
     ["https://a.com/x/"]);
}

console.log("\n4. how a link reads");
{
  eq("scheme and www dropped", M.linkLabel("https://www.youtube.com/watch"), "youtube.com/watch");
  eq("query string dropped", M.linkLabel("https://youtube.com/watch?v=dQw4w9WgXcQ"), "youtube.com/watch");
  eq("the host always survives", M.linkLabel("https://example.com"), "example.com");
  eq("trailing slash tidied", M.linkLabel("https://example.com/"), "example.com");
  eq("a very long path is cut",
     M.linkLabel("https://example.com/" + "a".repeat(80)).length, 42);
  eq("and says it was cut",
     M.linkLabel("https://example.com/" + "a".repeat(80)).endsWith("…"), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
