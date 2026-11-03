'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('safezone', Object.freeze({
  platform: () => ipcRenderer.invoke('platform'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  openReleasePage: () => ipcRenderer.invoke('open-release-page'),
  audioDriver: () => ipcRenderer.invoke('audio-driver'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  selectSource: (id) => ipcRenderer.invoke('select-source', id),
  listApps: () => ipcRenderer.invoke('list-apps'),
  startAudio: (id) => ipcRenderer.invoke('start-audio', id),
  stopAudio: () => ipcRenderer.invoke('stop-audio'),
  copy: (text) => ipcRenderer.invoke('copy', text),
  iceServers: () => ipcRenderer.invoke('ice-servers'),
  onAudio: (fn) => ipcRenderer.on('audio-pcm', (_e, chunk) => fn(chunk)),
  onAudioEnded: (fn) => ipcRenderer.on('audio-ended', () => fn()),
}));
