// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClipboard } from "../src/core/clipboard";

class MockClipboardItem {
  constructor(readonly data: Record<string, Blob>) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writeClipboard", () => {
  it("writes rich HTML and plain text in one clipboard item", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });

    await expect(writeClipboard({ html: "<b>Bold</b>", text: "Bold", warnings: [] }))
      .resolves.toEqual({ richTextWritten: true });
    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to readable text when the WebView rejects rich data", async () => {
    const write = vi.fn().mockRejectedValue(new Error("HTML rejected"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });

    await expect(writeClipboard({ html: "<b>Bold</b>", text: "Bold", warnings: [] }))
      .resolves.toEqual({ richTextWritten: false });
    expect(writeText).toHaveBeenCalledWith("Bold");
  });

  it("does not attempt a rich write for text-only targets", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });

    await writeClipboard({ text: "Portable", warnings: [] });
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith("Portable");
  });
});
