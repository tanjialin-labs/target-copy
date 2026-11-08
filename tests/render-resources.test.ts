// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ values: [] as string[] }));
vi.mock("../src/core/render", () => ({ renderMarkdown: (_app: unknown, markdown: string) => {
  calls.values.push(markdown);
  const root = document.implementation.createHTMLDocument("").createElement("div");
  root.innerHTML = markdown;
  return Promise.resolve({ root, dispose: () => root.remove() });
} }));

import { renderNote } from "../src/core/render-note";
import { sourceSegments } from "../src/core/source";
import { normalizeSoftBreaksForRichText, toPortableMarkdown } from "../src/core/markdown";
import { DEFAULT_SETTINGS } from "../src/types";

const app = { metadataCache: { getFirstLinkpathDest: () => null } };
const protect = (value: string) => value;

describe("local resource rendering", () => {
  it.each([
    ['![Alt](https://example.com/photo.png "Title")', "https://example.com/photo.png", "Alt"],
    ['![A `code` label](<folder/a b.png>)', "folder/a b.png", "A `code` label"],
    ['![Alt](folder/a(b).png)', "folder/a(b).png", "Alt"],
    ['![Alt][pic]\n\n[pic]: photo.png "Title"', "photo.png", "Alt"],
    ['![[photo.png|100x200]]', "photo.png", "100x200"],
  ])("restores %s after the native renderer completes", async (source, path, alt) => {
    calls.values.length = 0;
    const session = await renderNote(app as never, source!, "Main.md", protect);
    expect(calls.values[0]).not.toMatch(/<img|!\[\[|!\[[^\]]*\]\(/);
    const image = session.root.querySelector("img");
    expect(image?.getAttribute("src")).toBe(path);
    expect(image?.getAttribute("alt")).toBe(alt);
    session.dispose();
  });

  it("holds raw responsive images, SVG and media in the inert output document", async () => {
    const source = '<picture><source srcset="a.png 2x"><img src="b.png"></picture><svg><rect width="20"></rect></svg><video src="v.mp4"></video>';
    const session = await renderNote(app as never, source, "Main.md", protect);
    expect(session.root.innerHTML).toBe(source);
    expect(session.root.ownerDocument.defaultView).toBeNull();
  });

  it("leaves image syntax inside code and raw HTML examples unchanged", () => {
    const source = '```html\n![Alt](example.png)\n```\n\n<pre>![[photo.png]]</pre>';
    expect(sourceSegments(source).some((segment) => segment.kind === "image")).toBe(false);
    expect(toPortableMarkdown(source, DEFAULT_SETTINGS)).toBe(source);
  });

  it("preserves complete SVG source and its stylesheet as one resource", () => {
    const source = '<svg><style>.shape{fill:red}</style><rect class="shape"/></svg>';
    expect(sourceSegments(source)).toEqual([{ kind: "html", value: source }]);
  });

  it("joins prose around inline code and math without changing their content", () => {
    expect(normalizeSoftBreaksForRichText('A `code`\ncontinues with $x$\nhere.')).toBe('A `code` continues with $x$ here.');
  });

  it("keeps escaped embed syntax in the source", async () => {
    const source = String.raw`\![[photo.png]]`;
    const session = await renderNote(app as never, source, "Main.md", protect);
    expect(calls.values.at(-1)).toBe(source);
    session.dispose();
  });

  it("cancels an embedded note read promptly", async () => {
    const file = { path: "Nested.md", extension: "md" };
    let reading: () => void = () => undefined;
    const started = new Promise<void>((resolve) => { reading = resolve; });
    const readApp = {
      metadataCache: { getFirstLinkpathDest: () => file },
      vault: { getFileByPath: () => file, cachedRead: () => { reading(); return new Promise(() => {}); } },
    };
    const controller = new AbortController();
    const pending = renderNote(readApp as never, "![[Nested]]", "Main.md", protect, controller.signal);
    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports a failed embedded note read through the conversion promise", async () => {
    const file = { path: "Nested.md", extension: "md" };
    const readApp = {
      metadataCache: { getFirstLinkpathDest: () => file },
      vault: { getFileByPath: () => file, cachedRead: () => Promise.reject(new Error("Read unavailable")) },
    };
    await expect(renderNote(readApp as never, "![[Nested]]", "Main.md", protect)).rejects.toThrow("Read unavailable");
  });
});
