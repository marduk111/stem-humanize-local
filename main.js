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

  fileIn.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const ab = await audio.decodeAudioData(buf);
    if (fileSource) { try { fileSource.stop(); } catch (_) {} fileSource.disconnect(); }
    fileSource = audio.createBufferSource();
    fileSource.buffer = ab;
    fileSource.loop = false;
    if (micSource) { /* keep mic? allow both not easy; replace */ }
    fileSource.connect(node);
    fileSource.start();
    status.textContent = 'File playing: ' + file.name;
  };

  // expose
  window.__humanize = { audio, node, updateAll };
  updateAll();
}

window.addEventListener('load', setup);
