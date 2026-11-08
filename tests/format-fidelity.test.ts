// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRichHtml, type RichTarget } from "../src/adapters/rich-html";
import { domToMarkdown } from "../src/adapters/markdown";
import { adaptForTarget } from "../src/adapters";
import { getReadingViewSelection } from "../src/core/selection";
import { sourceSegments } from "../src/core/source";
import { toPortableMarkdown } from "../src/core/markdown";
import { abortable } from "../src/core/cancellation";
import { DEFAULT_SETTINGS } from "../src/types";

function dom(html: string): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

function select(root: HTMLElement, start: Node, startOffset: number, end: Node, endOffset: number): HTMLElement {
  document.body.append(root);
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return dom(getReadingViewSelection(root)!);
}

afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); });

describe("rich text fidelity", () => {
  it.each<RichTarget>(["google-docs", "word", "email", "notion", "slack", "wechat-official"])(
    "exports explicit deletion and underline styles for %s", (target) => {
      const output = dom(buildRichHtml(dom("<p><del>Removed</del> <u>Underlined</u></p>"), target));
      expect(output.querySelector("del")?.style.textDecoration).toBe("line-through");
      expect(output.querySelector("u")?.style.textDecoration).toBe("underline");
    },
  );

  it("retains code spaces, tabs, and trailing newlines in Google Docs HTML", () => {
    const source = "  first\tvalue  \n\n    second\n";
    const root = dom("<pre><code></code></pre>");
    root.querySelector("code")!.textContent = source;
    const output = dom(buildRichHtml(root, "google-docs"));
    const code = output.querySelector<HTMLElement>(".target-copy-gdocs-code-source")!;
    expect(code.localName).toBe("p");
    expect(code.style.margin).toBe("0px");
    expect([...code.querySelectorAll("span")].every((span) => span.style.whiteSpace === "pre-wrap")).toBe(true);
    code.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    expect(code.textContent).toBe(source);
    expect(output.textContent).not.toContain("\u00a0");
  });

  it("distinguishes a closing fence newline from raw HTML code content", () => {
    const output = dom(buildRichHtml(dom('<pre data-target-copy-fenced-code><code>a\n\n</code></pre>'), "google-docs"));
    expect(output.querySelectorAll("br")).toHaveLength(1);
    expect(output.innerHTML).not.toContain("data-target-copy-fenced-code");
  });

  it("declares normal paragraph semantics inside Google Docs table cells", () => {
    const output = dom(buildRichHtml(dom("<h1>Title</h1><p>Body</p><table><tr><td>Cell</td></tr></table>"), "google-docs"));
    expect(output.querySelector("h1")?.getAttribute("style")).toContain("mso-outline-level:1");
    for (const p of output.querySelectorAll("p")) expect(p.getAttribute("style")).toContain("mso-outline-level:body-text");
    expect(output.querySelector<HTMLElement>("td p")?.style.margin).toBe("0px");
  });

  it("preserves Obsidian link addresses with a Google Docs compatibility notice", () => {
    const root = dom('<p><a href="obsidian://open?vault=Example&amp;file=Note">wikilink</a></p>');
    const result = adaptForTarget("google-docs", root, "", {
      target: "google-docs", sourcePath: "Note.md", title: "", isSelection: true, settings: DEFAULT_SETTINGS,
    }, []);
    expect(result.html).toContain('href="obsidian://open?vault=Example&amp;file=Note"');
    expect(result.text).toContain("obsidian://open?vault=Example&file=Note");
    expect(result.warnings.some((warning) => warning.includes("Google Docs"))).toBe(true);
  });
});

