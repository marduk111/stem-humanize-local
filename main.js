// Stem Humanize — UI controller
// Loads the AudioWorklet, drives the guided step flow, live readouts, transport and export.

const PRESETS = {
  leadVocal:    { label: 'Lead Vox',   maxMs: 0.90, best: 'intimate lead vocals',        hint: 'Keeps consonants locked while sustained vowels loosen slightly.' },
  backingVocal: { label: 'Bkg Vox',    maxMs: 1.40, best: 'stacked or doubled vocals',   hint: 'More movement is allowed because several takes usually mask each other.' },
  drums:        { label: 'Drums',      maxMs: 0.55, best: 'full drum kits',              hint: 'Tight ceiling: short attacks expose timing movement first.' },
  bass:         { label: 'Bass',       maxMs: 0.80, best: 'electric or synth bass',      hint: 'Small amounts keep the low end tight; large amounts smear the groove.' },
  guitar:       { label: 'Guitar',     maxMs: 0.65, best: 'picked or strummed guitar',   hint: 'Pick transients are protected, so only the decay is allowed to move.' },
  keyboard:     { label: 'Keys',       maxMs: 1.10, best: 'piano, Rhodes, organs',       hint: 'Sustained chords tolerate more drift than percussive parts.' },
  strings:      { label: 'Strings',    maxMs: 0.85, best: 'bowed string sections',       hint: 'Bow changes are treated as attacks, so the sustain carries the movement.' },
  synth:        { label: 'Synth',      maxMs: 1.25, best: 'pads and sustained synths',   hint: 'Long sustained notes can take the most drift with little audible cost.' },
  brass:        { label: 'Brass',      maxMs: 1.35, best: 'brass sections and swells',   hint: 'Ensemble material masks small timing differences well.' },
  woodwinds:    { label: 'Winds',      maxMs: 1.00, best: 'flute, clarinet, sax',        hint: 'Breath attacks are protected; phrasing benefits from slight drift.' },
  percussion:   { label: 'Perc',       maxMs: 0.70, best: 'shakers, congas, hand percussion', hint: 'Short hits need a tight ceiling or they turn into flams.' },
  fullMix:      { label: 'Full Mix',   maxMs: 0.75, best: 'mixed material you cannot split',  hint: 'Most restrained option — tiny movement, maximum safety.' }
};

// Conservative starting point: movement stays in the sustain, attacks are protected,
// and the blend is low enough that the effect reads as performance, not processing.
const DEFAULTS = {
  preset: 'leadVocal',
  looseness: 0.42,
  organic: 0.35,
  expression: 0.15,
  bias: 0.5,
  sensitivity: 0.5,
  releaseMs: 100,
  mix: 0.35
};

const SLIDERS = ['looseness', 'organic', 'bias', 'sensitivity', 'releaseMs', 'mix', 'expression'];

