export const TARGET_IDS = [
  "google-docs",
  "word",
  "notion",
  "slack",
  "email",
  "wechat-official",
  "markdown",
  "plain-text",
  "original-source",
  "html-source",
] as const;

export type TargetId = (typeof TARGET_IDS)[number];
export type InternalLinkMode = "source" | "text" | "markdown";
export type LanguagePreference = "system" | "en" | "zh-CN" | "zh-TW" | "ja" | "de";
export type UiLanguage = Exclude<LanguagePreference, "system">;
export type TargetPreferences = Partial<Pick<TargetCopySettings,
  "includeTitle" | "embedLocalImages" | "internalLinkMode">>;

export interface TargetCopySettings {
  language: LanguagePreference;
  enabledTargets: TargetId[];
  defaultTarget: TargetId;
  lastTarget: TargetId;
  targetOrder: TargetId[];
  targetPreferences: Partial<Record<TargetId, TargetPreferences>>;
  includeTitle: boolean;
  stripFrontmatter: boolean;
  stripComments: boolean;
  internalLinkMode: InternalLinkMode;
  embedLocalImages: boolean;
  maxImageSizeMb: number;
  maxTotalImageSizeMb: number;
  showNotices: boolean;
  showCompatibilityNotices: boolean;
  maxEmbedCount: number;
  maxEmbedDepth: number;
}

export interface CopyInput {
  markdown: string;
  sourceFormat?: "markdown" | "html";
  renderedHtml?: string;
  referenceDefinitions?: string;
  title: string;
  sourcePath: string;
  isSelection: boolean;
}

export interface ConversionContext {
  target: TargetId;
  title: string;
  sourcePath: string;
  isSelection: boolean;
  settings: TargetCopySettings;
  resolveInternalLink?: (target: string, sourcePath?: string) => string;
  getSourcePathForElement?: (element: Element) => string;
}

export interface AdapterResult {
  text: string;
  html?: string;
  warnings: string[];
}

export interface CopyResult extends AdapterResult {
  target: TargetId;
}

export interface TargetDefinition {
  id: TargetId;
  richText: boolean;
}

export const TARGETS: readonly TargetDefinition[] = [
  {
    id: "google-docs",
    richText: true,
  },
  {
    id: "word",
    richText: true,
  },
  {
    id: "notion",
    richText: true,
  },
  {
    id: "slack",
    richText: true,
  },
  {
    id: "email",
    richText: true,
  },
  {
    id: "wechat-official",
    richText: true,
  },
  {
    id: "markdown",
    richText: false,
  },
  {
    id: "plain-text",
    richText: false,
  },
  { id: "original-source", richText: false },
  { id: "html-source", richText: false },
] as const;

export const DEFAULT_SETTINGS: TargetCopySettings = {
  language: "system",
  enabledTargets: TARGET_IDS.filter((target) => target !== "original-source" && target !== "html-source"),
  defaultTarget: "google-docs",
  lastTarget: "google-docs",
  targetOrder: [...TARGET_IDS],
  targetPreferences: {},
  includeTitle: false,
  stripFrontmatter: false,
  stripComments: false,
  internalLinkMode: "markdown",
  embedLocalImages: true,
  maxImageSizeMb: 0,
  maxTotalImageSizeMb: 0,
  showNotices: true,
  showCompatibilityNotices: true,
  maxEmbedCount: 0,
  maxEmbedDepth: 0,
};

export function isTargetId(value: unknown): value is TargetId {
  return typeof value === "string" && TARGET_IDS.includes(value as TargetId);
}

export function getTarget(targetId: TargetId): TargetDefinition {
  return TARGETS.find((target) => target.id === targetId) ?? TARGETS[0]!;
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return (
    value === "system" ||
    value === "en" ||
    value === "zh-CN" ||
    value === "zh-TW" ||
    value === "ja" ||
    value === "de"
  );
}

