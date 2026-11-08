import { isEscaped, sourceSegments } from "./source";

/** Collects only the definitions needed by a source selection. */
export function collectReferenceDefinitions(source: string, selection: string): string {
  const definitions = readDefinitions(source);
  const present = readDefinitions(selection);
  const visited = new Set<string>(present.keys());
  const pending = referencedLabels(selection);
  const output: string[] = [];
  for (let index = 0; index < pending.length; index += 1) {
    const label = pending[index]!;
    if (visited.has(label)) continue;
    visited.add(label);
    const definition = definitions.get(label);
    if (!definition) continue;
    output.push(definition);
    pending.push(...referencedLabels(definition));
  }
  return output.join("\n\n");
}

function readDefinitions(source: string): Map<string, string> {
  const masked = sourceSegments(source).map((segment) => segment.kind === "text"
    ? segment.value : segment.value.replace(/[^\r\n]/g, " ")).join("");
  const result = new Map<string, string>();
  const lines = source.split(/\r?\n/);
  const visible = masked.split(/\r?\n/);
  for (let index = 0; index < visible.length; index += 1) {
    const match = visible[index]!.match(/^ {0,3}\[([^\]]+)\]:/);
    if (!match) continue;
    const key = normalizeLabel(match[1]!);
    let end = index + 1;
    if (match[1]!.startsWith("^")) {
      while (end < lines.length) {
        if (/^(?: {4}|\t)/.test(lines[end]!)) { end += 1; continue; }
        if (!lines[end]!.trim() && /^(?: {4}|\t)/.test(lines[end + 1] || "")) { end += 1; continue; }
        break;
      }
    } else {
      if (/^ {0,3}\[[^\]]+\]:[ \t]*$/.test(lines[index]!)) end = Math.min(end + 1, lines.length);
      if (/^[ \t]+["'(]/.test(lines[end] || "")) end += 1;
    }
    if (!result.has(key)) result.set(key, lines.slice(index, end).join("\n"));
    index = end - 1;
  }
  return result;
}

function referencedLabels(source: string): string[] {
  const labels: string[] = [];
  for (const segment of sourceSegments(source)) {
    if (segment.kind === "image" && segment.reference !== undefined) labels.push(normalizeLabel(segment.reference));
    if (segment.kind !== "text") continue;
    const value = segment.value.replace(/^ {0,3}\[[^\]]+\]:/gm, "");
    const pattern = /\[([^\]\n[]+)\](?:\[([^\]\n]*)\])?/g;
    for (const match of value.matchAll(pattern)) {
      if (isEscaped(value, match.index) || value[match.index - 1] === "[" ||
        value[match.index + match[0].length] === "(" || value[match.index + match[0].length] === "]") continue;
      labels.push(normalizeLabel(match[2] || match[1]!));
    }
  }
  return labels;
}

function normalizeLabel(value: string): string {
  return value.replace(/\\([[\]\\])/g, "$1").trim().replace(/\s+/g, " ").toLowerCase();
}
