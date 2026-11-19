import { describe, expect, it } from "vitest";
import { prepareMarkdown, toPortableMarkdown } from "../src/core/markdown";
import { sourceSegments } from "../src/core/source";
import { DEFAULT_SETTINGS } from "../src/types";

const settings = { ...DEFAULT_SETTINGS, stripComments: true, internalLinkMode: "text" as const };
const prepare = (markdown: string) => prepareMarkdown({ markdown, title: "Note", sourcePath: "Note.md", isSelection: false }, settings);

describe("list and quote source boundaries", () => {
  it.each([
    "- Parent\n    - ",
    "1. Parent\n   1. Child\n       - ",
    "- Parent\n\t- ",
    "> - Parent\n>     - ",
    "- Parent\n  > - Child\n  >     - ",
    "- Parent\n\n    Continuation ",
  ])("transforms nested prose after %j", prefix => {
    const source = prefix + "[[Child]] ==highlight== %%private%%";
    expect(toPortableMarkdown(prepare(source), settings)).toBe(prefix + "Child <mark>highlight</mark> ");
  });

  it.each([
    "    - [[Code]] %%literal%% ==literal==\n",
    "- Parent\n\n      [[Code]] %%literal%% ==literal==\n\n    - [[Next]] %%remove%%",
    "> - Parent\n>\n>       [[Code]] %%literal%% ==literal==\n>\n>     - [[Next]] %%remove%%",
    "- Parent\n    - Child\n\n          [[Code]] %%literal%% ==literal==\n",
    "- Parent\n\nOutside\n\n    [[Code]] %%literal%% ==literal==\n",
  ])("preserves actual indented code in %j", source => {
    const result = toPortableMarkdown(prepare(source), settings);
    expect(result).toContain("[[Code]] %%literal%% ==literal==");
    if (source.includes("[[Next]]")) {
      expect(result).toContain("- Next ");
      expect(result).not.toContain("%%remove%%");
    }
    expect(sourceSegments(source).map(segment => segment.value).join("")).toBe(source);
  });

  it("keeps nested fences and inline code separate from surrounding prose", () => {
    const source = "- Parent\n    - [[Child]] `%%inline%%` %%remove%%\n\n      ```md\n      [[Code]] %%literal%%\n      ```\n    - [[Next]]";
    const result = toPortableMarkdown(prepare(source), settings);
    expect(result).toContain("- Child `%%inline%%` ");
    expect(result).toContain("      ```md\n      [[Code]] %%literal%%\n      ```");
    expect(result).toContain("- Next");
  });

  it("removes multiline comments within nested prose", () => {
    const source = "- Parent\n    - Before %%private\n      continuation%% After";
    expect(prepare(source)).toBe("- Parent\n    - Before  After");
  });
});
