export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: NodeJS.Platform;
      selectProjectFolder: () => Promise<string | null>;
      selectMediaFiles: () => Promise<string[] | null>;
    };
  }
}
