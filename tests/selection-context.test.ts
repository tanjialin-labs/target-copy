// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { collectReferenceDefinitions } from "../src/core/references";
import { DEFAULT_SETTINGS } from "../src/types";
vi.mock("obsidian", () => ({ TFile: class {}, Component: class {}, MarkdownRenderer: {} }));
import { TargetConverter } from "../src/core/converter";

describe("selection reference context", () => {
  it("collects used link, image and footnote definitions with transitive dependencies", () => {
    const note = `Read [guide][Guide] and note[^one]. ![image][photo]

[guide]: https://example.com/guide "Guide"
[photo]: assets/photo.png
[^one]: Evidence with [further reading][extra].

    A second paragraph.

[extra]: https://example.com/extra
[private]: https://example.com/unrelated`;
    const result = collectReferenceDefinitions(note, note.split("\n")[0]!);
    expect(result).toContain('[guide]: https://example.com/guide "Guide"');
    expect(result).toContain("[photo]: assets/photo.png");
    expect(result).toContain("    A second paragraph.");
    expect(result).toContain("[extra]: https://example.com/extra");
    expect(result).not.toContain("[private]");
  });

  it("honors collapsed and shortcut references and normalizes their labels", () => {
    expect(collectReferenceDefinitions('[A B]: https://example.com', '[a   b][] [A B]'))
      .toBe('[A B]: https://example.com');
  });

  it("leaves inline links, escaped references and examples independent of definitions", () => {
    const source = '[link]: private\n[code]: private\n[escaped]: private\n\n```md\n[hidden]: private\n```';
    expect(collectReferenceDefinitions(source, '[link](https://example.com) `[code]` \\[escaped] [hidden]')).toBe("");
  });

  it("does not duplicate definitions already in the selection", () => {
    const source = '[one][ref]\n\n[ref]: https://example.com';
    expect(collectReferenceDefinitions(source, source)).toBe("");
  });

  it("retains multiline reference URLs and titles", () => {
    const source = '[doc]:\n  https://example.com\n  "Documentation"';
    expect(collectReferenceDefinitions(source, '[doc]')).toBe(source);
  });

  it("uses definition context for Markdown while original source remains exact", async () => {
    const converter = new TargetConverter({ vault: { getName: () => "Vault" } } as never);
    const input = { markdown: '  See [guide][ref].\r\n', referenceDefinitions: '[ref]: https://example.com', title: 'Note', sourcePath: 'Note.md', isSelection: true };
    expect((await converter.convert(input, "markdown", DEFAULT_SETTINGS)).text).toContain('[ref]: https://example.com');
    expect((await converter.convert(input, "original-source", DEFAULT_SETTINGS)).text).toBe(input.markdown);
  });
});
