import type { App } from "obsidian";

const EMBED_SELECTOR = ".internal-embed, .markdown-embed, [data-embed-path]";

/**
 * Resolves the note that owns an element inside one or more transclusions.
 * Image embeds are ignored; only Markdown destinations change link context.
 */
export function getElementSourcePath(
  app: App,
  element: Element,
  rootSourcePath: string,
): string {
  const embeds: HTMLElement[] = [];
  let ancestor = element.parentElement;
  while (ancestor) {
    if (ancestor.matches(EMBED_SELECTOR)) embeds.push(ancestor);
    ancestor = ancestor.parentElement;
  }

  let sourcePath = rootSourcePath;
  for (const embed of embeds.reverse()) {
    const rawTarget =
      embed.getAttribute("src") ||
      embed.getAttribute("data-embed-path") ||
      embed.getAttribute("data-src") ||
      embed.getAttribute("data-path") ||
      "";
    const linkPath = rawTarget.split("|", 1)[0]?.split("#", 1)[0]?.trim();
    if (!linkPath) continue;
    const destination = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    if (destination?.extension === "md" || destination?.path.toLowerCase().endsWith(".md")) {
      sourcePath = destination.path;
    }
  }
  return sourcePath;
}
