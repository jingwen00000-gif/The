const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('firetake', {
  desktop: true,
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  openFile: (name, data) => ipcRenderer.invoke('open-file', { name, data }),
  printPDF: (html, name) => ipcRenderer.invoke('print-pdf', { html, name }),
  claude: (key, body) => ipcRenderer.invoke('claude', { key, body }),
  backupInfo: () => ipcRenderer.invoke('backup-info'),
  backupWrite: (name, data, keep) => ipcRenderer.invoke('backup-write', { name, data, keep }),
  backupOpenDir: () => ipcRenderer.invoke('backup-open-dir'),
  appVersion: () => ipcRenderer.invoke('app-version'),
  updateCheck: url => ipcRenderer.invoke('update-check', { url }),
  updateApply: (bundle, sha256) => ipcRenderer.invoke('update-apply', { bundle, sha256 }),
  updateApplyFile: () => ipcRenderer.invoke('update-apply-file'),
  dirGet: () => ipcRenderer.invoke('dir-get'),
  dirChoose: kind => ipcRenderer.invoke('dir-choose', { kind }),
  dirClear: kind => ipcRenderer.invoke('dir-clear', { kind }),
  dirOpen: kind => ipcRenderer.invoke('dir-open', { kind }),
  fsWrite: (rel, data) => ipcRenderer.invoke('fs-write', { rel, data }),
  fsRead: (rel, binary) => ipcRenderer.invoke('fs-read', { rel, binary }),
  fsList: rel => ipcRenderer.invoke('fs-list', { rel }),
  fsMove: (from, to) => ipcRenderer.invoke('fs-move', { from, to }),
  fsDelete: rel => ipcRenderer.invoke('fs-delete', { rel })
});
