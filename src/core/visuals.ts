import { t } from "../i18n";
import type { UiLanguage } from "../types";
import { dataUrlByteLength } from "./data-url";

export interface VisualProcessingResult {
  converted: number;
  warnings: string[];
}

export interface VisualLimits {
  maxImageSizeMb: number;
  maxTotalImageSizeMb: number;
}

export async function materializeImageDimensions(
  root: HTMLElement,
  timeoutMs = 1500,
): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>("img")];
  const pending = images.filter(
    (image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0,
  );

  const ownerWindow = root.ownerDocument.defaultView;
  if (pending.length > 0 && ownerWindow) {
    await waitForImages(pending, ownerWindow, timeoutMs);
  }

  for (const image of images) {
    const bounds = image.getBoundingClientRect();
    const width = Math.round(bounds.width) || image.naturalWidth;
    const height = Math.round(bounds.height) || image.naturalHeight;
    if (!image.hasAttribute("width") && width > 0) image.setAttribute("width", String(width));
    if (!image.hasAttribute("height") && height > 0) image.setAttribute("height", String(height));
  }
}

function waitForImages(
  images: HTMLImageElement[],
  ownerWindow: Window,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    let remaining = images.length;
    let finished = false;
    const listeners = new Map<HTMLImageElement, () => void>();
    const timeoutId = ownerWindow.setTimeout(finish, timeoutMs);

    function finish(): void {
      if (finished) return;
      finished = true;
      ownerWindow.clearTimeout(timeoutId);
      listeners.forEach((listener, image) => {
        image.removeEventListener("load", listener);
        image.removeEventListener("error", listener);
      });
      resolve();
    }

    for (const image of images) {
      const settleImage = () => {
        if (!listeners.has(image)) return;
        image.removeEventListener("load", settleImage);
        image.removeEventListener("error", settleImage);
        listeners.delete(image);
        remaining -= 1;
        if (remaining === 0) finish();
      };
      listeners.set(image, settleImage);
      image.addEventListener("load", settleImage, { once: true });
      image.addEventListener("error", settleImage, { once: true });
      if (image.complete) settleImage();
    }
  });
}

export async function processRenderedVisuals(
  root: HTMLElement,
  richText: boolean,
  language: UiLanguage = "en",
  limits?: VisualLimits,
): Promise<VisualProcessingResult> {
  const warnings: string[] = [];
  if (richText) new ImageBudget(limits, language, warnings).registerExistingImages(root);

  for (const canvas of [...root.querySelectorAll<HTMLCanvasElement>("canvas")]) {
    const label = visualLabel(canvas, language);
    warnings.push(t(language, "canvasSourceWarning", { name: label }));
    if (!richText) {
      canvas.replaceWith(
        createSourceBlock(serializeElement(canvas), "html", canvas.ownerDocument),
      );
    }
  }

  const topLevelSvgs = [...root.querySelectorAll<SVGSVGElement>("svg")].filter(
    (svg) => !svg.parentElement?.closest("svg"),
  );
  for (const svg of topLevelSvgs) {
    if (!richText) {
      const source = serializeElement(svg);
      replaceSvgWith(svg, createSourceBlock(source, "svg", svg.ownerDocument));
    }
  }

  return { converted: 0, warnings };
}

function visualLabel(element: Element, language: UiLanguage): string {
  const explicit =
    element.getAttribute("aria-label") ||
    element.getAttribute("data-title") ||
    element.closest<HTMLElement>("[aria-label]")?.getAttribute("aria-label");
  return explicit?.trim() || t(language, "canvasLabel");
}

function createSourceBlock(
  source: string,
  language: string,
  ownerDocument: Document,
): HTMLPreElement {
  const pre = ownerDocument.createElement("pre");
  pre.className = "target-copy-source-block";
  const code = ownerDocument.createElement("code");
  code.className = `language-${language}`;
  code.textContent = source;
  pre.appendChild(code);
  return pre;
}

function replaceWithPlaceholder(element: Element, label: string): void {
  const placeholder = element.ownerDocument.createElement("span");
  placeholder.textContent = `[${label}]`;
  element.replaceWith(placeholder);
}

function serializeElement(element: Element): string {
  const Serializer = element.ownerDocument.defaultView?.XMLSerializer;
  return Serializer
    ? new Serializer().serializeToString(element)
    : element.outerHTML;
}

function replaceSvgWith(svg: SVGSVGElement, replacement: Element): void {
  const mathContainer = svg.closest("mjx-container");
  if (mathContainer) {
    mathContainer.replaceWith(replacement);
  } else {
    svg.replaceWith(replacement);
  }
}

class ImageBudget {
  private readonly maxImageBytes: number;
  private readonly maxTotalBytes: number;
  private totalBytes = 0;

  constructor(
    limits: VisualLimits | undefined,
    private readonly language: UiLanguage,
    private readonly warnings: string[],
  ) {
    this.maxImageBytes = limits && limits.maxImageSizeMb > 0
      ? limits.maxImageSizeMb * 1024 * 1024
      : Number.POSITIVE_INFINITY;
    this.maxTotalBytes = limits && limits.maxTotalImageSizeMb > 0
      ? limits.maxTotalImageSizeMb * 1024 * 1024
      : Number.POSITIVE_INFINITY;
  }

  registerExistingImages(root: HTMLElement): void {
    for (const image of [
      ...root.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]'),
    ]) {
      const bytes = dataUrlByteLength(image.src);
      const label = image.alt || t(this.language, "diagramLabel");
      if (!this.add(bytes, label)) replaceWithPlaceholder(image, label);
    }
  }

  private add(bytes: number, label: string): boolean {
    if (bytes > this.maxImageBytes) {
      this.warnings.push(t(this.language, "imageTooLargeWarning", {
        name: label,
        size: formatMegabytes(this.maxImageBytes),
      }));
      return false;
    }
    if (this.totalBytes + bytes > this.maxTotalBytes) {
      this.warnings.push(t(this.language, "imageTotalWarning", {
        name: label,
        size: formatMegabytes(this.maxTotalBytes),
      }));
      return false;
    }
    this.totalBytes += bytes;
    return true;
  }
}

function formatMegabytes(bytes: number): string {
  const value = bytes / (1024 * 1024);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
