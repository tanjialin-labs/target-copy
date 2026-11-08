import { remote as desktopHost } from "electron";
import type { AdapterResult } from "../types";
import { getActiveWindow } from "./dom-context";

export interface ClipboardWriteResult {
  richTextWritten: boolean;
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
      return { richTextWritten: true };
    } catch {
      // The desktop bridge supports both clipboard formats without relying on focus.
    }
  }

  if (payload.html && writeThroughDesktopHost(payload)) {
    return { richTextWritten: true };
  }

  if (ownerWindow.navigator.clipboard?.writeText) {
    try {
      await ownerWindow.navigator.clipboard.writeText(payload.text);
      return { richTextWritten: false };
    } catch { /* Try the desktop clipboard bridge. */ }
  }

  if (writeThroughDesktopHost(payload)) {
    return { richTextWritten: Boolean(payload.html) };
  }
  throw new Error("Target Copy could not access the system clipboard.");
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
