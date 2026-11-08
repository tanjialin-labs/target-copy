// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("electron", () => ({ remote: { clipboard: native } }));
import { writeClipboard } from "../src/core/clipboard";

it("writes rich HTML and plain text through the desktop host after focus rejection", async () => {
  vi.spyOn(navigator.clipboard, "write").mockRejectedValue(new Error("Document is not focused"));
  const payload = { text: "Source text", html: "<p><b>Source text</b></p>", warnings: [] };
  const result = await writeClipboard(payload);
  expect(native.write).toHaveBeenCalledWith({ text: payload.text, html: payload.html });
  expect(result.richTextWritten).toBe(true);
  expect(document.querySelector(".target-copy-clipboard-bridge")).toBeNull();
});
