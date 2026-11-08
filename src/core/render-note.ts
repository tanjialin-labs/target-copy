import type { App } from "obsidian";
import { renderMarkdown, type RenderSession } from "./render";
import { isEscaped, sourceSegments } from "./source";
import { parseHtmlFragment } from "./html-fragment";
import { abortable, yieldForCancellation } from "./cancellation";
import { collectReferenceDefinitions } from "./references";
import { createDetachedEl, getActiveDocument } from "./dom-context";
import { t } from "../i18n";
import type { UiLanguage } from "../types";

export interface RenderNoteOptions {
  language?: UiLanguage;
  maxDepth?: number;
  fragment?: string;
  renders?: Map<string, { html: string; timedOut: boolean }>;
}

/** Expands local note transclusions through the same source protection as the host. */
export async function renderNote(
  app: App,
  markdown: string,
  sourcePath: string,
  protect: (markdown: string) => string,
  signal?: AbortSignal,
  ancestors: string[] = [],
  cache = new Map<string, Promise<string>>(),
  budget = { remaining: Number.POSITIVE_INFINITY },
  options: RenderNoteOptions = {},
): Promise<RenderSession> {
  const warnings: string[] = [];
  const language = options.language ?? "en";
  const renders = options.renders ?? new Map<string, { html: string; timedOut: boolean }>();
  const ownKey = `${sourcePath}#${options.fragment || ""}`;
  const embeds: Array<{ source: string; path: string; fragment: string; original: string }> = [];
  let token = "TARGETCOPYRESOURCE";
  while (markdown.includes(token)) token += "X";
  const resources: string[] = [];
  const holdResource = (html: string) => `<span data-target-copy-resource="${token}${resources.push(html) - 1}"></span>`;
  const segments = sourceSegments(markdown);
  const references = new Map<string, { path: string; title: string }>();
  for (const segment of segments) {
    if (segment.kind !== "text") continue;
    for (const match of segment.value.matchAll(/^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>]+)>|(\S+))(?:[ \t]+["'](.*?)["'])?[ \t]*$/gm)) {
      references.set(match[1]!.trim().toLowerCase(), { path: match[2] || match[3] || "", title: match[4] || "" });
    }
  }
  const prepared = segments.map((segment) => {
    if (segment.kind === "image") {
      const reference = segment.reference === undefined ? undefined : references.get(segment.reference.trim().toLowerCase());
      const path = segment.info ?? reference?.path;
      return path === undefined ? segment.value : holdResource(imageHtml(path, segment.body || "", segment.title || reference?.title || ""));
    }
    if (segment.kind === "html" && /^<(?:img|svg|picture|audio|video)\b/i.test(segment.value)) return holdResource(segment.value);
    if (segment.kind === "html" && /<(?:script|iframe|object|embed|form|style|link|meta|base)\b|\bon\w+\s*=|javascript\s*:/i.test(segment.value) && !/^<svg\b/i.test(segment.value)) {
      return `<pre class="target-copy-source-block"><code class="language-html">${escapeHtml(segment.value)}</code></pre>`;
    }
    if (segment.kind !== "text") return segment.value;
    return segment.value.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (original, target: string, alias: string | undefined, offset: number) => {
      if (isEscaped(segment.value, offset)) return original;
      const [path = "", fragment = ""] = target.split("#", 2);
      const file = app.metadataCache.getFirstLinkpathDest(path || sourcePath, sourcePath);
      if (/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file?.path || path)) {
        return holdResource(imageHtml(path, alias || path, ""));
      }
      if (!file || file.extension !== "md") {
        if (!file) warnings.push(t(language, "embedMissingWarning", { name: target }));
        return `<code>${escapeHtml(original)}</code>`;
      }
      const key = `${file.path}#${fragment}`;
      const cycle = ancestors.includes(key) || key === ownKey;
      const depthReached = Boolean(options.maxDepth && ancestors.length >= options.maxDepth);
      if (cycle || depthReached || budget.remaining <= 0) {
        warnings.push(t(language, cycle ? "embedCycleWarning" : depthReached ? "embedDepthWarning" : "embedCountWarning", { name: target }));
        return `<code>${escapeHtml(original)}</code>`;
      }
      const index = embeds.push({ source: "", path: file.path, fragment, original }) - 1;
      return `<div data-target-copy-embed="${token}${index}"></div>`;
    });
  }).join("");
  const renderKey = `${ownKey}\u0000${prepared}`;
  const rendered = renders.get(renderKey);
  let session: RenderSession;
  if (rendered) {
    const ownerDocument = getActiveDocument().implementation.createHTMLDocument("");
    const root = createDetachedEl(ownerDocument, "div");
    root.append(parseHtmlFragment(ownerDocument, rendered.html));
    session = { root, timedOut: rendered.timedOut, dispose: () => root.remove() };
  } else {
    session = await renderMarkdown(app, protect(prepared), sourcePath, signal, 5000, { minimumMs: 100, quietMs: 50 });
    const html = session.root.innerHTML;
    if (html.length <= 131072 && prepared.length <= 131072 && renders.size < 16 && !session.timedOut) {
      renders.set(renderKey, { html, timedOut: false });
    }
  }
  session.warnings = warnings;
  try {
    for (const slot of session.root.querySelectorAll<HTMLElement>("[data-target-copy-resource]")) {
      const value = slot.dataset.targetCopyResource || "";
      if (!value.startsWith(token)) continue;
      const html = resources[Number(value.slice(token.length))];
      if (html !== undefined) slot.replaceWith(parseHtmlFragment(session.root.ownerDocument, html));
    }
    for (const [index, embed] of embeds.entries()) {
      signal?.throwIfAborted();
      if (index > 0 && index % 16 === 0) await yieldForCancellation(signal);
      const slot = session.root.querySelector<HTMLElement>(`[data-target-copy-embed="${token}${index}"]`);
      if (!slot) continue;
      if (budget.remaining <= 0) {
        slot.textContent = embed.original;
        warnings.push(t(language, "embedCountWarning", { name: embed.original }));
        continue;
      }
      if (!cache.has(embed.path)) {
        const file = app.vault.getFileByPath(embed.path);
        if (!file) {
          slot.textContent = embed.original;
          warnings.push(t(language, "embedMissingWarning", { name: embed.original }));
          continue;
        }
        cache.set(embed.path, app.vault.cachedRead(file));
      }
      const content = await abortable(cache.get(embed.path)!, signal);
      const selected = selectFragment(app, embed.path, content, embed.fragment);
      if (selected === null || budget.remaining-- <= 0) {
        slot.textContent = embed.original;
        warnings.push(t(language, selected === null ? "embedMissingWarning" : "embedCountWarning", { name: embed.original }));
        continue;
      }
      const nested = await renderNote(app, selected, embed.path, protect, signal, [...ancestors, ownKey], cache, budget,
        { ...options, fragment: embed.fragment, renders });
      try {
        session.timedOut = Boolean(session.timedOut || nested.timedOut);
        warnings.push(...nested.warnings || []);
        slot.className = "internal-embed markdown-embed";
        slot.setAttribute("data-embed-path", embed.path);
        slot.replaceChildren(...[...nested.root.childNodes].map((node) => node.cloneNode(true)));
        slot.removeAttribute("data-target-copy-embed");
      } finally { nested.dispose(); }
    }
    return session;
  } catch (error) { session.dispose(); throw error; }
}

function selectFragment(app: App, path: string, content: string, fragment: string): string | null {
  if (!fragment) return content;
  const metadata = app.metadataCache.getCache(path);
  const withFootnotes = (selected: string) => {
    const definitions = collectReferenceDefinitions(content, selected);
    return definitions ? `${selected}\n\n${definitions}` : selected;
  };
  if (fragment.startsWith("^")) {
    const block = metadata?.blocks?.[fragment.slice(1)];
    return block ? withFootnotes(content.slice(block.position.start.offset, block.position.end.offset)) : null;
  }
  const headings = metadata?.headings || [];
  const index = headings.findIndex((heading) => heading.heading.toLowerCase() === fragment.toLowerCase());
  const heading = headings[index];
  if (!heading) return null;
  const end = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level)?.position.start.offset;
  return withFootnotes(content.slice(heading.position.start.offset, end));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function imageHtml(path: string, alt: string, title: string): string {
  const dimensions = alt.match(/^(\d+)(?:x(\d+))?$/);
  const size = dimensions ? ` width="${dimensions[1]}"${dimensions[2] ? ` height="${dimensions[2]}"` : ""}` : "";
  return `<img src="${escapeHtml(path)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ""}${size}>`;
}
