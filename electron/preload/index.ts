import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  selectProjectFolder: () => ipcRenderer.invoke('project:select-folder') as Promise<string | null>,
  selectMediaFiles: () => ipcRenderer.invoke('media:select-files') as Promise<string[] | null>,
})
