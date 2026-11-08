// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { normalizeSoftBreaksForRichText } from "../src/core/markdown";
import { domToMarkdown } from "../src/adapters/markdown";
import { domToPlainText } from "../src/adapters/text";
import { buildRichHtml } from "../src/adapters/rich-html";
import { DEFAULT_SETTINGS, normalizeSettings, settingsForTarget } from "../src/types";
vi.mock("obsidian", () => ({ TFile: class {}, Component: class {}, MarkdownRenderer: {} }));
import { TargetConverter } from "../src/core/converter";
const dom = (html: string) => { const root = document.createElement("div"); root.innerHTML = html; return root; };

describe("Markdown block boundaries", () => {
  it.each([
    'Name | Count\n--- | ---\nAlice | 1\nBob | 2',
    '> Name | Count\n> --- | ---\n> Alice | 1\n> Bob | 2',
    'Heading\n--', 'Heading\n=',
    '> > Heading\n> > --',
    '> First\n> > Nested',
  ])("preserves structure in %s", (source) => {
    expect(normalizeSoftBreaksForRichText(source)).toBe(source);
  });
  it("joins prose inside a nested quote without inserting quote markers", () => {
    expect(normalizeSoftBreaksForRichText('> > Alpha\n> > Beta')).toBe('> > Alpha Beta');
  });
  it("continues joining ordinary prose after a table", () => {
    const source = 'A | B\n--- | ---\n1 | 2\n\nOrdinary\nparagraph';
    expect(normalizeSoftBreaksForRichText(source)).toBe('A | B\n--- | ---\n1 | 2\n\nOrdinary paragraph');
  });
});

describe("semantic text export", () => {
  it.each(["audio", "video"])("keeps standalone %s resource addresses", (tag) => {
    expect(domToPlainText(dom(`<${tag} src="https://example.com/media" controls></${tag}>`)))
      .toBe('<https://example.com/media>');
  });
  it("moves emphasis whitespace outside Markdown delimiters", () => {
    expect(domToMarkdown(dom('<p>A<strong> bold </strong>word <em> italic </em>end</p>')))
      .toBe('A **bold** word  *italic* end');
  });
  it("keeps adjacent emphasis runs as HTML", () => {
    expect(domToMarkdown(dom('<p><strong>one</strong><strong>two</strong></p>')))
      .toBe('<strong>one</strong><strong>two</strong>');
  });
  it("preserves inline style semantics and retains complex styling as HTML", () => {
    expect(domToMarkdown(dom('<span style="font-weight:700">Bold</span>'))).toBe('**Bold**');
    expect(domToMarkdown(dom('<span style="font-style:italic">Italic</span>'))).toBe('*Italic*');
    expect(domToMarkdown(dom('<span style="color:red">Color</span>'))).toContain('style="color:red"');
  });
  it("retains the column positions occupied by merged cells", () => {
    const output = domToPlainText(dom('<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td colspan="2">Merged</td><td>9</td></tr><tr><td rowspan="2">Shared</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td></tr></table>'));
    expect(output.split('\n')[2]!.split('|').map((cell) => cell.trim())).toEqual(['Merged', '', '9']);
    expect(output.split('\n')[4]!.split('|').map((cell) => cell.trim())).toEqual(['', '4', '5']);
  });
  it("serializes nested table content once in plain text and Slack", () => {
    const root = dom('<table><tr><td>Outer<table><tr><td>Inner</td></tr></table></td><td>End</td></tr></table>');
    expect(domToPlainText(root).match(/Inner/g)).toHaveLength(1);
    expect(dom(buildRichHtml(root, "slack")).textContent?.match(/Inner/g)).toHaveLength(1);
  });
  it("uses HTML span integers and confines zero rowspans to their row group", () => {
    const root = dom('<table><tbody><tr><td colspan="2.5" rowspan="00">A</td><td>B</td></tr><tr><td>C</td></tr></tbody><tbody><tr><td>D</td><td>E</td><td>F</td></tr></tbody></table>');
    const rows = domToPlainText(root).split('\n').filter((line) => !/^[- |]+$/.test(line))
      .map((line) => line.split('|').map((cell) => cell.trim()));
    expect(rows).toEqual([['A', '', 'B'], ['', '', 'C'], ['D', 'E', 'F']]);
  });
});

describe("destination configuration", () => {
  it("keeps target preferences isolated and supports inheriting general values", () => {
    const settings = normalizeSettings({ ...DEFAULT_SETTINGS, targetPreferences: { word: { includeTitle: true, embedLocalImages: false }, slack: { internalLinkMode: "text" } }, targetOrder: ['slack','word','slack','invalid'] });
    expect(settingsForTarget(settings, "word").includeTitle).toBe(true);
    expect(settingsForTarget(settings, "slack").includeTitle).toBe(false);
    expect(settingsForTarget(settings, "slack").internalLinkMode).toBe("text");
    expect(settingsForTarget(settings, "email").embedLocalImages).toBe(true);
    expect(settings.targetOrder.slice(0,3)).toEqual(['slack','word','google-docs']);
  });
  it("adds the requested filename title to HTML files for each transformed target", async () => {
    const converter = new TargetConverter({vault:{getName:()=>"Vault"},metadataCache:{getFirstLinkpathDest:()=>null}} as never);
    const input = {markdown:'<p>Body</p>',sourceFormat:'html' as const,title:'Report',sourcePath:'Report.html',isSelection:false};
    for (const target of ['google-docs','word','notion','slack','email','wechat-official','markdown','plain-text','html-source'] as const) {
      const result = await converter.convert(input, target, {...DEFAULT_SETTINGS,includeTitle:true});
      expect(result.html || result.text, target).toContain('Report');
    }
    expect((await converter.convert(input, 'original-source', {...DEFAULT_SETTINGS,includeTitle:true})).text).toBe('<p>Body</p>');
  });
  it("retains independently configured notifications and unlimited expansion defaults", () => {
    const settings = normalizeSettings({showNotices:false,showCompatibilityNotices:true,maxImageSizeMb:50,maxTotalImageSizeMb:10});
    expect(settings.maxTotalImageSizeMb).toBe(10);
    expect(settings.showNotices).toBe(false);
    expect(settings.showCompatibilityNotices).toBe(true);
    expect(settings.maxEmbedCount).toBe(0);
    expect(settings.maxEmbedDepth).toBe(0);
  });
});
