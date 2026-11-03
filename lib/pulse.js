'use strict';
// Lê a saída de texto do `pactl` (PulseAudio ou PipeWire-pulse) para achar o som de UM programa.
// Código puro, sem rodar nada: assim dá para testar sem placa de som.
const fs = require('node:fs');

const clean = (s, max = 120) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);

function parseBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const line of String(text).split('\n')) {
    const head = line.match(/^(Sink Input|Sink) #(\d+)\s*$/);
    if (head) { cur = { kind: head[1], index: Number(head[2]), fields: {}, props: {} }; blocks.push(cur); continue; }
    if (!cur) continue;
    const prop = line.match(/^\t\t([A-Za-z0-9_.\-]+) = "(.*)"\s*$/);
    if (prop) { cur.props[prop[1]] = prop[2]; continue; }
    const field = line.match(/^\t([A-Za-z ]+): (.*)$/);
    if (field) cur.fields[field[1]] = field[2].trim();
  }
  return blocks;
}

const sinkInputs = (text) => parseBlocks(text).filter((b) => b.kind === 'Sink Input');
const sinks = (text) => parseBlocks(text).filter((b) => b.kind === 'Sink');

// true se `pid` é o próprio SafeZone ou um processo filho dele (o áudio do Electron roda num filho).
function makeIsOwn(rootPid, readStat = (pid) => fs.readFileSync('/proc/' + pid + '/stat', 'utf8')) {
  return (pid) => {
    let p = pid;
    for (let i = 0; i < 10 && p > 1; i++) {
      if (p === rootPid) return true;
      try {
        const s = readStat(p);
        p = Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]);
      } catch { return false; }
    }
    return false;
  };
}

function listApps(inputsText, isOwnPid = () => false) {
  return sinkInputs(inputsText)
    .map((b) => ({
      id: String(b.index),
      pid: Number(b.props['application.process.id']) || 0,
      name: clean(b.props['application.name'] || b.props['application.process.binary'] || 'Programa', 60),
      title: clean(b.props['media.name'] || '', 120),
    }))
    .filter((a) => !(a.pid && isOwnPid(a.pid)));
}

// Descobre qual "monitor" gravar: o da saída onde esse programa está tocando, filtrado só pelo stream dele.
function monitorTarget(inputsText, sinksText, id) {
  const input = sinkInputs(inputsText).find((b) => String(b.index) === String(id));
  if (!input) return null;
  const sink = sinks(sinksText).find((b) => String(b.index) === input.fields['Sink']);
  if (!sink) return null;
  const source = sink.fields['Monitor Source'] || (sink.fields['Name'] ? sink.fields['Name'] + '.monitor' : '');
  return source ? { sinkInput: input.index, source } : null;
}

module.exports = { clean, parseBlocks, sinkInputs, sinks, makeIsOwn, listApps, monitorTarget };
