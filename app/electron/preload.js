const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources:          () => ipcRenderer.invoke('get-sources'),
  startProcessAudio:   (pid) => ipcRenderer.send('start-process-audio', pid),
  stopProcessAudio:    () => ipcRenderer.send('stop-process-audio'),
  onProcessAudioData:  (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('process-audio-data', handler);
    return () => ipcRenderer.removeListener('process-audio-data', handler);
  },
  minimize:            () => ipcRenderer.send('window-minimize'),
  maximize:            () => ipcRenderer.send('window-maximize'),
  close:               () => ipcRenderer.send('window-close'),
});
