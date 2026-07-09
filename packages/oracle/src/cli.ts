#!/usr/bin/env node
import { lint } from "./lint.ts";
import { renderHuman } from "./render.ts";

const USAGE = `Usage: speccle-oracle <command> [options]

Commands:
  lint [path] [--json]   Lint every SPEC.md under path (default: current directory)
  strength               Oracle-strength heatmap (not implemented yet)

Exit codes: 0 clean, 1 violations, 2 usage error`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "lint") return runLint(rest);
  if (command === "strength") {
    console.error("speccle-oracle strength is not implemented yet.");
    return 2;
  }
  console.error(USAGE);
  return 2;
}

async function runLint(args: string[]): Promise<number> {
  let json = false;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      return 2;
    } else positional.push(arg);
  }
  if (positional.length > 1) {
    console.error(`lint takes at most one path\n\n${USAGE}`);
    return 2;
  }

  let report;
  try {
    report = await lint(positional[0] ?? ".");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  console.log(json ? JSON.stringify(report, null, 2) : renderHuman(report));
  return report.clean ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
