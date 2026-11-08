import { backtickFence, isEscaped, sourceSegments, transformProse, transformWithSourcePlaceholders } from "./source";

import type { CopyInput, TargetCopySettings } from "../types";

const FRONTMATTER_PATTERN = /^\uFEFF?---[\t ]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/;
const WIKILINK_PATTERN = /(!?)\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export function prepareMarkdown(
  input: CopyInput,
  settings: TargetCopySettings,
): string {
  let markdown = normalizeLineEndings(input.markdown);

  if (settings.stripFrontmatter && !input.isSelection) {
    markdown = markdown.replace(FRONTMATTER_PATTERN, "");
  }

  if (settings.stripComments) {
    markdown = transformObsidianCommentsOutsideCode(markdown, () => "");
  }

  if (settings.includeTitle && !input.isSelection && input.title) {
    const frontmatter = markdown.match(FRONTMATTER_PATTERN)?.[0] || "";
    markdown = `${frontmatter}# ${escapeHeading(input.title)}\n\n${markdown.slice(frontmatter.length)}`;
  }

  return markdown;
}

export function toPortableMarkdown(
  markdown: string,
  settings: TargetCopySettings,
  resolveInternalLink?: (target: string) => string,
): string {
  let result = normalizeLineEndings(markdown);

  result = transformProse(result, (prose) => {
    let transformed = prose.replace(
      WIKILINK_PATTERN,
      (_match, embed: string, rawTarget: string, alias: string | undefined, offset: number) => {
        if (isEscaped(prose, offset)) return _match;
        if (settings.internalLinkMode === "source") return _match;
        const target = rawTarget.trim();
        const [pathPart, fragment] = splitTarget(target);
        const visible = (alias?.trim() || fragment || basename(pathPart)).trim();

        if (embed && IMAGE_EXTENSION_PATTERN.test(pathPart)) {
          return `![${escapeBrackets(visible)}](${encodeLinkTarget(pathPart)})`;
        }

        if (settings.internalLinkMode === "markdown") {
          const destination = `${pathPart}${fragment ? `#${fragment}` : ""}`;
          const href = resolveInternalLink?.(destination) ?? encodeLinkTarget(destination);
          return `[${escapeBrackets(visible)}](${href})`;
        }

        return embed ? `Embedded: ${visible}` : visible;
      },
    );

    transformed = transformed.replace(
      /^>\s*\[!([^\]]+)\][+-]?\s*(.*)$/gm,
      (_match, type: string, title: string) =>
        `> **${(title || capitalize(type)).trim()}**`,
    );
    return transformed;
  });
  return transformWithSourcePlaceholders(result, (prose) => prose.replace(
    /==([^=\n](?:.*?[^=\n])?)==/g,
    (match: string, content: string, offset: number) =>
      isEscaped(prose, offset) || isEscaped(prose, offset + match.length - 2)
        ? match : `<mark>${content}</mark>`,
  ));
}

export function preserveHiddenSourceForRendering(
  markdown: string,
  settings: TargetCopySettings,
): string {
  let result = markdown;
  if (!settings.stripFrontmatter) {
    result = result.replace(FRONTMATTER_PATTERN, (frontmatter) => {
      const fence = backtickFence(frontmatter);
      return `${fence}yaml\n${frontmatter.trimEnd()}\n${fence}\n`;
    });
  }
  if (!settings.stripComments) {
    result = transformObsidianCommentsOutsideCode(
      result,
      (comment) =>
        `<code class="target-copy-source-inline">${escapeHtmlSource(comment)}</code>`,
    );
  }
  return result;
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/**
 * Normalizes CommonMark soft breaks for rich destinations while retaining
 * structural, explicit, and source-code line breaks.
 */
export function normalizeSoftBreaksForRichText(value: string): string {
  return transformWithSourcePlaceholders(value, normalizeProseSoftBreaks);
}

function normalizeProseSoftBreaks(value: string): string {
  const lines = normalizeLineEndings(value).split("\n");
  if (lines.length < 2) return value;

  const output: string[] = [];
  const tableLines = findTableLines(lines);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const previous = index > 0 ? lines[index - 1]! : "";
    if (index > 0 && shouldCollapseSoftBreak(previous, line, tableLines.has(index) || tableLines.has(index - 1))) {
      const previousOutput = output.pop() ?? "";
      output.push(joinSoftWrappedLines(previousOutput, previous, line));
    } else output.push(line);
  }

  return output.join("\n");
}

