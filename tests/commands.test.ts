import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
  class EmptyClass {}
  class Plugin {
    addCommand(command: { id: string }): void {
      command.id = `target-copy:${command.id}`;
    }
  }

  return {
    Component: EmptyClass,
    FuzzySuggestModal: EmptyClass,
    MarkdownRenderer: { render: vi.fn() },
    MarkdownView: EmptyClass,
    Menu: EmptyClass,
    Modal: EmptyClass,
    Notice: EmptyClass,
    Plugin,
    PluginSettingTab: EmptyClass,
    Setting: EmptyClass,
    TFile: EmptyClass,
  };
});

import TargetCopyPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/types";

class FakeMenuItem {
  title = "";
  icon: string | null = null;
  click?: () => void;
  submenu?: FakeMenu;
  disabled = false;

  constructor(private readonly supportsSubmenu = true) {}

  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  setIcon(icon: string | null): this {
    this.icon = icon;
    return this;
  }

  setDisabled(value: boolean): this { this.disabled = value; return this; }

  onClick(callback: () => void): this {
    this.click = callback;
    return this;
  }

  setSubmenu(): FakeMenu | undefined {
    if (!this.supportsSubmenu) return undefined;
    this.submenu = new FakeMenu();
    return this.submenu;
  }
}

class FakeMenu {
  readonly items: FakeMenuItem[] = [];

  constructor(private readonly supportsSubmenu = true) {}

  addItem(callback: (item: FakeMenuItem) => void): this {
    const item = new FakeMenuItem(this.supportsSubmenu);
    callback(item);
    this.items.push(item);
    return this;
  }
  addSeparator(): this { return this; }
}

function createPlugin(): TargetCopyPlugin {
  const plugin = Object.create(TargetCopyPlugin.prototype) as TargetCopyPlugin;
  plugin.settings = {
    ...DEFAULT_SETTINGS,
    language: "zh-CN",
    enabledTargets: ["google-docs", "wechat-official"],
    defaultTarget: "google-docs",
    lastTarget: "wechat-official",
  };
  return plugin;
}

describe("dynamic command bookkeeping", () => {
  it("retains the unprefixed ID even when Obsidian mutates command.id", () => {
    const plugin = Object.create(TargetCopyPlugin.prototype) as TargetCopyPlugin;
    const internal = plugin as unknown as {
      dynamicCommandIds: string[];
      registerDynamicCommand: (command: {
        id: string;
        name: string;
        callback: () => void;
      }) => void;
    };
    internal.dynamicCommandIds = [];

    internal.registerDynamicCommand({
      id: "quick-copy",
      name: "Quick copy",
      callback: () => undefined,
    });

    expect(internal.dynamicCommandIds).toEqual(["quick-copy"]);
  });
});

describe("destination context submenu", () => {
  let plugin: TargetCopyPlugin;

  beforeEach(() => {
    plugin = createPlugin();
  });

  it("keeps a stable submenu order and marks the last target", () => {
    const copyTo = vi.spyOn(plugin, "copyTo").mockResolvedValue();
    const menu = new FakeMenu();
    const file = { path: "note.md" };
    const addPickerMenuItem = (
      plugin as unknown as {
        addPickerMenuItem: (menu: FakeMenu, file: { path: string }) => void;
      }
    ).addPickerMenuItem.bind(plugin);

    addPickerMenuItem(menu, file);

    expect(menu.items).toHaveLength(1);
    expect(menu.items[0]?.title).toBe("选择复制目标…");
    expect(menu.items[0]?.icon).toBe("copy");
    expect(menu.items[0]?.click).toBeUndefined();
    expect(menu.items[0]?.submenu?.items.slice(1).map((item) => item.title)).toEqual([
      "Google Docs",
      "微信公众号",
    ]);
    expect(menu.items[0]?.submenu?.items[2]?.icon).toBe("history");

    menu.items[0]?.submenu?.items[2]?.click?.();
    expect(copyTo).toHaveBeenCalledWith("wechat-official", file, expect.any(Promise));
  });

  it("falls back to the picker when the host does not expose submenus", () => {
    const openTargetPicker = vi.fn();
    Object.defineProperty(plugin, "openTargetPicker", { value: openTargetPicker });
    const menu = new FakeMenu(false);
    const addPickerMenuItem = (
      plugin as unknown as { addPickerMenuItem: (menu: FakeMenu) => void }
    ).addPickerMenuItem.bind(plugin);

    addPickerMenuItem(menu);
    menu.items[0]?.click?.();

    expect(openTargetPicker).toHaveBeenCalledOnce();
  });
});
