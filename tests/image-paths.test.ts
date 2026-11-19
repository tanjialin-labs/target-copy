// @vitest-environment happy-dom
import { posix } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async importOriginal => ({ ...await importOriginal<object>(), Component: class {}, MarkdownRenderer: {} }));
import { TFile } from "obsidian";
import { TargetConverter } from "../src/core/converter";
import { inlineLocalImages } from "../src/core/assets";
import { DEFAULT_SETTINGS } from "../src/types";

function fixture(paths: string[]) {
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const files = paths.map(path => new (TFile as unknown as new(path: string, size: number) => TFile)(path, bytes.length));
  const app = {
    vault: {
      getName: () => "Fixture",
      adapter: { getBasePath: () => "/fixture-vault" },
      getAbstractFileByPath: (path: string) => files.find(file => file.path === path) ?? null,
      readBinary: vi.fn(async (_file: TFile) => bytes.buffer),
    },
    metadataCache: { getFirstLinkpathDest: vi.fn((path: string, source: string) =>
      files.find(file => file.path === posix.normalize(posix.join(posix.dirname(source), path))) ??
      files.find(file => file.path === path || file.name === path) ?? null) },
  };
  return { app, converter: new TargetConverter(app as never) };
}
const input = { markdown: "", title: "Main", sourcePath: "Main.md", isSelection: true };

describe("local image paths", () => {
  it.each([
    ["My Image.svg", "My%20Image.svg"],
    ["图像.svg", "%E5%9B%BE%E5%83%8F.svg"],
    ["name#part?.svg", "name%23part%3F.svg?cache=1"],
    ["literal%20name.svg", "literal%2520name.svg"],
    ["literal%ZZ.svg", "literal%ZZ.svg"],
  ])("embeds %s from the URL %s", async (path, src) => {
    const { app, converter } = fixture([path]);
    const result = await converter.convert({ ...input, sourceFormat: "html", markdown: `<img src="${src}" alt="Chart">` }, "html-source", DEFAULT_SETTINGS);
    expect(result.text).toContain('src="data:image/svg+xml;base64,');
    expect(result.warnings).toEqual([]);
    expect(app.vault.readBinary).toHaveBeenCalledTimes(1);
  });

  it("uses exact unencoded metadata and decodes URL paths only once", async () => {
    const { app } = fixture(["literal%20name.svg", "literal name.svg"]);
    const root = document.createElement("div");
    root.innerHTML = '<span class="image-embed" src="literal%20name.svg"><img src="app://vault/fixture-vault/literal%2520name.svg?1"></span>';
    expect(await inlineLocalImages(app as never, root, "Main.md", 0, 0)).toEqual([]);
    expect(app.vault.readBinary.mock.calls[0]?.[0]).toMatchObject({ path: "literal%20name.svg" });
  });

  it.each(["markdown", "plain-text"] as const)("restores Reading view image references for %s", async target => {
    const { converter } = fixture(["Assets/My Image.svg"]);
    const result = await converter.convert({ ...input, sourcePath: "Notes/Main.md", renderedHtml:
      '<span class="internal-embed image-embed" src="My Image.svg"><img alt="Chart" src="app://vault/fixture-vault/Assets/My%20Image.svg?1"></span>',
    }, target, DEFAULT_SETTINGS);
    expect(result.text).toBe("![Chart](../Assets/My%20Image.svg)");
    expect(result.warnings).toEqual([]);
  });

  it("restores a Vault resource URL when embed metadata is absent", async () => {
    const { converter } = fixture(["Assets/My Image.svg"]);
    const result = await converter.convert({ ...input, renderedHtml:
      '<img alt="Chart" src="app://vault/fixture-vault/Assets/My%20Image.svg?1">',
    }, "markdown", DEFAULT_SETTINGS);
    expect(result.text).toBe("![Chart](Assets/My%20Image.svg)");
    expect(result.warnings).toEqual([]);
  });

  it("restores each responsive source independently of the fallback metadata", async () => {
    const { converter } = fixture(["a.svg", "b.svg"]);
    const result = await converter.convert({ ...input, renderedHtml:
      '<span class="image-embed" src="a.svg"><img alt="Chart" src="app://vault/fixture-vault/a.svg?1" srcset="app://vault/fixture-vault/b.svg?1 2x"></span>',
    }, "markdown", DEFAULT_SETTINGS);
    expect(result.text).toContain('src="a.svg"');
    expect(result.text).toContain('srcset="b.svg 2x"');
    expect(result.text).not.toContain("app://");
  });

  it("reports an unavailable local reference without copying the machine path", async () => {
    const { app, converter } = fixture([]);
    const result = await converter.convert({ ...input, renderedHtml: '<img alt="Chart" src="file:///outside-vault/private.svg">' }, "markdown", DEFAULT_SETTINGS);
    expect(result.text).toBe("\\[Chart\\]");
    expect(result.text).not.toContain("outside-vault");
    expect(result.warnings.join(" ")).toContain("Could not restore");
    expect(app.vault.readBinary).not.toHaveBeenCalled();
  });

  it("leaves remote image URLs untouched and performs no Vault reads", async () => {
    const { app, converter } = fixture([]);
    const src = "https://example.com/My%20Image.svg?x=1#part";
    const result = await converter.convert({ ...input, renderedHtml: `<img alt="Chart" src="${src}">` }, "html-source", DEFAULT_SETTINGS);
    expect(result.text).toContain(src);
    expect(result.warnings).toEqual([]);
    expect(app.vault.readBinary).not.toHaveBeenCalled();
  });
});
