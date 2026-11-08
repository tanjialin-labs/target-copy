// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { parseHtmlFragment } from "../src/core/html-fragment";

describe("reading-view HTML fragments", () => {
  it("keeps a leading script as inert source for later normalization", () => {
    const fragment = parseHtmlFragment(
      document,
      "<script>KEEP_SCRIPT_SOURCE</script><p>Body</p>",
    );
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

    expect(wrapper.querySelector("script")?.textContent).toBe("KEEP_SCRIPT_SOURCE");
    expect(wrapper.textContent).toContain("Body");
    expect(wrapper.querySelector("[data-target-copy-parser-boundary]")).toBeNull();
  });
});
