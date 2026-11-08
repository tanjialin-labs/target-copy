// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { buildRichHtml } from "../src/adapters/rich-html";
import { adaptForTarget } from "../src/adapters";
import { domToMarkdown, domToPlainText, domToSlack } from "../src/adapters/text";
import { normalizeRenderedDom } from "../src/core/dom";
import { processRenderedVisuals } from "../src/core/visuals";
import { DEFAULT_SETTINGS, type ConversionContext } from "../src/types";

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

const context: ConversionContext = {
  target: "google-docs",
  title: "Fixture",
  sourcePath: "Fixture.md",
  isSelection: false,
  settings: DEFAULT_SETTINGS,
  resolveInternalLink: (target) =>
    `obsidian://open?vault=Test%20Vault&file=${encodeURIComponent(target)}`,
};

const PORTABLE_LINK = "obsidian://open?vault=Test%20Vault&file=Secret";

describe("normalizeRenderedDom", () => {
  it("removes unsafe content and converts interactive checkboxes", () => {
    const root = rootWith(`
      <script>alert(1)</script>
      <p><input type="checkbox" checked> Done</p>
      <a href="javascript:alert(1)" onclick="alert(1)">Unsafe</a>
    `);
    normalizeRenderedDom(root, context);

    expect(root.querySelector("script")).toBeNull();
    expect(root.textContent).toContain("<script>alert(1)</script>");
    expect(root.querySelector("input")).toBeNull();
    expect(root.textContent).toContain("☑");
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).toContain('href="javascript:alert(1)"');
    expect(root.textContent).toContain('onclick="alert(1)"');
  });

  it("allows image data URLs but rejects data URLs as links", () => {
    const root = rootWith(`
      <a href="data:text/html,unsafe">Unsafe data link</a>
      <img alt="Safe image" src="data:image/png;base64,AA==">
      <img alt="Unsafe image" src="data:text/html,unsafe">
    `);
    normalizeRenderedDom(root, context);

    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).toContain('href="data:text/html,unsafe"');
    expect(root.querySelector('img[alt="Safe image"]')?.hasAttribute("src")).toBe(true);
    expect(root.querySelector('img[alt="Unsafe image"]')).toBeNull();
    expect(root.textContent).toContain('src="data:text/html,unsafe"');
  });

  it("keeps local image references readable in Markdown and plain-text selections", () => {
    for (const target of ["markdown", "plain-text"] as const) {
      const root = rootWith(
        '<img alt="Diagram" data-path="Assets/diagram.svg" src="app://obsidian.md/Assets/diagram.svg">',
      );
      normalizeRenderedDom(root, { ...context, target });
      expect(root.querySelector("img")?.getAttribute("src"), target)
        .toBe("Assets/diagram.svg");
      expect(root.textContent, target).not.toContain("<img");
    }
  });

  it("keeps unsafe URLs in SVG and media as inert visible source", () => {
    const root = rootWith(`
      <svg><a href="javascript:alert(1)">Unsafe SVG link</a></svg>
      <video src="javascript:alert(2)"></video>
    `);
    normalizeRenderedDom(root, context);

    expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(root.querySelector('video[src^="javascript:"]')).toBeNull();
    expect(root.textContent).toContain('href="javascript:alert(1)"');
    expect(root.textContent).toContain('src="javascript:alert(2)"');
  });

  it("turns Obsidian callouts into portable semantic blocks", () => {
    const root = rootWith(`
      <div class="callout" data-callout="warning">
        <div class="callout-title">Important</div>
        <div class="callout-content"><p>Read this.</p></div>
      </div>
    `);
    normalizeRenderedDom(root, context);
    expect(root.querySelector(".target-copy-callout-title")?.textContent).toBe("Important");
    expect(root.querySelector(".target-copy-callout-content")?.textContent).toContain("Read this.");
  });

  it("removes vault-only links when configured for visible text", () => {
    const root = rootWith('<a class="internal-link" data-href="Secret">Alias</a>');
    normalizeRenderedDom(root, {
      ...context,
      settings: { ...DEFAULT_SETTINGS, internalLinkMode: "text" },
    });
    expect(root.innerHTML).toBe("<span>Alias</span>");
  });

  it("creates a clickable Obsidian link by default", () => {
    const root = rootWith('<a class="internal-link" data-href="Secret">Alias</a>');
    normalizeRenderedDom(root, context);
    expect(root.querySelector("a")?.textContent).toBe("Alias");
    expect(root.querySelector("a")?.getAttribute("href")).toBe(PORTABLE_LINK);
    expect(root.querySelector("a")?.classList.contains("internal-link")).toBe(false);
  });

  it("keeps Obsidian tags as portable visible text instead of broken document anchors", () => {
    const root = rootWith('<p>Tagged <a class="tag" href="#demo" data-tag="demo">#demo</a>.</p>');
    normalizeRenderedDom(root, context);
    expect(root.innerHTML).toBe("<p>Tagged <span>#demo</span>.</p>");
  });

  it("preserves vault link source syntax when requested", () => {
    const root = rootWith('<a class="internal-link" data-href="Secret">Alias</a>');
    normalizeRenderedDom(root, {
      ...context,
      settings: { ...DEFAULT_SETTINGS, internalLinkMode: "source" },
    });
    expect(root.textContent).toBe("[[Secret|Alias]]");
  });

  it("uses portable links for every rich destination", () => {
    const targets = [
      "google-docs",
      "word",
      "notion",
      "slack",
      "email",
      "wechat-official",
    ] as const;

    for (const target of targets) {
      const root = rootWith('<a class="internal-link" data-href="Secret">Alias</a>');
      normalizeRenderedDom(root, { ...context, target });
      const html = buildRichHtml(root, target);
      expect(html, target).toContain(`href="${PORTABLE_LINK.replaceAll("&", "&amp;")}"`);
      expect(html, target).toContain(">Alias</a>");
    }
  });

  it("keeps portable links useful in Markdown, plain text, and Slack text", () => {
    const root = rootWith('<a class="internal-link" data-href="Project note">Alias</a>');
    normalizeRenderedDom(root, {
      ...context,
      resolveInternalLink: () => PORTABLE_LINK,
    });
    expect(domToMarkdown(root)).toBe(`[Alias](${PORTABLE_LINK})`);
    expect(domToPlainText(root)).toBe(`Alias <${PORTABLE_LINK}>`);
    expect(domToSlack(root)).toBe(`<${PORTABLE_LINK}|Alias>`);
  });

  it("turns rendered SVG visuals into editable source for text targets", async () => {
    const root = rootWith(`
      <div class="mermaid"><svg viewBox="0 0 10 10"></svg></div>
      <div class="math"><svg viewBox="0 0 10 10"></svg></div>
    `);
    const result = await processRenderedVisuals(root, false);
    expect(result.converted).toBe(0);
    expect(root.textContent).toContain("<svg");
    expect(root.textContent).toContain('viewBox="0 0 10 10"');
    expect(root.querySelector("svg")).toBeNull();
  });
});

