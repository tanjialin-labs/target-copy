import { App, Notice, PluginSettingTab, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";
import { t, targetText } from "./i18n";
import type TargetCopyPlugin from "./main";
import { getTarget, LIMIT_MAXIMUMS, normalizeSettings, type LimitKey, type TargetCopySettings, type TargetId, type TargetPreferences, type UiLanguage } from "./types";

type LabelKey = Parameters<typeof t>[1];

export class TargetCopySettingTab extends PluginSettingTab {
  private reordering = false;
  private expandedTarget: TargetId | null = null;
  private settingsRevision = 0;
  private saveStates = new Map<string, { revision: number; state: "saving" | "saved" | "saveError" }>();

  constructor(app: App, private readonly plugin: TargetCopyPlugin) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof TargetCopySettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const revision = ++this.settingsRevision;
    this.saveStates.set(key, { revision, state: "saving" });
    this.plugin.settings = normalizeSettings({ ...this.plugin.settings, [key]: value });
    if (key === "language" || key === "targetOrder" || key === "enabledTargets") {
      this.plugin.refreshUserInterface();
    }
    try {
      await this.plugin.saveSettings();
      if (this.saveStates.get(key)?.revision === revision) this.saveStates.set(key, { revision, state: "saved" });
    } catch (error) {
      if (this.saveStates.get(key)?.revision === revision) this.saveStates.set(key, { revision, state: "saveError" });
      if (revision === this.settingsRevision) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(t(this.plugin.getUiLanguage(), "settingsSaveFailed", { message }));
      }
    }
    if (revision === this.settingsRevision) this.refreshSettings();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const lang = this.plugin.getUiLanguage();
    const msg = (key: LabelKey) => t(lang, key);
    const toggle = (key: keyof TargetCopySettings, name: LabelKey, desc: LabelKey): SettingGroupItem => ({
      name: msg(name), desc: msg(desc), control: { type: "toggle", key },
    });
    const targets = this.plugin.settings.targetOrder;
    return [
      { name: msg("defaultDestination"), desc: msg("defaultDestinationDesc"),
        control: { type: "dropdown", key: "defaultTarget", options: Object.fromEntries(
          this.plugin.getEnabledTargets().map(({ id }) => [id, targetText(lang, id).label]),
        ) },
      },
      { type: "group", heading: msg("destinations"), cls: "target-copy-settings", items: [
        { name: msg("destinationOrder"), desc: msg("destinationsDesc"), render: row => {
          row.addButton(button => {
            button.buttonEl.dataset.targetCopyFocus = "reorder";
            button.setButtonText(msg(this.reordering ? "done" : "reorder")).onClick(() => {
            this.reordering = !this.reordering;
            this.refreshSettings();
          }); });
        } },
        ...targets.flatMap(id => this.destinationRows(id, lang)),
      ] },
      { type: "group", heading: msg("copyContent"), items: [
        toggle("includeTitle", "includeTitle", "includeTitleDesc"),
        toggle("stripFrontmatter", "removeFrontmatter", "removeFrontmatterDesc"),
        toggle("stripComments", "removeComments", "removeCommentsDesc"),
        { name: msg("internalLinks"), desc: msg("internalLinksDesc"),
          control: { type: "dropdown", key: "internalLinkMode", options: this.linkOptions(lang) } },
        toggle("embedLocalImages", "embedImages", "embedImagesDesc"),
      ] },
      toggle("showNotices", "showNotices", "showNoticesDesc"),
      toggle("showCompatibilityNotices", "showCompatibilityNotices", "showCompatibilityNoticesDesc"),
      { name: msg("language"), desc: msg("languageDesc"), control: { type: "dropdown", key: "language",
        options: { system: msg("languageSystem"), en: "English", "zh-CN": "简体中文", "zh-TW": "繁體中文", ja: "日本語", de: "Deutsch" } } },
      { type: "page", name: msg("advancedSettings"), desc: msg("advancedSettingsDesc"), items: [
        this.limitRow("maxImageSizeMb", "maxImage", lang, true),
        this.limitRow("maxTotalImageSizeMb", "maxTotalImages", lang, true),
        this.limitRow("maxEmbedCount", "maxEmbedCount", lang),
        this.limitRow("maxEmbedDepth", "maxEmbedDepth", lang),
      ] },
      { name: msg("settingsTitle"), desc: msg("privacy") },
    ];
  }

  private linkOptions(lang: UiLanguage): Record<string, string> {
    return { source: t(lang, "preserveSource"), text: t(lang, "visibleText"), markdown: t(lang, "portableLink") };
  }

  private destinationRows(id: TargetId, lang: UiLanguage): SettingGroupItem[] {
    const { label, description } = targetText(lang, id);
    const enabled = this.plugin.isTargetEnabled(id);
    const customized = id !== "original-source" && Object.keys(this.plugin.settings.targetPreferences[id] || {}).length > 0;
    const rows: SettingGroupItem[] = [{
      name: label, desc: description, render: row => {
        if (customized) row.nameEl.createSpan({ cls: "target-copy-override-badge", text: t(lang, "customized") });
        if (this.reordering) {
          const order = this.plugin.settings.targetOrder;
          const index = order.indexOf(id);
          for (const offset of [-1, 1]) {
            const next = index + offset;
            const tooltip = t(lang, offset < 0 ? "moveUp" : "moveDown") + " · " + label;
            row.addExtraButton(button => {
              button.extraSettingsEl.dataset.targetCopyFocus = `${id}:move:${offset}`;
              button.setIcon(offset < 0 ? "arrow-up" : "arrow-down").setTooltip(tooltip)
              .setDisabled(next < 0 || next >= order.length).onClick(() => {
                const moved = [...this.plugin.settings.targetOrder];
                const current = moved.indexOf(id);
                const destination = current + offset;
                if (current < 0 || destination < 0 || destination >= moved.length) return;
                moved.splice(destination, 0, ...moved.splice(current, 1));
                void this.setControlValue("targetOrder", moved);
              }); });
          }
        } else if (id !== "original-source" && enabled) {
          row.addExtraButton(button => {
            button.extraSettingsEl.dataset.targetCopyFocus = `${id}:preferences`;
            button.setIcon("settings").setTooltip(t(lang, "destinationPreferences") + " · " + label).onClick(() => {
              this.expandedTarget = this.expandedTarget === id ? null : id;
              this.refreshSettings();
            });
            button.extraSettingsEl.setAttribute("aria-expanded", String(this.expandedTarget === id));
          });
          if (customized) row.addExtraButton(button => {
            button.extraSettingsEl.dataset.targetCopyFocus = `${id}:reset`;
            button.setIcon("rotate-ccw").setTooltip(t(lang, "restoreInheritance") + " · " + label).onClick(() => {
              const preferences = { ...this.plugin.settings.targetPreferences };
              delete preferences[id];
              void this.setControlValue("targetPreferences", preferences);
            });
          });
        }
        row.addToggle(control => {
          control.toggleEl.dataset.targetCopyFocus = `${id}:enabled`;
          const last = enabled && this.plugin.settings.enabledTargets.length === 1;
          control.setValue(enabled).setDisabled(last).setTooltip(last ? t(lang, "atLeastOne") : label)
            .onChange(value => {
              const current = this.plugin.settings.enabledTargets;
              if (!value && current.length === 1 && current.includes(id)) {
                new Notice(t(lang, "atLeastOne"));
                this.refreshSettings();
                return;
              }
              if (!value && this.expandedTarget === id) this.expandedTarget = null;
              void this.setControlValue("enabledTargets", value ? [...current, id] : current.filter(item => item !== id));
            });
          control.toggleEl.setAttribute("aria-label", label);
        });
      },
    }];
    if (!this.reordering && enabled && this.expandedTarget === id) {
      const booleanOptions = { enabled: t(lang, "enabledOption"), disabled: t(lang, "disabledOption") };
      rows.push(this.preferenceRow(id, "includeTitle", "includeTitle", booleanOptions, lang),
        this.preferenceRow(id, "internalLinkMode", "internalLinks", this.linkOptions(lang), lang));
      if (getTarget(id).richText || id === "html-source") {
        rows.push(this.preferenceRow(id, "embedLocalImages", "embedImages", booleanOptions, lang));
      }
    }
    return rows;
  }

  private preferenceRow(id: TargetId, field: keyof TargetPreferences, name: LabelKey,
    options: Record<string, string>, lang: UiLanguage): SettingGroupItem {
    const state = this.plugin.settings;
    const optionKey = (value: boolean | string) => typeof value === "boolean" ? (value ? "enabled" : "disabled") : value;
    const inherited = t(lang, "inheritSetting") + " (" + options[optionKey(state[field])] + ")";
    const saved = state.targetPreferences[id]?.[field];
    return { name: t(lang, name), render: row => {
      row.settingEl.addClass("target-copy-preference");
      row.addDropdown(control => {
        control.selectEl.dataset.targetCopyFocus = `${id}:${field}`;
        control.selectEl.setAttribute("aria-label", targetText(lang, id).label + " · " + t(lang, name));
        control.addOptions({ inherit: inherited, ...options }).setValue(saved === undefined ? "inherit" : optionKey(saved))
          .onChange(value => {
            const preferences = this.plugin.settings.targetPreferences;
            const updated = { ...preferences[id] };
            if (value === "inherit") delete updated[field];
            else if (field !== "internalLinkMode") updated[field] = value === "enabled";
            else if (value === "markdown" || value === "text" || value === "source") updated[field] = value;
            void this.setControlValue("targetPreferences", { ...preferences, [id]: updated });
          });
      });
    } };
  }

  private limitRow(key: LimitKey, name: LabelKey, lang: UiLanguage, megabytes = false): SettingDefinitionItem {
    const max = LIMIT_MAXIMUMS[key];
    const label = t(lang, name) + (megabytes ? " (MB)" : "");
    return { name: label, render: row => {
      const current = this.plugin.settings[key];
      const status = row.descEl.createDiv({ cls: "target-copy-setting-status" });
      status.setAttribute("role", "status");
      const showStatus = (message: string, invalid = false) => {
        status.setText(message);
        status.classList.toggle("is-error", invalid);
      };
      const state = this.saveStates.get(key)?.state;
      showStatus(state ? t(lang, state) : t(lang, current ? "limitActive" : "limitUnlimited", { value: current }), state === "saveError");
      row.addDropdown(mode => {
        mode.selectEl.dataset.targetCopyFocus = `${key}:mode`;
        mode.selectEl.setAttribute("aria-label", label);
        mode.addOptions({ unlimited: t(lang, "unlimited"), custom: t(lang, "setLimit") }).setValue(current ? "custom" : "unlimited");
        row.addText(number => {
          const input = number.inputEl;
          input.dataset.targetCopyFocus = `${key}:value`;
          input.type = "number";
          input.min = megabytes ? "0.01" : "1";
          input.max = String(max);
          input.step = megabytes ? "any" : "1";
          input.placeholder = input.min + "–" + max;
          input.setAttribute("aria-label", label);
          input.hidden = !current;
          number.setValue(current ? String(current) : "");
          const validate = () => {
            const valid = Boolean(input.value) && input.validity.valid && input.valueAsNumber > 0;
            input.setAttribute("aria-invalid", String(!valid));
            if (!valid) showStatus(t(lang, megabytes ? "limitInvalidSize" : "limitInvalidCount", { min: input.min, max }), true);
            else showStatus(t(lang, "limitReady", { value: input.value }));
            return valid;
          };
          const save = (value: number) => {
            if (value === this.plugin.settings[key] && this.saveStates.get(key)?.state !== "saveError") {
              showStatus(t(lang, this.saveStates.get(key)?.state === "saving" ? "saving" : "saved"));
              return;
            }
            showStatus(t(lang, "saving"));
            void this.setControlValue(key, value);
          };
          input.addEventListener("input", validate);
          input.addEventListener("change", () => { if (validate()) save(input.valueAsNumber); });
          input.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (validate()) save(input.valueAsNumber);
          });
          mode.onChange(value => {
            if (value === "unlimited") {
              input.hidden = true;
              save(0);
            } else {
              input.hidden = false;
              const previous = this.plugin.settings.lastCustomLimits[key];
              input.value = previous === undefined ? "" : String(previous);
              input.focus();
              if (previous !== undefined && validate()) save(previous);
              else validate();
            }
          });
        });
      });
    } };
  }

  private refreshSettings(): void {
    const ownerDocument = this.containerEl.ownerDocument;
    const currentContainer = () => {
      const focusedPage = ownerDocument.activeElement?.closest<HTMLElement>(".vertical-tab-content");
      if (focusedPage?.querySelector("[data-target-copy-focus]")) return focusedPage;
      return this.containerEl.isConnected ? this.containerEl :
        [...ownerDocument.querySelectorAll<HTMLElement>(".vertical-tab-content")]
          .find(element => element.querySelector("[data-target-copy-focus]")) ?? null;
    };
    preserveSettingsFocus(currentContainer() ?? this.containerEl, () => this.update(), currentContainer);
  }
}

