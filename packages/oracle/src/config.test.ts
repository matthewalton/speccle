import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONFIG_FILE,
  type SpeccleConfig,
  detectConfig,
  initConfig,
  readConfig,
  resolveFacts,
  writeConfig,
} from "./config.ts";

const roots: string[] = [];

async function scaffold(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "speccle-config-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("readConfig", () => {
  it("returns undefined when the repo has no config yet", async () => {
    const root = await scaffold({});
    expect(await readConfig(root)).toBeUndefined();
  });

  it("reads the recorded dialect and suite", async () => {
    const root = await scaffold({
      [CONFIG_FILE]: JSON.stringify({ dialect: "swift", suite: "xcodebuild test -scheme Ladder" }),
    });
    expect(await readConfig(root)).toEqual({
      dialect: "swift",
      suite: "xcodebuild test -scheme Ladder",
    });
  });

  it("throws, naming the file, on malformed JSON", async () => {
    const root = await scaffold({ [CONFIG_FILE]: "{not json" });
    await expect(readConfig(root)).rejects.toThrow(/\.speccle\/config\.json is not valid JSON/);
  });

  it("rejects an unknown top-level dialect, naming the file", async () => {
    const root = await scaffold({
      [CONFIG_FILE]: JSON.stringify({ dialect: "kotlin", suite: "x" }),
    });
    await expect(readConfig(root)).rejects.toThrow(
      /\.speccle\/config\.json: unknown test dialect: kotlin/,
    );
  });

  it("rejects an unknown dialect in an override", async () => {
    const root = await scaffold({
      [CONFIG_FILE]: JSON.stringify({
        dialect: "ts-vitest",
        suite: "npm test",
        overrides: [{ path: "ios", dialect: "kotlin" }],
      }),
    });
    await expect(readConfig(root)).rejects.toThrow(/unknown test dialect: kotlin/);
  });
});

describe("resolveFacts", () => {
  const config: SpeccleConfig = {
    dialect: "ts-vitest",
    suite: "pnpm test",
    overrides: [
      { path: "ios", dialect: "swift", suite: "swift test" },
      { path: "ios/App", suite: "xcodebuild test -scheme App" },
    ],
  };

  it("returns the repo defaults where no override matches", () => {
    expect(resolveFacts(config, "features/basket")).toEqual({
      dialect: "ts-vitest",
      suite: "pnpm test",
    });
  });

  it("applies a matching override", () => {
    expect(resolveFacts(config, "ios/features/ladder")).toEqual({
      dialect: "swift",
      suite: "swift test",
    });
  });

  it("lets the most specific override win per field, the shorter filling the rest", () => {
    // ios/App sets only suite; the dialect still comes from the shorter ios override.
    expect(resolveFacts(config, "ios/App/Sources")).toEqual({
      dialect: "swift",
      suite: "xcodebuild test -scheme App",
    });
  });

  it("matches on path segments, never a bare string prefix", () => {
    // "iosx" must not match the "ios" override.
    expect(resolveFacts(config, "iosx/features")).toEqual({
      dialect: "ts-vitest",
      suite: "pnpm test",
    });
  });
});

describe("detectConfig", () => {
  it("reads swift from Package.swift and defaults its suite to SwiftPM", async () => {
    const root = await scaffold({ "Package.swift": "// swift-tools-version:5.9\n" });
    expect(await detectConfig(root)).toEqual({ dialect: "swift", suite: "swift test" });
  });

  it("reads ts-vitest from a package.json and runs the detected package manager's test", async () => {
    const root = await scaffold({ "package.json": "{}", "pnpm-lock.yaml": "" });
    expect(await detectConfig(root)).toEqual({ dialect: "ts-vitest", suite: "pnpm test" });
  });

  it("falls back to npm test when no lockfile names the package manager", async () => {
    const root = await scaffold({ "package.json": "{}" });
    expect(await detectConfig(root)).toEqual({ dialect: "ts-vitest", suite: "npm test" });
  });

  it("runs bun through `bun run test`, not bun's own runner", async () => {
    const root = await scaffold({ "package.json": "{}", "bun.lock": "" });
    expect((await detectConfig(root)).suite).toBe("bun run test");
  });
});

describe("writeConfig", () => {
  it("creates .speccle/ and writes pretty JSON with a trailing newline", async () => {
    const root = await scaffold({});
    await writeConfig(root, { dialect: "ts-vitest", suite: "npm test" });
    const raw = await readFile(join(root, CONFIG_FILE), "utf8");
    expect(raw).toBe('{\n  "dialect": "ts-vitest",\n  "suite": "npm test"\n}\n');
  });
});

describe("initConfig", () => {
  it("writes a detected config when none exists", async () => {
    const root = await scaffold({ "Package.swift": "" });
    const report = await initConfig(root);
    expect(report.action).toBe("written");
    expect(report.config).toEqual({ dialect: "swift", suite: "swift test" });
    expect(await readConfig(root)).toEqual(report.config);
  });

  it("keeps a hand-edited config untouched, the written record winning over detection", async () => {
    const root = await scaffold({
      "Package.swift": "",
      [CONFIG_FILE]: JSON.stringify({ dialect: "swift", suite: "xcodebuild test -scheme Ladder" }),
    });
    const report = await initConfig(root);
    expect(report.action).toBe("kept");
    expect(report.config.suite).toBe("xcodebuild test -scheme Ladder");
  });

  it("is idempotent: a second run keeps what the first wrote", async () => {
    const root = await scaffold({ "package.json": "{}" });
    await initConfig(root);
    expect((await initConfig(root)).action).toBe("kept");
  });
});
