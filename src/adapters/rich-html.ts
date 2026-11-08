import { stripPluginAttributes } from "../core/dom";
import { createDetachedEl, createDetachedFragment } from "../core/dom-context";
import { formatTable } from "./text";

export type RichTarget =
  | "google-docs"
  | "word"
  | "notion"
  | "email"
  | "slack"
  | "wechat-official";

const BLOCK_STYLES: Record<string, Record<string, string>> = {
  h1: {
    "font-size": "24px",
    "font-weight": "700",
    "line-height": "1.25",
    margin: "24px 0 12px",
  },
  h2: {
    "font-size": "20px",
    "font-weight": "700",
    "line-height": "1.3",
    margin: "22px 0 10px",
  },
  h3: {
    "font-size": "17px",
    "font-weight": "700",
    "line-height": "1.35",
    margin: "18px 0 8px",
  },
  h4: {
    "font-size": "15px",
    "font-weight": "700",
    margin: "16px 0 8px",
  },
  h5: {
    "font-size": "14px",
    "font-weight": "700",
    margin: "14px 0 6px",
  },
  h6: {
    "font-size": "13px",
    "font-weight": "700",
    margin: "14px 0 6px",
  },
  p: {
    margin: "0 0 10px",
  },
  ul: {
    margin: "0 0 10px",
    "padding-left": "24px",
  },
  ol: {
    margin: "0 0 10px",
    "padding-left": "24px",
  },
  li: {
    margin: "2px 0",
  },
  blockquote: {
    "border-left": "4px solid #9ca3af",
    color: "#4b5563",
    margin: "12px 0",
    padding: "4px 0 4px 14px",
  },
  pre: {
    background: "#f6f8fa",
    border: "1px solid #d0d7de",
    "border-radius": "6px",
    "font-family": "Consolas, 'SFMono-Regular', Menlo, monospace",
    "font-size": "12px",
    "line-height": "1.45",
    margin: "12px 0",
    overflow: "auto",
    padding: "12px",
    "white-space": "pre-wrap",
  },
  table: {
    "border-collapse": "collapse",
    margin: "12px 0",
    width: "100%",
  },
  th: {
    background: "#f6f8fa",
    border: "1px solid #b8c0cc",
    "font-weight": "700",
    padding: "6px 9px",
    "text-align": "left",
    "vertical-align": "top",
  },
  td: {
    border: "1px solid #b8c0cc",
    padding: "6px 9px",
    "vertical-align": "top",
  },
  tr: {
    "break-inside": "avoid",
    "page-break-inside": "avoid",
  },
  thead: {
    display: "table-header-group",
  },
  hr: {
    border: "0",
    "border-top": "1px solid #d0d7de",
    margin: "18px 0",
  },
  img: {
    height: "auto",
    "max-width": "100%",
  },
};

const SOURCE_STYLE_PROPERTIES = new WeakMap<HTMLElement, Set<string>>();

export function buildRichHtml(
  source: HTMLElement,
  target: RichTarget,
): string {
  let root = source.cloneNode(true) as HTMLElement;
  clearSourcePresentation(root);
  trimTrailingEmptyBlocks(root);
  if (target === "google-docs") {
    prepareGoogleDocsRoot(root);
  }
  if (target === "slack") {
    prepareSlackRoot(root);
  }
  if (target === "wechat-official") {
    root = prepareWeChatRoot(root);
  }
  root.removeAttribute("class");
  root.removeAttribute("id");
  root.removeAttribute("style");
  root.removeAttribute("aria-hidden");
  captureSourceStyles(root);
  applyStyles(root, target);
  if (target === "word" || target === "google-docs") applyParagraphSemantics(root);
  stripPluginAttributes(root);
  return root.outerHTML;
}

function prepareSlackRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("table").forEach((table) => {
    const pre = createDetachedEl(table.ownerDocument, "pre");
    pre.className = "target-copy-slack-table";
    const code = createDetachedEl(table.ownerDocument, "code");
    code.textContent = formatTable(table);
    pre.appendChild(code);
    table.replaceWith(pre);
  });

  root.querySelectorAll<HTMLElement>(".target-copy-callout").forEach((callout) => {
    const quote = createDetachedEl(callout.ownerDocument, "blockquote");
    quote.className = callout.className;
    for (const attribute of [...callout.attributes]) {
      if (attribute.name !== "class" && attribute.name !== "style") {
        quote.setAttribute(attribute.name, attribute.value);
      }
    }
    while (callout.firstChild) quote.appendChild(callout.firstChild);
    callout.replaceWith(quote);
  });
}

function applyStyles(root: HTMLElement, target: RichTarget): void {
  applyStyle(root, {
    color: "#1f2328",
    "font-family":
      target === "word"
        ? "Calibri, Arial, sans-serif"
        : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
    "font-size": "14px",
    "line-height": "1.55",
  });

  for (const [selector, style] of Object.entries(BLOCK_STYLES)) {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => applyStyle(element, style));
  }

  root.querySelectorAll<HTMLElement>("code:not(pre code)").forEach((element) =>
    applyStyle(element, {
      background: "#f0f2f4",
      "border-radius": "3px",
      "font-family": "Consolas, 'SFMono-Regular', Menlo, monospace",
      "font-size": "0.9em",
      padding: "1px 4px",
    }),
  );

  root.querySelectorAll<HTMLElement>("strong, b").forEach((element) =>
    applyStyle(element, { "font-weight": "700" }),
  );
  root.querySelectorAll<HTMLElement>("em, i").forEach((element) =>
    applyStyle(element, { "font-style": "italic" }),
  );
  root.querySelectorAll<HTMLElement>("del, s, strike").forEach((element) =>
    applyStyle(element, { "text-decoration": "line-through" }),
  );
  root.querySelectorAll<HTMLElement>("u").forEach((element) =>
    applyStyle(element, { "text-decoration": "underline" }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a").forEach((element) =>
    applyStyle(element, { color: "#0969da", "text-decoration": "underline" }),
  );
  root.querySelectorAll<HTMLElement>("mark").forEach((element) =>
    applyStyle(element, { background: "#fff3a3", color: "#1f2328" }),
  );

  root.querySelectorAll<HTMLElement>(".target-copy-callout").forEach((element) =>
    applyStyle(element, {
      background: "#f6f8fa",
      border: "1px solid #d0d7de",
      "border-left": "4px solid #3b82f6",
      "border-radius": "4px",
      margin: "12px 0",
      padding: "10px 12px",
    }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-callout-title").forEach((element) =>
    applyStyle(element, { "font-weight": "700", margin: "0 0 6px" }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-callout-content > :last-child").forEach((element) =>
    applyStyle(element, { "margin-bottom": "0" }),
  );

  if (target === "email") {
    root.querySelectorAll<HTMLElement>("div").forEach((element) => {
      appendRawStyle(element, "max-width:100%");
    });
  }

  if (target === "notion") {
    applyStyle(root, { color: "#37352f", "line-height": "1.5" });
    root.querySelectorAll<HTMLElement>("pre").forEach((element) =>
      applyStyle(element, { background: "#f7f6f3", border: "0" }),
    );
    root.querySelectorAll<HTMLElement>("blockquote").forEach((element) =>
      applyStyle(element, { color: "#37352f", "border-left": "3px solid #37352f" }),
    );
  }

  if (target === "google-docs") {
    applyGoogleDocsStyles(root);
  }

  if (target === "wechat-official") {
    applyWeChatStyles(root);
  }
}

function trimTrailingEmptyBlocks(root: HTMLElement): void {
  while (root.lastChild?.nodeType === 3 && !root.lastChild.textContent?.trim()) {
    root.lastChild.remove();
  }

  while (root.lastElementChild && isEmptyTerminalBlock(root.lastElementChild)) {
    root.lastElementChild.remove();
    while (root.lastChild?.nodeType === 3 && !root.lastChild.textContent?.trim()) {
      root.lastChild.remove();
    }
  }
}

function isEmptyTerminalBlock(element: Element): boolean {
  if (!element.matches("p, div")) return false;
  if (element.textContent?.trim()) return false;
  return !element.querySelector("img, svg, canvas, table, pre, hr, audio, video");
}

function prepareGoogleDocsRoot(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("pre").forEach((element) => {
    const source = createGoogleDocsCodeSource(element);
    if (source.closest("table, blockquote, .target-copy-callout")) return;
    wrapGoogleDocsBlock(source, "code");
  });

  root.querySelectorAll<HTMLElement>(".target-copy-callout").forEach((element) => {
    if (element.closest("table")) return;
    wrapGoogleDocsBlock(element, "callout");
  });

  root.querySelectorAll<HTMLElement>("blockquote").forEach((element) => {
    if (element.closest("table, .target-copy-callout")) return;
    wrapGoogleDocsBlock(element, "quote");
  });
}

/** Editable source uses explicit line breaks and inline whitespace styles. */
function createGoogleDocsCodeSource(pre: HTMLElement): HTMLElement {
  const ownerDocument = pre.ownerDocument;
  const code = pre.querySelector<HTMLElement>(":scope > code") ?? pre;
  const source = createDetachedEl(ownerDocument, "p");
  source.className = "target-copy-gdocs-code-source";

  const languageClass = [...code.classList].find((name) =>
    /^(?:language|lang)-/.test(name),
  );
  if (languageClass) source.classList.add(languageClass);
  for (const attribute of [...code.attributes]) {
    if (attribute.name === "class" || attribute.name === "style") continue;
    source.setAttribute(attribute.name, attribute.value);
  }

  while (code.firstChild) source.appendChild(code.firstChild);
  if (pre.hasAttribute("data-target-copy-fenced-code")) trimRenderedCodeTerminator(source);
  materializeCodeLineBreaks(source);
  pre.replaceWith(source);
  return source;
}

function trimRenderedCodeTerminator(root: HTMLElement): void {
  const textNodes = collectTextNodes(root);
  const last = textNodes[textNodes.length - 1];
  if (last) last.textContent = (last.textContent || "").replace(/\n$/, "");
}

function materializeCodeLineBreaks(root: HTMLElement): void {
  for (const textNode of collectTextNodes(root)) {
    const value = textNode.textContent || "";
    const fragment = createDetachedFragment(root.ownerDocument);
    const lines = value.split("\n");
    lines.forEach((line, index) => {
      if (line) {
        const span = createDetachedEl(root.ownerDocument, "span");
        applyStyle(span, { "white-space": "pre-wrap" });
        appendRawStyle(span, "mso-spacerun:yes");
        span.textContent = line;
        fragment.appendChild(span);
      }
      if (index < lines.length - 1) fragment.appendChild(createDetachedEl(root.ownerDocument, "br"));
    });
    textNode.replaceWith(fragment);
  }
}

function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  for (const child of [...root.childNodes]) {
    if (child.nodeType === 3) {
      nodes.push(child as Text);
    } else {
      nodes.push(...collectTextNodes(child));
    }
  }
  return nodes;
}

function wrapGoogleDocsBlock(
  element: HTMLElement,
  kind: "code" | "callout" | "quote",
): void {
  const ownerDocument = element.ownerDocument;
  const table = createDetachedEl(ownerDocument, "table");
  table.className = `target-copy-gdocs-block target-copy-gdocs-${kind}`;
  const body = createDetachedEl(ownerDocument, "tbody");
  const row = createDetachedEl(ownerDocument, "tr");
  const cell = createDetachedEl(ownerDocument, "td");
  element.replaceWith(table);
  cell.appendChild(element);
  row.appendChild(cell);
  body.appendChild(row);
  table.appendChild(body);
}

function applyGoogleDocsStyles(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("th, td").forEach((cell) => {
    let paragraph: HTMLParagraphElement | undefined;
    for (const child of [...cell.childNodes]) {
      if (child.nodeType === 1 && (child as Element).matches("p, div, section, table, pre, blockquote, ul, ol, h1, h2, h3, h4, h5, h6")) {
        paragraph = undefined;
      } else if (paragraph || child.textContent?.trim() || child.nodeType === 1) {
        if (!paragraph) {
          paragraph = createDetachedEl(cell.ownerDocument, "p");
          cell.insertBefore(paragraph, child);
        }
        paragraph.appendChild(child);
      }
    }
  });
  root.querySelectorAll<HTMLElement>("td p, th p").forEach((paragraph) =>
    applyStyle(paragraph, { margin: "0", "line-height": "1.35" }),
  );
  root.querySelectorAll<HTMLElement>(
    "table:not(.target-copy-gdocs-block) th, table:not(.target-copy-gdocs-block) td",
  ).forEach((element) =>
    applyStyle(element, {
      "font-size": "13px",
      "line-height": "1.35",
      padding: "4px 6px",
    }),
  );

  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-block").forEach((element) =>
    applyStyle(element, {
      "border-collapse": "collapse",
      margin: "8px 0",
      width: "100%",
    }),
  );

  root.querySelectorAll<HTMLElement>(
    ".target-copy-gdocs-block > tbody > tr",
  ).forEach((element) =>
    applyStyle(element, {
      "break-inside": "auto",
      "page-break-inside": "auto",
    }),
  );

  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-block > tbody > tr > td").forEach(
    (element) => applyStyle(element, { padding: "6px 9px" }),
  );

  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-code > tbody > tr > td").forEach(
    (element) => applyStyle(element, {
      background: "#f6f8fa",
      border: "1px solid #d0d7de",
    }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-code-source").forEach((element) =>
    applyStyle(element, {
      background: "transparent",
      "font-family": "Consolas, 'SFMono-Regular', Menlo, monospace",
      "font-size": "11px",
      "line-height": "1.3",
      margin: "0",
      padding: "0",
      "white-space": "pre-wrap",
      "word-break": "break-word",
    }),
  );

  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-callout > tbody > tr > td").forEach(
    (element) => applyStyle(element, {
      background: "#f6f8fa",
      border: "1px solid #d0d7de",
      "border-left": "4px solid #3b82f6",
      padding: "8px 10px",
    }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-callout .target-copy-callout").forEach(
    (element) => applyStyle(element, {
      background: "transparent",
      border: "0",
      "border-radius": "0",
      margin: "0",
      padding: "0",
    }),
  );

  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-quote > tbody > tr > td").forEach(
    (element) => applyStyle(element, {
      border: "0",
      "border-left": "4px solid #9ca3af",
      padding: "6px 10px",
    }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-gdocs-quote blockquote").forEach((element) =>
    applyStyle(element, {
      "border-left": "0",
      margin: "0",
      padding: "0",
    }),
  );
}

