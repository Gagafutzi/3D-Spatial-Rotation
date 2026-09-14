"use strict";

/*
 * The contract with the training archive.
 *
 *     node archive-export.test.js
 *
 * The archive recognises sources by the SHAPE of the file, not its name, so
 * what this guards is the shape. Rename the storage key, drop a field from the
 * session record, or wrap the export in a friendlier envelope, and the file
 * stops being claimed by any adapter — which fails silently, as a dropped file
 * that simply says "no adapter recognised that file".
 *
 * Two levels:
 *
 *   1. Shape assertions read out of index.html. These run anywhere, including
 *      on a machine that has never heard of the archive.
 *
 *   2. If the archive is checked out next to this repo, the export is built and
 *      run through its ACTUAL adapter and merge. That is the real test; the
 *      shape assertions above it are the portable approximation.
 *
 * Point ARCHIVE_DIR at the archive to override where it is looked for.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
let checks = 0;

function check(name, condition, detail) {
  checks++;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`);
  }
}

const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");


/* ----------------------------------------------------------------
 * 1. The shape, read out of the page
 * ---------------------------------------------------------------- */

console.log("\nthe shape the archive looks for");

/* The adapter keys off this exact string. If it changes here it has to change
   there, and the export becomes unreadable in the meantime. */
const KEY = "spatial-rotation.progress.v1";

check(
  "the storage key is the one the adapter reads",
  page.includes(`const PROGRESS_KEY = '${KEY}';`),
  "PROGRESS_KEY is not " + KEY
);

check(
  "the export is keyed by PROGRESS_KEY rather than a literal",
  /\[PROGRESS_KEY\]:\s*JSON\.stringify\(progress\)/.test(page),
  "export does not write the progress store under PROGRESS_KEY"
);

check(
  "the export carries __origin for provenance",
  /'__origin':\s*location\.origin/.test(page),
  "no __origin in the export payload"
);

/* The archive stores the raw JSON *string*, the way a storage snapshot holds
   it, not a parsed object. Handing it an object makes the adapter bail. */
check(
  "the store is written as a string, not an object",
  page.includes("JSON.stringify(progress)"),
  "progress is not serialised"
);

console.log("\nthe fields a session record has to carry");

/* Everything readRotation touches on a history entry. */
const SESSION_FIELDS = [
  "ts",
  "mode",
  "seconds",
  "score",
  "attempts",
  "accuracy",
  "peakLevel",
  "endLevel",
  "level",
];

const historyPush = page.slice(
  page.indexOf("progress.history.push({"),
  page.indexOf("progress.history.push({") + 900
);

SESSION_FIELDS.forEach(field => {
  check(
    `a session records \`${field}\``,
    new RegExp("\\b" + field + "\\s*:").test(historyPush),
    "not written by recordSession"
  );
});

/* The ladder, which no single session states. */
["level", "best", "sessions", "seconds"].forEach(field => {
  check(
    `the per-mode ladder records \`${field}\``,
    new RegExp("\\b" + field + "\\s*:").test(
      page.slice(
        page.indexOf("function blankProgressEntry()"),
        page.indexOf("function blankProgressEntry()") + 220
      )
    ),
    "not in blankProgressEntry"
  );
});


/* ----------------------------------------------------------------
 * 2. Against the archive itself, when it is here
 * ---------------------------------------------------------------- */

const archiveDir =
  process.env.ARCHIVE_DIR ||
  path.join(__dirname, "..", "..", "training-archive");

const adaptersPath = path.join(archiveDir, "js", "adapters.js");

if (!fs.existsSync(adaptersPath)) {
  console.log(
    `\n(skipping the end-to-end check: no archive at ${archiveDir}. ` +
    `Set ARCHIVE_DIR to point at it.)`
  );
} else {
  console.log("\nagainst the archive's own adapter and merge");

  const { readFile } = require(adaptersPath);
  const { mergeRecords } = require(path.join(archiveDir, "js", "record.js"));

  /* Built the way exportRecord() builds it. */
  const buildExport = progress =>
    JSON.stringify(
      { "__origin": "https://example.invalid", [KEY]: JSON.stringify(progress) },
      null,
      2
    );

  const session = (ts, mode, attempts, score, peak, end, level) => ({
    ts,
    mode,
    seconds: 600,
    score,
    attempts,
    accuracy: attempts > 0 ? score / attempts : null,
    peakLevel: peak,
    endLevel: end,
    level,
  });

  const store = {
    modes: {
      molecules: { level: 3, best: 5, sessions: 2, seconds: 1200 },
      rs: { level: 1, best: 2, sessions: 1, seconds: 600 },
    },
    history: [
      session(1788600000000, "molecules", 24, 19, 5, 4, 3),
      session(1788610000000, "rs", 12, 9, 2, 2, 1),
    ],
  };

  const read = readFile(buildExport(store));

  check(
    "the export is claimed by the rotation adapter",
    read && !read.error && read.source === "rotation",
    read && read.error
  );

  check("both sessions come through", read.records.length === 2);

  check(
    "modes are told apart by label",
    read.records.map(r => r.label).sort().join(",") === "molecules,rs"
  );

  check(
    "difficulty is the peak level, in its own unit",
    read.records[0].difficulty === 5 && read.records[0].unit === "rotation-level"
  );

  check(
    "a scored session carries its accuracy",
    Math.abs(read.records[0].correct - 19 / 24) < 1e-9
  );

  check(
    "the ladder position survives into raw",
    read.records[0].raw.ladderLevel === 3
  );

  check(
    "per-mode state is exposed",
    read.state && read.state.molecules && read.state.molecules.best === 5
  );

  /* Below the trainer's own threshold an accuracy means nothing, and the
     archive has been bitten by trainers that reported one anyway. */
  const shortStore = {
    modes: {},
    history: [session(1788620000000, "blocks", 3, 3, 1, 1, 0)],
  };

  const shortRead = readFile(buildExport(shortStore));

  check(
    "a session under ten answers reports no accuracy",
    shortRead.records[0].correct === null,
    String(shortRead.records[0].correct)
  );

  check(
    "but its raw accuracy is still kept for later",
    shortRead.records[0].raw.rawAccuracy === 1
  );

  /* The whole promise of the archive: importing twice is a union. */
  const first = mergeRecords([], read.records);
  const twice = mergeRecords(first.records, readFile(buildExport(store)).records);

  check(
    "importing the same export twice adds nothing",
    twice.added === 0 && twice.total === first.total,
    JSON.stringify({ added: twice.added, total: twice.total })
  );

  const grown = JSON.parse(JSON.stringify(store));
  grown.history.push(session(1788700000000, "molecules", 30, 26, 6, 6, 4));

  const merged = mergeRecords(first.records, readFile(buildExport(grown)).records);

  check(
    "a later export contributes only what is new",
    merged.added === 1 && merged.total === first.total + 1,
    JSON.stringify({ added: merged.added, total: merged.total })
  );

  check(
    "ids are stable across separate exports",
    readFile(buildExport(store)).records[0].id ===
      readFile(buildExport(grown)).records[0].id
  );

  /* An empty record is not a file worth writing, and the adapter agrees. */
  const empty = readFile(buildExport({ modes: {}, history: [] }));
  check(
    "an empty record is not claimed as a source",
    !empty || empty.error || empty.source !== "rotation"
  );
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
