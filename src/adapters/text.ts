export { domToMarkdown } from "./markdown";

export function domToSlack(root: HTMLElement): string {
  return renderBlocks(root, "slack").replace(/^\n+|\n+$/g, "");
}

export function domToPlainText(root: HTMLElement): string {
  return renderBlocks(root, "plain").replace(/\n\n$/, "");
}


type Flavor = "slack" | "plain";

const INLINE_TAGS = new Set([
  "a",
  "b",
  "code",
  "del",
  "em",
  "i",
  "img",
  "mark",
  "s",
  "span",
  "strike",
  "strong",
  "sup",
]);

function renderBlocks(root: ParentNode, flavor: Flavor, depth = 0): string {
  const chunks: string[] = [];
  let inlineRun = "";
  const flush = () => {
    if (inlineRun.trim()) chunks.push(inlineRun.trim() + "\n\n");
    inlineRun = "";
  };

  for (const node of [...root.childNodes]) {
    if (node.nodeType === 3) {
      const value = normalizeInlineWhitespace(node.textContent || "");
      if (value) inlineRun += flavor === "slack" ? escapeSlackText(value) : value;
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as HTMLElement;

    const tag = element.tagName.toLowerCase();
    if (isInlineTag(tag) || tag === "br") {
      inlineRun += renderInlineNode(element, flavor);
      continue;
    }
    flush();
    if (["audio", "video", "source"].includes(tag)) {
      chunks.push(`${renderInlineNode(element, flavor).trim()}\n\n`);
    } else if (/^h[1-6]$/.test(tag)) {
      const text = renderInline(element, flavor).trim();
      chunks.push(flavor === "slack" ? `*${text}*\n\n` : `${text}\n${"=".repeat(Math.min(48, text.length || 1))}\n\n`);
    } else if (tag === "p") {
      chunks.push(`${renderInline(element, flavor).trim()}\n\n`);
    } else if (tag === "ul" || tag === "ol") {
      chunks.push(`${renderList(element, flavor, depth)}\n\n`);
    } else if (tag === "pre") {
      const code = element.textContent || "";
      chunks.push(flavor === "slack" ? `\`\`\`\n${code}\n\`\`\`\n\n` : `${code}\n\n`);
    } else if (tag === "blockquote") {
      const text =
        renderBlocks(element, flavor, depth).trim() ||
        renderInline(element, flavor).trim();
      chunks.push(`${prefixLines(text, "> ")}\n\n`);
    } else if (tag === "table") {
      const table = formatTable(element);
      chunks.push(flavor === "slack" ? `\`\`\`\n${table}\n\`\`\`\n\n` : `${table}\n\n`);
    } else if (tag === "hr") {
      chunks.push(`${flavor === "slack" ? "────────" : "--------------------------------"}\n\n`);
    } else if (element.classList.contains("target-copy-callout")) {
      const title = element.querySelector(".target-copy-callout-title")?.textContent?.trim() || "Note";
      const contentElement = element.querySelector<HTMLElement>(".target-copy-callout-content");
      const content = contentElement ? renderBlocks(contentElement, flavor, depth).trim() : "";
      const value = `${flavor === "slack" ? `*${title}*` : title}${content ? `\n${content}` : ""}`;
      chunks.push(`${prefixLines(value, "> ")}\n\n`);
    } else if (tag === "br") {
      chunks.push("\n");
    } else if (isInlineTag(tag)) {
      chunks.push(`${renderInlineNode(element, flavor).trim()}\n\n`);
    } else {
      const nested = renderBlocks(element, flavor, depth).trim();
      chunks.push(nested ? `${nested}\n\n` : `${renderInline(element, flavor).trim()}\n\n`);
    }
  }

  flush();
  return chunks.join("");
}

function renderList(list: HTMLElement, flavor: Flavor, depth: number): string {
  const ordered = list.tagName.toLowerCase() === "ol";
  const lines: string[] = [];
  let index = Number(list.getAttribute("start") || (list.hasAttribute("reversed") ? list.children.length : 1));

  for (const child of [...list.children]) {
    if (child.tagName !== "LI") continue;

    const nestedLists = [...child.children].filter((element) => /^(UL|OL)$/.test(element.tagName));
    const inlineParts: string[] = [];
    for (const node of [...child.childNodes]) {
      if (node.nodeType === 1 && /^(UL|OL)$/.test((node as HTMLElement).tagName)) continue;
      inlineParts.push(renderInlineNode(node, flavor));
    }

    if (child.hasAttribute("value")) index = Number(child.getAttribute("value"));
    const indent = "  ".repeat(depth);
    const marker = ordered ? `${index}.` : "•";
    lines.push(`${indent}${marker} ${inlineParts.join("").trim()}`);
    for (const nested of nestedLists) {
      lines.push(renderList(nested as HTMLElement, flavor, depth + 1));
    }
    index += list.hasAttribute("reversed") ? -1 : 1;
  }

  return lines.join("\n");
}

function renderInline(root: ParentNode, flavor: Flavor): string {
  return [...root.childNodes].map((node) => renderInlineNode(node, flavor)).join("");
}

function renderInlineNode(node: Node, flavor: Flavor): string {
  if (node.nodeType === 3) {
    const value = normalizeInlineWhitespace(node.textContent || "");
    return flavor === "slack" ? escapeSlackText(value) : value;
  }
  if (node.nodeType !== 1) return "";
  const element = node as HTMLElement;

  const tag = element.tagName.toLowerCase();
  const content = renderInline(element, flavor);

  if (tag === "br") return "\n";
  if (tag === "p") return `${content}\n\n`;
  if (tag === "div" || tag === "section") return `${content}\n`;
  if (["audio", "video", "source"].includes(tag)) {
    const src = element.getAttribute("src");
    return `${content}${src ? ` <${src}>` : ""}`;
  }
  if (tag === "strong" || tag === "b") return flavor === "slack" ? `*${content}*` : content;
  if (tag === "em" || tag === "i") return flavor === "slack" ? `_${content}_` : content;
  if (tag === "del" || tag === "s" || tag === "strike") return flavor === "slack" ? `~${content}~` : content;
  if (tag === "code") return flavor === "slack" ? `\`${element.textContent || ""}\`` : element.textContent || "";
  if (tag === "a") {
    const href = element.getAttribute("href") || "";
    const label = content || href;
    if (
      flavor === "slack" &&
      href &&
      /^(?:https?|mailto|obsidian|tel):/i.test(href)
    ) {
      const safeHref = href.replace(/\|/g, "%7C").replace(/>/g, "%3E");
      return label === href ? `<${safeHref}>` : `<${safeHref}|${label}>`;
    }
    return href && label !== href ? `${label} <${href}>` : label;
  }
  if (tag === "img") {
    const alt = element.getAttribute("alt") || "Image";
    const src = element.getAttribute("src") || "";
    if (/^data:image\//i.test(src)) return `[Image: ${alt}]`;
    return src ? `![${alt}](${src})` : `[${alt}]`;
  }
  if (tag === "sup" && element.classList.contains("target-copy-footnote-ref")) {
    const number = element.dataset.footnoteNumber || content;
    return `[${number}]`;
  }

  return content;
}

export function formatTable(table: HTMLElement): string {
  const sourceRows = [...table.querySelectorAll("tr")].filter((row) => row.closest("table") === table);
  const rows: string[][] = [];
  const occupied: boolean[][] = [];
  const groupEnds: number[] = [];
  for (let index = sourceRows.length - 1; index >= 0; index -= 1) {
    groupEnds[index] = sourceRows[index]?.parentElement === sourceRows[index + 1]?.parentElement
      ? groupEnds[index + 1]! : index + 1;
  }
  sourceRows.forEach((row, rowIndex) => {
    const values = rows[rowIndex] ??= [];
    const slots = occupied[rowIndex] ??= [];
    let column = 0;
    for (const cell of [...row.children].filter((item) => /^(TH|TD)$/.test(item.tagName))) {
      while (slots[column]) column += 1;
      const nested = cell.cloneNode(true) as HTMLElement;
      for (const child of [...nested.querySelectorAll<HTMLElement>("table")].filter((item) => item.parentElement?.closest("table") === null)) {
        child.replaceWith(nested.ownerDocument.createTextNode(` [${formatTable(child).replace(/\n/g, "; ")}] `));
      }
      values[column] = collapseWhitespace(renderInline(nested, "plain"));
      const colspan = Math.max(1, Math.min(1000, Number.parseInt(cell.getAttribute("colspan") || "1", 10) || 1));
      const rawRowspan = cell.getAttribute("rowspan");
      const available = groupEnds[rowIndex]! - rowIndex;
      const parsedRowspan = Number.parseInt(rawRowspan || "1", 10);
      const rowspan = parsedRowspan === 0 ? available : Math.max(1, Math.min(available, parsedRowspan || 1));
      for (let y = rowIndex; y < rowIndex + rowspan; y += 1) {
        const rowSlots = occupied[y] ??= [];
        const rowValues = rows[y] ??= [];
        for (let x = column; x < column + colspan; x += 1) {
          rowSlots[x] = true;
          rowValues[x] ??= "";
        }
      }
      column += colspan;
    }
  });
  if (rows.length === 0) return "";

  const columnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
  const widths = Array.from({ length: columnCount }, () => 1);
  for (const row of rows) {
    for (let column = 0; column < row.length; column += 1) {
      widths[column] = Math.max(widths[column]!, displayWidth(row[column] || ""));
    }
  }

  const renderRow = (row: string[]) =>
    Array.from({ length: columnCount }, (_, column) => row[column] || "")
      .map((cell, column) => padToDisplayWidth(cell, widths[column] ?? 1))
      .join(" | ")
      .trimEnd();

  const lines = rows.map(renderRow);
  if (table.querySelector("th") && lines.length > 0) {
    lines.splice(1, 0, widths.map((width) => "-".repeat(width)).join("-+-"));
  }
  return lines.join("\n");
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, " ");
}

function escapeSlackText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([*_~`])/g, "\\$1")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function padToDisplayWidth(value: string, width: number): string {
  return `${value}${" ".repeat(Math.max(0, width - displayWidth(value)))}`;
}

function displayWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    if (/\p{Mark}/u.test(character) || character === "\u200d" || character === "\ufe0f") {
      continue;
    }
    width += isWideCharacter(character) ? 2 : 1;
  }
  return width;
}

function isWideCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  );
}

function prefixLines(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}


function isInlineTag(tag: string): boolean {
  return INLINE_TAGS.has(tag);
}
