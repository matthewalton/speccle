// Guards the two published artifacts' versions against the content they carry, and against
// each other. The marketplace cache dir is keyed by version
// (cache/speccle-marketplace/speccle/<version>/), so shipping changed content under an
// unchanged version serves a stale tree to everyone who already installed — the
// 0.7.0 → 0.7.1 burn.
//
// Two modes:
//
//   (default)   pre-commit. Reads the *staged* index (`git show :<path>`), so the check
//               reflects exactly what the commit will contain, not the working tree.
//   --release   publish time, from packages/oracle's prepublishOnly. Reads the working
//               tree — there is nothing staged at publish — and asserts all three
//               manifests agree before a tarball can be built.
//
// The shared version line is ADR-0048; ADR-0050 closed the window where the plugin could run
// ahead of it. The lines are equal at every commit, and shipped content moves both — because
// a rule enforced only at publish is not enforced while the work is being done.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const PLUGIN_MANIFEST = "packages/plugin/.claude-plugin/plugin.json";
const MARKETPLACE_MANIFEST = ".claude-plugin/marketplace.json";
const ORACLE_MANIFEST = "packages/oracle/package.json";

// What reaches a consumer, and so what a version number has to name (ADR-0050). The tarball's
// `files` are dist + skills + lenses: src compiles to dist, packages/plugin/skills is copied
// in at build time, and lenses ship verbatim. Tests, fixtures, docs, and scripts ship to
// no one.
const SHIPPED = [
  { prefix: "packages/plugin/", carriedBy: "the marketplace tree, and the tarball's skills/" },
  { prefix: "packages/oracle/lenses/", carriedBy: "the tarball's lenses/" },
  {
    prefix: "packages/oracle/src/",
    carriedBy: "the tarball's dist/",
    excludes: (file) => file.endsWith(".test.ts"), // the build excludes them
  },
];

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const isRelease = process.argv.includes("--release");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

// A file's content at a tree-ish ("" is the staged index → `:path`, "HEAD" the last
// commit → `HEAD:path`). null if the path doesn't exist there — a new file, or no commit
// yet; git's "unknown revision" is expected here, so its stderr is silenced.
function show(ref, file) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

const problems = [];

function parse(json, label) {
  if (json === null) return null;
  try {
    return JSON.parse(json);
  } catch {
    problems.push(`${label} is not valid JSON.`);
    return null;
  }
}

// The marketplace's mirror of a plugin manifest, checked for agreement. Shared by both
// modes — invariant A holds staged and released alike.
function checkMirror(plugin, market) {
  if (!plugin || !market) return;
  const entry = (market.plugins ?? []).find((p) => p.name === plugin.name);
  if (!entry) {
    problems.push(`${MARKETPLACE_MANIFEST} has no plugin entry named "${plugin.name}".`);
  } else if (entry.version !== plugin.version) {
    problems.push(
      `Manifest versions disagree: ${PLUGIN_MANIFEST} is ${plugin.version}, ` +
        `${MARKETPLACE_MANIFEST} is ${entry.version}. Bump both together.`,
    );
  }
}

/** Every staged file that a published artifact carries, with what carries it. */
function shippedAmong(files) {
  const hits = [];
  for (const file of files) {
    const rule = SHIPPED.find(
      (candidate) => file.startsWith(candidate.prefix) && candidate.excludes?.(file) !== true,
    );
    if (rule !== undefined) hits.push({ file, carriedBy: rule.carriedBy });
  }
  return hits;
}

/** The first few triggering files, so the demand arrives with its reason attached. */
function evidence(shipped) {
  const shown = shipped.slice(0, 3).map((hit) => `${hit.file} → ${hit.carriedBy}`);
  const rest = shipped.length - shown.length;
  return (
    shown.map((line) => `\n      ${line}`).join("") + (rest > 0 ? `\n      …and ${rest} more` : "")
  );
}

if (isRelease) {
  const read = (file) => {
    try {
      return parse(readFileSync(path.join(REPO_ROOT, file), "utf8"), file);
    } catch {
      problems.push(`${file} is missing or unreadable.`);
      return null;
    }
  };

  const plugin = read(PLUGIN_MANIFEST);
  const oracle = read(ORACLE_MANIFEST);
  checkMirror(plugin, read(MARKETPLACE_MANIFEST));

  // The tarball may not publish under a number the skills it carries do not share. Since
  // ADR-0050 this can only fail on a tree edited outside a commit, but it stays: publish is
  // the last gate, and the one whose failure is unrecoverable.
  if (plugin && oracle && plugin.version !== oracle.version) {
    problems.push(
      `Release mismatch: ${ORACLE_MANIFEST} is ${oracle.version}, ${PLUGIN_MANIFEST} is ` +
        `${plugin.version}. The tarball carries these skills, so both publish on one ` +
        `version line — raise the tarball to ${plugin.version}, never lower the plugin.`,
    );
  }
} else {
  const stagedFiles = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);

  const shipped = shippedAmong(stagedFiles);
  const touchesManifest = [PLUGIN_MANIFEST, MARKETPLACE_MANIFEST, ORACLE_MANIFEST].some((file) =>
    stagedFiles.includes(file),
  );

  // A no-op unless the commit ships something or moves a version. A latent mismatch predating
  // this commit shouldn't block an unrelated change.
  if (shipped.length > 0 || touchesManifest) {
    const stagedPlugin = parse(show("", PLUGIN_MANIFEST), PLUGIN_MANIFEST);
    const stagedOracle = parse(show("", ORACLE_MANIFEST), ORACLE_MANIFEST);

    // Invariant A — the plugin manifest and its marketplace mirror always move together.
    checkMirror(stagedPlugin, parse(show("", MARKETPLACE_MANIFEST), MARKETPLACE_MANIFEST));

    // Invariant B — one version line, at every commit and not just at a release (ADR-0050).
    if (stagedPlugin && stagedOracle && stagedPlugin.version !== stagedOracle.version) {
      problems.push(
        `Version lines disagree: ${ORACLE_MANIFEST} is ${stagedOracle.version}, ` +
          `${PLUGIN_MANIFEST} is ${stagedPlugin.version}. The two artifacts share one ` +
          `version line — move them together, and the marketplace mirror with them.`,
      );
    }

    // Invariant C — shipped content carries a version nothing has published yet. Skipped when
    // there is no prior version to compare against (first commit, or a newly-added manifest).
    if (shipped.length > 0) {
      for (const [manifest, staged] of [
        [PLUGIN_MANIFEST, stagedPlugin],
        [ORACLE_MANIFEST, stagedOracle],
      ]) {
        const head = parse(show("HEAD", manifest), manifest);
        if (head && staged && head.version === staged.version) {
          problems.push(
            `This commit ships content but ${manifest} is still ${staged.version}:` +
              `${evidence(shipped)}\n    Bump it — a consumer already holds ${staged.version}, ` +
              `and neither cache nor registry will hand them a second one.`,
          );
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Plugin version guard failed:\n");
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error("");
  process.exit(1);
}
