import { App, MarkdownView, TFile } from "obsidian";

import type { CopyInput } from "../types";
import { getEditorSelections, getReadingViewSelection } from "./selection";
import { collectReferenceDefinitions } from "./references";

export async function collectCopyInput(
  app: App,
  requestedFile?: TFile,
): Promise<CopyInput | null> {
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  const file = requestedFile ?? activeView?.file ?? app.workspace.getActiveFile();
  if (!file || !/^(md|html?)$/i.test(file.extension)) return null;

  if (!requestedFile && activeView?.file?.path === file.path) {
    if (activeView.getMode() === "preview") {
      const renderedHtml = getReadingViewSelection(activeView.containerEl);
      if (renderedHtml) {
        return {
          markdown: "",
          renderedHtml,
          title: file.basename,
          sourcePath: file.path,
          isSelection: true,
        };
      }
    }

    if (activeView.getMode() !== "preview") {
      const selection = getEditorSelections(activeView.editor);
      if (selection) {
        return {
          markdown: selection,
          referenceDefinitions: collectReferenceDefinitions(activeView.editor.getValue(), selection),
          title: file.basename,
          sourcePath: file.path,
          isSelection: true,
        };
      }
      return {
        markdown: activeView.editor.getValue(),
        title: file.basename,
        sourcePath: file.path,
        isSelection: false,
      };
    }
  }

  return {
    markdown: activeView?.file?.path === file.path && activeView.getMode() !== "preview"
      ? activeView.editor.getValue() : await app.vault.cachedRead(file),
    sourceFormat: /^html?$/i.test(file.extension) ? "html" : "markdown",
    title: file.basename,
    sourcePath: file.path,
    isSelection: false,
  };
}
