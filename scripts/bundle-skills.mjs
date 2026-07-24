// Copies the plugin's skills into the oracle package so the published `speccle` tarball
// carries them (ADR-0046). `speccle init` then materializes this payload into a target's
// .claude/skills/. Generated at build time — packages/oracle/skills/ is gitignored — so the
// build (and prepublishOnly through it) can never ship a stale copy. Moving or renaming
// packages/plugin/skills/ is a breaking change to this step.

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(REPO_ROOT, "packages/plugin/skills");
const DEST = path.join(REPO_ROOT, "packages/oracle/skills");

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
await cp(SOURCE, DEST, { recursive: true });

const names = (await readdir(DEST, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
console.log(`bundled ${names.length} skills into packages/oracle/skills/  (${names.join(", ")})`);
