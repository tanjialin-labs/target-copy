import { normalizeFootnotes } from "./footnotes";
import { parseSrcset } from "./srcset";
import type { ConversionContext } from "../types";

const REMOVE_SELECTORS = [
  "script",
  "base",
  "link",
  "meta",
  "iframe",
  "object",
  "embed",
  "form",
  "button",
  ".copy-code-button",
  ".collapse-indicator",
  ".heading-collapse-indicator",
  ".list-collapse-indicator",
].join(",");

const SAFE_LINK_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "obsidian:",
  "tel:",
]);
const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:avif|bmp|gif|jpe?g|png|svg\+xml|webp)(?:;[^,]*)?,/i;

export function normalizeRenderedDom(
  root: HTMLElement,
  context: ConversionContext,
): void {
  preserveExecutableSource(root);
  root.querySelectorAll("style").forEach((element) => {
    if (!element.closest("svg")) element.remove();
  });
  root.querySelectorAll(REMOVE_SELECTORS).forEach((element) => {
    if (!element.closest("svg")) element.remove();
  });
  normalizeCallouts(root);
  normalizeCheckboxes(root);
  normalizeFootnotes(root);
  normalizeTags(root);
  normalizeInternalLinks(root, context);
  restoreTextImageReferences(root, context);
  normalizeResponsiveImages(root);
  removeUnsafeContent(root);

}

export function normalizeResponsiveImages(root: HTMLElement): void {
  root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    if (image.getAttribute("src")) return;
    const srcset = image.getAttribute("srcset") ||
      image.closest("picture")?.querySelector("source[srcset]")?.getAttribute("srcset");
    if (!srcset) return;
    const candidate = parseSrcset(srcset)[0];
    if (candidate) image.setAttribute("src", candidate.url);
  });
}

function restoreTextImageReferences(
  root: HTMLElement,
  context: ConversionContext,
): void {
  if (context.target !== "markdown" && context.target !== "plain-text") return;
  root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const source = image.getAttribute("src") || "";
    if (!/^(?:app|blob|file):/i.test(source)) return;
    const portablePath = image.getAttribute("data-path") || image.getAttribute("data-src") || "";
    if (!portablePath || /^[a-z][a-z\d+.-]*:/i.test(portablePath)) return;
    image.setAttribute("src", portablePath);
  });
}

function normalizeTags(root: HTMLElement): void {
  const ownerDocument = root.ownerDocument;
  root.querySelectorAll<HTMLAnchorElement>("a.tag").forEach((link) => {
    const text = ownerDocument.createElement("span");
    text.textContent = link.textContent || link.dataset.tag || "";
    link.replaceWith(text);
  });
}

function preserveExecutableSource(root: HTMLElement): void {
  const selector = "script, style, base, link, meta, iframe, object, embed, form, button";
  const elements = [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) =>
      !(element.localName === "style" && element.closest("svg")) &&
      !element.parentElement?.closest(selector),
  );
  for (const element of elements) {
    if (element.matches(".copy-code-button")) {
      element.remove();
      continue;
    }
    if (root.contains(element)) replaceWithVisibleSource(element);
  }
}

export function stripPluginAttributes(root: HTMLElement): void {
  const elements = [root, ...root.querySelectorAll<HTMLElement>("*")];
  elements.forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("data-target-copy-")) element.removeAttribute(attribute.name);
    }
  });
}

function normalizeCallouts(root: HTMLElement): void {
  const ownerDocument = root.ownerDocument;
  root.querySelectorAll<HTMLElement>(".callout").forEach((callout) => {
    const titleElement = callout.querySelector<HTMLElement>(".callout-title");
    const contentElement = callout.querySelector<HTMLElement>(".callout-content");
    const type = callout.dataset.callout || "note";

    const replacement = ownerDocument.createElement("div");
    replacement.className = "target-copy-callout";
    replacement.dataset.callout = type;

    const title = ownerDocument.createElement("p");
    title.className = "target-copy-callout-title";
    const titleContent = titleElement?.querySelector(".callout-title-inner") || titleElement;
    if (titleContent) {
      titleContent.querySelectorAll(".callout-icon, .callout-fold").forEach((icon) => icon.remove());
      title.append(...titleContent.childNodes);
    } else title.textContent = capitalize(type);
    replacement.appendChild(title);

    const content = ownerDocument.createElement("div");
    content.className = "target-copy-callout-content";
    if (contentElement) {
      while (contentElement.firstChild) {
        content.appendChild(contentElement.firstChild);
      }
    }
    replacement.appendChild(content);
    callout.replaceWith(replacement);
  });
}

