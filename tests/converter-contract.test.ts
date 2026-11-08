// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TargetConverter } from "../src/core/converter";
import { DEFAULT_SETTINGS, TARGET_IDS, type CopyInput } from "../src/types";

vi.mock("../src/core/render-note", () => ({ renderNote: vi.fn(() => { throw new Error("HTML input must not use Markdown rendering"); }) }));
vi.mock("obsidian", () => ({ TFile: class {}, Component: class {}, MarkdownRenderer: {} }));

const app = {
  vault: { getName: () => "Fixture", getAbstractFileByPath: () => null },
  metadataCache: { getFirstLinkpathDest: () => null },
};
const converter = new TargetConverter(app as never);
const input: CopyInput = { markdown: "", title: "Fixture", sourcePath: "Fixture.md", isSelection: true };

describe("source and format boundaries", () => {
  it("copies original whitespace and frontmatter independently of transformation settings", async () => {
    const source = "  \r\n---\r\nx: 1\r\n---\r\n%% hidden %%\r\n    [[Note]]\r\n";
    const result = await converter.convert({ ...input, markdown: source }, "original-source", {
      ...DEFAULT_SETTINGS, stripComments: true, stripFrontmatter: true, includeTitle: true,
    });
    expect(result.text).toBe(source);
    expect(result.html).toBeUndefined();
  });

  it("requires source selection when exact source is unavailable in reading view", async () => {
    await expect(converter.convert({ ...input, renderedHtml: "<b>Selected</b>" }, "original-source", DEFAULT_SETTINGS))
      .rejects.toThrow("editor");
  });

  it("exports HTML markup with only the text MIME representation", async () => {
    const result = await converter.convert({ ...input, renderedHtml: "<p>Hello <b>world</b></p>" }, "html-source", DEFAULT_SETTINGS);
    expect(result.text).toContain("<b");
    expect(result.html).toBeUndefined();
  });

  it("converts an HTML file to Markdown while preserving complex table structure", async () => {
    const source = '<p><strong>Title</strong><br>Next</p><table><tr><td colspan="2">Merged</td></tr></table>';
    const result = await converter.convert({ ...input, markdown: source, sourceFormat: "html" }, "markdown", DEFAULT_SETTINGS);
    expect(result.text).toContain("**Title**  \nNext");
    expect(result.text).toContain('colspan="2"');
  });

  it.each(TARGET_IDS.filter((target) => target !== "original-source"))("keeps essential HTML content for %s", async (target) => {
    const result = await converter.convert({ ...input, renderedHtml:
      '<p><a href="https://example.com">Link</a> <b>Bold</b></p><ul><li><input type="checkbox" checked>Done</li></ul><pre><code>a\n\n\nb</code></pre>',
    }, target, DEFAULT_SETTINGS);
    const content = result.html || result.text;
    expect(content).toContain("example.com");
    expect(content).toContain("Bold");
    expect(content).toContain("Done");
  });

  it("uses readable clipboard text for Slack's editor", async () => {
    const result = await converter.convert({ ...input, renderedHtml: '<p>2 * 3 <a href="https://example.com">Link</a></p>' }, "slack", DEFAULT_SETTINGS);
    expect(result.text).toBe("2 * 3 Link <https://example.com>");
    expect(result.html).toContain("https://example.com");
  });
});
