// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { domToMarkdown, domToPlainText } from "../src/adapters/text";
import { normalizeRenderedDom } from "../src/core/dom";
import { createInternalLinkResolver } from "../src/core/internal-links";
import { getElementSourcePath } from "../src/core/source-context";
import { DEFAULT_SETTINGS, type ConversionContext } from "../src/types";

const context: ConversionContext = {
  target: "google-docs",
  title: "Fixture",
  sourcePath: "Root/Main.md",
  isSelection: false,
  settings: DEFAULT_SETTINGS,
};

function rootWith(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("portable rich content", () => {
  it("retains the fallback image and original responsive source choices", () => {
    const root = rootWith(`
      <picture>
        <source srcset="https://tracker.example/private.webp 2x">
        <img alt="Chart" src="data:image/png;base64,AA=="
          srcset="app://obsidian.md/Chart@2x.png 2x" sizes="100vw">
      </picture>`);

    normalizeRenderedDom(root, context);
    const image = root.querySelector("img")!;
    expect(root.querySelector("picture > source")?.getAttribute("srcset")).toContain("https://tracker.example/private.webp");
    expect(image.getAttribute("src")).toBe("data:image/png;base64,AA==");
    expect(image.hasAttribute("srcset")).toBe(true);
    expect(image.hasAttribute("sizes")).toBe(true);
  });

  it("retains CSS image references and SVG fragment styling", () => {
    const root = rootWith(`
      <p style="color: red; background-image: url(https://tracker.example/pixel.png)">Safe text</p>
      <svg><rect style="fill: url(#gradient)"></rect></svg>`);

    normalizeRenderedDom(root, context);
    const paragraph = root.querySelector("p")!;
    expect(paragraph.style.color).toBe("red");
    expect(paragraph.style.backgroundImage).toContain("https://tracker.example/pixel.png");
    expect(root.querySelector("rect")?.getAttribute("style")).toContain("url(#gradient)");
  });

  it("keeps footnote references and definitions but removes vault-only backlinks", () => {
    const root = rootWith(`
      <p>Claim<sup class="footnote-ref" id="fnref-1"><a href="#fn-1">1</a></sup>.</p>
      <section class="footnotes"><ol><li id="fn-1"><p>Evidence
        <a class="footnote-backref" href="#fnref-1">↩</a></p></li></ol></section>`);

    normalizeRenderedDom(root, context);
    expect(root.querySelector(".target-copy-footnote-ref")?.textContent).toBe("1");
    expect(root.querySelector(".target-copy-footnotes")).not.toBeNull();
    expect(root.querySelector(".footnote-backref")).toBeNull();
    expect(root.querySelector("#fn-1, #fnref-1")).toBeNull();
    expect(domToMarkdown(root)).toContain("Claim[^1].");
    expect(domToMarkdown(root)).toContain("[^1]: Evidence");
    expect(domToPlainText(root)).toContain("Claim[1].");
    expect(domToPlainText(root)).toContain("1. Evidence");
  });
});

describe("transclusion source context", () => {
  it("resolves nested transclusions relative to the note that contains them", () => {
    const resolve = vi.fn((target: string, source: string) => {
      const paths: Record<string, string> = {
        "Root/Main.md|Chapter": "Root/Sections/Chapter.md",
        "Root/Sections/Chapter.md|Nested": "Root/Sections/Sub/Nested.md",
        "Root/Sections/Sub/Nested.md|Sibling": "Root/Sections/Sub/Sibling.md",
      };
      const path = paths[`${source}|${target}`];
      return path ? { path, extension: "md" } : null;
    });
    const app = {
      vault: { getName: () => "Vault" },
      metadataCache: { getFirstLinkpathDest: resolve },
    };
    const root = rootWith(`
      <div class="internal-embed markdown-embed is-loaded" src="Chapter">
        <div class="internal-embed markdown-embed is-loaded" src="Nested">
          <a class="internal-link" data-href="Sibling">Sibling</a>
        </div>
      </div>`);
    const link = root.querySelector("a")!;
    const sourcePath = getElementSourcePath(app as never, link, "Root/Main.md");
    const linkResolver = createInternalLinkResolver(app as never, "Root/Main.md");

    expect(sourcePath).toBe("Root/Sections/Sub/Nested.md");
    expect(linkResolver("Sibling", sourcePath)).toContain(
      encodeURIComponent("Root/Sections/Sub/Sibling.md"),
    );
    expect(resolve).toHaveBeenCalledWith("Sibling", "Root/Sections/Sub/Nested.md");
  });
});
