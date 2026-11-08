import { App } from "obsidian";

import { adaptForTarget } from "../adapters";
import { resolveLanguage, t } from "../i18n";
import type {
  AdapterResult,
  ConversionContext,
  CopyInput,
  TargetCopySettings,
  TargetId,
} from "../types";
import { inlineLocalImages } from "./assets";
import {
  preserveDiagramSourceForRendering,
  restorePreservedCodeLanguages,
} from "./diagrams";
import { normalizeRenderedDom, normalizeResponsiveImages } from "./dom";
import { createDetachedEl, getActiveDocument } from "./dom-context";
import { parseHtmlFragment } from "./html-fragment";
import { createInternalLinkResolver } from "./internal-links";
import {
  normalizeSoftBreaksForRichText,
  prepareMarkdown,
  preserveHiddenSourceForRendering,
  toPortableMarkdown,
} from "./markdown";
import {
  preserveLatexForRendering,
  replaceRenderedMathWithLatex,
  restorePreservedLatexSource,
} from "./math";
import { renderNote } from "./render-note";
import type { RenderSession } from "./render";
import { getElementSourcePath } from "./source-context";
import { materializeImageDimensions, processRenderedVisuals } from "./visuals";
import { getTarget, settingsForTarget } from "../types";

export class TargetConverter {
  constructor(private readonly app: App) {}

  async convert(
    input: CopyInput,
    target: TargetId,
    settings: TargetCopySettings,
    signal?: AbortSignal,
  ): Promise<AdapterResult> {
    signal?.throwIfAborted();
    settings = settingsForTarget(settings, target);
    const targetDefinition = getTarget(target);
    const language = resolveLanguage(settings.language);
    if (target === "original-source") {
      if (input.renderedHtml !== undefined) throw new Error(t(language, "originalSelectionUnavailable"));
      return { text: input.markdown, warnings: [] };
    }
    const preparedMarkdown = prepareMarkdown(input.referenceDefinitions
      ? { ...input, markdown: `${input.markdown}\n\n${input.referenceDefinitions}` }
      : input, settings);
    const resolveInternalLink = createInternalLinkResolver(
      this.app,
      input.sourcePath,
    );
    const context: ConversionContext = {
      target,
      title: input.title,
      sourcePath: input.sourcePath,
      isSelection: input.isSelection,
      settings,
      resolveInternalLink,
      getSourcePathForElement: (element) =>
        getElementSourcePath(this.app, element, input.sourcePath),
    };

    if (target === "markdown" && input.renderedHtml === undefined && input.sourceFormat !== "html") {
      return {
        text: toPortableMarkdown(preparedMarkdown, settings, resolveInternalLink),
        warnings: [],
      };
    }

    const protect = (markdown: string) => preserveDiagramSourceForRendering(
      preserveLatexForRendering(
        preserveHiddenSourceForRendering(
          normalizeSoftBreaksForRichText(markdown),
          settings,
        ),
      ),
    );
    const renderSession: RenderSession = input.renderedHtml !== undefined || input.sourceFormat === "html"
      ? createRenderedSelection(input.renderedHtml ?? input.markdown)
      : await renderNote(this.app, preparedMarkdown, input.sourcePath, protect, signal, [], new Map(),
        { remaining: settings.maxEmbedCount || Number.POSITIVE_INFINITY },
        { language, maxDepth: settings.maxEmbedDepth });

    try {
      if (input.sourceFormat === "html" && !input.isSelection && settings.includeTitle && input.title) {
        const heading = createDetachedEl(renderSession.root.ownerDocument, "h1");
        heading.textContent = input.title;
        renderSession.root.prepend(heading);
      }
      const warnings: string[] = [...renderSession.warnings || []];
      if (renderSession.timedOut) warnings.push(t(language, "renderTimeout"));
      signal?.throwIfAborted();
      restorePreservedLatexSource(renderSession.root);
      restorePreservedCodeLanguages(renderSession.root);
      if (input.renderedHtml !== undefined) {
        warnings.push(...replaceRenderedMathWithLatex(renderSession.root, language));
      }
      normalizeResponsiveImages(renderSession.root);
      if (settings.embedLocalImages && (targetDefinition.richText || target === "html-source")) {
        warnings.push(
          ...(await inlineLocalImages(
            this.app,
            renderSession.root,
            input.sourcePath,
            settings.maxImageSizeMb,
            settings.maxTotalImageSizeMb,
            language,
            signal,
          )),
        );
      }
      if (targetDefinition.richText) {
        await materializeImageDimensions(renderSession.root);
      }
      normalizeRenderedDom(renderSession.root, context);
      signal?.throwIfAborted();
      const visuals = await processRenderedVisuals(
        renderSession.root,
        targetDefinition.richText || target === "html-source" || target === "markdown",
        language,
        {
          maxImageSizeMb: settings.maxImageSizeMb,
          maxTotalImageSizeMb: settings.maxTotalImageSizeMb,
        },
      );
      warnings.push(...visuals.warnings);

      const result = adaptForTarget(
        target,
        renderSession.root,
        input.sourceFormat === "html" ? "" : preparedMarkdown,
        context,
        unique(warnings),
      );
      result.warnings = unique(result.warnings);
      return result;
    } finally {
      renderSession.dispose();
    }
  }
}

function createRenderedSelection(html: string): { root: HTMLElement; dispose: () => void; timedOut?: boolean } {
  const ownerDocument = getActiveDocument().implementation.createHTMLDocument("");
  const root = createDetachedEl(ownerDocument, "div");
  root.className = "target-copy-render-root markdown-rendered";
  root.appendChild(parseHtmlFragment(ownerDocument, html));
  return { root, dispose: () => undefined };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
