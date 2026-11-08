// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ renders: [] as string[] }));
vi.mock("../src/core/render", () => ({ renderMarkdown: async (_app: unknown, markdown: string) => {
  mock.renders.push(markdown);
  const root = document.implementation.createHTMLDocument("").createElement("div");
  root.innerHTML = markdown;
  return { root, dispose: () => root.remove() };
} }));
import { renderNote } from "../src/core/render-note";
const protect = (source: string) => source;
function appWith(notes: Record<string, string>) {
  const file = (path: string) => Object.hasOwn(notes, path) ? { path, extension: "md" } : null;
  return {
    metadataCache: {
      getFirstLinkpathDest: (path: string) => file(path.endsWith(".md") ? path : `${path}.md`),
      getCache: (path: string) => ({ headings: [{ heading: "Section", level: 1, position: { start: { offset: notes[path]?.indexOf("# Section") ?? 0 } } }] }),
    },
    vault: { getFileByPath: file, cachedRead: async (entry: {path:string}) => notes[entry.path]! },
  };
}
beforeEach(() => { mock.renders.length = 0; });
describe("embedded note expansion", () => {
  it("reuses rendering within one copy while retaining every repeated embed", async () => {
    const app = appWith({"Part.md":"<p>Repeated body</p>"});
    const result = await renderNote(app as never, Array(20).fill("![[Part]]").join("\n\n"), "Main.md", protect);
    expect(result.root.querySelectorAll(".markdown-embed")).toHaveLength(20);
    expect(result.root.textContent?.match(/Repeated body/g)).toHaveLength(20);
    expect(mock.renders).toHaveLength(2);
    result.dispose();
  });
  it("expands beyond 64 references with default settings", async () => {
    const app = appWith({"Part.md":"<p>Body</p>"});
    const result = await renderNote(app as never, Array(70).fill("![[Part]]").join("\n\n"), "Main.md", protect);
    expect(result.root.querySelectorAll(".markdown-embed")).toHaveLength(70);
    expect(result.warnings).toEqual([]);
    result.dispose();
  });
  it("reports each reference kept by an explicit expansion limit", async () => {
    const app = appWith({"Part.md":"<p>Body</p>"});
    const result = await renderNote(app as never, "![[Part]]\n\n![[Part]]", "Main.md", protect, undefined, [], new Map(), { remaining: 1 });
    expect(result.root.querySelectorAll(".markdown-embed")).toHaveLength(1);
    expect(result.root.textContent).toContain("![[Part]]");
    expect(result.warnings?.join(" ")).toContain("expansion limit");
    result.dispose();
  });
  it("reports circular and depth-limited references", async () => {
    const app = appWith({"A.md":"![[B]]", "B.md":"![[A]]"});
    const cycle = await renderNote(app as never, "![[B]]", "A.md", protect);
    expect(cycle.warnings?.join(" ")).toContain("circular");
    cycle.dispose();
    const depth = await renderNote(app as never, "![[A]]", "Main.md", protect, undefined, [], new Map(), {remaining:Infinity}, {maxDepth:1});
    expect(depth.warnings?.join(" ")).toContain("nesting depth");
    depth.dispose();
  });
  it("keeps cached rendering independent of the current ancestor chain", async () => {
    const app = appWith({"A.md":"![[B]]", "B.md":"![[A]]"});
    const result = await renderNote(app as never, "![[A]]\n\n![[B]]", "Main.md", protect);
    expect(result.root.querySelectorAll(".markdown-embed")).toHaveLength(4);
    expect(result.root.textContent).toContain("![[A]]");
    expect(result.root.textContent).toContain("![[B]]");
    result.dispose();
  });
  it("retains the reference definitions used by a heading embed", async () => {
    const app = appWith({"Part.md":"# Section\nSee [guide][ref].\n\n[ref]: https://example.com"});
    const result = await renderNote(app as never, "![[Part#Section]]", "Main.md", protect);
    expect(mock.renders.join("\n")).toContain("[ref]: https://example.com");
    result.dispose();
  });
  it("reports a missing embedded note", async () => {
    const result = await renderNote(appWith({}) as never, "![[Missing]]", "Main.md", protect);
    expect(result.warnings?.join(" ")).toContain("Missing");
    expect(result.root.textContent).toContain("![[Missing]]");
    result.dispose();
  });
  it("allows cancellation while expanding many cached references", async () => {
    const controller = new AbortController();
    const pending = renderNote(appWith({"Part.md":"<p>Body</p>"}) as never,
      Array(200).fill("![[Part]]").join("\n\n"), "Main.md", protect, controller.signal);
    window.setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
