import { remote as desktopHost } from "electron";
import type { AdapterResult } from "../types";
import { getActiveDocument, getActiveWindow } from "./dom-context";

export interface ClipboardWriteResult {
  richTextWritten: boolean;
  systemTextModeUsed: boolean;
}

type ClipboardWindow = Window & {
  Blob: typeof Blob;
  ClipboardItem: typeof ClipboardItem;
};

export async function writeClipboard(payload: AdapterResult): Promise<ClipboardWriteResult> {
  const ownerWindow = getActiveWindow() as ClipboardWindow;
  if (payload.html && supportsRichClipboard()) {
    try {
      const item = new ownerWindow.ClipboardItem({
        "text/html": new ownerWindow.Blob([payload.html], { type: "text/html" }),
        "text/plain": new ownerWindow.Blob([payload.text], { type: "text/plain" }),
      });
      await ownerWindow.navigator.clipboard.write([item]);
      return { richTextWritten: true, systemTextModeUsed: false };
    } catch {
      // The desktop and document bridges also support both clipboard formats.
    }
  }

  if (payload.html) {
    if (writeThroughDesktopHost(payload)) {
      return { richTextWritten: true, systemTextModeUsed: false };
    }
    try {
      return { richTextWritten: writeThroughDocument(payload), systemTextModeUsed: false };
    } catch { /* Try the async text clipboard when rich copying is unavailable. */ }
  }

  if (ownerWindow.navigator.clipboard?.writeText) {
    try {
      await ownerWindow.navigator.clipboard.writeText(payload.text);
      return { richTextWritten: false, systemTextModeUsed: false };
    } catch { /* Use the document clipboard bridge. */ }
  }

  if (writeThroughDesktopHost(payload)) {
    return { richTextWritten: Boolean(payload.html), systemTextModeUsed: false };
  }
  writeThroughDocument(payload);
  return { richTextWritten: false, systemTextModeUsed: true };
}

function writeThroughDesktopHost(payload: AdapterResult): boolean {
  try {
    const clipboard = desktopHost?.clipboard;
    if (!clipboard) return false;
    clipboard.write(payload.html ? { text: payload.text, html: payload.html } : { text: payload.text });
    return true;
  } catch { return false; }
}

function supportsRichClipboard(): boolean {
  const ownerWindow = getActiveWindow() as ClipboardWindow;
  return (
    typeof ownerWindow.ClipboardItem !== "undefined" &&
    typeof ownerWindow.navigator.clipboard?.write === "function"
  );
}

function writeThroughDocument(payload: AdapterResult): boolean {
  const ownerDocument = getActiveDocument();
  const textarea = ownerDocument.createElement("textarea");
  textarea.value = payload.text;
  textarea.setAttribute("readonly", "");
  textarea.className = "target-copy-clipboard-bridge";
  ownerDocument.body.appendChild(textarea);
  const focused = ownerDocument.activeElement as HTMLElement | null;
  const selection = ownerDocument.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  let richTextWritten = false;
  const copy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", payload.text);
    if (payload.html) {
      event.clipboardData.setData("text/html", payload.html);
      richTextWritten = true;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  ownerDocument.addEventListener("copy", copy, true);
  try {
    textarea.select();
    // The document bridge supports clients without a working async clipboard.
    if (!ownerDocument.execCommand("copy")) throw new Error("The system clipboard rejected the copy operation.");
  } finally {
    ownerDocument.removeEventListener("copy", copy, true);
    textarea.remove();
    focused?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
  return richTextWritten;
}
