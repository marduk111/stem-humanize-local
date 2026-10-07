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

const paramOrder = [
  'looseness', 'organic', 'expression', 'bias', 'sensitivity', 'releaseMs', 'mix'
];

async function setup() {
  const audio = new AudioContext({ latencyHint: 'interactive' });
  await audio.audioWorklet.addModule('humanize-processor.js');
  const node = new AudioWorkletNode(audio, 'humanize-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {}
  });

  // wire
  const out = audio.createGain();
  node.connect(out);
  out.connect(audio.destination);

  // UI
  const fileIn = document.getElementById('fileIn');
  const micBtn = document.getElementById('micBtn');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const presetSel = document.getElementById('presetSel');
  const looseness = document.getElementById('looseness');
  const organic = document.getElementById('organic');
  const expression = document.getElementById('expression');
  const bias = document.getElementById('bias');
  const sensitivity = document.getElementById('sensitivity');
  const releaseMs = document.getElementById('releaseMs');
  const mix = document.getElementById('mix');
  const status = document.getElementById('status');

  let source = null;
  let micSource = null;
  let fileSource = null;

  function setParam(name, v) {
    const p = node.parameters.get(name);
    if (p) p.setValueAtTime(v, audio.currentTime);
  }

  function updateAll() {
    const presetKey = presetSel.value;
    const pIdx = presetMap[presetKey] / 11; // 0..1
    setParam('preset', pIdx);
    setParam('looseness', +looseness.value);
    setParam('organic', +organic.value);
    setParam('expression', +expression.value);
    setParam('bias', +bias.value);
    setParam('sensitivity', +sensitivity.value);
    setParam('releaseMs', +releaseMs.value);
    setParam('mix', +mix.value);
    status.textContent = `preset=${presetKey} loose=${looseness.value} org=${organic.value} expr=${expression.value} feel=${bias.value} sense=${sensitivity.value} rel=${releaseMs.value} mix=${mix.value}`;
  }

  [presetSel, looseness, organic, expression, bias, sensitivity, releaseMs, mix].forEach(el => {
    el.addEventListener('input', updateAll);
    el.addEventListener('change', updateAll);
  });

  startBtn.onclick = async () => {
    if (audio.state !== 'running') await audio.resume();
    status.textContent = 'Running';
  };
  stopBtn.onclick = () => {
    if (audio.state === 'running') audio.suspend();
    status.textContent = 'Suspended';
  };

  micBtn.onclick = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micSource = audio.createMediaStreamSource(stream);
      if (fileSource) { fileSource.disconnect(); }
      micSource.connect(node);
      status.textContent = 'Mic active';
    } catch (e) {
      status.textContent = 'Mic error: ' + e.message;
    }
  };

  let currentFile = null;
  let currentBuffer = null;

  fileIn.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentFile = file;
    const buf = await file.arrayBuffer();
    currentBuffer = await audio.decodeAudioData(buf);
    if (fileSource) { try { fileSource.stop(); } catch (_) {} fileSource.disconnect(); }
    fileSource = audio.createBufferSource();
    fileSource.buffer = currentBuffer;
    fileSource.loop = false;
    fileSource.connect(node);
    fileSource.start();
    status.textContent = 'File playing: ' + file.name;
  };

  function writeWav(buffer, sampleRate) {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length * numChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * numChannels * 2, true);
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return arrayBuffer;
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  async function exportWav() {
    if (!currentBuffer) {
      status.textContent = 'No file loaded to export. Load an audio file first.';
      return;
    }
    const exportCtx = new OfflineAudioContext({
      numberOfChannels: currentBuffer.numberOfChannels,
      length: currentBuffer.length,
      sampleRate: currentBuffer.sampleRate || audio.sampleRate
    });
    await exportCtx.audioWorklet.addModule('humanize-processor.js');
    const expNode = new AudioWorkletNode(exportCtx, 'humanize-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [currentBuffer.numberOfChannels]
    });
    const src = exportCtx.createBufferSource();
    src.buffer = currentBuffer;
    src.connect(expNode);
    expNode.connect(exportCtx.destination);

    const presetKey = presetSel.value;
    const pIdx = presetMap[presetKey] / 11;
    const params = expNode.parameters;
  const set = (k, v) => {
    const p = params.get(k);
    if (p) p.value = v;
    else console.warn('param missing', k);
  };
  set('preset', pIdx);
  set('looseness', +looseness.value);
  set('organic', +organic.value);
  set('expression', +expression.value);
  set('bias', +bias.value);
  set('sensitivity', +sensitivity.value);
  set('releaseMs', +releaseMs.value);
  set('mix', +mix.value);

    src.start(0);
    const rendered = await exportCtx.startRendering();
    const wav = writeWav(rendered, exportCtx.sampleRate);
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url;
    const base = currentFile?.name?.replace(/\.[^/.]+$/, '') || 'stem-humanized';
    a.download = base + '-humanized.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    status.textContent = 'Exported ' + a.download;
  }

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.onclick = exportWav;

  // expose
  window.__humanize = { audio, node, updateAll, exportWav };
  updateAll();
}

window.addEventListener('load', setup);
