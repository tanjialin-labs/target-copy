// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { materializeImageDimensions } from "../src/core/visuals";

describe("materializeImageDimensions", () => {
  it("writes loaded intrinsic dimensions into clipboard HTML", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<img src="https://example.com/image.png">';
    const image = root.querySelector("img")!;
    Object.defineProperty(image, "complete", { configurable: true, value: true });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 760 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 220 });

    await materializeImageDimensions(root, 0);

    expect(image.getAttribute("width")).toBe("760");
    expect(image.getAttribute("height")).toBe("220");
  });

  it("uses the visible size while keeping the original image bytes", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<img src="data:image/jpeg;base64,AA==">';
    const image = root.querySelector("img")!;
    Object.defineProperty(image, "complete", { configurable: true, value: true });
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: 4000 });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: 3000 });
    image.getBoundingClientRect = () => ({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    });

    await materializeImageDimensions(root, 0);

    expect(image.getAttribute("src")).toBe("data:image/jpeg;base64,AA==");
    expect(image.getAttribute("width")).toBe("800");
    expect(image.getAttribute("height")).toBe("600");
  });
});
