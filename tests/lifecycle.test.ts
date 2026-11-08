// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ render: vi.fn(), load: vi.fn(), unload: vi.fn() }));
vi.mock("obsidian", () => ({
  Component: class { load = mock.load; unload = mock.unload; },
  MarkdownRenderer: { render: mock.render },
}));
import { renderMarkdown } from "../src/core/render";
import { waitForDomStability } from "../src/core/dom-stability";
import { writeClipboard } from "../src/core/clipboard";
import { parseSrcset } from "../src/core/srcset";

afterEach(() => { vi.restoreAllMocks(); mock.render.mockReset(); mock.unload.mockClear(); });

describe("conversion lifetime", () => {
  it("releases the component when the native renderer fails", async () => {
    mock.render.mockRejectedValue(new Error("fixture"));
    await expect(renderMarkdown({} as never, "text", "Test.md")).rejects.toThrow("fixture");
    expect(mock.unload).toHaveBeenCalledTimes(1);
  });

  it("cancels a renderer that has not resolved", async () => {
    mock.render.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = renderMarkdown({} as never, "text", "Test.md", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.unload).toHaveBeenCalledTimes(1);
  });

  it("returns a stable snapshot and a timeout status for unfinished rendering", async () => {
    let original: HTMLElement | undefined;
    mock.render.mockImplementation((_app, _text, root: HTMLElement) => {
      original = root;
      root.textContent = "Available content";
      expect(root.ownerDocument.defaultView).toBeNull();
      return new Promise(() => {});
    });
    const result = await renderMarkdown({} as never, "text", "Test.md", undefined, 15);
    expect(result.timedOut).toBe(true);
    expect(result.root.textContent).toBe("Available content");
    original!.textContent = "Late mutation";
    expect(result.root.textContent).toBe("Available content");
    result.dispose();
    result.dispose();
    expect(mock.unload).toHaveBeenCalledTimes(1);
  });

  it("stops the DOM observer promptly on cancellation", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<div aria-busy="true"></div>';
    const controller = new AbortController();
    const pending = waitForDomStability(root, window, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("clipboard recovery", () => {
  it("keeps both clipboard representations when the async rich API is unavailable", async () => {
    vi.spyOn(navigator.clipboard, "write").mockRejectedValue(new Error("Document is not focused"));
    const data = new DataTransfer();
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => {
      document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, cancelable: true }));
      return true;
    }) });
    const result = await writeClipboard({ text: "Exact text", html: "<p><strong>Exact text</strong></p>", warnings: [] });
    expect(result.richTextWritten).toBe(true);
    expect(data.getData("text/plain")).toBe("Exact text");
    expect(data.getData("text/html")).toBe("<p><strong>Exact text</strong></p>");
  });

  it("uses the document bridge on async rejection and restores focus and selection", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"));
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => true) });
    const result = await writeClipboard({ text: "Exact source", warnings: [] });
    expect(result.systemTextModeUsed).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(document.querySelector("textarea.target-copy-clipboard-bridge")).toBeNull();
    input.remove();
  });
});

describe("responsive sources", () => {
  it("keeps data URL commas and density descriptors", () => {
    expect(parseSrcset("data:image/png;base64,AA== 1x, photo.png 2x")).toEqual([
      { url: "data:image/png;base64,AA==", descriptor: "1x" },
      { url: "photo.png", descriptor: "2x" },
    ]);
    expect(parseSrcset("first.png, second.png").map((image) => image.url)).toEqual(["first.png", "second.png"]);
  });
});
