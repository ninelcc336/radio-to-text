const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("engineApi", {
  request(request) {
    return ipcRenderer.invoke("engine:request", request);
  },
  selectAudioFile() {
    return ipcRenderer.invoke("dialog:select-audio");
  }
});
