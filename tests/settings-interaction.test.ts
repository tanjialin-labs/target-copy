// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
const notices = vi.hoisted(() => [] as string[]);
vi.mock("obsidian", async importOriginal => {
  class Empty {}
  return { ...await importOriginal<object>(),
    Plugin: class { saveData = vi.fn(async (_value: unknown) => undefined); },
    PluginSettingTab: class { containerEl = document.createElement("div"); update = vi.fn(); },
    Notice: class { constructor(message: string) { notices.push(message); } },
    Component: Empty, MarkdownRenderer: {}, MarkdownView: Empty, Menu: Empty, Modal: Empty, FuzzySuggestModal: Empty,
  };
});
import TargetCopyPlugin from "../src/main";
import { preserveSettingsFocus, TargetCopySettingTab } from "../src/settings";
import { normalizeSettings, type TargetCopySettings } from "../src/types";

afterEach(() => { document.body.replaceChildren(); notices.length = 0; });

function setup(settings: Partial<TargetCopySettings> = {}) {
  const plugin = new TargetCopyPlugin({} as never, {} as never);
  plugin.settings = normalizeSettings({ language: "en", ...settings });
  plugin.refreshUserInterface = vi.fn();
  const tab = new TargetCopySettingTab({} as never, plugin);
  document.body.append(tab.containerEl);
  return { plugin, tab };
}

interface Definition { name?: string; items?: Definition[]; render?: (row: never) => void }
function renderRow(tab: TargetCopySettingTab, name: string) {
  const flatten = (items: Definition[]): Definition[] => items.flatMap(item => [item, ...flatten(item.items || [])]);
  const definition = flatten(tab.getSettingDefinitions() as Definition[]).find(item => item.name === name)!;
  expect(definition, name).toBeDefined();
  const settingEl = document.createElement("div"); settingEl.className = "setting-item";
  const nameEl = document.createElement("div"); nameEl.className = "setting-item-name"; nameEl.textContent = name;
  const descEl = document.createElement("div");
  const create = (tag: string) => { const node = document.createElement(tag); settingEl.append(node); return node; };
  const decorate = (element: HTMLElement) => Object.assign(element, {
    createSpan: ({ cls, text }: { cls: string; text: string }) => {
      const node = document.createElement("span"); node.className = cls; node.textContent = text; element.append(node); return node;
    },
    createDiv: ({ cls }: { cls: string }) => {
      const node = document.createElement("div"); node.className = cls; element.append(node);
      Object.assign(node, { setText: (text: string) => { node.textContent = text; } }); return node;
    },
  });
  settingEl.append(nameEl, descEl); tab.containerEl.append(settingEl);
  const addButton = (callback: (control: unknown) => void) => {
    const button = create("button") as HTMLButtonElement;
    const control = { buttonEl: button, extraSettingsEl: button,
      setButtonText(text: string) { button.textContent = text; return this; },
      setIcon() { return this; }, setTooltip(text: string) { button.title = text; return this; },
      setDisabled(value: boolean) { button.disabled = value; return this; },
      onClick(fn: () => void) { button.addEventListener("click", fn); return this; },
    }; callback(control);
  };
  definition.render?.({ settingEl, nameEl: decorate(nameEl), descEl: decorate(descEl),
    addButton, addExtraButton: addButton,
    addToggle(callback: (control: unknown) => void) {
      const input = create("input") as HTMLInputElement; input.type = "checkbox";
      callback({ toggleEl: input,
        setValue(value: boolean) { input.checked = value; return this; },
        setDisabled(value: boolean) { input.disabled = value; return this; },
        setTooltip() { return this; }, onChange(fn: (value: boolean) => void) { input.addEventListener("change", () => fn(input.checked)); return this; },
      });
    },
    addDropdown(callback: (control: unknown) => void) {
      const select = create("select") as HTMLSelectElement;
      callback({ selectEl: select,
        addOptions(options: Record<string, string>) {
          for (const [value, text] of Object.entries(options)) {
            const option = document.createElement("option"); option.value = value; option.textContent = text; select.add(option);
          }
          return this;
        },
        setValue(value: string) { select.value = value; return this; },
        onChange(fn: (value: string) => void) { select.addEventListener("change", () => fn(select.value)); return this; },
      });
    },
    addText(callback: (control: unknown) => void) {
      const input = create("input") as HTMLInputElement;
      callback({ inputEl: input, setValue(value: string) { input.value = value; return this; } });
    },
  } as never);
  return settingEl;
}

