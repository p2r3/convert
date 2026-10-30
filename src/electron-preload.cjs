const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopUpdater", {
  getState: () => ipcRenderer.invoke("updater:get-state"),
  check: () => ipcRenderer.invoke("updater:check"),
  setAutoUpdate: (enabled) => ipcRenderer.invoke("updater:set-auto-update", enabled === true),
  install: () => ipcRenderer.invoke("updater:install"),
  openRelease: () => ipcRenderer.invoke("updater:open-release"),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updater:state", listener);
    return () => ipcRenderer.removeListener("updater:state", listener);
  },
});
