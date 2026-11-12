import { App, Notice, PluginSettingTab, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";
import { t, targetText } from "./i18n";
import type TargetCopyPlugin from "./main";
import { getTarget, normalizeSettings, type TargetCopySettings, type TargetId, type TargetPreferences, type UiLanguage } from "./types";

type LimitKey = "maxImageSizeMb" | "maxTotalImageSizeMb" | "maxEmbedCount" | "maxEmbedDepth";
type LabelKey = Parameters<typeof t>[1];

export class TargetCopySettingTab extends PluginSettingTab {
  private reordering = false;
  private expandedTarget: TargetId | null = null;

  constructor(app: App, private readonly plugin: TargetCopyPlugin) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof TargetCopySettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    this.plugin.settings = normalizeSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.saveSettings();
    if (key === "language" || key === "targetOrder" || key === "enabledTargets") {
      this.plugin.refreshUserInterface();
    }
    this.update();
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
          row.addButton(button => button.setButtonText(msg(this.reordering ? "done" : "reorder")).onClick(() => {
            this.reordering = !this.reordering;
            this.update();
          }));
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
        this.limitRow("maxImageSizeMb", "maxImage", 500, lang, true),
        this.limitRow("maxTotalImageSizeMb", "maxTotalImages", 2000, lang, true),
        this.limitRow("maxEmbedCount", "maxEmbedCount", 100000, lang),
        this.limitRow("maxEmbedDepth", "maxEmbedDepth", 1000, lang),
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
    const rows: SettingGroupItem[] = [{
      name: label, desc: description, render: row => {
        if (this.reordering) {
          const order = this.plugin.settings.targetOrder;
          const index = order.indexOf(id);
          for (const offset of [-1, 1]) {
            const next = index + offset;
            const tooltip = t(lang, offset < 0 ? "moveUp" : "moveDown") + " · " + label;
            row.addExtraButton(button => button.setIcon(offset < 0 ? "arrow-up" : "arrow-down").setTooltip(tooltip)
              .setDisabled(next < 0 || next >= order.length).onClick(() => {
                const moved = [...order];
                moved.splice(next, 0, ...moved.splice(index, 1));
                void this.setControlValue("targetOrder", moved);
              }));
          }
        } else if (id !== "original-source" && enabled) {
          row.addExtraButton(button => {
            button.setIcon("settings").setTooltip(t(lang, "destinationPreferences") + " · " + label).onClick(() => {
              this.expandedTarget = this.expandedTarget === id ? null : id;
              this.update();
            });
            button.extraSettingsEl.setAttribute("aria-expanded", String(this.expandedTarget === id));
          });
        }
        row.addToggle(control => {
          const last = enabled && this.plugin.settings.enabledTargets.length === 1;
          control.setValue(enabled).setDisabled(last).setTooltip(last ? t(lang, "atLeastOne") : label)
            .onChange(value => {
              const current = this.plugin.settings.enabledTargets;
              if (!value && current.length === 1 && current.includes(id)) {
                new Notice(t(lang, "atLeastOne"));
                this.update();
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

  private limitRow(key: LimitKey, name: LabelKey, max: number, lang: UiLanguage, megabytes = false): SettingDefinitionItem {
    const label = t(lang, name) + (megabytes ? " (MB)" : "");
    return { name: label, render: row => {
      const current = this.plugin.settings[key];
      row.addDropdown(mode => {
        mode.selectEl.setAttribute("aria-label", label);
        mode.addOptions({ unlimited: t(lang, "unlimited"), custom: t(lang, "setLimit") }).setValue(current ? "custom" : "unlimited");
        row.addText(number => {
          const input = number.inputEl;
          input.type = "number";
          input.min = "1";
          input.max = String(max);
          input.step = "1";
          input.placeholder = "1–" + max;
          input.setAttribute("aria-label", label);
          input.hidden = !current;
          number.setValue(current ? String(current) : "");
          input.addEventListener("change", () => {
            if (input.reportValidity() && input.valueAsNumber > 0) void this.setControlValue(key, input.valueAsNumber);
          });
          input.addEventListener("blur", () => {
            if (!input.value || !input.validity.valid) this.update();
          });
          mode.onChange(value => {
            if (value === "unlimited") void this.setControlValue(key, 0);
            else { input.hidden = false; input.focus(); }
          });
        });
      });
    } };
  }
}
