// @vitest-environment happy-dom

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { dataUrlByteLength } from "../src/core/data-url";
import { processRenderedVisuals } from "../src/core/visuals";

function pngData(bytes: number): string {
  return `data:image/png;base64,${Buffer.alloc(bytes).toString("base64")}`;
}

describe("embedded image budget", () => {
  it("calculates base64 payload bytes without allocating a decoded copy", () => {
    expect(dataUrlByteLength(pngData(1024))).toBe(1024);
  });

  it("replaces an individual oversized data image with visible text", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<img alt="Large chart" src="${pngData(2048)}">`;

    const result = await processRenderedVisuals(root, true, "en", {
      maxImageSizeMb: 0.001,
      maxTotalImageSizeMb: 1,
    });

    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("Large chart");
    expect(result.warnings.join(" ")).toContain("larger");
  });

  it("applies one total budget across all existing data images", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <img alt="First" src="${pngData(700)}">
      <img alt="Second" src="${pngData(700)}">
    `;

    const result = await processRenderedVisuals(root, true, "en", {
      maxImageSizeMb: 1,
      maxTotalImageSizeMb: 0.001,
    });

    expect(root.querySelectorAll("img")).toHaveLength(1);
    expect(root.textContent).toContain("Second");
    expect(result.warnings.join(" ")).toContain("total image limit");
  });

  it("preserves canvas markup instead of converting it to PNG", async () => {
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "Generated chart");
    Object.defineProperty(canvas, "toBlob", {
      value: (callback: BlobCallback) =>
        callback(new Blob([new Uint8Array(2048)], { type: "image/png" })),
    });
    root.appendChild(canvas);

    const result = await processRenderedVisuals(root, true, "en", {
      maxImageSizeMb: 0.001,
      maxTotalImageSizeMb: 1,
    });

    expect(root.querySelector("canvas")).not.toBeNull();
    expect(root.querySelector("img")).toBeNull();
    expect(result.warnings.join(" ")).toContain("canvas markup");
  });

  it("keeps all data images when both limits are explicitly unlimited", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <img alt="First" src="${pngData(2048)}">
      <img alt="Second" src="${pngData(2048)}">
    `;
    const result = await processRenderedVisuals(root, true, "en", {
      maxImageSizeMb: 0,
      maxTotalImageSizeMb: 0,
    });
    expect(root.querySelectorAll("img")).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });
});
