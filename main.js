const presetMap = {
  leadVocal: 0,
  backingVocal: 1,
  drums: 2,
  bass: 3,
  guitar: 4,
  keyboard: 5,
  strings: 6,
  synth: 7,
  brass: 8,
  woodwinds: 9,
  percussion: 10,
  fullMix: 11
};

const sliderIds = [
  'looseness', 'organic', 'expression', 'bias', 'sensitivity', 'releaseMs', 'mix'
];

async function setup() {
  const audio = new AudioContext({ latencyHint: 'interactive' });
  await audio.audioWorklet.addModule('humanize-processor.js');

  const node = new AudioWorkletNode(audio, 'humanize-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });

  node.connect(audio.destination);

  const ui = {
    fileIn: document.getElementById('fileIn'),
    micBtn: document.getElementById('micBtn'),
    stopSrcBtn: document.getElementById('stopSrcBtn'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    exportBtn: document.getElementById('exportBtn'),
    presetSel: document.getElementById('presetSel'),
    status: document.getElementById('status'),
    verBadge: document.getElementById('verBadge'),
    buildInfo: document.getElementById('buildInfo'),
    changelog: document.getElementById('changelog'),
    sliders: {}
  };
  sliderIds.forEach((id) => { ui.sliders[id] = document.getElementById(id); });

  let micSource = null;
  let micStream = null;
  let fileSource = null;
  let currentFile = null;
  let currentBuffer = null;

  // ---------------------------------------------------------------- helpers

  function setStatus(text) {
    ui.status.textContent = text;
  }

  function setParam(name, value) {
    const param = node.parameters.get(name);
    if (param) param.setValueAtTime(value, audio.currentTime);
  }

  function fmt(id, value) {
    const el = document.getElementById(id + 'Val');
    if (!el) return;
    el.textContent = id === 'releaseMs' ? String(Math.round(value)) : Number(value).toFixed(2);
  }

  function updateAll() {
    const presetKey = ui.presetSel.value;
    setParam('preset', presetMap[presetKey] / 11);
    sliderIds.forEach((id) => {
      const el = ui.sliders[id];
      setParam(id, Number(el.value));
      fmt(id, el.value);
    });
  }

  function disconnectSource(kind) {
    if (kind === 'mic' || kind === undefined) {
      if (micSource) { try { micSource.disconnect(); } catch (_) {} micSource = null; }
      if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    }
    if (kind === 'file' || kind === undefined) {
      if (fileSource) {
        try { fileSource.onended = null; fileSource.stop(); } catch (_) {}
        try { fileSource.disconnect(); } catch (_) {}
        fileSource = null;
      }
    }
  }

  // ---------------------------------------------------------------- version

  async function loadVersion() {
    let info = null;
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (res.ok) info = await res.json();
    } catch (_) {}
    if (!info || !info.version) {
      try {
        const res = await fetch('api/info', { cache: 'no-store' });
        if (res.ok) info = await res.json();
      } catch (_) {}
    }

    if (info && info.version) {
      const build = info.build ? ' · ' + info.build : '';
      ui.verBadge.textContent = 'v' + info.version + build;
      ui.buildInfo.textContent = 'Stem Humanize v' + info.version + build +
        (info.commit && info.commit !== 'unknown' ? ' · ' + info.commit : '');
      document.title = 'Stem Humanize v' + info.version;
    } else {
      ui.verBadge.textContent = 'v dev';
      ui.buildInfo.textContent = 'Development build';
    }

    try {
      const res = await fetch('CHANGELOG.md', { cache: 'no-store' });
      if (res.ok) ui.changelog.textContent = await res.text();
    } catch (_) {
      ui.changelog.textContent = 'Changelog unavailable.';
    }
  }

  // ---------------------------------------------------------------- wiring

  ui.presetSel.addEventListener('input', updateAll);
  ui.presetSel.addEventListener('change', updateAll);
  sliderIds.forEach((id) => {
    ui.sliders[id].addEventListener('input', updateAll);
    ui.sliders[id].addEventListener('change', updateAll);
  });

  ui.startBtn.onclick = async () => {
    try {
      if (audio.state !== 'running') await audio.resume();
      setStatus('Audio running.');
    } catch (err) {
      setStatus('Could not start audio: ' + err.message);
    }
  };

  ui.stopBtn.onclick = async () => {
    if (audio.state === 'running') await audio.suspend();
    setStatus('Audio suspended.');
  };

  ui.stopSrcBtn.onclick = () => {
    disconnectSource();
    setStatus('Source stopped.');
  };

  ui.micBtn.onclick = async () => {
    try {
      disconnectSource('file');
      disconnectSource('mic');
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micSource = audio.createMediaStreamSource(micStream);
      micSource.connect(node);
      if (audio.state !== 'running') await audio.resume();
      setStatus('Microphone live.');
    } catch (err) {
      setStatus('Microphone error: ' + err.message);
    }
  };

  ui.fileIn.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      disconnectSource();
      currentFile = file;
      const bytes = await file.arrayBuffer();
      currentBuffer = await audio.decodeAudioData(bytes);

      fileSource = audio.createBufferSource();
      fileSource.buffer = currentBuffer;
      fileSource.connect(node);
      fileSource.onended = () => setStatus('File finished: ' + file.name);
      fileSource.start();

      if (audio.state !== 'running') await audio.resume();
      setStatus('Playing ' + file.name + ' — ' + currentBuffer.duration.toFixed(1) + 's');
    } catch (err) {
      currentBuffer = null;
      setStatus('Could not load file: ' + err.message);
    }
  };

  // ---------------------------------------------------------------- export

  function writeString(view, offset, text) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }

  function encodeWav(buffer, sampleRate) {
    const channels = buffer.numberOfChannels;
    const frames = buffer.length;
    const out = new ArrayBuffer(44 + frames * channels * 2);
    const view = new DataView(out);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + frames * channels * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, frames * channels * 2, true);

    const data = [];
    for (let ch = 0; ch < channels; ch++) data.push(buffer.getChannelData(ch));

    let offset = 44;
    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const s = Math.max(-1, Math.min(1, data[ch][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    return out;
  }

  async function exportWav() {
    if (!currentBuffer) {
      setStatus('Load an audio file first — export renders the loaded file offline.');
      return;
    }

    const originalLabel = ui.exportBtn.textContent;
    ui.exportBtn.disabled = true;
    ui.exportBtn.textContent = 'Rendering…';
    setStatus('Rendering humanized file offline…');

    try {
      const channels = currentBuffer.numberOfChannels;
      const sampleRate = currentBuffer.sampleRate || audio.sampleRate;

      const offline = new OfflineAudioContext({ numberOfChannels: channels, length: currentBuffer.length, sampleRate });
      await offline.audioWorklet.addModule('humanize-processor.js');

      const renderNode = new AudioWorkletNode(offline, 'humanize-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [channels]
      });

      const renderSource = offline.createBufferSource();
      renderSource.buffer = currentBuffer;
      renderSource.connect(renderNode);
      renderNode.connect(offline.destination);

      const values = {
        preset: presetMap[ui.presetSel.value] / 11
      };
      sliderIds.forEach((id) => { values[id] = Number(ui.sliders[id].value); });

      Object.keys(values).forEach((name) => {
        const param = renderNode.parameters.get(name);
        if (param) param.value = values[name];
      });

      renderSource.start(0);
      const rendered = await offline.startRendering();
      const wav = encodeWav(rendered, sampleRate);

      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const link = document.createElement('a');
      link.href = url;
      const base = (currentFile && currentFile.name ? currentFile.name : 'stem').replace(/\.[^/.]+$/, '');
      link.download = base + '-humanized.wav';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setStatus('Exported ' + link.download + ' (' + (wav.byteLength / 1048576).toFixed(1) + ' MB).');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error(err);
      setStatus('Export failed: ' + err.message);
    } finally {
      ui.exportBtn.disabled = false;
      ui.exportBtn.textContent = originalLabel;
    }
  }

  ui.exportBtn.onclick = exportWav;

  // ---------------------------------------------------------------- boot

  updateAll();
  loadVersion();

  window.__humanize = { audio, node, updateAll, exportWav };
}

window.addEventListener('load', () => {
  setup().catch((err) => {
    const status = document.getElementById('status');
    if (status) status.textContent = 'Failed to start audio engine: ' + err.message;
    console.error(err);
  });
});
