import {
  FuzzySuggestModal,
  type Command,
  type FuzzyMatch,
  Menu,
  Modal,
  type MenuItem,
  Notice,
  Plugin,
  TFile,
} from "obsidian";

import { writeClipboard } from "./core/clipboard";
import { TargetConverter } from "./core/converter";
import { getActiveWindow } from "./core/dom-context";
import { collectCopyInput } from "./core/input";
import { LatestTaskQueue } from "./core/latest-task";
import { resolveLanguage, t, targetText } from "./i18n";
import { TargetCopySettingTab } from "./settings";
import {
  DEFAULT_SETTINGS,
  getTarget,
  normalizeSettings,
  type CopyInput,
  type TargetCopySettings,
  type TargetDefinition,
  type TargetId,
  type UiLanguage,
} from "./types";

interface CopyDetails {
  target: TargetId;
  isSelection: boolean;
  warnings: string[];
}

export default class TargetCopyPlugin extends Plugin {
  settings: TargetCopySettings = { ...DEFAULT_SETTINGS };
  private converter!: TargetConverter;
  private copySequence = 0;
  private activeConversion: AbortController | undefined;
  private clipboardWrites = new LatestTaskQueue();
  private dynamicCommandIds: string[] = [];
  private ribbonIcon?: HTMLElement;
  private writingConversion: AbortController | undefined;
  private lastCopyDetails: CopyDetails | undefined;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.converter = new TargetConverter(this.app);
    this.addSettingTab(new TargetCopySettingTab(this.app, this));

