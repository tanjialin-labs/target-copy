import { buildRichHtml } from "./rich-html";
import { domToMarkdown, domToPlainText } from "./text";
import { toPortableMarkdown } from "../core/markdown";
import { resolveLanguage, t } from "../i18n";
import type {
  AdapterResult,
  ConversionContext,
  TargetId,
  UiLanguage,
} from "../types";

export function adaptForTarget(
  target: TargetId,
  root: HTMLElement,
  preparedMarkdown: string,
  context: ConversionContext,
  warnings: string[],
): AdapterResult {
  const language = resolveLanguage(context.settings.language);
  if (target === "original-source") return { text: preparedMarkdown, warnings };
  if (target === "html-source") return { text: buildRichHtml(root, "email"), warnings };
  if (target === "markdown") {
    return {
      text: preparedMarkdown
        ? toPortableMarkdown(
          preparedMarkdown,
          context.settings,
          context.resolveInternalLink,
        )
        : domToMarkdown(root),
      warnings,
    };
  }

  if (target === "plain-text") {
    return {
      text: domToPlainText(root),
      warnings,
    };
  }

  const text = domToPlainText(root);
  const html = buildRichHtml(root, target);

  if (target === "google-docs" && [...root.querySelectorAll("a[href]")].some(
    (link) => /^obsidian:/i.test(link.getAttribute("href") || ""),
  )) warnings.push(t(language, "googleDocsLinksWarning"));

  if (target === "slack" && root.querySelector("table")) {
    warnings.push(t(language, "slackTableWarning"));
  }

  if (target === "wechat-official") {
    warnings.push(...getWeChatWarnings(root, language));
  }

  return { text, html, warnings };
}

function getWeChatWarnings(root: HTMLElement, language: UiLanguage): string[] {
  const warnings: string[] = [];
  const externalLinks = [...root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')].filter(
    (link) => {
      try {
        return new URL(link.href).hostname !== "mp.weixin.qq.com";
      } catch {
        return false;
      }
    },
  ).length;
  if (externalLinks > 0) {
    warnings.push(t(language, "wechatExternalLinksWarning", { count: externalLinks }));
  }

  const remoteImages = root.querySelectorAll('img[src^="http://"], img[src^="https://"]').length;
  if (remoteImages > 0) {
    warnings.push(t(language, "wechatRemoteImagesWarning", { count: remoteImages }));
  }

  if (maxListDepth(root) > 2) {
    warnings.push(t(language, "wechatListWarning"));
  }
  return warnings;
}

function maxListDepth(root: HTMLElement): number {
  let maximum = 0;
  root.querySelectorAll("ul, ol").forEach((list) => {
    let depth = 1;
    let parent = list.parentElement;
    while (parent && parent !== root) {
      if (parent.matches("ul, ol")) depth += 1;
      parent = parent.parentElement;
    }
    maximum = Math.max(maximum, depth);
  });
  return maximum;
}
