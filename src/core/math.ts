import { sourceSegments } from "./source";
import { t } from "../i18n";
import type { UiLanguage } from "../types";

export function preserveLatexForRendering(markdown: string): string {
  return sourceSegments(markdown).map((segment) => segment.kind === "math" ? preserveLatexInProse(segment.value, /^[ \t>]*$/.test(segment.prefix || "")) : segment.value).join("");
}

function preserveLatexInProse(markdown: string, allowBlock: boolean): string {
  const encodedSource = encodeURIComponent(markdown);
  return markdown.startsWith("$$") && allowBlock
    ? `<pre class="target-copy-latex-block"><code class="language-latex" data-target-copy-latex-source="${encodedSource}">LaTeX source</code></pre>`
    : `<code class="target-copy-latex-inline" data-target-copy-latex-source="${encodedSource}">LaTeX source</code>`;
}

export function restorePreservedLatexSource(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-target-copy-latex-source]").forEach(
    (element) => {
      const encoded = element.dataset.targetCopyLatexSource;
      if (!encoded) return;
      try {
        restoreLatexElement(element, decodeURIComponent(encoded));
      } catch {
        restoreLatexElement(element, encoded);
      }
      element.removeAttribute("data-target-copy-latex-source");
    },
  );
}

export function replaceRenderedMathWithLatex(
  root: HTMLElement,
  language: UiLanguage,
): string[] {
  const warnings: string[] = [];
  const candidates = [...root.querySelectorAll<HTMLElement>(".math, mjx-container")]
    .filter((element) => !element.parentElement?.closest(".math, mjx-container"));
  let unavailable = 0;

  for (const element of candidates) {
    const source = findLatexSource(element);
    if (!source) {
      unavailable += 1;
      continue;
    }
    const block =
      element.classList.contains("math-block") ||
      element.getAttribute("display") === "true" ||
      element.getAttribute("display") === "block";
    const ownerDocument = element.ownerDocument;
    const replacement = block
      ? ownerDocument.createElement("pre")
      : ownerDocument.createElement("code");

    if (block) {
      replacement.className = "target-copy-latex-block";
      const code = ownerDocument.createElement("code");
      code.className = "language-latex";
      code.textContent = source ? `$$${source}$$` : t(language, "latexUnavailableLabel");
      replacement.appendChild(code);
    } else {
      replacement.className = "target-copy-latex-inline";
      writeInlineLatexSource(replacement, `$${source}$`);
    }

    element.replaceWith(replacement);
  }

  if (unavailable > 0) {
    warnings.push(t(language, "latexUnavailableWarning", { count: unavailable }));
  }
  return warnings;
}

function restoreLatexElement(element: HTMLElement, source: string): void {
  if (element.classList.contains("target-copy-latex-inline")) {
    writeInlineLatexSource(element, source);
  } else {
    element.textContent = source;
  }
}

function writeInlineLatexSource(element: HTMLElement, source: string): void {
  if (!source.startsWith("$") || !source.endsWith("$") || source.length < 2) {
    element.textContent = source;
    return;
  }

  const ownerDocument = element.ownerDocument;
  const opening = ownerDocument.createElement("span");
  const leadingBreak = ownerDocument.createElement("wbr");
  const content = ownerDocument.createElement("span");
  const trailingBreak = ownerDocument.createElement("wbr");
  const closing = ownerDocument.createElement("span");
  const delimiter = source.startsWith("$$") && source.endsWith("$$") ? "$$" : "$";
  opening.textContent = delimiter;
  content.textContent = source.slice(delimiter.length, -delimiter.length);
  closing.textContent = delimiter;
  element.replaceChildren(opening, leadingBreak, content, trailingBreak, closing);
}

function findLatexSource(element: HTMLElement): string | null {
  for (const candidate of [
    element.getAttribute("data-math"),
    element.getAttribute("data-latex"),
    element.querySelector<HTMLElement>('[data-math]')?.getAttribute("data-math"),
    element.querySelector<HTMLElement>('[data-latex]')?.getAttribute("data-latex"),
    element.querySelector("annotation[encoding='application/x-tex']")?.textContent,
    element.querySelector("script[type^='math/tex']")?.textContent,
  ]) {
    if (candidate?.trim()) return stripDelimiters(candidate.trim());
  }
  return null;
}

function stripDelimiters(value: string): string {
  if (value.startsWith("$$") && value.endsWith("$$")) return value.slice(2, -2);
  if (value.startsWith("$") && value.endsWith("$")) return value.slice(1, -1);
  return value;
}
