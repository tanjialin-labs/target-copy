import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("release metadata", () => {
  const packageJson = readJson("package.json") as {
    version: string;
    dependencies?: Record<string, string>;
  };
  const manifest = readJson("manifest.json") as {
    id: string;
    name: string;
    version: string;
    description: string;
    isDesktopOnly: boolean;
  };
  const versions = readJson("versions.json") as Record<string, string>;

  it("keeps package, manifest, and versions metadata in sync", () => {
    expect(manifest.version).toBe(packageJson.version);
    expect(versions[manifest.version]).toBeTypeOf("string");
  });

  it("meets the basic cross-platform community manifest constraints", () => {
    expect(manifest.id).toBe("target-copy");
    expect(manifest.name).toBe("Target Copy");
    expect(manifest.description.length).toBeLessThanOrEqual(250);
    expect(manifest.isDesktopOnly).toBe(true);
    expect(packageJson.dependencies).toBeUndefined();
  });
});

describe("privacy boundary", () => {
  const source = sourceFiles(join(projectRoot, "src"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  it("does not contain network, upload, or clipboard-read APIs", () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bsendBeacon\s*\(/,
      /clipboard\.read(?:Text)?\s*\(/,
      /\baxios\b/,
    ];
    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });

  it("restricts native host access to clipboard writing", () => {
    expect(source).not.toMatch(/from\s+["'](?:node:|fs|path|os|crypto)[^"']*["']/);
    expect(source).not.toMatch(/require\s*\(\s*["'](?:node:|fs|path|os|crypto)/);
    const electronImporters = sourceFiles(join(projectRoot, "src"))
      .filter((path) => /from\s+["']electron["']/.test(readFileSync(path, "utf8")));
    expect(electronImporters).toEqual([join(projectRoot, "src", "core", "clipboard.ts")]);
    expect(source).not.toMatch(/\b(?:ipcRenderer|BrowserWindow|child_process|webContents)\b/);
  });
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(projectRoot, path), "utf8"));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}