describe("reading selections", () => {
  it("recognizes a selection containing only a checkbox", () => {
    const root = dom('<p><input type="checkbox" checked></p>');
    const paragraph = root.querySelector("p")!;
    const output = select(root, paragraph, 0, paragraph, 1);
    expect(output.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
  });
  it("retains a partial heading's level and inline formatting", () => {
    const root = dom("<h3>A <em>selected title</em> suffix</h3>");
    const text = root.querySelector("em")!.firstChild!;
    const output = select(root, text, 0, text, 8);
    expect(output.querySelector("h3 em")?.textContent).toBe("selected");
    expect(output.textContent).toBe("selected");
  });

  it("keeps numbering when the selection starts at an element boundary", () => {
    const root = dom('<ol start="4"><li>One</li><li>Two</li><li>Three</li></ol>');
    const list = root.querySelector("ol")!;
    const output = select(root, list, 1, list, 3);
    expect(output.querySelector("ol")?.getAttribute("start")).toBe("5");
    expect(output.textContent).toBe("TwoThree");
  });

  it("keeps numbering when a partial list selection ends in the following paragraph", () => {
    const root = dom('<ol start="4"><li>One</li><li value="8">Two</li><li>Three</li></ol><p>After</p>');
    const text = root.querySelectorAll("li")[2]!.firstChild!;
    const end = root.querySelector("p")!.firstChild!;
    const output = select(root, text, 0, end, 5);
    expect(output.querySelector("ol")?.getAttribute("start")).toBe("9");
    expect(output.textContent).toBe("ThreeAfter");
  });

  it("retains definitions for matching footnote IDs in distinct embedded notes", () => {
    const root = dom(['First', 'Second'].map((note) => `<div data-embed-path="${note}.md"><p>${note}<a class="footnote-link" href="#fn-1">1</a></p><section class="footnotes"><ol><li id="fn-1">${note} evidence</li></ol></section></div>`).join(""));
    const first = root.querySelector("p")!.firstChild!;
    const last = root.querySelectorAll("p")[1]!.lastChild!;
    const output = select(root, first, 0, last, 1);
    expect(output.querySelector('[data-embed-path="First.md"] .footnotes')?.textContent).toBe("First evidence");
    expect(output.querySelector('[data-embed-path="Second.md"] .footnotes')?.textContent).toBe("Second evidence");
  });
});

describe("source boundaries", () => {
  it("retains highlights independently of bold and protects inline code", () => {
    expect(toPortableMarkdown('==highlighted `code` and **bold**==', DEFAULT_SETTINGS))
      .toBe('<mark>highlighted `code` and **bold**</mark>');
    expect(toPortableMarkdown('\\==literal== and `==code==`', DEFAULT_SETTINGS))
      .toBe('\\==literal== and `==code==`');
    expect(domToMarkdown(dom('<p><mark>Highlight <strong>bold</strong></mark></p>')))
      .toBe('<mark>Highlight **bold**</mark>');
  });
  it("keeps greater-than signs within quoted source fences", () => {
    const source = '> ```sh\n> > output.txt\n> >> append.txt\n> ```\n';
    expect(sourceSegments(source)[0]?.body).toBe("> output.txt\n>> append.txt\n");
  });

  it("keeps escaped wikilinks literal", () => {
    const source = String.raw`Literal \[[Note|name]] and \![[image.png]]`;
    expect(toPortableMarkdown(source, DEFAULT_SETTINGS)).toBe(source);
  });

  it("keeps separate paragraphs inside HTML table cells", () => {
    expect(domToMarkdown(dom("<table><tr><td><p>First</p><p>Second</p></td></tr></table>")))
      .toContain("First<br><br>Second");
  });

  it("retains a callout whose body contains only an image", () => {
    const root = dom('<div class="target-copy-callout"><p class="target-copy-callout-title">Image</p><div class="target-copy-callout-content"><img src="chart.png" alt="Chart"></div></div>');
    expect(domToMarkdown(root)).toContain('> ![Chart](chart.png)');
  });

  it("retains image titles and presentation attributes in Markdown output", () => {
    expect(domToMarkdown(dom('<p><img src="a.png" alt="" title="Caption"></p>'))).toBe('![](a.png "Caption")');
    expect(domToMarkdown(dom('<img src="a.png" width="320" srcset="b.png 2x">'))).toContain('width="320" srcset="b.png 2x"');
  });

  it("releases its cancellation listener while an underlying read is pending", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = abortable(new Promise(() => {}), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
