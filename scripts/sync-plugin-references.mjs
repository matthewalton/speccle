// Copies the docs a skill is ordered to *read* into the plugin, so an installed skill
// never needs the network to obey its own instructions. Run with --check in pre-commit:
// a stale copy is a broken skill for everyone who installed the plugin.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const BLOB_BASE = "https://github.com/matthewalton/speccle/blob/main";
const TREE_BASE = "https://github.com/matthewalton/speccle/tree/main";

const REFERENCES = [
  {
    source: "docs/convention.md",
    dest: "packages/plugin/skills/plan-feature/references/convention.md",
  },
  {
    source: "docs/convention.md",
    dest: "packages/plugin/skills/spec-feature/references/convention.md",
  },
  {
    source: "docs/convention.md",
    dest: "packages/plugin/skills/implement-feature/references/convention.md",
  },
  {
    source: "docs/convention.md",
    dest: "packages/plugin/skills/carve-feature/references/convention.md",
  },
  {
    source: "docs/convention.md",
    dest: "packages/plugin/skills/conform/references/convention.md",
  },
];

const MARKDOWN_LINK = /\]\(([^)]+)\)/g;

async function isDirectory(absolutePath) {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch {
    return false;
  }
}

// A link target the copy can still resolve: absolute, an anchor, or a mail link.
function isPortable(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target);
}

async function absolutiseLinks(markdown, sourcePath) {
  const sourceDir = path.posix.dirname(sourcePath);
  const rewrites = [];

  for (const match of markdown.matchAll(MARKDOWN_LINK)) {
    const target = match[1];
    if (isPortable(target)) continue;

    const resolved = path.posix.normalize(path.posix.join(sourceDir, target));
    const base = (await isDirectory(path.join(REPO_ROOT, resolved))) ? TREE_BASE : BLOB_BASE;
    rewrites.push([match[0], `](${base}/${resolved})`]);
  }

  return rewrites.reduce((text, [from, to]) => text.replaceAll(from, to), markdown);
}

function banner(sourcePath) {
  return [
    `<!-- Generated from ${sourcePath} by scripts/sync-plugin-references.mjs — do not edit.`,
    `     Edit the source and run \`pnpm sync:plugin-refs\`. -->`,
    "",
    "",
  ].join("\n");
}

async function render({ source }) {
  const markdown = await readFile(path.join(REPO_ROOT, source), "utf8");
  return banner(source) + (await absolutiseLinks(markdown, source));
}

async function readDest(dest) {
  try {
    return await readFile(path.join(REPO_ROOT, dest), "utf8");
  } catch {
    return null;
  }
}

const checking = process.argv.includes("--check");
const stale = [];

for (const reference of REFERENCES) {
  const expected = await render(reference);
  const actual = await readDest(reference.dest);

  if (actual === expected) continue;

  if (checking) {
    stale.push(reference);
    continue;
  }

  await mkdir(path.dirname(path.join(REPO_ROOT, reference.dest)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, reference.dest), expected);
  console.log(`synced  ${reference.dest}  ← ${reference.source}`);
}

if (stale.length > 0) {
  console.error("Bundled plugin references are stale:\n");
  for (const { source, dest } of stale) console.error(`  ${dest}  ← ${source}`);
  console.error("\nRun `pnpm sync:plugin-refs` and commit the result.");
  process.exit(1);
}

if (checking) console.log("Bundled plugin references are up to date.");
