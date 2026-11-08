// @vitest-environment happy-dom
import { expect, it } from "vitest";

import { createDetachedEl, createDetachedFragment } from "../src/core/dom-context";

it("creates detached nodes and fragments for copied content", () => {
  const ownerDocument = document.implementation.createHTMLDocument("");
  const element = createDetachedEl(ownerDocument, "section");
  const fragment = createDetachedFragment(ownerDocument);

  expect(element.ownerDocument).toBe(ownerDocument);
  expect(element.isConnected).toBe(false);
  fragment.appendChild(element);
  const target = createDetachedEl(ownerDocument, "div");
  target.appendChild(fragment);
  expect(target.firstElementChild).toBe(element);
  expect(ownerDocument.body.childElementCount).toBe(0);
});
