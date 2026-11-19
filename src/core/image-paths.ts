import { type App, TFile } from "obsidian";

interface ImageReference {
  path: string;
  fragment: string;
  vaultRelative: boolean;
}

export function imageMetadataPath(element: Element): string | null {
  for (const value of metadataPaths(element)) {
    if (value && !/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  }
  return null;
}

/** Resolves only Vault files; resource URLs never authorize a filesystem read. */
export function resolveLocalImage(
  app: App,
  element: Element,
  sourcePath: string,
  src = element.getAttribute("src") || "",
  useMetadata = true,
): { file: TFile; fragment: string } | null {
  const candidates: ImageReference[] = [];
  if (useMetadata) {
    for (const value of metadataPaths(element)) {
      if (value) candidates.push(...relativeReferences(value, false));
    }
  }
  if (/^(?:app|file):/i.test(src)) {
    const resource = vaultResourceReference(app, src);
    if (resource) candidates.push(resource);
  } else candidates.push(...relativeReferences(src, true));

  for (const { path, fragment, vaultRelative } of candidates) {
    const direct = vaultRelative ? app.vault.getAbstractFileByPath(path) : null;
    if (direct instanceof TFile) return { file: direct, fragment };
    const linked = app.metadataCache.getFirstLinkpathDest(path, sourcePath);
    if (linked) return { file: linked, fragment };
    const fallback = app.vault.getAbstractFileByPath(path);
    if (fallback instanceof TFile) return { file: fallback, fragment };
  }
  return null;
}

export function portableImagePath(filePath: string, sourcePath: string, fragment = ""): string {
  const from = sourcePath.split("/").slice(0, -1);
  const to = filePath.split("/");
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  return [...from.map(() => ".."), ...to].map(part => encodeURIComponent(part)).join("/") + fragment;
}

function metadataPaths(element: Element): Array<string | null> {
  return [element.getAttribute("data-path"), element.getAttribute("data-src"),
    element.closest(".image-embed[src]")?.getAttribute("src") ?? null];
}

function relativeReferences(value: string, encoded: boolean): ImageReference[] {
  if (!value || /^[a-z][a-z\d+.-]*:|^\/\//i.test(value)) return [];
  const fragmentIndex = value.indexOf("#");
  const fragment = fragmentIndex < 0 ? "" : value.slice(fragmentIndex);
  const path = value.split(/[?#]/, 1)[0]!.replace(/^\/+/, "");
  if (!path) return [];
  const decoded = decodePath(path);
  const paths = encoded ? [decoded, path] : [path, decoded];
  return [...new Set(paths)].map(path => ({ path, fragment, vaultRelative: false }));
}

function vaultResourceReference(app: App, src: string): ImageReference | null {
  try {
    const url = new URL(src);
    const adapter = app.vault.adapter as { getBasePath?: () => string } | undefined;
    const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^\/(?=[a-z]:\/)/i, "").replace(/\/$/, "");
    const base = normalize(adapter?.getBasePath?.() || "");
    const path = normalize(decodePath(url.pathname));
    if (!base || !path.startsWith(base + "/")) return null;
    return { path: path.slice(base.length + 1), fragment: url.hash, vaultRelative: true };
  } catch { return null; }
}

function decodePath(path: string): string {
  try { return decodeURIComponent(path); } catch { return path; }
}
