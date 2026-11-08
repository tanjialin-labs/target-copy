export interface SourceSegment {
  kind: "text" | "fence" | "code" | "html" | "comment" | "math" | "image";
  value: string;
  body?: string;
  info?: string;
  prefix?: string;
  unclosed?: boolean;
  reference?: string;
  title?: string;
}

/** Shared lexical boundaries for transformations that must leave source intact. */
export function sourceSegments(source: string): SourceSegment[] {
  const result: SourceSegment[] = [];
  let textStart = 0;
  let index = 0;
  const push = (segment: SourceSegment, end: number) => {
    if (textStart < index) result.push({ kind: "text", value: source.slice(textStart, index) });
    result.push(segment);
    index = end;
    textStart = end;
  };
  while (index < source.length) {
    if (source.startsWith("![", index) && !source.startsWith("![[", index) && !isEscaped(source, index)) {
      const image = readImage(source, index);
      if (image) { push(image.segment, image.end); continue; }
    }
    if (index === 0) {
      const frontmatter = source.match(/^\uFEFF?---[\t ]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/)?.[0];
      if (frontmatter) { push({ kind: "code", value: frontmatter }, frontmatter.length); continue; }
    }
    if (index === 0 || source[index - 1] === "\n") {
      const lineEnd = endOfLine(source, index);
      const line = source.slice(index, lineEnd);
      const opening = line.match(/^([ \t]*(?:>[ \t]?)*[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?)(`{3,}|~{3,})([^\n]*)/);
      if (opening && !(opening[2]![0] === "`" && opening[3]!.includes("`"))) {
        const prefix = opening[1]!;
        const marker = opening[2]!;
        const quotePrefix = prefix.match(/^[ \t]*(?:>[ \t]?)+/)?.[0] ?? "";
        const quoteDepth = (quotePrefix.match(/>/g) || []).length;
        const quotePattern = new RegExp(`^(?:[ \\t]*>[ \\t]?){${quoteDepth}}`);
        const indentation = prefix.slice(quotePrefix.length).replace(/\S/g, " ");
        let cursor = lineEnd;
        let body = "";
        let closed = false;
        while (cursor < source.length) {
          const end = endOfLine(source, cursor);
          const raw = source.slice(cursor, end);
          if (quotePrefix && !/^[ \t]*>/.test(raw) && raw.trim()) break;
          let content = quotePrefix ? raw.replace(quotePattern, "") : raw;
          const close = content.match(/^[ \t]*(`+|~+)[ \t]*(?:\r?\n|$)$/);
          if (close && close[1]![0] === marker[0] && close[1]!.length >= marker.length) {
            cursor = end;
            closed = true;
            break;
          }
          if (indentation && content.startsWith(indentation)) content = content.slice(indentation.length);
          body += content;
          cursor = end;
        }
        push({ kind: "fence", value: source.slice(index, cursor), body,
          info: opening[3]!.trim(), prefix, unclosed: !closed }, cursor);
        continue;
      }
      if (/^(?: {4}|\t)/.test(line)) {
        let cursor = lineEnd;
        while (cursor < source.length) {
          const end = endOfLine(source, cursor);
          const next = source.slice(cursor, end);
          if (next.trim() && !/^(?: {4}|\t)/.test(next)) break;
          cursor = end;
        }
        push({ kind: "code", value: source.slice(index, cursor) }, cursor);
        continue;
      }
    }
    if (source.startsWith("%%", index)) {
      const closing = source.indexOf("%%", index + 2);
      if (closing >= 0) {
        push({ kind: "comment", value: source.slice(index, closing + 2) }, closing + 2);
        continue;
      }
    }
    if (source[index] === "$" && !isEscaped(source, index)) {
      const delimiter = source.startsWith("$$", index) ? "$$" : "$";
      if (delimiter === "$$" || !/\s/.test(source[index + 1] || " ")) {
        let closing = source.indexOf(delimiter, index + delimiter.length);
        while (closing >= 0 && (isEscaped(source, closing) ||
          (delimiter === "$" && /\s/.test(source[closing - 1] || " ")))) {
          closing = source.indexOf(delimiter, closing + delimiter.length);
        }
        if (closing >= 0 && (delimiter === "$$" || !source.slice(index, closing).includes("\n\n"))) {
          const end = closing + delimiter.length;
          push({ kind: "math", value: source.slice(index, end), prefix: source.slice(source.lastIndexOf("\n", index - 1) + 1, index) }, end);
          continue;
        }
      }
    }
    if (source[index] === "<") {
      const remainder = source.slice(index);
      const comment = remainder.match(/^<!--[\s\S]*?(?:-->|$)/);
      const raw = remainder.match(/^<(pre|code|script|style|svg|math|table|picture|audio|video|iframe|object|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/i);
      const tag = remainder.match(/^<\/?[a-z][\w:-]*(?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/i);
      const value = comment?.[0] ?? raw?.[0] ?? tag?.[0];
      if (value) {
        push({ kind: "html", value }, index + value.length);
        continue;
      }
    }
    if (source[index] === "`" && !isEscaped(source, index)) {
      const ticks = source.slice(index).match(/^`+/)![0];
      const candidates = /`+/g;
      candidates.lastIndex = index + ticks.length;
      let match: RegExpExecArray | null;
      let end = -1;
      while ((match = candidates.exec(source))) {
        if (match[0].length === ticks.length) { end = candidates.lastIndex; break; }
      }
      if (end >= 0) {
        push({ kind: "code", value: source.slice(index, end) }, end);
        continue;
      }
      index += ticks.length;
      continue;
    }
    index += 1;
  }
  if (textStart < source.length) result.push({ kind: "text", value: source.slice(textStart) });
  return result;
}

function readImage(source: string, start: number): { segment: SourceSegment; end: number } | null {
  let depth = 1;
  let index = start + 2;
  for (; index < source.length; index += 1) {
    if (isEscaped(source, index)) continue;
    if (source[index] === "[") depth += 1;
    if (source[index] === "]" && --depth === 0) break;
  }
  if (index === source.length) return null;
  const alt = source.slice(start + 2, index);
  let end = index + 1;
  if (source[end] === "(") {
    let nesting = 1;
    let quote = "";
    let angle = false;
    const destinationStart = ++end;
    for (; end < source.length; end += 1) {
      const char = source[end]!;
      if (isEscaped(source, end)) continue;
      if (quote) { if (char === quote) quote = ""; continue; }
      if ((char === '"' || char === "'") && /\s/.test(source[end - 1] || "")) { quote = char; continue; }
      if (char === "<") angle = true;
      if (char === ">") angle = false;
      if (angle) continue;
      if (char === "(") nesting += 1;
      if (char === ")" && --nesting === 0) break;
    }
    if (end >= source.length) return null;
    const parsed = source.slice(destinationStart, end).trim().match(/^(?:<([^>]*)>|([\s\S]*?))(?:\s+["']([\s\S]*)["'])?$/);
    if (!parsed) return null;
    end += 1;
    return { segment: { kind: "image", value: source.slice(start, end), body: alt,
      info: (parsed[1] ?? parsed[2] ?? "").replace(/\\([\\()[\] ])/g, "$1"), title: parsed[3] || "" }, end };
  }
  let reference = alt;
  if (source[end] === "[") {
    const close = source.indexOf("]", end + 1);
    if (close < 0) return null;
    reference = source.slice(end + 1, close) || alt;
    end = close + 1;
  }
  return { segment: { kind: "image", value: source.slice(start, end), body: alt, reference }, end };
}

export function transformProse(source: string, transform: (value: string) => string): string {
  return sourceSegments(source).map((segment) => segment.kind === "text"
    ? transform(segment.value) : segment.value).join("");
}

export function transformWithSourcePlaceholders(source: string, transform: (value: string) => string): string {
  let prefix = "TARGETCOPYSOURCE";
  while (source.includes(prefix)) prefix += "X";
  const values: Array<{ token: string; value: string }> = [];
  const masked = sourceSegments(source).map((segment) => {
    if (segment.kind === "text") return segment.value;
    const block = segment.kind === "fence" ||
      (segment.kind === "code" && /^(?: {4}|\t|\uFEFF?---)/.test(segment.value)) ||
      (segment.kind === "math" && segment.value.startsWith("$$") && !segment.prefix?.trim()) ||
      (segment.kind === "html" && /^<(?:pre|table|div|p|section|svg|style|script)\b/i.test(segment.value));
    const token = block ? `<${prefix}${values.length}>` : `${prefix}${values.length}END`;
    const newline = block && segment.value.endsWith("\n") ? "\n" : "";
    values.push({ token, value: newline ? segment.value.slice(0, -1) : segment.value });
    return token + newline;
  }).join("");
  const pattern = new RegExp(`<${prefix}(\\d+)>|${prefix}(\\d+)END`, "g");
  return transform(masked).replace(pattern, (_match, blockIndex: string | undefined, inlineIndex: string | undefined) =>
    values[Number(blockIndex ?? inlineIndex)]!.value);
}

export function backtickFence(value: string, minimum = 3): string {
  let length = minimum;
  for (const match of value.matchAll(/`+/g)) length = Math.max(length, match[0].length + 1);
  return "`".repeat(length);
}

function endOfLine(source: string, start: number): number {
  const end = source.indexOf("\n", start);
  return end < 0 ? source.length : end + 1;
}

export function isEscaped(source: string, index: number): boolean {
  let count = 0;
  while (source[--index] === "\\") count += 1;
  return count % 2 === 1;
}
