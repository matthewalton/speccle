import { access } from "node:fs/promises";
import { join } from "node:path";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

const LOCKFILES: [string, PackageManager][] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
];

export async function detectPackageManager(root: string): Promise<PackageManager> {
  for (const [lockfile, manager] of LOCKFILES) {
    if (await exists(join(root, lockfile))) return manager;
  }
  return "npm";
}

export function installCommandFor(manager: PackageManager, deps: string[]): string {
  const subcommand = manager === "npm" ? "install -D" : manager === "bun" ? "add -d" : "add -D";
  return `${manager} ${subcommand} ${deps.join(" ")}`;
}

export function removeCommandFor(manager: PackageManager, deps: string[]): string {
  const subcommand = manager === "npm" ? "uninstall" : "remove";
  return `${manager} ${subcommand} ${deps.join(" ")}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