const STEP_TITLES = [
  'Load & listen',
  'Instrument preset',
  'Timing feel',
  'Transient protection',
  'Blend & expression',
  'Check & export'
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmtMs = (ms) => (ms < 0.01 ? '0.00 ms' : ms.toFixed(2) + ' ms');
const pct = (v) => Math.round(v * 100) + '%';

async function setup() {
  const audio = new AudioContext({ latencyHint: 'interactive' });
  await audio.audioWorklet.addModule('humanize-processor.js');

  const node = new AudioWorkletNode(audio, 'humanize-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });

  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  node.connect(analyser);
  analyser.connect(audio.destination);

  const levelData = new Float32Array(analyser.fftSize);

  // ---------------------------------------------------------------- element refs

  const $ = (id) => document.getElementById(id);
  const ui = {
    verBadge: $('verBadge'),
    buildInfo: $('buildInfo'),
    changelog: $('changelog'),
    enginePill: $('enginePill'),
    engineText: $('engineText'),
    bypassBtn: $('bypassBtn'),

    stepSelect: $('stepSelect'),
    prevStep: $('prevStep'),
    nextStep: $('nextStep'),
    stepProgress: $('stepProgress'),
    stepCount: $('stepCount'),

    fileIn: $('fileIn'),
    chooseFileBtn: $('chooseFileBtn'),
    micBtn: $('micBtn'),
    stopSrcBtn: $('stopSrcBtn'),

    wave: $('wave'),
    fileName: $('fileName'),
    fileSub: $('fileSub'),
    playBtn: $('playBtn'),
    pauseBtn: $('pauseBtn'),
    restartBtn: $('restartBtn'),
    loopChk: $('loopChk'),
    levelBar: $('levelBar'),

    presetSel: $('presetSel'),
    presetCeiling: $('presetCeiling'),
    presetBest: $('presetBest'),
    presetHint: $('presetHint'),

    infoFile: $('infoFile'),
    infoFormat: $('infoFormat'),
    infoLevel: $('infoLevel'),
    infoStatus: $('infoStatus'),
    srcWarnings: $('srcWarnings'),

    maxDelay: $('maxDelay'),
    avgDelay: $('avgDelay'),
    biasReadout: $('biasReadout'),
    timingHint: $('timingHint'),

    attackPct: $('attackPct'),
    attackBar: $('attackBar'),
    motionPct: $('motionPct'),
    motionBar: $('motionBar'),
    transientHint: $('transientHint'),

    riskLabel: $('riskLabel'),
    riskBar: $('riskBar'),
    exprDepth: $('exprDepth'),
    blendHint: $('blendHint'),

    exportBtn: $('exportBtn'),
    exportBtnMain: $('exportBtnMain'),
    exportFile: $('exportFile'),
    exportPreset: $('exportPreset'),
    exportTiming: $('exportTiming'),
    exportBlend: $('exportBlend'),
    exportOutput: $('exportOutput'),
    exportHint: $('exportHint'),
    chkOriginal: $('chkOriginal'),
    chkHumanized: $('chkHumanized'),
    chkRisk: $('chkRisk'),

    sessPreset: $('sessPreset'),
    sessTiming: $('sessTiming'),
    sessProtect: $('sessProtect'),
    sessBlend: $('sessBlend'),
    sessionBadge: $('sessionBadge'),
    applyDefaultBtn: $('applyDefaultBtn'),
    startBtn: $('startBtn'),
    status: $('status'),

    sliders: {}
  };
  SLIDERS.forEach((id) => { ui.sliders[id] = $(id); });

  // ---------------------------------------------------------------- state

  let micSource = null;
  let micStream = null;
  let fileSource = null;
  let currentFile = null;
  let currentBuffer = null;
  let peaks = null;

  let playState = 'stopped'; // stopped | playing | paused
  let playOffset = 0;
  let playStartedAt = 0;
  let suppressEnded = false;

  let bypassed = false;
  let bypassedMix = DEFAULTS.mix;

  let currentStep = 0;

  // ---------------------------------------------------------------- helpers

  function setStatus(text) { ui.status.textContent = text; }

  function setParam(name, value) {
    const p = node.parameters.get(name);
    if (p) p.setValueAtTime(value, audio.currentTime);
  }

  function values() {
    const v = { preset: ui.presetSel.value };
    SLIDERS.forEach((id) => { v[id] = Number(ui.sliders[id].value); });
    return v;
  }

  function timingModel(v) {
    const preset = PRESETS[v.preset] || PRESETS.leadVocal;
    const organicScale = 0.25 + 0.45 * v.organic;
    const looseMs = preset.maxMs * v.looseness;
    const maxExtra = looseMs * organicScale;           // upper bound of drift excursion
    const avgDelay = 3.2 + looseMs * 0.7;              // constant offset from the delay line
    const biasMs = (v.bias - 0.5) * looseMs * 0.9;     // positive = later / sluggish
    return { preset, looseMs, maxExtra, avgDelay, biasMs };
  }

  function riskScore(v, t) {
    return clamp(
      0.55 * v.mix +
      0.25 * Math.min(1, t.maxExtra / 1.5) +
      0.20 * v.expression,
      0, 1);
  }

  function riskWord(r) {
    if (r <= 0.25) return 'Very low';
    if (r <= 0.45) return 'Low';
    if (r <= 0.65) return 'Moderate';
    return 'High';
  }

  function riskClass(r) {
    if (r <= 0.25) return 'good';
    if (r <= 0.45) return 'good';
    if (r <= 0.65) return 'warn';
    return 'bad';
  }

  function exprDepthDb(expression) {
    return 20 * Math.log10(1 + 0.035 * expression);
  }

  // ---------------------------------------------------------------- step flow

  function showStep(index, focus) {
    currentStep = clamp(index, 0, STEP_TITLES.length - 1);
    document.querySelectorAll('.step').forEach((el) => {
      el.classList.toggle('on', Number(el.dataset.step) === currentStep);
    });
    ui.stepSelect.value = String(currentStep);
    ui.stepProgress.style.width = ((currentStep + 1) / STEP_TITLES.length) * 100 + '%';
    ui.stepCount.textContent = (currentStep + 1) + ' / ' + STEP_TITLES.length;
    ui.prevStep.disabled = currentStep === 0;
    ui.nextStep.disabled = currentStep === STEP_TITLES.length - 1;
    if (focus) {
      const h = document.querySelector('.step.on h2');
      if (h) {
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: true });
      }
    }
  }

  ui.stepSelect.addEventListener('change', () => showStep(Number(ui.stepSelect.value)));
  ui.prevStep.addEventListener('click', () => showStep(currentStep - 1, true));
  ui.nextStep.addEventListener('click', () => showStep(currentStep + 1, true));

  // ---------------------------------------------------------------- guidance

  function guidance(v, t, risk) {
    // timing
    let timingHint;
    if (v.looseness < 0.12) {
      timingHint = 'Almost no movement. Safe, but likely inaudible on anything busy.';
    } else if (t.maxExtra < 0.25) {
      timingHint = 'Subtle and safe: tails breathe a little without touching the groove.';
    } else if (t.maxExtra < 0.6) {
      timingHint = 'Noticeable on solo sustains, still locked inside a full arrangement.';
    } else if (t.maxExtra < 1.2) {
      timingHint = 'Strong — convincing on pads and ensembles, risky on sharp attacks.';
    } else {
      timingHint = 'Extreme for this preset. Expect audible smearing on transients.';
    }

    // feel
    let biasText;
    if (Math.abs(t.biasMs) < 0.02) biasText = 'Neutral (centered)';
    else if (t.biasMs > 0) biasText = '+' + t.biasMs.toFixed(2) + ' ms later (sluggish)';
    else biasText = t.biasMs.toFixed(2) + ' ms earlier (rushed)';

    // transient
    let transientHint;
    if (v.sensitivity < 0.3) {
      transientHint = 'Low protection: movement keeps running through attacks. Only for smooth material.';
    } else if (v.sensitivity < 0.65) {
      transientHint = 'Balanced: clear attacks are protected, sustain stays free to move.';
    } else {
      transientHint = 'High protection: attacks are locked down. On dense stems the effect may barely engage.';
    }
    if (v.releaseMs < 60) transientHint += ' Release is short, so movement returns quickly.';
    else if (v.releaseMs > 200) transientHint += ' Release is long, so busy stems can stay settled.';

    // blend
    let blendHint;
    if (v.mix < 0.18) blendHint = 'Very subtle — close to a no-op. Fine for safety, easy to lose.';
    else if (v.mix < 0.45) blendHint = 'Recommended transparency: felt more than heard on most stems.';
    else if (v.mix < 0.7) blendHint = 'Strong blend. Listen for doubled attacks and comb-filtering.';
    else blendHint = 'Very wet. Expect clearly audible smearing on percussive material.';

    const depth = exprDepthDb(v.expression);
    const depthText = (depth < 0.01 ? '0.00' : depth.toFixed(2)) + ' dB max';

    return { timingHint, biasText, transientHint, blendHint, depthText, riskWord: riskWord(risk) };
  }

  // ---------------------------------------------------------------- update all

  function updateAll() {
    const v = values();
    const t = timingModel(v);
    const risk = riskScore(v, t);
    const g = guidance(v, t, risk);

    // worklet parameters
    setParam('preset', Object.keys(PRESETS).indexOf(v.preset) / 11);
    SLIDERS.forEach((id) => setParam(id, bypassed && id === 'mix' ? 0 : v[id]));

    // slider readouts
    ui.sliders.looseness.parentElement.querySelector('.val').textContent = v.looseness.toFixed(2);
    ui.sliders.organic.parentElement.querySelector('.val').textContent = v.organic.toFixed(2);
    ui.sliders.bias.parentElement.querySelector('.val').textContent = v.bias.toFixed(2);
    ui.sliders.sensitivity.parentElement.querySelector('.val').textContent = v.sensitivity.toFixed(2);
    ui.sliders.releaseMs.parentElement.querySelector('.val').textContent = Math.round(v.releaseMs);
    ui.sliders.mix.parentElement.querySelector('.val').textContent = v.mix.toFixed(2);
    ui.sliders.expression.parentElement.querySelector('.val').textContent = v.expression.toFixed(2);

    // preset step
    ui.presetCeiling.textContent = fmtMs(t.preset.maxMs);
    ui.presetBest.textContent = t.preset.best;
    ui.presetHint.textContent = t.preset.hint;

    // timing step
    ui.maxDelay.textContent = fmtMs(t.maxExtra);
    ui.avgDelay.textContent = fmtMs(t.avgDelay);
    ui.biasReadout.textContent = g.biasText;
    ui.timingHint.textContent = g.timingHint;

    // transient step
    ui.transientHint.textContent = g.transientHint;

    // blend step
    ui.riskLabel.textContent = g.riskWord + ' · ' + pct(risk);
    ui.riskBar.style.width = pct(risk);
    ui.exprDepth.textContent = g.depthText;
    ui.blendHint.textContent = g.blendHint;

    // session card
    ui.sessPreset.textContent = t.preset.label;
    ui.sessTiming.textContent = fmtMs(t.maxExtra);
    ui.sessProtect.textContent = pct(v.sensitivity) + ' · ' + Math.round(v.releaseMs) + ' ms';
    ui.sessBlend.textContent = v.mix.toFixed(2) + ' / ' + v.expression.toFixed(2);
    ui.sessionBadge.textContent = g.riskWord.toLowerCase() + ' risk';
    ui.sessionBadge.className = 'badge ' + riskClass(risk);

    // export step
    ui.exportFile.textContent = currentFile ? currentFile.name : 'No file loaded';
    ui.exportPreset.textContent = t.preset.label;
    ui.exportTiming.textContent = 'up to ' + fmtMs(t.maxExtra) + ' · ' + Math.round(v.looseness * 100) + '% loose';
    ui.exportBlend.textContent = 'mix ' + v.mix.toFixed(2) + ' · expr ' + v.expression.toFixed(2);
    ui.chkRisk.textContent = g.riskWord + ' · ' + pct(risk);
    ui.chkOriginal.textContent = currentFile ? currentFile.name : '—';
    ui.chkHumanized.textContent = currentBuffer
      ? estimatedName() + ' · ' + fmtMs(t.maxExtra) + ' movement'
      : '—';
  }

  SLIDERS.forEach((id) => {
    ui.sliders[id].addEventListener('input', updateAll);
    ui.sliders[id].addEventListener('change', updateAll);
  });
  ui.sliders.mix.addEventListener('input', () => {
    // Remember a new blend while A/B is bypassed, so returning to processed uses it.
    if (bypassed) bypassedMix = Number(ui.sliders.mix.value);
  });
  ui.presetSel.addEventListener('change', () => { updateAll(); setStatus('Preset set to ' + PRESETS[ui.presetSel.value].label + '.'); });

  // ---------------------------------------------------------------- engine state

  function syncEngine() {
    const running = audio.state === 'running';
    ui.enginePill.classList.toggle('live', running);
    ui.enginePill.classList.toggle('suspended', !running);
    ui.engineText.textContent = running ? 'Engine running' : 'Engine idle';
    ui.startBtn.textContent = running ? 'Suspend audio' : 'Start audio';
    ui.startBtn.classList.toggle('primary', !running);
  }

  audio.addEventListener('statechange', syncEngine);

  ui.startBtn.addEventListener('click', async () => {
    try {
      if (audio.state === 'running') {
        await audio.suspend();
        setStatus('Audio suspended — release to resume.');
      } else {
        await audio.resume();
        setStatus('Audio running.');
      }
      syncEngine();
    } catch (err) {
      setStatus('Could not change audio state: ' + err.message);
    }
  });

  // ---------------------------------------------------------------- A/B bypass

  function syncBypass() {
    ui.bypassBtn.textContent = bypassed ? 'A/B: original' : 'A/B: processed';
    ui.bypassBtn.classList.toggle('active', bypassed);
  }

  ui.bypassBtn.addEventListener('click', () => {
    const v = values();
    if (!bypassed) {
      bypassedMix = v.mix;
      bypassed = true;
      setParam('mix', 0);
      setStatus('A/B: hearing the original stem (mix bypassed).');
    } else {
      bypassed = false;
      setParam('mix', bypassedMix);
      setStatus('A/B: back to the humanized blend.');
    }
    syncBypass();
  });

  // ---------------------------------------------------------------- transport

  function stopSourceNode() {
    if (!fileSource) return;
    suppressEnded = true;
    try { fileSource.onended = null; fileSource.stop(); } catch (_) {}
    try { fileSource.disconnect(); } catch (_) {}
    fileSource = null;
    suppressEnded = false;
  }

  function position() {
    if (!currentBuffer) return 0;
    if (playState !== 'playing') return playOffset;
    const elapsed = playOffset + (audio.currentTime - playStartedAt);
    return ui.loopChk.checked ? elapsed % currentBuffer.duration : Math.min(elapsed, currentBuffer.duration);
  }

  function startSource(offset) {
    if (!currentBuffer) {
      setStatus('Load an audio file first.');
      return;
    }
    stopSourceNode();
    playOffset = clamp(offset, 0, Math.max(0, currentBuffer.duration - 0.001));

    fileSource = audio.createBufferSource();
    fileSource.buffer = currentBuffer;
    fileSource.loop = ui.loopChk.checked;
    fileSource.connect(node);

    fileSource.onended = () => {
      if (suppressEnded) return;
      playState = 'stopped';
      playOffset = 0;
      syncTransport();
      setStatus('Playback finished.');
    };

    fileSource.start(0, playOffset);
    playStartedAt = audio.currentTime;
    playState = 'playing';
    syncTransport();
    if (audio.state !== 'running') audio.resume().catch(() => {});
  }

  function pauseSource() {
    if (playState !== 'playing') return;
    playOffset = position();
    stopSourceNode();
    playState = 'paused';
    syncTransport();
    setStatus('Paused at ' + playOffset.toFixed(2) + ' s.');
  }

  function syncTransport() {
    const has = !!currentBuffer;
    ui.playBtn.disabled = !has || playState === 'playing';
    ui.pauseBtn.disabled = !has || playState !== 'playing';
    ui.restartBtn.disabled = !has;
    ui.playBtn.textContent = playState === 'paused' ? 'Resume' : 'Play';
  }

  ui.playBtn.addEventListener('click', () => {
    startSource(playState === 'paused' ? playOffset : playOffset);
    setStatus('Playing.');
  });

  ui.pauseBtn.addEventListener('click', pauseSource);

  ui.restartBtn.addEventListener('click', () => {
    playOffset = 0;
    startSource(0);
    setStatus('Restarted from the beginning.');
  });

  ui.loopChk.addEventListener('change', () => {
    if (playState === 'playing') startSource(position());
  });

  ui.stopSrcBtn.addEventListener('click', () => {
    stopSourceNode();
    playState = 'stopped';
    playOffset = 0;
    if (micSource) { try { micSource.disconnect(); } catch (_) {} micSource = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    syncTransport();
    setStatus('Source stopped.');
  });

  // ---------------------------------------------------------------- file load

  function computePeaks(buffer, bins) {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const out = new Float32Array(bins);
    const step = length / bins;
    for (let b = 0; b < bins; b++) {
      const start = Math.floor(b * step);
      const end = Math.min(length, Math.floor((b + 1) * step));
      let max = 0;
      const stride = Math.max(1, Math.floor((end - start) / 96));
      for (let i = start; i < end; i += stride) {
        for (let c = 0; c < channels; c++) {
          const v = Math.abs(buffer.getChannelData(c)[i]);
          if (v > max) max = v;
        }
      }
      out[b] = max;
    }
    return out;
  }

  function peakDb(buffer) {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += 7) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
    }
    return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  }

  function analyze(buffer, file) {
    const duration = buffer.duration;
    const channels = buffer.numberOfChannels === 1 ? 'mono' : buffer.numberOfChannels + ' ch';
    const rate = (buffer.sampleRate / 1000).toFixed(1) + ' kHz';
    const db = peakDb(buffer);

    ui.infoFile.textContent = file ? file.name : 'Microphone';
    ui.infoFormat.textContent = rate + ' · ' + channels + ' · ' + duration.toFixed(2) + ' s';
    ui.infoLevel.textContent = isFinite(db) ? db.toFixed(1) + ' dBFS peak' + (db > -0.1 ? ' (clipping)' : '') : 'silent';
    ui.infoStatus.textContent = 'Ready';

    const warnings = [];
    if (isFinite(db) && db > -0.1) {
      warnings.push('The file peaks at 0 dBFS. Timing movement can push it over — lower the source by about 0.5 dB before exporting.');
    }
    if (isFinite(db) && db < -30) {
      warnings.push('The file is very quiet (peak below −30 dBFS). Check that you loaded the right stem.');
    }
    if (duration > 900) {
      warnings.push('This is a long file (' + (duration / 60).toFixed(1) + ' min). Export still works, but rendering and decoding will take longer.');
    }
    if (buffer.sampleRate < 44100) {
      warnings.push('Sample rate is below 44.1 kHz, so high-frequency detail is limited before processing.');
    }
    if (file && /\.(mp3|m4a|aac|ogg|opus)$/i.test(file.name)) {
      warnings.push('This is a lossy source. Use the original WAV or FLAC render when you can — re-encoding adds its own artifacts.');
    }

    ui.srcWarnings.innerHTML = warnings.map((w) =>
      '<div class="callout warn"><span class="ico">&#9888;</span><span>' + w + '</span></div>'
    ).join('');

    ui.fileName.textContent = file ? file.name : 'Microphone';
    ui.fileSub.textContent = rate + ' · ' + channels + ' · ' + duration.toFixed(2) + ' s';
  }

  ui.chooseFileBtn.addEventListener('click', () => ui.fileIn.click());

  ui.fileIn.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    await loadFile(file);
  });

  async function loadFile(file) {
    setStatus('Decoding ' + file.name + '…');
    try {
      // stop mic if live
      if (micSource) { try { micSource.disconnect(); } catch (_) {} micSource = null; }
      if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }

      const bytes = await file.arrayBuffer();
      const buffer = await audio.decodeAudioData(bytes);

      currentFile = file;
      currentBuffer = buffer;
      peaks = computePeaks(buffer, 420);
      playOffset = 0;
      playState = 'stopped';

      analyze(buffer, file);
      updateAll();
      startSource(0);
      setStatus('Loaded ' + file.name + ' — playing. Use A/B to compare.');
    } catch (err) {
      currentBuffer = null;
      peaks = null;
      playState = 'stopped';
      ui.infoStatus.textContent = 'Could not decode';
      syncTransport();
      setStatus('Could not load file: ' + err.message);
      console.error(err);
    }
  }

  ui.micBtn.addEventListener('click', async () => {
    try {
      stopSourceNode();
      playState = 'stopped';
      playOffset = 0;
      if (micSource) { try { micSource.disconnect(); } catch (_) {} micSource = null; }
      if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }

      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micSource = audio.createMediaStreamSource(micStream);
      micSource.connect(node);
      if (audio.state !== 'running') await audio.resume();

      ui.infoFile.textContent = 'Microphone';
      ui.infoFormat.textContent = 'live input';
      ui.infoLevel.textContent = 'live';
      ui.infoStatus.textContent = 'Listening';
      ui.fileName.textContent = 'Microphone (live)';
      ui.fileSub.textContent = 'Live monitoring — export needs a file';
      ui.srcWarnings.innerHTML = '<div class="callout warn"><span class="ico">&#9888;</span><span>Live input cannot be exported. Load a file to render a WAV.</span></div>';
      syncEngine();
      setStatus('Microphone live.');
    } catch (err) {
      setStatus('Microphone error: ' + err.message);
    }
  });

  // ---------------------------------------------------------------- meters (from worklet)

  node.port.onmessage = (event) => {
    const data = event.data;
    if (!data || data.type !== 'meter') return;
    const attack = clamp(data.attack, 0, 1);
    const motion = clamp(data.motion, 0, 1);
    ui.attackBar.style.width = pct(attack);
    ui.attackPct.textContent = pct(attack);
    ui.motionBar.style.width = pct(motion);
    ui.motionPct.textContent = pct(motion);
  };

  // ---------------------------------------------------------------- animation

  function drawWave() {
    const canvas = ui.wave;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 84;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!peaks) {
      ctx.strokeStyle = 'rgba(140, 155, 180, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, h / 2);
      ctx.lineTo(w - 8, h / 2);
      ctx.stroke();
      return;
    }

    const mid = h / 2;
    const pos = currentBuffer ? position() / currentBuffer.duration : 0;
    const binW = w / peaks.length;

    for (let i = 0; i < peaks.length; i++) {
      const amp = Math.max(0.6, peaks[i] * (h * 0.42));
      const x = i * binW;
      const played = (i / peaks.length) <= pos;
      ctx.fillStyle = played ? 'rgba(90, 162, 255, 0.92)' : 'rgba(126, 146, 176, 0.42)';
      ctx.fillRect(x, mid - amp, Math.max(1, binW * 0.62), amp * 2);
    }

    if (pos > 0 && pos < 1) {
      ctx.fillStyle = 'rgba(235, 245, 255, 0.9)';
      ctx.fillRect(pos * w, 4, 1.5, h - 8);
    }
  }

  function tick() {
    drawWave();

    analyser.getFloatTimeDomainData(levelData);
    let sum = 0;
    for (let i = 0; i < levelData.length; i++) sum += levelData[i] * levelData[i];
    const rms = Math.sqrt(sum / levelData.length);
    const level = clamp((20 * Math.log10(rms + 1e-6) + 60) / 60, 0, 1);
    ui.levelBar.style.width = pct(level);

    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- export

  function estimatedName() {
    const base = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'stem';
    return base + '-humanized.wav';
  }

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

  let exporting = false;

  async function exportWav() {
    if (!currentBuffer) {
      setStatus('Load an audio file first — export renders the loaded file offline.');
      showStep(0, true);
      return;
    }
    if (exporting) return;

    exporting = true;
    const buttons = [ui.exportBtn, ui.exportBtnMain];
    const labels = buttons.map((b) => b.textContent);
    buttons.forEach((b) => { b.disabled = true; b.textContent = 'Rendering…'; });
    ui.exportHint.textContent = 'Rendering offline…';
    setStatus('Rendering ' + estimatedName() + '…');

    try {
      const channels = currentBuffer.numberOfChannels;
      const sampleRate = currentBuffer.sampleRate || audio.sampleRate;
      const v = values();

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

      const paramValues = { preset: Object.keys(PRESETS).indexOf(v.preset) / 11 };
      SLIDERS.forEach((id) => { paramValues[id] = v[id]; });

      Object.keys(paramValues).forEach((name) => {
        const param = renderNode.parameters.get(name);
        if (param) param.value = paramValues[name];
      });

      renderSource.start(0);
      const rendered = await offline.startRendering();
      const wav = encodeWav(rendered, sampleRate);

      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = estimatedName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const mb = (wav.byteLength / 1048576).toFixed(1);
      ui.exportOutput.textContent = estimatedName() + ' · ' + mb + ' MB · 16-bit PCM';
      ui.exportHint.textContent = 'Done — check your Downloads folder.';
      setStatus('Exported ' + link.download + ' (' + mb + ' MB).');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error(err);
      ui.exportHint.textContent = 'Export failed.';
      setStatus('Export failed: ' + err.message);
    } finally {
      exporting = false;
      buttons.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; });
    }
  }

  ui.exportBtn.addEventListener('click', exportWav);
  ui.exportBtnMain.addEventListener('click', exportWav);

  // ---------------------------------------------------------------- defaults

  function applyDefaults(announce) {
    ui.presetSel.value = DEFAULTS.preset;
    SLIDERS.forEach((id) => { ui.sliders[id].value = DEFAULTS[id]; });
    bypassed = false;
    syncBypass();
    updateAll();
    if (announce) {
      setStatus('Applied recommended defaults: subtle movement, protected attacks, 35% blend.');
      showStep(2, true);
    }
  }

  ui.applyDefaultBtn.addEventListener('click', () => applyDefaults(true));

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

  // ---------------------------------------------------------------- boot

  applyDefaults(false);
  showStep(0);
  syncEngine();
  syncTransport();
  syncBypass();
  updateAll();
  loadVersion();
  requestAnimationFrame(tick);

  window.__humanize = { audio, node, showStep, exportWav, applyDefaults };
}

window.addEventListener('load', () => {
  setup().catch((err) => {
    const status = document.getElementById('status');
    if (status) status.textContent = 'Failed to start the audio engine: ' + err.message;
    console.error(err);
  });
});