describe("text adapters", () => {
  it("uses normalized readable text as the fallback for rich destinations", () => {
    const root = rootWith("<p>A source line wraps into one paragraph.</p>");
    const result = adaptForTarget(
      "google-docs",
      root,
      "A source line wraps\ninto one paragraph.",
      context,
      [],
    );
    expect(result.text).toBe("A source line wraps into one paragraph.");
    expect(result.html).toContain("A source line wraps into one paragraph.");
  });

  it("creates Slack mrkdwn and a monospace table representation", () => {
    const root = rootWith(`
      <h2>Release</h2>
      <p><strong>Ready</strong> for <a href="https://example.com">review</a>.</p>
      <table><thead><tr><th>Name</th><th>Status</th></tr></thead>
      <tbody><tr><td>Alpha</td><td>Done</td></tr></tbody></table>
    `);
    const text = domToSlack(root);
    expect(text).toContain("*Release*");
    expect(text).toContain("*Ready*");
    expect(text).toContain("<https://example.com|review>");
    expect(text).toContain("```");
    expect(text).toContain("Name  | Status");
  });

  it("aligns Chinese table content by visual width", () => {
    const root = rootWith(`
      <table><tr><th>名称</th><th>Status</th></tr>
      <tr><td>A</td><td>完成</td></tr></table>
    `);
    const text = domToSlack(root);
    expect(text).toContain("名称 | Status");
    expect(text).toContain("A    | 完成");
  });

  it("escapes literal Slack formatting characters without breaking semantic emphasis", () => {
    const root = rootWith("<p>Use 2 * 3 and <strong>keep this bold</strong>.</p>");
    expect(domToSlack(root)).toBe("Use 2 \\* 3 and *keep this bold*.");
  });

  it("keeps list structure in plain text", () => {
    const root = rootWith("<ol><li>First</li><li>Second<ul><li>Nested</li></ul></li></ol>");
    expect(domToPlainText(root)).toBe("1. First\n2. Second\n  • Nested");
  });

  it("does not truncate long table cells or discard link and image locations", () => {
    const longValue = "A".repeat(120);
    const root = rootWith(
      `<p><a href="mailto:test@example.com">Email us</a> <img alt="Diagram" src="diagram.svg"></p>` +
      `<table><tr><td>${longValue}</td></tr></table>`,
    );
    const text = domToPlainText(root);
    expect(text).toContain("Email us <mailto:test@example.com>");
    expect(text).toContain("![Diagram](diagram.svg)");
    expect(text).toContain(longValue);
    expect(text).not.toContain("…");
  });

  it("keeps standalone links and avoids duplicating embedded image bytes in text", () => {
    const root = rootWith(
      '<a href="https://example.com/source">Source</a><img alt="Asset" src="data:image/png;base64,AAECAwQ=">',
    );
    expect(domToPlainText(root)).toContain("Source <https://example.com/source>");
    expect(domToPlainText(root)).toContain("[Image: Asset]");
    expect(domToPlainText(root)).not.toContain("AAECAwQ=");
    expect(domToMarkdown(root)).toContain("[Source](https://example.com/source)");
    expect(domToMarkdown(root)).toContain("![Asset](data:image/png;base64,AAECAwQ=)");
  });

  it("reconstructs portable Markdown from a rendered selection", () => {
    const root = rootWith(`
      <h2>Selected section</h2>
      <p><strong>Bold</strong>, <em>italic</em>, and <a href="https://example.com/a b">a link</a>.</p>
      <ul><li>First</li><li>Second</li></ul>
      <table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>
      <pre><code class="language-ts">const ready = true;</code></pre>
    `);
    const markdown = domToMarkdown(root);
    expect(markdown).toContain("## Selected section");
    expect(markdown).toContain("**Bold**, *italic*, and [a link](https://example.com/a%20b).");
    expect(markdown).toContain("- First\n- Second");
    expect(markdown).toContain("| Name | Value |");
    expect(markdown).toContain("```ts\nconst ready = true;\n```");
  });

  it("does not promote the first row of a headerless table", () => {
    const root = rootWith("<table><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>");
    expect(domToMarkdown(root)).toBe(
      "|  |  |\n| --- | --- |\n| A | 1 |\n| B | 2 |",
    );
  });
});

