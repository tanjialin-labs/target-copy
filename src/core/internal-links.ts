import type { App } from "obsidian";

export type InternalLinkResolver = (target: string, sourcePath?: string) => string;

export function createInternalLinkResolver(
  app: App,
  sourcePath: string,
): InternalLinkResolver {
  const vaultName = app.vault.getName();
  return (target, contextualSourcePath = sourcePath) => {
    const [linkPath, subpath] = splitSubpath(target.trim());
    const resolved = linkPath
      ? app.metadataCache.getFirstLinkpathDest(linkPath, contextualSourcePath)?.path || linkPath
      : contextualSourcePath;
    const file = `${resolved}${subpath}`;
    return `obsidian://open?vault=${encodeUriValue(vaultName)}&file=${encodeUriValue(file)}`;
  };
}

function splitSubpath(target: string): [string, string] {
  const hashIndex = target.indexOf("#");
  return hashIndex < 0
    ? [target, ""]
    : [target.slice(0, hashIndex), target.slice(hashIndex)];
}

function encodeUriValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