export function normalizeSettings(value: unknown): TargetCopySettings {
  const loaded = isRecord(value) ? value : {};
  const enabledTargets = normalizeEnabledTargets(loaded.enabledTargets);
  const firstEnabled = enabledTargets[0]!;
  const defaultTarget =
    isTargetId(loaded.defaultTarget) && enabledTargets.includes(loaded.defaultTarget)
      ? loaded.defaultTarget
      : enabledTargets.includes(DEFAULT_SETTINGS.defaultTarget)
        ? DEFAULT_SETTINGS.defaultTarget
        : firstEnabled;
  const lastTarget =
    isTargetId(loaded.lastTarget) && enabledTargets.includes(loaded.lastTarget)
      ? loaded.lastTarget
      : defaultTarget;
  const maxImageSizeMb = validNumber(
    loaded.maxImageSizeMb,
    0,
    500,
    DEFAULT_SETTINGS.maxImageSizeMb,
  );
  const loadedTotalImageSizeMb = validNumber(
    loaded.maxTotalImageSizeMb,
    0,
    2000,
    DEFAULT_SETTINGS.maxTotalImageSizeMb,
  );
  const maxTotalImageSizeMb = loadedTotalImageSizeMb;

  return {
    language: isLanguagePreference(loaded.language)
      ? loaded.language
      : DEFAULT_SETTINGS.language,
    enabledTargets,
    defaultTarget,
    lastTarget,
    targetOrder: normalizeTargetOrder(loaded.targetOrder),
    targetPreferences: normalizeTargetPreferences(loaded.targetPreferences),
    includeTitle: validBoolean(loaded.includeTitle, DEFAULT_SETTINGS.includeTitle),
    stripFrontmatter: validBoolean(
      loaded.stripFrontmatter,
      DEFAULT_SETTINGS.stripFrontmatter,
    ),
    stripComments: validBoolean(loaded.stripComments, DEFAULT_SETTINGS.stripComments),
    internalLinkMode:
      loaded.internalLinkMode === "source" ||
      loaded.internalLinkMode === "markdown" ||
      loaded.internalLinkMode === "text"
        ? loaded.internalLinkMode
        : DEFAULT_SETTINGS.internalLinkMode,
    embedLocalImages: validBoolean(
      loaded.embedLocalImages,
      DEFAULT_SETTINGS.embedLocalImages,
    ),
    maxImageSizeMb,
    maxTotalImageSizeMb,
    showNotices: validBoolean(loaded.showNotices, DEFAULT_SETTINGS.showNotices),
    showCompatibilityNotices: validBoolean(loaded.showCompatibilityNotices,
      validBoolean(loaded.showNotices, DEFAULT_SETTINGS.showCompatibilityNotices)),
    maxEmbedCount: Math.floor(validNumber(loaded.maxEmbedCount, 0, 100000, DEFAULT_SETTINGS.maxEmbedCount)),
    maxEmbedDepth: Math.floor(validNumber(loaded.maxEmbedDepth, 0, 1000, DEFAULT_SETTINGS.maxEmbedDepth)),
  };
}

export function settingsForTarget(settings: TargetCopySettings, target: TargetId): TargetCopySettings {
  return { ...settings, ...settings.targetPreferences[target] };
}

function normalizeTargetOrder(value: unknown): TargetId[] {
  const saved = Array.isArray(value) ? value.filter(isTargetId) : [];
  return [...new Set([...saved, ...TARGET_IDS])];
}

function normalizeTargetPreferences(value: unknown): TargetCopySettings["targetPreferences"] {
  if (!isRecord(value)) return {};
  const result: TargetCopySettings["targetPreferences"] = {};
  for (const target of TARGET_IDS) {
    const saved = value[target];
    if (!isRecord(saved)) continue;
    const preferences: TargetPreferences = {};
    if (typeof saved.includeTitle === "boolean") preferences.includeTitle = saved.includeTitle;
    if (typeof saved.embedLocalImages === "boolean") preferences.embedLocalImages = saved.embedLocalImages;
    if (["source", "text", "markdown"].includes(String(saved.internalLinkMode))) {
      preferences.internalLinkMode = saved.internalLinkMode as InternalLinkMode;
    }
    result[target] = preferences;
  }
  return result;
}

function normalizeEnabledTargets(value: unknown): TargetId[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.enabledTargets];
  const enabled = TARGET_IDS.filter((targetId) => value.includes(targetId));
  return enabled.length > 0 ? enabled : [...DEFAULT_SETTINGS.enabledTargets];
}

function validBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function validNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? Math.min(maximum, value)
    : defaultValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
