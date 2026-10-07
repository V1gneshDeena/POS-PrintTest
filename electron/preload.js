/**
 * Electron Preload — Gregory POS
 *
 * Exposes a safe API to the renderer process for printer status checks.
 * Uses contextBridge to maintain security (contextIsolation: true).
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Check if the receipt printer is reachable.
   * Returns { online: boolean, printerIp: string, printerPort: number }
   */
  getPrinterStatus: () => ipcRenderer.invoke('printer:status'),

  /**
   * True when running inside Electron (vs. browser).
   */
  isElectron: true,
})
