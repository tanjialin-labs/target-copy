// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  preserveDiagramSourceForRendering,
  restorePreservedCodeLanguages,
} from "../src/core/diagrams";
import { preserveHiddenSourceForRendering } from "../src/core/markdown";
import { DEFAULT_SETTINGS } from "../src/types";

describe("source-first rendering", () => {
  it.each(["mermaid", "plantuml", "dot", "svg", "dataview", "tasks", "ts"])(
    "keeps %s fenced code as editable source instead of executing it",
    (language) => {
      const source = `\`\`\`${language}\nA --> B\n\`\`\``;
      const protectedSource = preserveDiagramSourceForRendering(source);
      expect(protectedSource).toContain('class="language-text"');
      expect(protectedSource).toContain(`data-target-copy-language="${language}"`);
      expect(protectedSource).toContain("A --&gt; B");
      expect(protectedSource).not.toContain("```");
    },
  );

  it("protects multiple adjacent executable blocks in one document", () => {
    const source = "```mermaid\ngraph TD\n```\n```dataview\nTABLE file.name\n```";
    const protectedSource = preserveDiagramSourceForRendering(source);
    expect(protectedSource.match(/language-text/g)).toHaveLength(2);
    expect(protectedSource).toContain('data-target-copy-language="mermaid"');
    expect(protectedSource).toContain('data-target-copy-language="dataview"');
  });

  it("restores language metadata only after Obsidian rendering", () => {
    document.body.innerHTML = '<code class="language-text" data-target-copy-language="mermaid">graph TD</code>';
    restorePreservedCodeLanguages(document.body);
    const code = document.querySelector("code")!;
    expect(code.className).toBe("language-mermaid");
    expect(code.hasAttribute("data-target-copy-language")).toBe(false);
  });

  it("does not execute dollar syntax inside preserved code", () => {
    const source = "```mermaid\nA[$value] --> B\n```";
    expect(preserveDiagramSourceForRendering(source)).toContain("A[&#36;value]");
  });

  it("keeps unclosed fences inert while preserving their source", () => {
    const source = "```mermaid\nA --> B";
    const protectedSource = preserveDiagramSourceForRendering(source);
    expect(protectedSource).toContain('data-target-copy-language="mermaid"');
    expect(protectedSource).toContain('data-code-fence-state="unclosed"');
    expect(protectedSource).toContain("A --&gt; B");
    expect(protectedSource).not.toContain("```mermaid");
  });

  it("preserves complete fence info without allowing attribute injection", () => {
    const source = "```ts title=\"demo\"\nconst value = 1;\n```";
    const protectedSource = preserveDiagramSourceForRendering(source);
    expect(protectedSource).toContain('data-target-copy-language="ts"');
    expect(protectedSource).toContain('data-code-info="ts title=&quot;demo&quot;"');

    const hostile = "```\"><img src=x onerror=alert(1)>\nSAFE_BODY\n```";
    const protectedHostile = preserveDiagramSourceForRendering(hostile);
    expect(protectedHostile).not.toContain("<img src=x");
    expect(protectedHostile).toContain("&quot;&gt;&lt;img");
    expect(protectedHostile).toContain("SAFE_BODY");
  });

  it("makes retained frontmatter and comments visible to rich rendering", () => {
    const source = "---\ntags: [private]\n---\nBody %%keep me%%";
    const protectedSource = preserveHiddenSourceForRendering(source, DEFAULT_SETTINGS);
    expect(protectedSource).toContain("```yaml\n---\ntags: [private]\n---\n```");
    expect(protectedSource).toContain("&#37;&#37;keep me&#37;&#37;");
  });

  it("prevents fence-like text inside frontmatter and comments from executing", () => {
    const source = [
      "---",
      "example: |",
      "  ```dataview",
      "  TABLE file.name",
      "  ```",
      "---",
      "%%",
      "~~~tasks",
      "not done",
      "~~~",
      "%%",
    ].join("\n");
    const hidden = preserveHiddenSourceForRendering(source, DEFAULT_SETTINGS);
    const protectedSource = preserveDiagramSourceForRendering(hidden);
    expect(protectedSource).toContain('data-target-copy-language="yaml"');
    expect(protectedSource).not.toContain('data-target-copy-language="dataview"');
    expect(protectedSource).not.toContain('data-target-copy-language="tasks"');
    expect(protectedSource).toContain("TABLE file.name");
    expect(protectedSource).toContain("not done");
  });
});