function normalizeCheckboxes(root: HTMLElement): void {
  const ownerDocument = root.ownerDocument;
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((checkbox) => {
    const marker = ownerDocument.createElement("span");
    marker.dataset.taskChecked = String(checkbox.checked);
    marker.textContent = checkbox.checked ? "☑ " : "☐ ";
    marker.setAttribute("aria-label", checkbox.checked ? "Completed" : "Not completed");
    checkbox.replaceWith(marker);
  });
}

function normalizeInternalLinks(root: HTMLElement, context: ConversionContext): void {
  const ownerDocument = root.ownerDocument;
  root.querySelectorAll<HTMLAnchorElement>("a.internal-link").forEach((link) => {
    const target = link.dataset.href || link.getAttribute("href") || "";
    const label = link.textContent?.trim() || target;
    if (context.settings.internalLinkMode === "source") {
      const source = ownerDocument.createElement("span");
      source.textContent = label && label !== target
        ? `[[${target}|${label}]]`
        : `[[${target}]]`;
      link.replaceWith(source);
      return;
    }

    if (context.settings.internalLinkMode === "markdown") {
      link.setAttribute(
        "href",
        context.resolveInternalLink?.(
          target,
          context.getSourcePathForElement?.(link) ?? context.sourcePath,
        ) ?? encodeURI(target),
      );
      link.removeAttribute("data-href");
      link.classList.remove("internal-link");
      return;
    }

    const text = ownerDocument.createElement("span");
    text.textContent = link.textContent || link.dataset.href || "Internal link";
    link.replaceWith(text);
  });
}

function removeUnsafeContent(root: HTMLElement): void {
  const elements = [...root.querySelectorAll<HTMLElement>("*")];
  for (const element of elements) {
    if (!root.contains(element)) continue;
    const hasExecutableAttribute = [...element.attributes].some((attribute) => {
      const name = attribute.name.toLowerCase();
      return name.startsWith("on") || name === "srcdoc" || name === "nonce";
    });
    const hasUnsafeUrl = ["href", "src", "xlink:href"].some(
      (attribute) =>
        element.hasAttribute(attribute) && !isSafeUrl(element, attribute),
    );
    const unsafeStyle = /(?:expression\s*\(|javascript\s*:|@import)/i.test(element.getAttribute("style") || "");
    if (hasExecutableAttribute || hasUnsafeUrl || unsafeStyle) {
      replaceWithVisibleSource(element);
      continue;
    }
    if (
      element.tagName === "A" &&
      element.getAttribute("target") === "_blank"
    ) {
      element.setAttribute("rel", "noopener noreferrer");
    }
  }
}

function isSafeUrl(element: HTMLElement, attribute: string): boolean {
  const value = element.getAttribute(attribute);
  if (!value || value.startsWith("#")) return true;

  try {
    const url = new URL(value, "https://target-copy.invalid/");
    const isRelative = url.origin === "https://target-copy.invalid";
    const imageElement = ["img", "image", "source", "video", "audio"].includes(element.localName);
    const safeProtocol =
      SAFE_LINK_PROTOCOLS.has(url.protocol) ||
      (imageElement &&
        (SAFE_IMAGE_PROTOCOLS.has(url.protocol) ||
          (url.protocol === "data:" && SAFE_IMAGE_DATA_URL.test(value))));
    return isRelative || safeProtocol;
  } catch {
    return false;
  }
}

function replaceWithVisibleSource(element: HTMLElement): void {
  element = (element.closest("svg") as HTMLElement | null) || element;
  const ownerDocument = element.ownerDocument;
  const pre = ownerDocument.createElement("pre");
  pre.className = "target-copy-source-block";
  const code = ownerDocument.createElement("code");
  code.className = "language-html";
  code.textContent = element.outerHTML;
  pre.appendChild(code);
  element.replaceWith(pre);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
