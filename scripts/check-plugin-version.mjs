// Guards the plugin's version against its own content. The marketplace cache dir is
// keyed by version (cache/speccle-marketplace/speccle/<version>/), so shipping changed
// content under an unchanged version serves a stale tree to everyone who already
// installed — the 0.7.0 → 0.7.1 burn. It runs in pre-commit: any staged change under
// packages/plugin/ must carry a fresh plugin.json version, and the marketplace mirror
// must always agree with it.
//
// Both invariants read the *staged* index (`git show :<path>`), so the check reflects
// exactly what the commit will contain, not the working tree.

import { execFileSync } from "node:child_process";

const PLUGIN_MANIFEST = "packages/plugin/.claude-plugin/plugin.json";
const MARKETPLACE_MANIFEST = ".claude-plugin/marketplace.json";
const PLUGIN_DIR = "packages/plugin/";

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

const stagedFiles = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);

const touchesPluginDir = stagedFiles.some((file) => file.startsWith(PLUGIN_DIR));
const touchesMarketplace = stagedFiles.includes(MARKETPLACE_MANIFEST);

// A no-op unless the commit touches the plugin. A latent version mismatch predating this
// commit shouldn't block an unrelated change.
if (touchesPluginDir || touchesMarketplace) {
  const stagedPlugin = parse(show("", PLUGIN_MANIFEST), PLUGIN_MANIFEST);
  const stagedMarket = parse(show("", MARKETPLACE_MANIFEST), MARKETPLACE_MANIFEST);

  // Invariant A — the two manifests always move together.
  if (stagedPlugin && stagedMarket) {
    const entry = (stagedMarket.plugins ?? []).find((p) => p.name === stagedPlugin.name);
    if (!entry) {
      problems.push(`${MARKETPLACE_MANIFEST} has no plugin entry named "${stagedPlugin.name}".`);
    } else if (entry.version !== stagedPlugin.version) {
      problems.push(
        `Manifest versions disagree: ${PLUGIN_MANIFEST} is ${stagedPlugin.version}, ` +
          `${MARKETPLACE_MANIFEST} is ${entry.version}. Bump both together.`,
      );
    }
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
}

if (problems.length > 0) {
  console.error("Plugin version guard failed:\n");
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error("");
  process.exit(1);
}