function shouldCollapseSoftBreak(
  previous: string,
  current: string,
  inProtectedBlock: boolean,
): boolean {
  if (inProtectedBlock || !previous.trim() || !current.trim()) return false;
  if (/(?: {2,}|\\)$/.test(previous)) return false;
  if (isListContinuation(previous, current)) return true;
  if (isStructuralMarkdownLine(previous) || isStructuralMarkdownLine(current)) {
    return false;
  }

  const previousQuote = quoteContent(previous);
  const currentQuote = quoteContent(current);
  if (previousQuote !== null || currentQuote !== null) {
    if (previousQuote === null || currentQuote === null) return false;
    if (quoteDepth(previous) !== quoteDepth(current)) return false;
    if (/^\[![^\]]+\][+-]?(?:\s|$)/.test(previousQuote.trim())) return false;
    if (isListContinuation(previousQuote, currentQuote)) return true;
    return !isStructuralMarkdownLine(previousQuote) &&
      !isStructuralMarkdownLine(currentQuote);
  }

  return true;
}

function isListContinuation(previous: string, current: string): boolean {
  return /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+\S/.test(previous) &&
    /^[ \t]{2,}\S/.test(current) &&
    !isStructuralMarkdownLine(current);
}

function joinSoftWrappedLines(
  previousOutput: string,
  previousSource: string,
  currentSource: string,
): string {
  const quoted = quoteContent(previousSource) !== null && quoteContent(currentSource) !== null;
  const continuation = quoted
    ? quoteContent(currentSource) ?? currentSource
    : currentSource;
  return `${previousOutput.trimEnd()} ${continuation.trimStart()}`;
}

function quoteContent(line: string): string | null {
  const match = line.match(/^(?: {0,3}>[ \t]?)+(.*)$/);
  return match?.[1] ?? null;
}

function quoteDepth(line: string): number {
  return (line.match(/^(?: {0,3}>[ \t]?)+/)?.[0].match(/>/g) || []).length;
}

function findTableLines(lines: string[]): Set<number> {
  const result = new Set<number>();
  const body = (line: string) => quoteContent(line) ?? line;
  const cells = (line: string) => body(line).trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/);
  for (let index = 1; index < lines.length; index += 1) {
    const delimiter = body(lines[index]!);
    const previous = lines[index - 1]!;
    if (!delimiter.includes("|") || !previous.trim() || quoteDepth(previous) !== quoteDepth(lines[index]!)) continue;
    const parts = cells(delimiter);
    if (!parts.every((part) => /^[ \t]*:?-+:?[ \t]*$/.test(part)) || cells(previous).length !== parts.length) continue;
    result.add(index - 1);
    result.add(index);
    for (let row = index + 1; row < lines.length; row += 1) {
      if (!body(lines[row]!).trim() || quoteDepth(lines[row]!) !== quoteDepth(previous) ||
        !/(?<!\\)\|/.test(body(lines[row]!))) break;
      result.add(row);
    }
  }
  return result;
}

function isStructuralMarkdownLine(line: string): boolean {
  const value = line.trimEnd();
  return (
    /^ {0,3}(?:#{1,6})(?:\s|$)/.test(value) ||
    /^ {0,3}(?:`{3,}|~{3,})/.test(value) ||
    /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.test(value) ||
    /^ {0,3}(?:=+|-+)[ \t]*$/.test(value) ||
    /^ {0,3}(?:\*\s*){3,}$/.test(value) ||
    /^ {0,3}(?:_\s*){3,}$/.test(value) ||
    /^ {0,3}\$\$[ \t]*$/.test(value) ||
    /^ {0,3}\[[^\]]+\]:[ \t]*/.test(value) ||
    /^ {0,3}</.test(value) ||
    /^(?: {4,}|\t)\S/.test(value) ||
    looksLikeTableRow(value)
  );
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") ||
    trimmed.endsWith("|") ||
    /^:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+$/.test(trimmed);
}

function splitTarget(target: string): [string, string] {
  const hashIndex = target.indexOf("#");
  if (hashIndex < 0) {
    return [target, ""];
  }
  return [target.slice(0, hashIndex), target.slice(hashIndex + 1)];
}

function basename(path: string): string {
  const segment = path.split("/").pop() || path;
  return segment.replace(/\.md$/i, "");
}

function encodeLinkTarget(target: string): string {
  return target.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function escapeBrackets(value: string): string {
  return value.replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function escapeHeading(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/^#+\s*/, "").trim();
}

function capitalize(value: string): string {
  if (!value) return "Note";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtmlSource(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/%/g, "&#37;")
    .replace(/\$/g, "&#36;")
    .replace(/`/g, "&#96;")
    .replace(/~/g, "&#126;");
}

function transformObsidianCommentsOutsideCode(
  value: string,
  transform: (comment: string) => string,
): string {
  return sourceSegments(value).map((segment) => segment.kind === "comment" ? transform(segment.value) : segment.value).join("");
}
