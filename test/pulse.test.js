'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pulse = require('../lib/pulse');

const INPUTS = [
  'Sink Input #52',
  '\tDriver: protocol-native.c',
  '\tSink: 1',
  '\tProperties:',
  '\t\tmedia.name = "Filme.mkv"',
  '\t\tapplication.name = "mpv"',
  '\t\tapplication.process.id = "4242"',
  '',
  'Sink Input #53',
  '\tSink: 1',
  '\tProperties:',
  '\t\tmedia.name = "Call"',
  '\t\tapplication.name = "Discord"',
  '\t\tapplication.process.id = "999"',
  '',
  'Sink Input #54',
  '\tSink: 1',
  '\tProperties:',
  '\t\tmedia.name = "x"',
  '\t\tapplication.name = "SafeZone"',
  '\t\tapplication.process.id = "100"',
  '',
].join('\n');

const SINKS = [
  'Sink #1',
  '\tState: RUNNING',
  '\tName: alsa_output.pci-0000_00_1f.3.analog-stereo',
  '\tMonitor Source: alsa_output.pci-0000_00_1f.3.analog-stereo.monitor',
  '\tProperties:',
  '\t\tdevice.description = "Built-in Audio"',
  '',
].join('\n');

test('lista só programas, sem o próprio SafeZone', () => {
  const own = pulse.makeIsOwn(100, (pid) => (pid === 100 ? '100 (safezone) S 1 ' : '4242 (mpv) S 1 '));
  const apps = pulse.listApps(INPUTS, own);
  assert.deepEqual(apps.map((a) => a.name), ['mpv', 'Discord']);
  assert.equal(apps[0].id, '52');
});

test('filho do SafeZone também é ignorado', () => {
  const stat = { 200: '200 (audio) S 100 ', 100: '100 (safezone) S 1 ' };
  assert.equal(pulse.makeIsOwn(100, (p) => stat[p])(200), true);
  assert.equal(pulse.makeIsOwn(100, (p) => stat[p])(300), false);
});

test('acha o monitor da saída do programa escolhido', () => {
  const t = pulse.monitorTarget(INPUTS, SINKS, '52');
  assert.equal(t.sinkInput, 52);
  assert.equal(t.source, 'alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
  assert.equal(pulse.monitorTarget(INPUTS, SINKS, '999'), null);
});

test('remove caracteres de controle dos nomes', () => {
  assert.equal(pulse.clean('a\u0000b\nc'), 'abc');
});
