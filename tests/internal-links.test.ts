import { describe, expect, it } from "vitest";

import { createInternalLinkResolver } from "../src/core/internal-links";

describe("createInternalLinkResolver", () => {
  const app = {
    vault: { getName: () => "Research Vault" },
    metadataCache: {
      getFirstLinkpathDest: (target: string) =>
        target === "Demo Note" ? { path: "Notes/Demo Note.md" } : null,
    },
  };

  it("creates an encoded Obsidian URI for the resolved note and heading", () => {
    const resolve = createInternalLinkResolver(
      app as never,
      "Projects/Source.md",
    );
    expect(resolve("Demo Note#Decision 1")).toBe(
      "obsidian://open?vault=Research%20Vault&file=Notes%2FDemo%20Note.md%23Decision%201",
    );
  });

  it("uses the source note for heading-only links", () => {
    const resolve = createInternalLinkResolver(
      app as never,
      "Projects/Source.md",
    );
    expect(resolve("#Overview")).toBe(
      "obsidian://open?vault=Research%20Vault&file=Projects%2FSource.md%23Overview",
    );
  });
});
