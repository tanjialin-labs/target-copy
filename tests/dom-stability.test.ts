// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { waitForDomStability } from "../src/core/dom-stability";

describe("rendered DOM stability", () => {
  it("waits for delayed postprocessor mutations and a following quiet period", async () => {
    const root = document.createElement("div");
    const waiting = waitForDomStability(root, window, {
      quietMs: 30,
      timeoutMs: 300,
    });
    window.setTimeout(() => {
      root.textContent = "Late postprocessor output";
    }, 20);

    await waiting;
    expect(root.textContent).toBe("Late postprocessor output");
  });

  it("uses the hard timeout when a renderer never leaves its loading state", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="markdown-embed is-loading" aria-busy="true"></div>';
    const started = Date.now();

    await waitForDomStability(root, window, { quietMs: 10, timeoutMs: 50 });

    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    expect(Date.now() - started).toBeLessThan(250);
  });
});
