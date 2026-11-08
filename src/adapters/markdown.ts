import { backtickFence } from "../core/source";

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, pre, ul, ol, li, blockquote, table, hr, div, section, article, figure, details, audio, video, svg, iframe";
const RAW = new Set(["audio", "video", "picture", "svg", "math", "iframe", "object", "details", "dl", "figure"]);

/** Serializes supported semantics; complex structures remain portable HTML. */
export function domToMarkdown(root: HTMLElement): string {
  return blocks(root).replace(/^\n+|\n+$/g, "");
}

function blocks(root: ParentNode): string {
  const chunks: string[] = [];
  let inlineRun = "";
  const flush = () => {
    if (inlineRun.trim()) chunks.push(inlineRun.trim());
    inlineRun = "";
  };
  for (const node of root.childNodes) {
    if (node.nodeType !== 1 || !(node as Element).matches(BLOCKS)) {
      inlineRun += inline(node);
      continue;
    }
    flush();
    const value = block(node as HTMLElement);
    if (value) chunks.push(value);
  }
  flush();
  return chunks.join("\n\n");
}

function block(element: HTMLElement): string {
  const tag = element.localName;
  if (RAW.has(tag)) return element.outerHTML;
  if (element.classList.contains("target-copy-footnotes")) {
    return [...element.querySelectorAll<HTMLElement>(":scope > ol > li")].map((item) => {
      const value = blocks(item).split("\n");
      return `[^${item.dataset.footnoteNumber}]: ${value[0] || ""}` +
        value.slice(1).map((line) => `\n    ${line}`).join("");
    }).join("\n");
  }
  if (element.classList.contains("target-copy-callout")) {
    const title = element.querySelector<HTMLElement>(":scope > .target-copy-callout-title");
    const body = element.querySelector<HTMLElement>(":scope > .target-copy-callout-content");
    const content = body ? blocks(body) : "";
    const value = `**${title ? children(title) : "Note"}**${content ? `\n\n${content}` : ""}`;
    return quote(value);
  }
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${children(element).trim()}`;
  if (tag === "p") return children(element).trim();
  if (tag === "pre") {
    if (element.classList.contains("target-copy-latex-block")) return element.textContent || "";
    const code = element.querySelector("code");
    const value = element.textContent || "";
    const info = code?.getAttribute("data-code-info") || code?.className.match(/(?:language|lang)-([\w+-]+)/)?.[1] || "";
    const fence = backtickFence(value + info);
    return `${fence}${info}\n${value}${value.endsWith("\n") ? "" : "\n"}${fence}`;
  }
  if (tag === "ul" || tag === "ol") return list(element);
  if (tag === "blockquote") return quote(blocks(element));
  if (tag === "table") return table(element);
  if (tag === "hr") return "---";
  return blocks(element);
}

function list(element: HTMLElement): string {
  const items = [...element.children].filter((child) => child.localName === "li") as HTMLElement[];
  const ordered = element.localName === "ol";
  let number = Number(element.getAttribute("start") || 1);
  if (element.hasAttribute("reversed") || items.some((item, index) =>
    item.hasAttribute("value") && Number(item.getAttribute("value")) !== number + index)) return element.outerHTML;
  return items.map((item) => {
    const marker = ordered ? `${number++}. ` : "- ";
    const body = blocks(item).split("\n");
    return marker + (body.shift() || "") + body.map((line) => `\n${" ".repeat(marker.length)}${line}`).join("");
  }).join("\n");
}

function table(element: HTMLElement): string {
  const rows = [...element.querySelectorAll<HTMLTableRowElement>("tr")]
    .filter((row) => row.closest("table") === element);
  if (element.querySelector("table, caption, pre, ul, ol") ||
    [...element.querySelectorAll("th, td")].some((cell) =>
      Number(cell.getAttribute("colspan") || 1) !== 1 || Number(cell.getAttribute("rowspan") || 1) !== 1)) return element.outerHTML;
  if (!rows.length) return element.outerHTML;
  const width = Math.max(...rows.map((row) => row.cells.length));
  const values = rows.map((row) => Array.from({ length: width }, (_, index) => {
    const cell = row.cells[index];
    return cell ? blocks(cell).trim().replace(/\n/g, "<br>").replace(/(?<!\\)\|/g, "\\|") : "";
  }));
  const header = rows[0]!.querySelector("th") ? values.shift()! : Array<string>(width).fill("");
  const separator = Array.from({ length: width }, (_, index) => {
    const cell = rows[0]!.cells[index];
    const align = cell?.style.textAlign || cell?.getAttribute("align");
    return align === "center" ? ":---:" : align === "right" ? "---:" : align === "left" ? ":---" : "---";
  });
  return [header, separator, ...values].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function children(element: ParentNode): string {
  return [...element.childNodes].map(inline).join("");
}

function inline(node: Node): string {
  if (node.nodeType === 3) return escapeText((node.textContent || "").replace(/[\t\r\n ]+/g, " "));
  if (node.nodeType !== 1) return "";
  const element = node as HTMLElement;
  const tag = element.localName;
  if (RAW.has(tag)) return element.outerHTML;
  if (tag === "br") return "  \n";
  if (tag === "wbr") return "";
  if (tag === "input" && element.getAttribute("type") === "checkbox") {
    return (element as HTMLInputElement).checked ? "[x] " : "[ ] ";
  }
  if (element.hasAttribute("data-task-checked")) return element.dataset.taskChecked === "true" ? "[x] " : "[ ] ";
  if (element.classList.contains("target-copy-footnote-ref")) {
    const label = element.dataset.footnoteNumber || element.textContent || "";
    return element.dataset.footnoteResolved === "false" ? `\\[${label}\\]` : `[^${label}]`;
  }
  if (tag === "code") {
    const value = element.textContent || "";
    if (element.classList.contains("target-copy-latex-inline")) return value;
    const fence = backtickFence(value, 1);
    const padding = value.startsWith("`") || value.endsWith("`") ||
      (/^ .* $/.test(value) && value.trim()) ? " " : "";
    return `${fence}${padding}${value}${padding}${fence}`;
  }
  const content = children(element);
  if (tag === "strong" || tag === "b") return emphasis(element, content, "**");
  if (tag === "mark") return `<mark>${content}</mark>`;
  if (tag === "em" || tag === "i") return emphasis(element, content, "*");
  if (["del", "s", "strike"].includes(tag)) return emphasis(element, content, "~~");
  if (tag === "a") {
    const href = element.getAttribute("href");
    return href ? `[${content || escapeText(href)}](${url(href)})` : content;
  }
  if (tag === "img") {
    const src = element.getAttribute("src");
    if (element.matches("[width], [height], [srcset], [sizes], [style]")) return element.outerHTML;
    const title = element.getAttribute("title");
    const suffix = title ? ` "${title.replace(/\\/g, "\\\\").replace(/"/g, "&quot;")}"` : "";
    return src ? `![${escapeText(element.getAttribute("alt") ?? "")}](${url(src)}${suffix})` : element.outerHTML;
  }
  if (tag === "span" && element.hasAttribute("style")) {
    const supported = new Set(["font-weight", "font-style", "text-decoration", "text-decoration-line"]);
    if ([...Array(element.style.length).keys()].some((index) => !supported.has(element.style.item(index)))) return element.outerHTML;
    let value = content;
    if (element.style.fontStyle && element.style.fontStyle !== "normal") value = emphasis(element, value, "*");
    if (element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600) value = emphasis(element, value, "**");
    const decoration = element.style.textDecorationLine || element.style.textDecoration;
    if (decoration.includes("underline")) return element.outerHTML;
    if (decoration.includes("line-through")) value = emphasis(element, value, "~~");
    return value;
  }
  if (["span", "div", "section", "article"].includes(tag)) return content;
  if (element.matches(BLOCKS)) return block(element);
  return element.outerHTML;
}

function emphasis(element: HTMLElement, content: string, marker: string): string {
  const match = content.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (!match[2]) return content;
  const adjacent = [element.previousSibling, element.nextSibling].some((node) =>
    node?.nodeType === 1 && (node as Element).matches("strong, b, em, i, del, s, strike, span[style]"));
  if (adjacent) return element.outerHTML;
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]~|])/g, "\\$1").replace(/(^|\n)([ \t]*)([#+-]|\d+[.)])(?=\s)/g, "$1$2\\$3");
}

function url(value: string): string {
  return value.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/</g, "%3C").replace(/>/g, "%3E");
}

function quote(value: string): string {
  return value.split("\n").map((line) => `> ${line}`).join("\n");
}
