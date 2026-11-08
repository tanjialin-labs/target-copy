import { createDetachedFragment } from "./dom-context";

export function parseHtmlFragment(
  ownerDocument: Document,
  html: string,
): DocumentFragment {
  const ownerWindow = ownerDocument.defaultView as
    | (Window & { DOMParser: typeof DOMParser })
    | null;
  const Parser = ownerWindow?.DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(
    `<span data-target-copy-parser-boundary></span>${html}`,
    "text/html",
  );
  const fragment = createDetachedFragment(ownerDocument);
  for (const child of [...parsed.body.childNodes].slice(1)) {
    fragment.appendChild(ownerDocument.importNode(child, true));
  }
  return fragment;
}
