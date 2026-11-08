import { describe, expect, it } from "vitest";

import {
  normalizeSoftBreaksForRichText,
  prepareMarkdown,
  toPortableMarkdown,
} from "../src/core/markdown";
import { DEFAULT_SETTINGS, type CopyInput } from "../src/types";

const input: CopyInput = {
  title: "Example note",
  sourcePath: "Notes/Example note.md",
  isSelection: false,
  markdown: `---
tags: [private]
---
# Existing heading

Visible %%hidden%% text.`,
};

describe("prepareMarkdown", () => {
  it("keeps properties at the start when adding a title", () => {
    const source = prepareMarkdown(input, { ...DEFAULT_SETTINGS, includeTitle: true });
    expect(source).toMatch(/^---\ntags: \[private\]\n---\n# Example note/);
  });
  it("removes frontmatter and Obsidian comments", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      stripFrontmatter: true,
      stripComments: true,
    };
    expect(prepareMarkdown(input, settings)).toBe(
      "# Existing heading\n\nVisible  text.",
    );
  });

  it("preserves frontmatter and Obsidian comments by default", () => {
    expect(prepareMarkdown(input, DEFAULT_SETTINGS)).toBe(input.markdown);
  });

  it("preserves comment markers inside inline and fenced code", () => {
    const codeInput = {
      ...input,
      markdown: "Visible %%remove%% `%%inline%%`\n\n```ts\nconst marker = '%%code%%';\n```",
    };
    expect(prepareMarkdown(codeInput, { ...DEFAULT_SETTINGS, stripComments: true })).toBe(
      "Visible  `%%inline%%`\n\n```ts\nconst marker = '%%code%%';\n```",
    );
  });

  it("removes a whole comment even when it contains fence-like syntax", () => {
    const input = {
      markdown: "Before\n%%\n~~~tasks\nnot done\n~~~\n%%\nAfter",
      title: "Test",
      sourcePath: "Test.md",
      isSelection: false,
    };
    expect(
      prepareMarkdown(input, { ...DEFAULT_SETTINGS, stripComments: true }),
    ).toBe("Before\n\nAfter");
  });

  it("optionally adds the note title for whole notes", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      includeTitle: true,
      stripFrontmatter: true,
      stripComments: true,
    };
    expect(prepareMarkdown(input, settings)).toMatch(
      /^# Example note\n\n# Existing heading/,
    );
  });

  it("does not add the note title to a selection", () => {
    const settings = { ...DEFAULT_SETTINGS, includeTitle: true };
    expect(
      prepareMarkdown({ ...input, isSelection: true }, settings),
    ).not.toContain("# Example note");
  });

  it("does not mistake selected horizontal rules for frontmatter", () => {
    const selection = {
      ...input,
      isSelection: true,
      markdown: "---\n\nSelected text\n\n---",
    };
    expect(prepareMarkdown(selection, DEFAULT_SETTINGS)).toBe(
      "---\n\nSelected text\n\n---",
    );
  });
});

describe("toPortableMarkdown", () => {
  it("turns wikilinks into visible text only when requested", () => {
    expect(
      toPortableMarkdown(
        "See [[Projects/Alpha|the plan]] and [[People/Ada]].",
        { ...DEFAULT_SETTINGS, internalLinkMode: "text" },
      ),
    ).toBe("See the plan and Ada.");
  });

  it("preserves wikilink and embed source syntax when requested", () => {
    const markdown = `See [[Projects/Alpha|the plan]] and ![[Assets/chart.png]].

> [!warning] Keep this

==highlight==`;
    expect(toPortableMarkdown(markdown, {
      ...DEFAULT_SETTINGS,
      internalLinkMode: "source",
    })).toBe(markdown.replace("> [!warning] Keep this", "> **Keep this**").replace("==highlight==", "<mark>highlight</mark>"));
  });

  it("turns wikilinks into clickable Obsidian links", () => {
    const settings = { ...DEFAULT_SETTINGS, internalLinkMode: "markdown" as const };
    const resolve = (target: string) =>
      `obsidian://open?vault=Test%20Vault&file=${encodeURIComponent(`Folder/${target}`)}`;
    expect(
      toPortableMarkdown(
        "See [[Project Alpha#Decision|the decision]].",
        settings,
        resolve,
      ),
    ).toBe(
      "See [the decision](obsidian://open?vault=Test%20Vault&file=Folder%2FProject%20Alpha%23Decision).",
    );
  });

  it("normalizes image embeds, callouts, and highlights", () => {
    const markdown = `![[Assets/chart.png|Result chart]]

> [!warning] Check this
> Body

This is ==important==.`;
    expect(toPortableMarkdown(markdown, {
      ...DEFAULT_SETTINGS,
      internalLinkMode: "text",
    })).toBe(`![Result chart](Assets/chart.png)

> **Check this**
> Body

This is <mark>important</mark>.`);
  });

  it("does not rewrite wikilinks or highlights inside code", () => {
    const markdown = `Outside [[Real Note]] and ==important==.

\`[[inline]] ==literal==\`

\`\`\`ts
const value = "[[code]] ==literal==";
\`\`\``;
    const converted = toPortableMarkdown(markdown, {
      ...DEFAULT_SETTINGS,
      internalLinkMode: "text",
    });
    expect(converted).toContain("Outside Real Note and <mark>important</mark>.");
    expect(converted).toContain("`[[inline]] ==literal==`");
    expect(converted).toContain('const value = "[[code]] ==literal==";');
  });
});

describe("normalizeSoftBreaksForRichText", () => {
  it("joins wrapped prose without changing explicit hard breaks", () => {
    const markdown = [
      "A sentence wraps",
      "onto the next source line.",
      "",
      "Keep this break.  ",
      "Next line.",
      "",
      "Keep this too.\\",
      "Next line.",
    ].join("\n");
    expect(normalizeSoftBreaksForRichText(markdown)).toBe([
      "A sentence wraps onto the next source line.",
      "",
      "Keep this break.  ",
      "Next line.",
      "",
      "Keep this too.\\",
      "Next line.",
    ].join("\n"));
  });

  it("keeps source blocks and tables while joining quoted and list prose", () => {
    const markdown = `- A list item
  continues here

> A quote wraps
> onto one paragraph

| A | B |
| - | - |
| 1 | 2 |

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\``;
    expect(normalizeSoftBreaksForRichText(markdown)).toBe(`- A list item continues here

> A quote wraps onto one paragraph

| A | B |
| - | - |
| 1 | 2 |

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\``);
  });

  it("does not merge nested list items into their parent", () => {
    const markdown = `1. Parent
   - Nested item
     - Third-level item
   - Sibling item`;
    expect(normalizeSoftBreaksForRichText(markdown)).toBe(markdown);
  });

  it("keeps a callout title separate and joins its body prose", () => {
    expect(normalizeSoftBreaksForRichText(`> [!note] Title
> Body wraps
> onto one paragraph`)).toBe(`> [!note] Title
> Body wraps onto one paragraph`);
  });

  it("keeps quoted source fences and BOM frontmatter unchanged", () => {
    const markdown = `\uFEFF---
title: Example
aliases:
  - Demo
---

> \`\`\`js
> const first = true;
> const second = true;
> \`\`\``;
    expect(normalizeSoftBreaksForRichText(markdown)).toBe(markdown);
  });
});
