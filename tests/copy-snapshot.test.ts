// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { captureCopyInput, materializeCopyInput } from "../src/core/input";
import { TargetConverter } from "../src/core/converter";
import { DEFAULT_SETTINGS } from "../src/types";

vi.mock("obsidian", () => ({ MarkdownView: class {}, TFile: class {}, Component: class {}, MarkdownRenderer: {} }));
const file = { basename: "Fixture", path: "Fixture.md", extension: "md" };
afterEach(() => { document.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });

it("keeps a whitespace reading selection distinct from an absent selection", () => {
  const container = document.body.createEl("div");
  const text = document.createTextNode("private  paragraph");
  container.append(text);
  const range = document.createRange();
  range.setStart(text, 7);
  range.setEnd(text, 9);
  document.getSelection()!.addRange(range);
  const read = vi.fn();
  const app = { workspace: { getActiveViewOfType: () => ({ file, getMode: () => "preview", containerEl: container }) },
    vault: { cachedRead: read } };
  expect(captureCopyInput(app as never)).toMatchObject({ isSelection: true, renderedHtml: "" });
  expect(read).not.toHaveBeenCalled();
  document.getSelection()!.removeAllRanges();
  expect(captureCopyInput(app as never)?.isSelection).toBe(false);
});

it("holds the editor revision and resolves selection definitions only when needed", async () => {
  let doc = "See [guide][r].\n\n[r]: https://example.com/old";
  const editor = { getValue: () => doc, listSelections: () => [{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 15 } }],
    getRange: () => "See [guide][r]." };
  const app = { workspace: { getActiveViewOfType: () => ({ file, editor, getMode: () => "source" }) } };
  const snapshot = captureCopyInput(app as never)!;
  doc = "Changed after opening the menu";
  const scan = vi.spyOn(snapshot, "readDefinitions");
  expect((await materializeCopyInput(snapshot, "original-source")).markdown).toBe("See [guide][r].");
  expect(scan).not.toHaveBeenCalled();
  expect((await materializeCopyInput(snapshot, "word")).referenceDefinitions).toContain("example.com/old");
  expect(scan).toHaveBeenCalledTimes(1);
});

it("defers file-menu reads until a target is chosen", async () => {
  const read = vi.fn(async () => "file contents");
  const app = { workspace: { getActiveViewOfType: () => null }, vault: { cachedRead: read } };
  const snapshot = captureCopyInput(app as never, file as never)!;
  expect(read).not.toHaveBeenCalled();
  expect((await materializeCopyInput(snapshot, "word")).markdown).toBe("file contents");
  expect(read).toHaveBeenCalledWith(file);
});

it.each(["html-source", "google-docs"] as const)("enforces the final responsive image budget for %s", async target => {
  const small = "data:image/png;base64," + "A".repeat(1200);
  const big = "DATA:image/png;base64," + "B".repeat(1000);
  const html = '<picture><source srcset="' + big + ' 2x, https://example.com/hi.png 3x"><img src="' + small + '" srcset="' + big + ' 2x"></picture>';
  const app = { vault: { getName: () => "Fixture" }, metadataCache: { getFirstLinkpathDest: () => null } };
  const result = await new TargetConverter(app as never).convert({ markdown: html, sourceFormat: "html",
    sourcePath: "Fixture.html", title: "Fixture", isSelection: false }, target, { ...DEFAULT_SETTINGS, maxTotalImageSizeMb: 0.001 });
  const output = result.html ?? result.text;
  expect(output).toContain(small);
  expect(output).not.toContain(big);
  expect(output).toContain("https://example.com/hi.png");
  expect(result.warnings.join(" ")).toContain("total image limit");
});