function clearSourcePresentation(root: HTMLElement): void {
  root.removeAttribute("aria-hidden");
}

function prepareWeChatRoot(source: HTMLElement): HTMLElement {
  const root = createDetachedEl(source.ownerDocument, "section");
  while (source.firstChild) root.appendChild(source.firstChild);
  return root;
}

function applyWeChatStyles(root: HTMLElement): void {
  applyStyle(root, {
    color: "#3f3f3f",
    "font-family": "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    "font-size": "16px",
    "letter-spacing": "0.034em",
    "line-height": "1.75",
    "word-break": "break-word",
  });
  root.querySelectorAll<HTMLElement>("p").forEach((element) =>
    applyStyle(element, { margin: "0 0 16px", "text-align": "justify" }),
  );
  root.querySelectorAll<HTMLElement>("h1").forEach((element) =>
    applyStyle(element, {
      color: "#1f1f1f",
      "font-size": "24px",
      "line-height": "1.35",
      margin: "28px 0 20px",
      "text-align": "center",
    }),
  );
  root.querySelectorAll<HTMLElement>("h2").forEach((element) =>
    applyStyle(element, {
      color: "#1f1f1f",
      "border-left": "4px solid #07c160",
      "font-size": "20px",
      "line-height": "1.4",
      margin: "28px 0 16px",
      padding: "2px 0 2px 10px",
    }),
  );
  root.querySelectorAll<HTMLElement>("h3, h4, h5, h6").forEach((element) =>
    applyStyle(element, {
      color: "#1f1f1f",
      "font-size": "17px",
      "line-height": "1.45",
      margin: "22px 0 12px",
    }),
  );
  root.querySelectorAll<HTMLElement>("blockquote").forEach((element) =>
    applyStyle(element, {
      background: "#f7f7f7",
      "border-left": "4px solid #07c160",
      color: "#5b5b5b",
      margin: "16px 0",
      padding: "10px 14px",
    }),
  );
  root.querySelectorAll<HTMLElement>("pre").forEach((element) =>
    applyStyle(element, {
      background: "#f6f8fa",
      border: "1px solid #e5e5e5",
      "border-radius": "4px",
      "font-size": "13px",
      "line-height": "1.55",
      overflow: "auto",
      padding: "12px",
      "white-space": "pre-wrap",
      "word-break": "break-all",
    }),
  );
  root.querySelectorAll<HTMLAnchorElement>("a").forEach((element) =>
    applyStyle(element, { color: "#576b95", "text-decoration": "none" }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-callout").forEach((element) =>
    applyStyle(element, {
      background: "#f3fbf6",
      border: "1px solid #ccebd8",
      "border-left": "4px solid #07c160",
      "border-radius": "4px",
      margin: "16px 0",
      padding: "12px 14px",
    }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-wechat-references").forEach((element) =>
    applyStyle(element, {
      "border-top": "1px solid #e5e5e5",
      color: "#7f7f7f",
      "font-size": "13px",
      "line-height": "1.6",
      margin: "28px 0 0",
      padding: "14px 0 0",
    }),
  );
  root.querySelectorAll<HTMLElement>(".target-copy-wechat-references-title").forEach((element) =>
    applyStyle(element, { color: "#3f3f3f", "font-weight": "700", margin: "0 0 8px" }),
  );
}

function applyStyle(element: HTMLElement, styles: Record<string, string>): void {
  if (element.closest("svg")) return;
  const sourceProperties = SOURCE_STYLE_PROPERTIES.get(element);
  for (const [property, value] of Object.entries(styles)) {
    if (!sourceProperties?.has(property)) {
      element.style.setProperty(property, value);
    }
  }
}

function captureSourceStyles(root: HTMLElement): void {
  for (const element of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    if (element.closest("svg")) continue;
    const align = element.getAttribute("align");
    if (align && /^(left|center|right|justify)$/.test(align) && !element.style.textAlign) {
      element.style.textAlign = align;
    }
    const properties = new Set<string>();
    for (let index = 0; index < element.style.length; index += 1) {
      const property = element.style.item(index);
      if (property) properties.add(property);
    }
    SOURCE_STYLE_PROPERTIES.set(element, properties);
  }
}

function appendRawStyle(element: HTMLElement, rule: string): void {
  const current = element.getAttribute("style") || "";
  element.setAttribute("style", `${current}${current && !current.endsWith(";") ? ";" : ""}${rule};`);
}

function applyParagraphSemantics(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    const level = heading.tagName.slice(1);
    appendRawStyle(heading, `mso-style-name:'Heading ${level}';mso-outline-level:${level}`);
  });
  root.querySelectorAll<HTMLElement>("p, li").forEach((paragraph) => {
    appendRawStyle(paragraph, "mso-style-name:Normal;mso-outline-level:body-text");
  });
}
