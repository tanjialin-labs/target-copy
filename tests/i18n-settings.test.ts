import { describe, expect, it } from "vitest";

import { resolveLanguage, t, targetText } from "../src/i18n";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/types";

describe("interface language", () => {
  it.each([
    ["zh-CN", "zh-CN"],
    ["zh", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["zh-Hans-CN", "zh-CN"],
    ["zh-TW", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-Hant-HK", "zh-TW"],
    ["ja", "ja"],
    ["ja-JP", "ja"],
    ["de", "de"],
    ["de-AT", "de"],
    ["en-US", "en"],
    ["fr-FR", "en"],
  ] as const)("maps system locale %s to %s", (systemLanguage, expected) => {
    expect(resolveLanguage("system", systemLanguage)).toBe(expected);
  });

  it.each(["en", "zh-CN", "zh-TW", "ja", "de"] as const)(
    "honors the explicit %s override",
    (language) => {
      expect(resolveLanguage(language, "fr-FR")).toBe(language);
    },
  );

  it("interpolates messages and localizes destination text", () => {
    expect(t("de", "copyFor", { target: "Notion" })).toBe("Für Notion kopieren");
    expect(targetText("zh-CN", "wechat-official").label).toBe("微信公众号");
    expect(targetText("zh-TW", "plain-text").label).toBe("純文字");
    expect(targetText("ja", "email").label).toBe("メール");
    expect(t("ja", "imageTooLargeWarning", { name: "photo.png", size: 5 }))
      .toContain("photo.png");
  });
});

describe("settings normalization", () => {
  it("keeps source export options opt-in on a new installation", () => {
    const settings = normalizeSettings(null);
    expect(settings.enabledTargets).toEqual(DEFAULT_SETTINGS.enabledTargets);
    expect(settings.language).toBe("system");
    expect(settings.lastTarget).toBeNull();
    expect(settings.maxImageSizeMb).toBe(0);
    expect(settings.maxTotalImageSizeMb).toBe(0);
    expect(settings.stripFrontmatter).toBe(false);
    expect(settings.stripComments).toBe(false);
    expect(settings.internalLinkMode).toBe("markdown");
  });

  it("keeps only valid unique destinations in canonical order", () => {
    const settings = normalizeSettings({
      enabledTargets: ["email", "slack", "email", "unknown"],
      defaultTarget: "google-docs",
      lastTarget: "email",
    });
    expect(settings.enabledTargets).toEqual(["slack", "email"]);
    expect(settings.defaultTarget).toBe("slack");
    expect(settings.lastTarget).toBe("email");
  });

  it("recovers from an empty destination list and invalid values", () => {
    const settings = normalizeSettings({
      enabledTargets: [],
      language: "fr",
      maxImageSizeMb: 900,
      maxTotalImageSizeMb: 4000,
      includeTitle: "yes",
    });
    expect(settings.enabledTargets).toEqual(DEFAULT_SETTINGS.enabledTargets);
    expect(settings.language).toBe("system");
    expect(settings.maxImageSizeMb).toBe(500);
    expect(settings.maxTotalImageSizeMb).toBe(2000);
    expect(settings.includeTitle).toBe(false);
  });

  it("preserves independently chosen image limits", () => {
    const settings = normalizeSettings({
      maxImageSizeMb: 12,
      maxTotalImageSizeMb: 4,
    });
    expect(settings.maxImageSizeMb).toBe(12);
    expect(settings.maxTotalImageSizeMb).toBe(4);
  });

  it("accepts zero as an explicit unlimited image policy", () => {
    const settings = normalizeSettings({
      maxImageSizeMb: 0,
      maxTotalImageSizeMb: 0,
    });
    expect(settings.maxImageSizeMb).toBe(0);
    expect(settings.maxTotalImageSizeMb).toBe(0);
  });

});
