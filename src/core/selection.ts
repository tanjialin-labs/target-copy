import { createDetachedEl, createDetachedFragment } from "./dom-context";

interface EditorPositionLike {
  line: number;
  ch: number;
}

interface EditorSelectionReader {
  listSelections(): Array<{ anchor: EditorPositionLike; head: EditorPositionLike }>;
  getRange(from: EditorPositionLike, to: EditorPositionLike): string;
}

export function getEditorSelections(editor: EditorSelectionReader): string | null {
  const selections = editor.listSelections()
    .map(({ anchor, head }) => {
      const from = comparePositions(anchor, head) <= 0 ? anchor : head;
      const to = comparePositions(anchor, head) <= 0 ? head : anchor;
      return { from, to };
    })
    .filter(({ from, to }) => comparePositions(from, to) !== 0)
    .sort((left, right) => comparePositions(left.from, right.from));

  const merged: typeof selections = [];
  for (const selection of selections) {
    const previous = merged.at(-1);
    if (previous && comparePositions(selection.from, previous.to) <= 0) {
      if (comparePositions(selection.to, previous.to) > 0) previous.to = selection.to;
    } else merged.push({ ...selection });
  }
  const values = merged.map(({ from, to }) => editor.getRange(from, to));
  return values.length > 0 ? values.join("\n\n") : null;
}

export function getReadingViewSelection(container: HTMLElement): string | null {
  const ownerDocument = container.ownerDocument;
  const selection = ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const wrapper = createDetachedEl(ownerDocument, "div");
  let selectedHere = false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    const commonAncestor = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer as HTMLElement
      : range.commonAncestorContainer.parentElement;
    if (!commonAncestor || !container.contains(commonAncestor)) {
      if (range.intersectsNode(container)) return "";
      continue;
    }
    selectedHere = true;

    const fragment = rebuildSelectionContext(range, commonAncestor, container);
    if (wrapper.childNodes.length > 0) wrapper.appendChild(ownerDocument.createTextNode("\n"));
    wrapper.appendChild(fragment);
  }
  const hasMeaningfulContent =
    Boolean(wrapper.textContent?.trim()) || Boolean(wrapper.querySelector('img, svg, table, pre, canvas, audio, video, hr, math, mjx-container, input[type="checkbox"]'));
  if (hasMeaningfulContent) appendSelectedFootnotes(wrapper, container);
  if (hasMeaningfulContent) return wrapper.innerHTML;
  return selectedHere ? "" : null;
}

function rebuildSelectionContext(
  range: Range,
  commonAncestor: HTMLElement,
  container: HTMLElement,
): DocumentFragment {
  const ownerDocument = container.ownerDocument;
  let content: Node = range.cloneContents();
  let descendant: HTMLElement = commonAncestor;
  let current: HTMLElement | null = commonAncestor;

  while (current && current !== container) {
    if (current.matches(
      "a, strong, b, em, i, del, s, strike, u, mark, code, pre, p, h1, h2, h3, h4, h5, h6, blockquote, sup, sub, " +
      "table, thead, tbody, tfoot, tr, td, th, li, ol, ul, .callout-title, .callout-title-inner, .callout-content, .callout, " +
      ".internal-embed, .markdown-embed, [data-embed-path]",
    )) {
      const shell = current.cloneNode(false) as HTMLElement;
      if (current.tagName === "LI") {
        const checkbox = [...current.children].find(
          (child) => child.matches('input[type="checkbox"], .task-list-item-checkbox'),
        );
        if (checkbox && !nodeContainsCheckbox(content)) {
          shell.appendChild(checkbox.cloneNode(true));
        }
      }
      if (current.tagName === "OL") {
        preserveSelectedListNumber(current, descendant, range.startContainer, range.startOffset, shell);
      }
      if (current.classList.contains("callout")) {
        const body = current.querySelector<HTMLElement>(":scope > .callout-content");
        if (body?.contains(descendant)) {
          const title = current.querySelector<HTMLElement>(":scope > .callout-title");
          if (title) shell.appendChild(title.cloneNode(true));
        }
      }
      shell.appendChild(content);
      content = shell;
    }
    descendant = current;
    current = current.parentElement;
  }

  const fragment = createDetachedFragment(ownerDocument);
  fragment.appendChild(content);
  const selectedLists = [...container.querySelectorAll<HTMLElement>("ol")]
    .filter((list) => range.intersectsNode(list));
  [...fragment.querySelectorAll<HTMLElement>("ol")].forEach((list, index) => {
    const original = selectedLists[index];
    if (!original) return;
    const firstItem = [...original.children].find((item) => item.tagName === "LI" && range.intersectsNode(item));
    if (firstItem) preserveSelectedListNumber(original, firstItem as HTMLElement, firstItem, 0, list);
  });
  const selectedItems = [...container.querySelectorAll<HTMLElement>("li")]
    .filter((item) => range.intersectsNode(item));
  const clonedItems = [...fragment.querySelectorAll<HTMLElement>("li")];
  clonedItems.forEach((item, index) => {
    const original = selectedItems[index];
    const checkbox = original?.querySelector<HTMLInputElement>(':scope > input[type="checkbox"]');
    if (checkbox) {
      let clone = item.querySelector<HTMLInputElement>(':scope > input[type="checkbox"]');
      if (!clone) {
        clone = checkbox.cloneNode(true) as HTMLInputElement;
        item.prepend(clone);
      }
      clone.toggleAttribute("checked", checkbox.checked);
    }
  });
  return fragment;
}

