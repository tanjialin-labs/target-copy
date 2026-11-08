export interface DomStabilityOptions {
  quietMs?: number;
  minimumMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal | undefined;
}

export type DomStabilityResult = "settled" | "timeout";

/** Renderer promises are awaited by the caller; this bounds trailing DOM work. */
export function waitForDomStability(
  root: HTMLElement,
  ownerWindow: Window,
  options: DomStabilityOptions = {},
): Promise<DomStabilityResult> {
  const quietMs = options.quietMs ?? 100;
  const timeoutMs = Math.max(quietMs, options.timeoutMs ?? 3000);
  const minimumMs = Math.min(timeoutMs, options.minimumMs ?? (options.quietMs === undefined ? 400 : quietMs));
  const signal = options.signal;
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let changed = started;
    let done = false;
    let timer: number | undefined;
    const Observer = (ownerWindow as Window & { MutationObserver: typeof MutationObserver }).MutationObserver;
    const cleanup = () => {
      done = true;
      observer.disconnect();
      if (timer !== undefined) ownerWindow.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => { cleanup(); reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Copy cancelled", "AbortError")); };
    const check = () => {
      if (done) return;
      const now = Date.now();
      const pending = [...root.querySelectorAll('[aria-busy="true"], .is-loading')]
        .some((element) => !element.matches("img, audio, video") && !element.closest(".image-embed, .media-embed"));
      if (now - started >= timeoutMs) { cleanup(); resolve("timeout"); return; }
      if (!pending && now - started >= minimumMs && now - changed >= quietMs) {
        cleanup(); resolve("settled"); return;
      }
      timer = ownerWindow.setTimeout(check, Math.min(quietMs, timeoutMs - (now - started)));
    };
    const observer = new Observer(() => { changed = Date.now(); });
    observer.observe(root, { attributes: true, characterData: true, childList: true, subtree: true });
    signal?.addEventListener("abort", abort, { once: true });
    timer = ownerWindow.setTimeout(check, Math.min(quietMs, minimumMs));
  });
}
