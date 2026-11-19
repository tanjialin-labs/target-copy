import type { App } from "obsidian";

import { t } from "../i18n";
import type { UiLanguage } from "../types";
import { blobToDataUrl } from "./data-url";
import { getElementSourcePath } from "./source-context";
import { parseSrcset, serializeSrcset } from "./srcset";
import { abortable } from "./cancellation";
import { createDetachedEl } from "./dom-context";
import { resolveLocalImage } from "./image-paths";

const MIME_TYPES: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export async function inlineLocalImages(
  app: App,
  root: HTMLElement,
  sourcePath: string,
  maxSizeMb: number,
  maxTotalSizeMb: number,
  language: UiLanguage = "en",
  signal?: AbortSignal,
): Promise<string[]> {
  const warnings: string[] = [];
  const images = [...root.querySelectorAll<HTMLImageElement>("img")];
  const responsive: Array<{ element: Element; candidates: ReturnType<typeof parseSrcset> }> = [];
  const owners = new Map<HTMLImageElement, Element>();
  const commit = new Map<HTMLImageElement, (url: string) => void>();
  for (const element of root.querySelectorAll("img[srcset], picture > source[srcset]")) {
    const candidates = parseSrcset(element.getAttribute("srcset") || "");
    responsive.push({ element, candidates });
    for (const candidate of candidates) {
      const image = createDetachedEl(root.ownerDocument, "img");
      image.setAttribute("src", candidate.url);
      owners.set(image, element);
      commit.set(image, (url) => { candidate.url = url; });
      images.push(image);
    }
  }
  let embeddedBytes = 0;
  const encoded = new Map<string, Promise<string>>();

  for (const image of images) {
    signal?.throwIfAborted();
    const src = image.getAttribute("src") || "";
    if (!src || /^(?:data:|https?:|blob:)/i.test(src)) continue;

    const contextualSourcePath = getElementSourcePath(app, owners.get(image) || image, sourcePath);
    const resolved = resolveLocalImage(app, image, contextualSourcePath);
    if (!resolved) {
      warnings.push(t(language, "imageResolveWarning", { name: image.alt || src }));
      continue;
    }
    const { file, fragment } = resolved;

    const maxBytes = maxSizeMb === 0
      ? Number.POSITIVE_INFINITY
      : maxSizeMb * 1024 * 1024;
    if (file.stat.size > maxBytes) {
      warnings.push(t(language, "imageTooLargeWarning", {
        name: file.name,
        size: formatMegabytes(maxSizeMb),
      }));
      continue;
    }

    const maxTotalBytes = maxTotalSizeMb === 0
      ? Number.POSITIVE_INFINITY
      : maxTotalSizeMb * 1024 * 1024;
    if (embeddedBytes + file.stat.size > maxTotalBytes) {
      warnings.push(t(language, "imageTotalWarning", {
        name: file.name,
        size: formatMegabytes(maxTotalSizeMb),
      }));
      continue;
    }

    const mimeType = MIME_TYPES[file.extension.toLowerCase()];
    if (!mimeType) {
      warnings.push(t(language, "imageTypeWarning", { name: file.name }));
      continue;
    }

    try {
      let pending = encoded.get(file.path);
      if (!pending) {
        pending = app.vault.readBinary(file).then((bytes) => {
          signal?.throwIfAborted();
          return blobToDataUrl(new Blob([bytes], { type: mimeType }));
        });
        encoded.set(file.path, pending);
      }
      const dataUrl = await abortable(pending, signal);
      signal?.throwIfAborted();
      image.setAttribute("src", dataUrl + fragment);
      commit.get(image)?.(dataUrl + fragment);
      image.removeAttribute("data-path");
      image.removeAttribute("data-src");
      embeddedBytes += file.stat.size;
    } catch {
      signal?.throwIfAborted();
      warnings.push(t(language, "imageReadWarning", { name: file.name }));
    }
  }

  for (const { element, candidates } of responsive) {
    element.setAttribute("srcset", serializeSrcset(candidates));
  }
  return warnings;
}

function formatMegabytes(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
