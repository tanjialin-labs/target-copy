export function getActiveDocument(): Document {
  return window.activeDocument ?? window.document;
}

export function getActiveWindow(): Window {
  return window.activeWindow ?? window;
}

/**
 * Creates an element in the document that owns a copied fragment.
 *
 * Target Copy renders into inert HTML documents so rendered content cannot
 * affect the active Obsidian view. Obsidian's DOM helpers are available on
 * their element prototypes in those documents as well; create and detach a
 * short-lived child to retain both that helper contract and the document's
 * ownership.
 */
export function createDetachedEl<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  tagName: K,
): HTMLElementTagNameMap[K] {
  const parent = ownerDocument.body;
  if (!parent) throw new Error("Target Copy requires a document body.");
  const element = parent.createEl(tagName);
  element.remove();
  return element;
}

/** Creates a detached fragment for content that will be inserted into the supplied document. */
export function createDetachedFragment(ownerDocument: Document): DocumentFragment {
  return ownerDocument.createRange().createContextualFragment("");
}
