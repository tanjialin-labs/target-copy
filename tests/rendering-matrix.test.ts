// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { buildRichHtml, type RichTarget } from "../src/adapters/rich-html";
import { domToMarkdown, domToPlainText, domToSlack } from "../src/adapters/text";
import { normalizeRenderedDom } from "../src/core/dom";
import { DEFAULT_SETTINGS, type ConversionContext } from "../src/types";

const RICH_TARGETS: RichTarget[] = [
  "google-docs",
  "word",
  "notion",
  "slack",
  "email",
  "wechat-official",
];

const OBSIDIAN_LINK =
  "obsidian://open?vault=Test%20Vault&file=Notes%2FLinked%20note.md%23Decision";

function createFixture(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <h2>Rendering matrix</h2>
    <p>Plain <strong>bold</strong> <em>italic</em> <del>removed</del>
      <mark>highlighted</mark> <code>inline()</code> and
      <a href="https://example.com/reference">external link</a>.</p>
    <p>A required hard break<br>stays inside one paragraph.</p>
    <p><a class="internal-link" data-href="Linked note#Decision">linked decision</a></p>
    <ol start="3">
      <li>Ordered item<ul><li><input type="checkbox" checked> Completed task</li>
      <li><input type="checkbox"> Open task</li></ul></li>
    </ol>
    <table><thead><tr><th>Element</th><th>Result</th></tr></thead>
      <tbody><tr><td>Table cell</td><td>Full content</td></tr></tbody></table>
    <pre><code class="language-ts"><span style="color:#0550ae">const</span> ready = true;\nreturn ready;</code></pre>
    <p>Inline formula <code class="target-copy-latex-inline"><span>$</span><wbr><span>E=mc^2</span><wbr><span>$</span></code>.</p>
    <pre class="target-copy-latex-block"><code class="language-latex">$$\n\\int_0^1 x^2 dx\n$$</code></pre>
    <div class="callout" data-callout="warning">
      <div class="callout-title">Keep this</div>
      <div class="callout-content"><p>Callout body.</p></div>
    </div>
    <blockquote><p>Quoted body.</p></blockquote>
    <p><img src="data:image/png;base64,AA==" alt="Fixture" width="320" height="180"></p>
    <p>Footnoted claim<sup class="footnote-ref" id="fnref-matrix"><a href="#fn-matrix">1</a></sup>.</p>
    <section class="footnotes"><ol><li id="fn-matrix"><p>Footnote evidence
      <a class="footnote-backref" href="#fnref-matrix">↩</a></p></li></ol></section>
    <picture><source srcset="https://example.com/alternate.webp 2x">
      <img src="data:image/png;base64,AQ==" srcset="app://alternate.png 2x"
        sizes="100vw" alt="Responsive fixture"></picture>
    <p><br></p>
  `;
  const context: ConversionContext = {
    target: "google-docs",
    title: "Rendering matrix",
    sourcePath: "Notes/Source.md",
    isSelection: false,
    settings: DEFAULT_SETTINGS,
    resolveInternalLink: () => OBSIDIAN_LINK,
  };
  normalizeRenderedDom(root, context);
  return root;
}

describe("destination rendering matrix", () => {
  it.each(RICH_TARGETS)("preserves complete content for %s", (target) => {
    const html = buildRichHtml(createFixture(), target);
    const output = document.createElement("div");
    output.innerHTML = html;

    for (const token of [
      "Rendering matrix",
      "bold",
      "italic",
      "removed",
      "highlighted",
      "inline()",
      "external link",
      "required hard break",
      "linked decision",
      "Ordered item",
      "Completed task",
      "Open task",
      "Table cell",
      "Full content",
      "const ready = true;",
      "return ready;",
      "$E=mc^2$",
      "\\int_0^1 x^2 dx",
      "Keep this",
      "Callout body.",
      "Quoted body.",
      "Footnoted claim",
      "Footnote evidence",
    ]) {
      expect(output.textContent, `${target}: ${token}`).toContain(token);
    }

    expect(output.querySelector("h2")).not.toBeNull();
    expect(output.querySelector("strong")).not.toBeNull();
    expect(output.querySelector("em")).not.toBeNull();
    expect(output.querySelector("del")).not.toBeNull();
    expect(output.querySelector("mark")).not.toBeNull();
    expect(output.querySelector("ol[start='3'] ul")).not.toBeNull();
    expect(output.querySelector("input")).toBeNull();
    expect(output.textContent).toContain("☑");
    expect(output.textContent).toContain("☐");
    if (target === "slack") {
      expect(output.querySelector("table")).toBeNull();
      expect(output.querySelector("pre.target-copy-slack-table")?.textContent)
        .toContain("Element    | Result");
    } else {
      expect(output.querySelector("table th")).not.toBeNull();
    }
    expect(output.querySelector(".target-copy-callout")).not.toBeNull();
    expect(output.querySelector("blockquote")).not.toBeNull();
    expect(output.querySelector(`a[href="${OBSIDIAN_LINK}"]`)?.textContent)
      .toBe("linked decision");
    expect(output.querySelector('img[alt="Fixture"]')?.getAttribute("src"))
      .toBe("data:image/png;base64,AA==");
    expect(output.querySelector('img[alt="Fixture"]')?.getAttribute("width")).toBe("320");
    expect(output.querySelector(".target-copy-footnote-ref")?.textContent).toBe("1");
    expect(output.querySelector(".target-copy-footnotes")?.textContent).toContain("Footnote evidence");
    expect(output.querySelector(".footnote-backref"))
      .toBeNull();
    expect(output.querySelector('img[alt="Responsive fixture"]')?.getAttribute("src"))
      .toBe("data:image/png;base64,AQ==");
    const emptyParagraphs = [...output.querySelectorAll("p")].filter(
      (paragraph) =>
        !paragraph.textContent?.trim() &&
        !paragraph.querySelector("img, svg, table, pre, hr, audio, video"),
    );
    expect(emptyParagraphs).toHaveLength(0);
  });

  it("uses a compact editable Google Docs representation without PRE controls", () => {
    const output = document.createElement("div");
    output.innerHTML = buildRichHtml(createFixture(), "google-docs");

    expect(output.querySelectorAll(".target-copy-gdocs-code-source")).toHaveLength(2);
    expect(output.querySelector(".target-copy-gdocs-code pre")).toBeNull();
    expect(output.querySelectorAll(".target-copy-gdocs-code-source br").length).toBeGreaterThan(0);
    for (const row of output.querySelectorAll(".target-copy-gdocs-block > tbody > tr")) {
      expect(row.getAttribute("style")).toContain("page-break-inside: auto");
      expect(row.getAttribute("style")).not.toContain("page-break-inside: avoid");
    }
  });

  it.each(RICH_TARGETS.filter((target) => target !== "google-docs"))(
    "keeps semantic PRE source blocks for %s",
    (target) => {
      const output = document.createElement("div");
      output.innerHTML = buildRichHtml(createFixture(), target);
      expect(output.querySelector('pre code.language-ts')?.textContent)
        .toContain("const ready = true;\nreturn ready;");
      expect(output.querySelector('pre code.language-latex')?.textContent)
        .toContain("$$\n\\int_0^1 x^2 dx\n$$");
    },
  );

  it("keeps equivalent structure in Markdown, Slack, and plain text", () => {
    const root = createFixture();
    const markdown = domToMarkdown(root);
    const slack = domToSlack(root);
    const plain = domToPlainText(root);

    expect(markdown).toContain("## Rendering matrix");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("~~removed~~");
    expect(markdown).toContain("3. Ordered item");
    expect(markdown).toContain("| Element | Result |");
    expect(markdown).toContain("```ts\nconst ready = true;\nreturn ready;\n```");
    expect(markdown).toContain(`[linked decision](${OBSIDIAN_LINK})`);
    expect(markdown).toContain("Footnoted claim[^1].");
    expect(markdown).toContain("[^1]: Footnote evidence");

    expect(slack).toContain("*bold*");
    expect(slack).toContain("~removed~");
    expect(slack).toContain("3. Ordered item");
    expect(slack).toContain(`<${OBSIDIAN_LINK}|linked decision>`);
    expect(slack).toContain("```\nElement");

    expect(plain).toContain("Rendering matrix");
    expect(plain).toContain("3. Ordered item");
    expect(plain).toContain(`linked decision <${OBSIDIAN_LINK}>`);
    expect(plain).toContain("Element    | Result");
    expect(plain).toContain("const ready = true;");
    expect(plain).toContain("Footnoted claim[1].");
    expect(plain).toContain("Footnote evidence");
  });
});
