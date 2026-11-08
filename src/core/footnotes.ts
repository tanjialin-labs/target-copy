const REFERENCES = "sup.footnote-ref, sup[data-footnote-ref], sup:has(.footnote-link), a.footnote-link, a[data-footnote-ref]";

export function normalizeFootnotes(root: HTMLElement): void {
  root.querySelectorAll('.footnote-backref, [data-footnote-backref], a[href^="#fnref"], a[href^="#fn-ref"]')
    .forEach((backlink) => backlink.remove());
  const scopes = new Map<Element, number>();
  const scope = (element: Element) => {
    const owner = element.closest(".internal-embed, .markdown-embed, [data-embed-path]") || root;
    if (!scopes.has(owner)) scopes.set(owner, scopes.size);
    return scopes.get(owner)!;
  };
  const definitions = new Map<string, HTMLElement>();
  const numbers = new Map<HTMLElement, string>();
  const sections = [...root.querySelectorAll<HTMLElement>("section.footnotes, div.footnotes")];
  for (const section of sections) {
    for (const item of section.querySelectorAll<HTMLElement>(":scope > ol > li")) {
      if (item.id) definitions.set(`${scope(item)}#${item.id}`, item);
    }
  }
  let next = 1;
  for (const reference of [...root.querySelectorAll<HTMLElement>(REFERENCES)]) {
    if (!root.contains(reference)) continue;
    const anchor = reference.matches("a") ? reference : reference.querySelector("a");
    const href = anchor?.getAttribute("href") || "";
    let id = href.slice(href.indexOf("#") + 1);
    try { id = decodeURIComponent(id); } catch { /* Retain a literal fragment. */ }
    const definition = definitions.get(`${scope(reference)}#${id}`);
    const label = reference.textContent?.trim().replace(/^\[|\]$/g, "") || String(next);
    const number = definition ? numbers.get(definition) || String(next++) : label;
    if (definition) numbers.set(definition, number);
    const portable = root.ownerDocument.createElement("sup");
    portable.className = "target-copy-footnote-ref";
    portable.dataset.footnoteNumber = number;
    portable.dataset.footnoteResolved = String(Boolean(definition));
    portable.textContent = number;
    reference.replaceWith(portable);
  }
  for (const section of sections) {
    section.classList.replace("footnotes", "target-copy-footnotes");
    for (const item of section.querySelectorAll<HTMLElement>(":scope > ol > li")) {
      const number = numbers.get(item) || String(next++);
      item.dataset.footnoteNumber = number;
      item.setAttribute("value", number);
      item.id = `target-copy-footnote-${number}`;
    }
  }
  for (const ref of root.querySelectorAll<HTMLElement>('.target-copy-footnote-ref[data-footnote-resolved="true"]')) {
    const anchor = root.ownerDocument.createElement("a");
    anchor.setAttribute("href", `#target-copy-footnote-${ref.dataset.footnoteNumber}`);
    anchor.textContent = ref.textContent;
    ref.replaceChildren(anchor);
  }
  root.querySelectorAll('.footnote-backref, [data-footnote-backref], a[href^="#fnref"], a[href^="#fn-ref"]')
    .forEach((backlink) => backlink.remove());
}
