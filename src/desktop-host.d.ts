/** Desktop APIs supplied by the Obsidian host, external to the plugin bundle. */
declare module "electron" {
  export const remote: {
    clipboard?: { write(data: { text: string; html?: string }): void };
  } | undefined;
}