function preserveSelectedListNumber(
  list: HTMLElement,
  descendant: HTMLElement,
  rangeStart: Node,
  rangeStartOffset: number,
  shell: HTMLElement,
): void {
  let listItem = descendant === list
    ? rangeStart.nodeType === 1
      ? (rangeStart.childNodes[rangeStartOffset] ?? rangeStart) as HTMLElement
      : rangeStart.parentElement
    : descendant;
  if (!listItem) return;
  while (listItem.parentElement && listItem.parentElement !== list) {
    listItem = listItem.parentElement;
  }
  if (listItem.parentElement !== list || listItem.tagName !== "LI") return;
  const items = [...list.children].filter((child) => child.tagName === "LI");
  let value = Number(list.getAttribute("start") || (list.hasAttribute("reversed") ? items.length : 1));
  for (const item of items) {
    if (item.hasAttribute("value")) value = Number(item.getAttribute("value"));
    if (item === listItem) { shell.setAttribute("start", String(value)); break; }
    value += list.hasAttribute("reversed") ? -1 : 1;
  }
}

function appendSelectedFootnotes(wrapper: HTMLElement, container: HTMLElement): void {
  const refs = wrapper.querySelectorAll<HTMLAnchorElement>(".footnote-link, .footnote-ref a, a[data-footnote-ref]");
  const added = new Set<string>();
  for (const ref of refs) {
    const href = ref.getAttribute("href") || "";
    const hash = href.indexOf("#");
    if (hash < 0) continue;
    let id: string;
    try { id = decodeURIComponent(href.slice(hash + 1)); } catch { continue; }
    const sourceScope = (element: Element) => {
      const scope = element.closest(".internal-embed, .markdown-embed, [data-embed-path]");
      return scope?.getAttribute("src") || scope?.getAttribute("data-embed-path") || "";
    };
    const scopePath = sourceScope(ref);
    const key = `${scopePath}#${id}`;
    if (added.has(key)) continue;
    const item = [...container.querySelectorAll<HTMLElement>(".footnotes li[id]")].find((candidate) =>
      candidate.id === id && sourceScope(candidate) === scopePath);
    if (!item || [...wrapper.querySelectorAll("li[id]")].some((candidate) => candidate.id === id && sourceScope(candidate) === scopePath)) continue;
    added.add(key);
    const section = createDetachedEl(wrapper.ownerDocument, "section");
    section.className = "footnotes";
    const list = createDetachedEl(wrapper.ownerDocument, "ol");
    list.appendChild(item.cloneNode(true));
    section.appendChild(list);
    (ref.closest(".internal-embed, .markdown-embed, [data-embed-path]") || wrapper).appendChild(section);
  }
}

function nodeContainsCheckbox(node: Node): boolean {
  if (
    node.nodeType === 1 &&
    (node as Element).matches('input[type="checkbox"], .task-list-item-checkbox')
  ) {
    return true;
  }
  return [...node.childNodes].some((child) => nodeContainsCheckbox(child));
}

function comparePositions(left: EditorPositionLike, right: EditorPositionLike): number {
  return left.line === right.line ? left.ch - right.ch : left.line - right.line;
}
