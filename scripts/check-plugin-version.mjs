// Guards the plugin's version against its own content, and the two published artifacts
// against each other. The marketplace cache dir is keyed by version
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
// The shared version line is ADR-0048: between releases the plugin runs ahead (its cache
// forces an immediate bump), and a release closes the gap in the oracle's direction.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const PLUGIN_MANIFEST = "packages/plugin/.claude-plugin/plugin.json";
const MARKETPLACE_MANIFEST = ".claude-plugin/marketplace.json";
const ORACLE_MANIFEST = "packages/oracle/package.json";
const PLUGIN_DIR = "packages/plugin/";

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

  // Invariant C, at the moment it matters — the tarball may not publish behind the skills
  // it carries. The plugin runs ahead between releases by design; a release catches up.
  if (plugin && oracle && plugin.version !== oracle.version) {
    problems.push(
      `Release mismatch: ${ORACLE_MANIFEST} is ${oracle.version}, ${PLUGIN_MANIFEST} is ` +
        `${plugin.version}. The tarball carries these skills, so both publish on one ` +
        `version line — raise the tarball to ${plugin.version}, never lower the plugin.`,
    );
  }
} else {
  const stagedFiles = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);

  const touchesPluginDir = stagedFiles.some((file) => file.startsWith(PLUGIN_DIR));
  const touchesMarketplace = stagedFiles.includes(MARKETPLACE_MANIFEST);
  const touchesOracleManifest = stagedFiles.includes(ORACLE_MANIFEST);

  // A no-op unless the commit touches a version-bearing manifest. A latent mismatch
  // predating this commit shouldn't block an unrelated change.
  if (touchesPluginDir || touchesMarketplace || touchesOracleManifest) {
    const stagedPlugin = parse(show("", PLUGIN_MANIFEST), PLUGIN_MANIFEST);

    // Invariant A — the two manifests always move together.
    if (touchesPluginDir || touchesMarketplace) {
      checkMirror(stagedPlugin, parse(show("", MARKETPLACE_MANIFEST), MARKETPLACE_MANIFEST));
    }

    // Invariant B — changed plugin content must carry a fresh version. Skipped when there
    // is no prior version to compare against (first commit, or a newly-added plugin).
    if (touchesPluginDir && stagedPlugin) {
      const headPlugin = parse(show("HEAD", PLUGIN_MANIFEST), PLUGIN_MANIFEST);
      if (headPlugin && headPlugin.version === stagedPlugin.version) {
        problems.push(
          `packages/plugin/ changed but ${PLUGIN_MANIFEST} is still ${stagedPlugin.version}. ` +
            `The marketplace cache is keyed by version — bump it (and the marketplace ` +
            `mirror) so installs don't serve a stale tree.`,
        );
      }
    }

    // Invariant C — the oracle's version only moves at a release, and a release moves both
    // lines. Bumping it alone would publish the skills under a number the plugin doesn't
    // share. An untouched version is fine: that is the plugin running ahead, by design.
    if (touchesOracleManifest && stagedPlugin) {
      const stagedOracle = parse(show("", ORACLE_MANIFEST), ORACLE_MANIFEST);
      const headOracle = parse(show("HEAD", ORACLE_MANIFEST), ORACLE_MANIFEST);
      const bumped = stagedOracle && headOracle && stagedOracle.version !== headOracle.version;
      if (bumped && stagedOracle.version !== stagedPlugin.version) {
        problems.push(
          `${ORACLE_MANIFEST} bumps to ${stagedOracle.version} but ${PLUGIN_MANIFEST} is ` +
            `${stagedPlugin.version}. A release ships both on one version line — move them ` +
            `together (and the marketplace mirror with them).`,
        );
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