describe("settings interaction", () => {
  it("applies rapid moves to the current order and saves snapshots sequentially", async () => {
    const { plugin, tab } = setup();
    const pending: Array<() => void> = [];
    const saved: TargetCopySettings[] = [];
    vi.spyOn(plugin, "saveData").mockImplementation(value => {
      saved.push(value as TargetCopySettings);
      return new Promise<void>(resolve => pending.push(resolve));
    });
    renderRow(tab, "Menu order").querySelector("button")!.click();
    const row = renderRow(tab, "Notion");
    const up = row.querySelector<HTMLButtonElement>('button[title="Move up · Notion"]')!;
    up.click(); up.click();
    expect(plugin.settings.targetOrder.slice(0, 3)).toEqual(["notion", "google-docs", "word"]);
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.targetOrder.slice(0, 3)).toEqual(["google-docs", "notion", "word"]);
    pending.shift()!();
    await vi.waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]!.targetOrder.slice(0, 3)).toEqual(["notion", "google-docs", "word"]);
    pending.shift()!();
    await vi.waitFor(() => expect(tab.update).toHaveBeenCalledTimes(2));
  });

  it("reports a failed save and allows the following save to succeed", async () => {
    const { plugin, tab } = setup();
    vi.spyOn(plugin, "saveData").mockRejectedValueOnce(new Error("Unavailable"));
    await tab.setControlValue("maxImageSizeMb", 2);
    expect(notices.join(" ")).toContain("could not save settings");
    expect(renderRow(tab, "Maximum embedded image size (MB)").textContent).toContain("Not saved");
    await tab.setControlValue("maxImageSizeMb", 3);
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(renderRow(tab, "Maximum embedded image size (MB)").textContent).toContain("Saved");
  });

  it("marks destination overrides and resets only the chosen destination", async () => {
    const { plugin, tab } = setup({ targetPreferences: { notion: { includeTitle: true }, word: { embedLocalImages: false } } });
    const row = renderRow(tab, "Notion");
    expect(row.querySelector(".target-copy-override-badge")?.textContent).toBe("Customized");
    row.querySelector<HTMLButtonElement>('button[title="Restore general settings · Notion"]')!.click();
    await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalled());
    expect(plugin.settings.targetPreferences.notion).toBeUndefined();
    expect(plugin.settings.targetPreferences.word).toEqual({ embedLocalImages: false });
    expect(renderRow(tab, "Notion").querySelector(".target-copy-override-badge")).toBeNull();
  });

  it("validates limits immediately and restores the saved custom value after unlimited", async () => {
    const { plugin, tab } = setup({ maxImageSizeMb: 2.5 });
    let row = renderRow(tab, "Maximum embedded image size (MB)");
    const input = row.querySelector("input")!;
    input.value = "501"; input.dispatchEvent(new Event("input"));
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(row.textContent).toContain("0.01 to 500");
    input.dispatchEvent(new Event("change"));
    expect(plugin.saveData).not.toHaveBeenCalled();
    input.value = "4.5"; input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledTimes(1));
    const mode = row.querySelector("select")!; mode.value = "unlimited"; mode.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledTimes(2));
    plugin.settings = normalizeSettings(JSON.parse(JSON.stringify(plugin.settings)));
    row = renderRow(tab, "Maximum embedded image size (MB)");
    const restoredMode = row.querySelector("select")!; restoredMode.value = "custom"; restoredMode.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(plugin.saveData).toHaveBeenCalledTimes(3));
    expect(row.querySelector("input")!.value).toBe("4.5");
    expect(plugin.settings.maxImageSizeMb).toBe(4.5);
  });

  it("preserves focus, cursor, and uncommitted text across a settings render", () => {
    const container = document.createElement("div"); document.body.append(container);
    container.innerHTML = '<input data-target-copy-focus="test" value="draft">';
    const input = container.querySelector("input")!; input.focus(); input.setSelectionRange(2, 4);
    preserveSettingsFocus(container, () => { container.innerHTML = '<input data-target-copy-focus="test" value="saved">'; });
    const replacement = container.querySelector("input")!;
    expect(document.activeElement).toBe(replacement);
    expect(replacement.value).toBe("draft");
    expect([replacement.selectionStart, replacement.selectionEnd]).toEqual([2, 4]);
  });

  it("restores focus when a native settings subpage replaces its container and autofocuses another control", () => {
    let container = document.createElement("div"); document.body.append(container);
    container.innerHTML = '<input data-target-copy-focus="limit" value="3.5">';
    container.querySelector("input")!.focus();
    preserveSettingsFocus(container, () => {
      const next = document.createElement("div");
      next.innerHTML = '<select><option>Custom</option></select><input data-target-copy-focus="limit" value="3.5">';
      container.replaceWith(next); container = next;
      next.querySelector("select")!.focus();
    }, () => container);
    expect(document.activeElement).toBe(container.querySelector("input"));
  });

  it("preserves subpage focus while the previous settings page remains mounted for a transition", async () => {
    const { tab } = setup(); tab.containerEl.className = "vertical-tab-content";
    tab.containerEl.innerHTML = '<button data-target-copy-focus="reorder">Order</button>';
    let subpage = document.createElement("div"); subpage.className = "vertical-tab-content"; document.body.append(subpage);
    subpage.innerHTML = '<input data-target-copy-focus="maxImageSizeMb:value" value="3.5">';
    subpage.querySelector("input")!.focus();
    vi.mocked(tab.update).mockImplementation(() => {
      const next = document.createElement("div"); next.className = "vertical-tab-content";
      next.innerHTML = '<select data-target-copy-focus="maxImageSizeMb:mode"><option>Custom</option></select><input data-target-copy-focus="maxImageSizeMb:value" value="3.5">';
      subpage.replaceWith(next); subpage = next; next.querySelector("select")!.focus();
    });
    await tab.setControlValue("maxImageSizeMb", 3.5);
    expect(document.activeElement).toBe(subpage.querySelector("input"));
  });
});
