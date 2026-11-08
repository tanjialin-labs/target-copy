/** Cancels a wait while observing the underlying operation through completion. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new DOMException("Copy cancelled", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal.reason instanceof Error ? signal.reason : new DOMException("Copy cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

export async function yieldForCancellation(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await abortable(new Promise<void>((resolve) => window.setTimeout(resolve, 0)), signal);
}
