import { sourceSegments } from "./source";

export function preserveDiagramSourceForRendering(markdown: string): string {
  return sourceSegments(markdown).map((segment) => {
    if (segment.kind !== "fence") return segment.value;
    const info = segment.info || "";
    const language = info.match(/^([^\s`~]+)/)?.[1] ?? "";
    const metadata = language ? ` class="language-text" data-target-copy-language="${escapeHtmlAttribute(language)}"` : "";
    const infoMetadata = info ? ` data-code-info="${escapeHtmlAttribute(info)}"` : "";
    const state = segment.unclosed ? ' data-code-fence-state="unclosed"' : "";
    return `${segment.prefix || ""}<pre class="target-copy-source-block" data-target-copy-fenced-code><code${metadata}${infoMetadata}${state}>${escapeHtml(segment.body || "")}</code></pre>${segment.value.endsWith("\n") ? "\n" : ""}`;
  }).join("");
}

export function restorePreservedCodeLanguages(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("code[data-target-copy-language]").forEach((code) => {
    const language = code.dataset.targetCopyLanguage?.trim();
    if (language && /^[\w+-]+$/.test(language)) {
      code.className = `language-${language}`;
    } else {
      code.removeAttribute("class");
    }
    code.removeAttribute("data-target-copy-language");
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\$/g, "&#36;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
