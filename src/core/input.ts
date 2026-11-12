import { App, MarkdownView, TFile } from "obsidian";
import type { CopyInput, TargetId } from "../types";
import { getEditorSelections, getReadingViewSelection } from "./selection";
import { collectReferenceDefinitions } from "./references";

export type CopyScope = Pick<CopyInput, "title" | "sourcePath" | "isSelection" | "sourceFormat" | "renderedHtml">;

export interface CopySnapshot extends CopyScope {
  readMarkdown: () => string | Promise<string>;
  readDefinitions?: () => string;
}

export function captureCopyInput(app: App, requestedFile?: TFile): CopySnapshot | null {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  const file = requestedFile ?? view?.file ?? app.workspace.getActiveFile();
  if (!file || !/^(md|html?)$/i.test(file.extension)) return null;
  const scope: Pick<CopyInput, "title" | "sourcePath" | "sourceFormat"> = {
    title: file.basename, sourcePath: file.path, sourceFormat: /^html?$/i.test(file.extension) ? "html" : "markdown",
  };
  if (view?.file?.path === file.path) {
    if (view.getMode() === "preview") {
      if (!requestedFile) {
        const renderedHtml = getReadingViewSelection(view.containerEl);
        if (renderedHtml !== null) {
          return { ...scope, isSelection: true, renderedHtml, readMarkdown: () => "" };
        }
      }
    } else {
      const selection = requestedFile ? null : getEditorSelections(view.editor);
      // Hold the editor revision while the menu owns focus. Parse it only on copy.
      const documentText = view.editor.getValue();
      if (selection !== null) {
        return { ...scope, isSelection: true, readMarkdown: () => selection,
          readDefinitions: () => collectReferenceDefinitions(documentText, selection) };
      }
      return { ...scope, isSelection: false, readMarkdown: () => documentText };
    }
  }
  return { ...scope, isSelection: false, readMarkdown: () => app.vault.cachedRead(file) };
}

export async function materializeCopyInput(snapshot: CopySnapshot, target: TargetId): Promise<CopyInput> {
  const { readMarkdown, readDefinitions, ...scope } = snapshot;
  const markdown = await readMarkdown();
  if (!readDefinitions || target === "original-source") return { ...scope, markdown };
  return { ...scope, markdown, referenceDefinitions: readDefinitions() };
}
