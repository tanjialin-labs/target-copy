import { App, Component, MarkdownRenderer } from "obsidian";

import { createDetachedEl, getActiveDocument, getActiveWindow } from "./dom-context";
import { waitForDomStability, type DomStabilityOptions } from "./dom-stability";
import { abortable } from "./cancellation";

export interface RenderSession {
  root: HTMLElement;
  dispose: () => void;
  timedOut?: boolean;
  warnings?: string[];
}

export async function renderMarkdown(
  app: App,
  markdown: string,
  sourcePath: string,
  signal?: AbortSignal,
  timeoutMs = 5000,
  stability: Omit<DomStabilityOptions, "signal"> = {},
): Promise<RenderSession> {
  signal?.throwIfAborted();
  const component = new Component();
  component.load();

  const ownerDocument = getActiveDocument().implementation.createHTMLDocument("");
  const root = createDetachedEl(ownerDocument, "div");
  root.className = "target-copy-render-root markdown-rendered";
  root.setAttribute("aria-hidden", "true");
  ownerDocument.body.appendChild(root);
  let timedOut = false;
  let output: HTMLElement = root;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    root.remove();
    component.unload();
  };
  const ownerWindow = getActiveWindow();
  const lifetime = new AbortController();
  const abort = () => lifetime.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const deadline = ownerWindow.setTimeout(() => {
    timedOut = true;
    lifetime.abort(new DOMException("Rendering timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    await abortable(MarkdownRenderer.render(app, markdown, root, sourcePath, component), lifetime.signal);
    timedOut = await waitForDomStability(
      root,
      root.ownerDocument.defaultView ?? getActiveWindow(),
      { ...stability, signal: lifetime.signal },
    ) === "timeout";
  } catch (error) {
    if (!timedOut || signal?.aborted) {
      release();
      throw error;
    }
  } finally {
    ownerWindow.clearTimeout(deadline);
    signal?.removeEventListener("abort", abort);
    if (timedOut) {
      output = root.cloneNode(true) as HTMLElement;
      release();
    }
  }

  let disposed = false;
  return {
    root: output,
    timedOut,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      release();
      output.remove();
    },
  };
}