describe("rich HTML adapters", () => {
  it("uses inline styles while preserving source element metadata", () => {
    const root = rootWith(`
      <h1 class="heading">Title</h1>
      <table class="dataview"><tr><td>Cell</td></tr></table>
      <pre><code>const x = 1;</code></pre>
    `);
    root.setAttribute("aria-hidden", "true");
    root.style.position = "fixed";
    root.style.left = "-100000px";
    root.style.opacity = "0";
    const html = buildRichHtml(root, "google-docs");
    expect(html).toContain("font-size: 24px");
    expect(html).toContain("border-collapse: collapse");
    expect(html).toContain("font-family: Consolas");
    expect(html).toContain('class="heading"');
    expect(html).toContain('class="dataview"');
    expect(html).not.toContain("-100000px");
    expect(html).not.toContain("opacity: 0");
    expect(html).not.toContain("aria-hidden");
  });

  it("uses stable editable containers for Google Docs blocks", () => {
    const root = rootWith(`
      <pre><code class="language-ts">const x = 1;\n  const y = 2;</code></pre>
      <div class="target-copy-callout"><p>Note</p></div>
      <blockquote><p>Quoted</p></blockquote>
      <p><br></p>
    `);
    const html = buildRichHtml(root, "google-docs");
    const output = rootWith(html);

    expect(output.querySelectorAll(".target-copy-gdocs-block")).toHaveLength(3);
    const code = output.querySelector(".target-copy-gdocs-code-source");
    expect(code?.textContent).toBe("const x = 1;  const y = 2;");
    expect(code?.querySelectorAll("br")).toHaveLength(1);
    expect(code?.classList.contains("language-ts")).toBe(true);
    expect(code?.getAttribute("style")).toContain("white-space: pre-wrap");
    expect(output.querySelector(".target-copy-gdocs-code pre")).toBeNull();
    expect(output.querySelector(".target-copy-gdocs-callout")?.textContent).toContain("Note");
    expect(output.querySelector(".target-copy-gdocs-quote")?.textContent).toContain("Quoted");
    expect(output.firstElementChild?.lastElementChild?.matches("p")).toBe(false);
    expect(html).toContain("page-break-inside: auto");
  });

  it("keeps highlighted code spans while removing Google Docs PRE controls", () => {
    const root = rootWith(
      '<pre><code class="language-ts">const <span style="color:#d73a49">ready</span> = true;\nreturn ready;</code></pre>',
    );
    const html = buildRichHtml(root, "google-docs");
    const output = rootWith(html);
    const code = output.querySelector(".target-copy-gdocs-code-source");

    expect(code?.querySelector('span[style*="color"]')?.textContent).toBe("ready");
    expect(code?.querySelectorAll("br")).toHaveLength(1);
    expect(code?.textContent).toBe("const ready = true;return ready;");
    expect(output.querySelector("pre")).toBeNull();
  });

  it("preserves intentional blank code lines in Google Docs", () => {
    const root = rootWith('<pre><code>\nfirst();\n\nsecond();\n\n</code></pre>');
    const html = buildRichHtml(root, "google-docs");
    const output = rootWith(html);
    const code = output.querySelector(".target-copy-gdocs-code-source");

    expect(code?.textContent).toBe("first();second();");
    expect(code?.firstChild?.nodeName).toBe("BR");
    expect(code?.querySelectorAll("br")).toHaveLength(5);
  });

  it("removes PRE controls from code nested in tables, callouts, and quotes", () => {
    const root = rootWith(`
      <table><tr><td><pre><code>table();</code></pre></td></tr></table>
      <div class="target-copy-callout"><pre><code>callout();</code></pre></div>
      <blockquote><pre><code>quote();</code></pre></blockquote>
    `);
    const html = buildRichHtml(root, "google-docs");
    const output = rootWith(html);

    expect(output.querySelector("pre")).toBeNull();
    expect(output.querySelectorAll(".target-copy-gdocs-code-source")).toHaveLength(3);
    expect(output.textContent).toContain("table();");
    expect(output.textContent).toContain("callout();");
    expect(output.textContent).toContain("quote();");
  });

  it("keeps image dimensions available to Google Docs", () => {
    const root = rootWith('<img src="https://example.com/image.png" width="760" height="220">');
    const html = buildRichHtml(root, "google-docs");
    expect(html).toContain('width="760"');
    expect(html).toContain('height="220"');
  });

  it("does not discard a terminal Canvas visual", () => {
    const root = rootWith('<p>Before</p><div><canvas width="640" height="360"></canvas></div>');
    const html = buildRichHtml(root, "email");
    expect(html).toContain('<canvas width="640" height="360"></canvas>');
  });

  it("adds Word outline metadata without relying on a stylesheet", () => {
    const root = rootWith("<h2>Section</h2><p>Body</p>");
    const html = buildRichHtml(root, "word");
    expect(html).toContain("mso-outline-level:2");
    expect(html).toContain("Calibri");
  });

  it("preserves author-provided inline styles instead of replacing them", () => {
    const root = rootWith(
      '<p class="theme-text" style="display:none;color:white;background:black">Visible</p>',
    );
    const html = buildRichHtml(root, "email");
    expect(html).toContain("Visible");
    expect(html).toContain("display: none");
    expect(html).toContain("color: white");
    expect(html).toContain("background: black");
  });

  it("creates WeChat inline HTML without rewriting external links", () => {
    const root = rootWith(`
      <h2>公众号标题</h2>
      <p>阅读 <a href="https://example.com/story">外部文章</a>，以及
      <a href="https://mp.weixin.qq.com/s/example">公众号旧文</a>。</p>
    `);
    const html = buildRichHtml(root, "wechat-official");
    expect(html.startsWith("<section")).toBe(true);
    expect(html).toContain("border-left-color: #07c160");
    expect(html).toContain(">外部文章</a>");
    expect(html).toContain('href="https://example.com/story"');
    expect(html).toContain('href="https://mp.weixin.qq.com/s/example"');
  });

  it("uses a restrained semantic profile for Notion", () => {
    const root = rootWith("<blockquote>Decision</blockquote><pre><code>value</code></pre>");
    const html = buildRichHtml(root, "notion");
    expect(html).toContain("color: #37352f");
    expect(html).toContain("background: #f7f6f3");
  });

  it("uses Slack-compatible HTML fallbacks for tables and callouts", () => {
    const root = rootWith(`
      <table><tr><th>Name</th><th>Status</th></tr><tr><td>Alpha</td><td>Done</td></tr></table>
      <div class="target-copy-callout"><p class="target-copy-callout-title">Notice</p>
        <div class="target-copy-callout-content"><p>Read this.</p></div></div>
    `);
    const html = buildRichHtml(root, "slack");
    const output = rootWith(html);

    expect(output.querySelector("table")).toBeNull();
    expect(output.querySelector("pre.target-copy-slack-table")?.textContent)
      .toContain("Name  | Status");
    expect(output.querySelector("pre.target-copy-slack-table")?.textContent)
      .toContain("Alpha | Done");
    expect(output.querySelector("blockquote.target-copy-callout")?.textContent)
      .toContain("Notice");
  });
});