    this.ribbonIcon = this.addRibbonIcon(
      "copy",
      t(this.getUiLanguage(), "copyForTarget"),
      () => this.openTargetPicker(),
    );
    this.refreshUserInterface();

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu) => {
        this.addPickerMenuItem(menu);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && /^(md|html?)$/i.test(file.extension)) {
          this.addPickerMenuItem(menu, file);
        }
      }),
    );
  }

  onunload(): void {
    this.activeConversion?.abort();
    this.copySequence += 1;
    this.lastCopyDetails = undefined;
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getUiLanguage(): UiLanguage {
    return resolveLanguage(this.settings.language);
  }

  getEnabledTargets(): TargetDefinition[] {
    return this.settings.targetOrder.filter((id) => this.isTargetEnabled(id)).map(getTarget);
  }

  isTargetEnabled(targetId: TargetId): boolean {
    return this.settings.enabledTargets.includes(targetId);
  }

  refreshUserInterface(): void {
    const language = this.getUiLanguage();
    const ribbonLabel = t(language, "copyForTarget");
    this.ribbonIcon?.setAttribute("aria-label", ribbonLabel);
    this.ribbonIcon?.setAttribute("title", ribbonLabel);
    this.refreshCommands();
  }

  private refreshCommands(): void {
    for (const commandId of this.dynamicCommandIds) this.removeCommand(commandId);
    this.dynamicCommandIds = [];

    const language = this.getUiLanguage();
    this.registerDynamicCommand({
      id: "cancel-copy",
      name: t(language, "cancelCopy"),
      checkCallback: (checking) => {
        const available = Boolean(this.activeConversion && this.activeConversion !== this.writingConversion);
        if (!checking && available) this.cancelCopy();
        return available;
      },
    });
    this.registerDynamicCommand({
      id: "last-copy-details",
      name: t(language, "copyDetails"),
      callback: () => this.showCopyDetails(),
    });

    this.registerDynamicCommand({
      id: "choose-target",
      name: t(language, "copyForTarget"),
      checkCallback: (checking) => {
        const available = this.hasMarkdownFile();
        if (!checking && available) this.openTargetPicker();
        return available;
      },
    });

    this.registerDynamicCommand({
      id: "quick-copy",
      name: t(language, "quickCopy"),
      checkCallback: (checking) => {
        const available = this.hasMarkdownFile();
        if (!checking && available) void this.copyTo(this.settings.defaultTarget);
        return available;
      },
    });

    this.registerDynamicCommand({
      id: "repeat-last-copy",
      name: t(language, "repeatLast"),
      checkCallback: (checking) => {
        const available = this.hasMarkdownFile();
        const targetId = this.isTargetEnabled(this.settings.lastTarget)
          ? this.settings.lastTarget
          : this.settings.defaultTarget;
        if (!checking && available) void this.copyTo(targetId);
        return available;
      },
    });

    for (const target of this.getEnabledTargets()) {
      const label = targetText(language, target.id).label;
      this.registerDynamicCommand({
        id: `copy-for-${target.id}`,
        name: t(language, "copyFor", { target: label }),
        checkCallback: (checking) => {
          const available = this.hasMarkdownFile();
          if (!checking && available) void this.copyTo(target.id);
          return available;
        },
      });
    }
  }

  private registerDynamicCommand(command: Command): void {
    // Obsidian mutates command.id to include the plugin prefix in addCommand().
    // removeCommand() expects the original unprefixed ID and adds that prefix itself.
    const commandId = command.id;
    this.addCommand(command);
    this.dynamicCommandIds.push(commandId);
  }

  private addPickerMenuItem(menu: Menu, file?: TFile): void {
    const snapshot = collectCopyInput(this.app, file).catch(() => null);
    menu.addItem((item) => {
      item
        .setTitle(t(this.getUiLanguage(), "copyForTarget"))
        .setIcon("copy");

      const submenu = this.createSubmenu(item);
      if (!submenu) {
        item.onClick(() => this.openTargetPicker(file, snapshot));
        return;
      }

      const language = this.getUiLanguage();
      submenu.addItem((scope) => {
        scope.setTitle(t(language, "loadingSelection")).setDisabled(true);
        void snapshot.then((input) => scope.setTitle(input ? describeInput(input, language) : t(language, "noNote")));
      });
      submenu.addSeparator();
      for (const target of this.getTargetsForPicker()) {
        submenu.addItem((targetItem) => {
          targetItem
            .setTitle(targetText(language, target.id).label)
            .onClick(() => void this.copyTo(target.id, file, snapshot));
          if (target.id === this.settings.lastTarget) targetItem.setIcon("history");
          if (target.id === "original-source") void snapshot.then((input) => {
            if (input?.renderedHtml !== undefined) {
              targetItem.setDisabled(true).setTitle(`${targetText(language, target.id).label} — ${t(language, "copySourceReading")}`);
            }
          });
        });
      }
    });
  }

  private createSubmenu(item: MenuItem): Menu | undefined {
    const submenuItem = item as MenuItem & { setSubmenu?: () => Menu };
    return submenuItem.setSubmenu?.();
  }

  getTargetsForPicker(): TargetDefinition[] {
    return this.getEnabledTargets();
  }

  cancelCopy(): void {
    const current = this.activeConversion;
    if (!current || current === this.writingConversion) return;
    current.abort();
    this.copySequence += 1;
    this.activeConversion = undefined;
    if (this.settings.showNotices) new Notice(t(this.getUiLanguage(), "copyCancelled"));
  }

  showCopyDetails(): void {
    new CopyDetailsModal(this, this.lastCopyDetails).open();
  }

  private openTargetPicker(file?: TFile, snapshot = collectCopyInput(this.app, file).catch(() => null)): void {
    new TargetPickerModal(this, file, snapshot).open();
  }

  private hasMarkdownFile(): boolean {
    return /^(md|html?)$/i.test(this.app.workspace.getActiveFile()?.extension || "");
  }

  async copyTo(targetId: TargetId, file?: TFile, snapshot?: Promise<CopyInput | null>): Promise<void> {
    this.activeConversion?.abort();
    const controller = new AbortController();
    this.activeConversion = controller;
    const settings = normalizeSettings(this.settings);
    const sequence = ++this.copySequence;
    const ownerWindow = getActiveWindow();
    const language = this.getUiLanguage();
    const target = getTarget(targetId);
    const targetLabel = targetText(language, target.id).label;
    let progressNotice: Notice | undefined;
    let progressTimer: number | undefined;

    if (!this.isTargetEnabled(targetId)) {
      new Notice(t(language, "targetDisabled", { target: targetLabel }));
      this.activeConversion = undefined;
      return;
    }

    try {
      const input = await (snapshot ?? collectCopyInput(this.app, file));
      controller.signal.throwIfAborted();
      if (!input) {
        new Notice(t(language, "noNote"));
        return;
      }
      if (targetId === "original-source" && input.renderedHtml !== undefined) {
        new Notice(t(language, "readingSourceHint"));
        return;
      }

      if (this.settings.showNotices) {
        progressTimer = ownerWindow.setTimeout(() => {
          if (sequence === this.copySequence) {
            const content = createFragment();
            content.createDiv({ text: t(language, "preparing", { target: targetLabel }) });
            const cancel = content.createEl("button", { cls: "target-copy-notice__action", text: t(language, "cancelCopy") });
            cancel.addEventListener("click", () => {
              if (this.activeConversion === controller) this.cancelCopy();
              progressNotice?.hide();
            });
            progressNotice = new Notice(content, 0);
          }
        }, 600);
      }

      const result = await this.converter.convert(input, targetId, settings, controller.signal);
      if (sequence !== this.copySequence) return;
      progressNotice?.hide();
      if (progressTimer !== undefined) ownerWindow.clearTimeout(progressTimer);
      const clipboardResult = await this.clipboardWrites.run(
        () => sequence === this.copySequence,
        async () => {
          this.writingConversion = controller;
          try { return await writeClipboard(result); }
          finally { if (this.writingConversion === controller) this.writingConversion = undefined; }
        },
      );
      if (!clipboardResult || sequence !== this.copySequence) return;
      if (result.html && !clipboardResult.richTextWritten) {
        result.warnings.push(t(language, "textRepresentation"));
      }
      if (clipboardResult.systemTextModeUsed) {
        result.warnings.push(t(language, "systemTextMode"));
      }
      this.settings.lastTarget = targetId;
      this.lastCopyDetails = { target: targetId, isSelection: input.isSelection, warnings: [...result.warnings] };
      const details = this.lastCopyDetails;
      await this.saveSettings().catch(() => undefined);
      if (sequence !== this.copySequence) return;
      const warnings = this.settings.showCompatibilityNotices ? result.warnings : [];
      if (this.settings.showNotices || warnings.length) {
        new Notice(
          createResultNotice(language, targetLabel, input.isSelection, warnings, () => new CopyDetailsModal(this, details).open(), this.settings.showNotices),
          warnings.length ? 12000 : 3000,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t(language, "copyFailed", { message }), 7000);
    } finally {
      if (progressTimer !== undefined) ownerWindow.clearTimeout(progressTimer);
      progressNotice?.hide();
      if (this.activeConversion === controller) this.activeConversion = undefined;
    }
  }
}

class TargetPickerModal extends FuzzySuggestModal<TargetDefinition> {
  private input?: CopyInput | null;
  private alive = false;
  private readonly scopeEl: HTMLElement;
  constructor(
    private readonly plugin: TargetCopyPlugin,
    private readonly file?: TFile,
    private readonly snapshot?: Promise<CopyInput | null>,
  ) {
    super(plugin.app);
    this.modalEl.addClass("target-copy-picker");
    this.setPlaceholder(t(plugin.getUiLanguage(), "choosePlaceholder"));
    this.scopeEl = this.modalEl.createDiv({ cls: "target-copy-picker__scope" });
    this.scopeEl.setAttribute("role", "status");
    (this.inputEl.closest(".prompt-input-container") ?? this.inputEl).after(this.scopeEl);
  }

  async onOpen(): Promise<void> {
    this.alive = true;
    await super.onOpen();
    if (!this.alive) return;
    this.scopeEl.setText(t(this.plugin.getUiLanguage(), "loadingSelection"));
    void this.snapshot?.then((input) => {
      if (!this.alive) return;
      this.input = input;
      const language = this.plugin.getUiLanguage();
      this.scopeEl.setText(input ? describeInput(input, language) : t(language, "noNote"));
      if (input?.renderedHtml !== undefined && this.plugin.isTargetEnabled("original-source")) {
        this.scopeEl.createDiv({ cls: "target-copy-picker__description", text: t(language, "readingSourceHint") });
      }
      this.inputEl.trigger("input");
    });
  }

  onClose(): void {
    this.alive = false;
    super.onClose();
  }

  getItems(): TargetDefinition[] {
    if (!this.input) return [];
    return this.plugin.getTargetsForPicker().filter((target) =>
      target.id !== "original-source" || this.input?.renderedHtml === undefined);
  }

  getItemText(item: TargetDefinition): string {
    const text = targetText(this.plugin.getUiLanguage(), item.id);
    return `${text.label} — ${text.description}`;
  }

  renderSuggestion(match: FuzzyMatch<TargetDefinition>, element: HTMLElement): void {
    const item = match.item;
    const language = this.plugin.getUiLanguage();
    const text = targetText(language, item.id);
    const header = element.createDiv({ cls: "target-copy-picker__header" });
    header.createSpan({ cls: "target-copy-picker__label", text: text.label });
    if (item.id === this.plugin.settings.lastTarget) {
      header.createSpan({ cls: "target-copy-picker__badge", text: t(language, "lastUsed") });
    }
    if (item.id === this.plugin.settings.defaultTarget) {
      header.createSpan({ cls: "target-copy-picker__badge", text: t(language, "defaultBadge") });
    }
    element.createDiv({
      cls: "target-copy-picker__description",
      text: text.description,
    });
    header.createSpan({ cls: "target-copy-picker__format", text: t(language, item.richText ? "copyOutputRich" : "copyOutputText") });
  }

  onChooseItem(item: TargetDefinition): void {
    void this.plugin.copyTo(item.id, this.file, this.snapshot);
  }
}

function createResultNotice(
  language: UiLanguage,
  targetLabel: string,
  isSelection: boolean,
  warnings: string[],
  showDetails: () => void,
  showSuccess: boolean,
): DocumentFragment {
  const fragment = createFragment();
  fragment.createEl("strong", {
    text: showSuccess ? t(language, isSelection ? "selectionCopied" : "noteCopied", {
      target: targetLabel,
    }) : t(language, "compatibilityTitle"),
  });
  for (const warning of warnings.slice(0, 3)) {
    fragment.createDiv({ cls: "target-copy-notice__warning", text: `• ${warning}` });
  }
  if (warnings.length) {
    const button = fragment.createEl("button", {
      cls: "target-copy-notice__action",
      text: `${t(language, "viewDetails")} (${warnings.length})`,
    });
    button.addEventListener("click", showDetails);
  }
  return fragment;
}

function describeInput(input: CopyInput, language: UiLanguage): string {
  const format = input.renderedHtml !== undefined ? "copySourceReading" : input.sourceFormat === "html" ? "copySourceHtml" : "copySourceMarkdown";
  return `${t(language, input.isSelection ? "copyScopeSelection" : "copyScopeNote")} · ${t(language, format)}`;
}

class CopyDetailsModal extends Modal {
  constructor(private readonly plugin: TargetCopyPlugin, private readonly details?: CopyDetails) { super(plugin.app); }
  onOpen(): void {
    const language = this.plugin.getUiLanguage();
    this.setTitle(t(language, "copyDetails"));
    this.contentEl.addClass("target-copy-details");
    if (!this.details) { this.contentEl.createEl("p", { text: t(language, "noCopyDetails") }); return; }
    this.contentEl.createEl("p", { text: `${targetText(language, this.details.target).label} · ${t(language, this.details.isSelection ? "copyScopeSelection" : "copyScopeNote")}` });
    if (!this.details.warnings.length) this.contentEl.createEl("p", { text: t(language, "noCompatibilityIssues") });
    else {
      const list = this.contentEl.createEl("ul");
      for (const warning of this.details.warnings) list.createEl("li", { text: warning });
    }
  }
  onClose(): void { this.contentEl.empty(); }
}