export function preserveSettingsFocus(container: HTMLElement, render: () => void, currentContainer = () => container as HTMLElement | null): void {
  const ownerDocument = container.ownerDocument;
  const active = ownerDocument.activeElement as HTMLElement | null;
  if (!active || !container.contains(active)) { render(); return; }
  const selector = "input, select, button, [tabindex='0']";
  const index = [...container.querySelectorAll(selector)].indexOf(active);
  const key = active.dataset.targetCopyFocus;
  const rowName = active.closest(".setting-item")?.querySelector(".setting-item-name")?.textContent;
  const input = active.tagName === "INPUT" ? active as HTMLInputElement : null;
  const text = input && ["text", "number", "search"].includes(input.type) ? input.value : null;
  const selection = input?.selectionStart === null || !input ? null : [input.selectionStart, input.selectionEnd] as const;
  const scrollTop = container.scrollTop;
  render();
  let renderedFocus = ownerDocument.activeElement;
  const restore = () => {
    const current = currentContainer();
    if (!current?.isConnected || ownerDocument.activeElement && ownerDocument.activeElement !== ownerDocument.body && ownerDocument.activeElement !== renderedFocus) return;
    const controls = [...current.querySelectorAll<HTMLElement>(selector)];
    const replacement = (key ? controls.find(control => control.dataset.targetCopyFocus === key) :
      controls.find(control => control.tagName === active.tagName && control.closest(".setting-item")?.querySelector(".setting-item-name")?.textContent === rowName)) ?? controls[index];
    if (replacement) {
      if (text !== null && replacement.tagName === "INPUT") {
        const field = replacement as HTMLInputElement;
        const changed = field.value !== text;
        field.value = text;
        if (selection?.[0] !== null && selection?.[0] !== undefined) field.setSelectionRange(selection[0], selection[1]);
        if (changed) {
          const EventConstructor = (ownerDocument.defaultView as (Window & { Event: typeof Event }) | null)?.Event ?? Event;
          field.dispatchEvent(new EventConstructor("input", { bubbles: true }));
        }
      }
      replacement.focus({ preventScroll: true });
      renderedFocus = ownerDocument.activeElement;
    }
    current.scrollTop = scrollTop;
  };
  restore();
  ownerDocument.defaultView?.requestAnimationFrame(restore);
}
