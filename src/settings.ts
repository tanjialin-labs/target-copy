import { App, Notice, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import { t, targetText } from "./i18n";
import type TargetCopyPlugin from "./main";
import { TARGETS, getTarget, isTargetId, normalizeSettings, type TargetCopySettings } from "./types";

export class TargetCopySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TargetCopyPlugin) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    if (key.startsWith("preference:")) {
      const [, target, field] = key.split(":");
      if (!target || !isTargetId(target)) return "inherit";
      const values = this.plugin.settings.targetPreferences[target];
      if (field === "internalLinkMode") return values?.internalLinkMode ?? "inherit";
      const value = field === "includeTitle" ? values?.includeTitle : values?.embedLocalImages;
      return value === undefined ? "inherit" : value ? "enabled" : "disabled";
    }
    if (key.startsWith("target:")) {
      const target = key.slice(7);
      return isTargetId(target) && this.plugin.settings.enabledTargets.includes(target);
    }
    return this.plugin.settings[key as keyof TargetCopySettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const previous = this.plugin.settings;
    if (key.startsWith("preference:")) {
      const [, target, field] = key.split(":");
      if (!target || !isTargetId(target) || !field || !["includeTitle", "embedLocalImages", "internalLinkMode"].includes(field)) return;
      const preference: Record<string, unknown> = { ...previous.targetPreferences[target] };
      if (value === "inherit") delete preference[field];
      else preference[field] = field === "internalLinkMode" ? value : value === "enabled";
      this.plugin.settings = normalizeSettings({ ...previous, targetPreferences: { ...previous.targetPreferences, [target]: preference } });
    } else if (key.startsWith("target:")) {
      const target = key.slice(7);
      if (!isTargetId(target) || typeof value !== "boolean") return;
      if (!value && previous.enabledTargets.length === 1 && previous.enabledTargets.includes(target)) {
        new Notice(t(this.plugin.getUiLanguage(), "atLeastOne"));
        this.update();
        return;
      }
      this.plugin.settings = normalizeSettings({ ...previous,
        enabledTargets: TARGETS.filter((item) => item.id === target ? value : previous.enabledTargets.includes(item.id)).map((item) => item.id),
      });
    } else {
      this.plugin.settings = normalizeSettings({ ...previous, [key]: value });
    }
    await this.plugin.saveSettings();
    if (key === "language" || key.startsWith("target:")) {
      this.plugin.refreshUserInterface();
      this.update();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const language = this.plugin.getUiLanguage();
    const toggle = (key: keyof TargetCopySettings, name: Parameters<typeof t>[1], desc: Parameters<typeof t>[1]): SettingDefinitionItem => ({
      name: t(language, name), desc: t(language, desc), control: { type: "toggle", key },
    });
    return [
      { name: t(language, "settingsTitle"), desc: t(language, "privacy") },
      {
        name: t(language, "language"), desc: t(language, "languageDesc"),
        control: { type: "dropdown", key: "language", options: {
          system: t(language, "languageSystem"), en: "English", "zh-CN": "简体中文",
          "zh-TW": "繁體中文", ja: "日本語", de: "Deutsch",
        } },
      },
      {
        type: "group", heading: t(language, "destinations"), cls: "target-copy-settings",
        items: [
          { name: t(language, "destinations"), desc: t(language, "destinationsDesc") },
          ...TARGETS.map((target) => ({
            name: targetText(language, target.id).label,
            desc: targetText(language, target.id).description,
            control: { type: "toggle" as const, key: `target:${target.id}`,
              disabled: () => this.plugin.settings.enabledTargets.length === 1 && this.plugin.isTargetEnabled(target.id),
            },
          })),
        ],
      },
      {
        name: t(language, "defaultDestination"), desc: t(language, "defaultDestinationDesc"),
        control: { type: "dropdown", key: "defaultTarget", options: Object.fromEntries(
          this.plugin.getEnabledTargets().map((target) => [target.id, targetText(language, target.id).label]),
        ) },
      },
      toggle("includeTitle", "includeTitle", "includeTitleDesc"),
      toggle("stripFrontmatter", "removeFrontmatter", "removeFrontmatterDesc"),
      toggle("stripComments", "removeComments", "removeCommentsDesc"),
      {
        name: t(language, "internalLinks"), desc: t(language, "internalLinksDesc"),
        control: { type: "dropdown", key: "internalLinkMode", options: {
          source: t(language, "preserveSource"), text: t(language, "visibleText"), markdown: t(language, "portableLink"),
        } },
      },
      toggle("embedLocalImages", "embedImages", "embedImagesDesc"),
      {
        name: `${t(language, "maxImage")} (MB)`, desc: t(language, "maxImageDesc"),
        control: { type: "number", key: "maxImageSizeMb", min: 0, max: 500, step: 1 },
      },
      {
        name: `${t(language, "maxTotalImages")} (MB)`, desc: t(language, "maxTotalImagesDesc"),
        control: { type: "number", key: "maxTotalImageSizeMb", min: 0, max: 2000, step: 1 },
      },
      toggle("showNotices", "showNotices", "showNoticesDesc"),
      toggle("showCompatibilityNotices", "showCompatibilityNotices", "showCompatibilityNoticesDesc"),
      {
        type: "page", name: t(language, "advancedSettings"), desc: t(language, "advancedSettingsDesc"),
        items: [
          {
            type: "page", name: t(language, "destinationOrder"), desc: t(language, "destinationOrderDesc"),
            items: this.plugin.getEnabledTargets().map((target, index, targets) => ({
              name: targetText(language, target.id).label,
              render: (setting) => {
                const move = async (offset: number) => {
                  const other = targets[index + offset];
                  if (!other) return;
                  const order = [...this.plugin.settings.targetOrder];
                  const left = order.indexOf(target.id), right = order.indexOf(other.id);
                  [order[left], order[right]] = [order[right]!, order[left]!];
                  this.plugin.settings = { ...this.plugin.settings, targetOrder: order };
                  await this.plugin.saveSettings();
                  this.plugin.refreshUserInterface();
                  this.update();
                };
                setting.addExtraButton((button) => button.setIcon("arrow-up").setTooltip(t(language, "moveUp"))
                  .setDisabled(index === 0).onClick(() => { void move(-1); }));
                setting.addExtraButton((button) => button.setIcon("arrow-down").setTooltip(t(language, "moveDown"))
                  .setDisabled(index === targets.length - 1).onClick(() => { void move(1); }));
              },
            })),
          },
          {
            type: "page", name: t(language, "destinationPreferences"), desc: t(language, "destinationPreferencesDesc"),
            items: this.plugin.getEnabledTargets().filter((target) => target.id !== "original-source").map((target) => {
              const booleanOptions = { inherit: t(language, "inheritSetting"), enabled: t(language, "enabledOption"), disabled: t(language, "disabledOption") };
              const items: SettingDefinitionItem[] = [
                { name: t(language, "includeTitle"), control: { type: "dropdown", key: `preference:${target.id}:includeTitle`, options: booleanOptions } },
                { name: t(language, "internalLinks"), control: { type: "dropdown", key: `preference:${target.id}:internalLinkMode`, options: {
                  inherit: t(language, "inheritSetting"), source: t(language, "preserveSource"), text: t(language, "visibleText"), markdown: t(language, "portableLink"),
                } } },
              ];
              if (getTarget(target.id).richText || target.id === "html-source") items.push({ name: t(language, "embedImages"), control: { type: "dropdown", key: `preference:${target.id}:embedLocalImages`, options: booleanOptions } });
              return { type: "page", name: targetText(language, target.id).label, items };
            }),
          },
          {
            type: "group", heading: t(language, "embedLimits"), items: [
              { name: t(language, "maxEmbedCount"), desc: t(language, "embedLimitDesc"), control: { type: "number", key: "maxEmbedCount", min: 0, max: 100000, step: 1 } },
              { name: t(language, "maxEmbedDepth"), desc: t(language, "embedLimitDesc"), control: { type: "number", key: "maxEmbedDepth", min: 0, max: 1000, step: 1 } },
            ],
          },
        ],
      },
    ];
  }
}
