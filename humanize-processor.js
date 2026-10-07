class HumanizeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'preset', defaultValue: 0.0, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'looseness', defaultValue: 0.38, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'organic', defaultValue: 0.35, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'expression', defaultValue: 0.25, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'bias', defaultValue: 0.5, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'sensitivity', defaultValue: 0.45, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'releaseMs', defaultValue: 90, minValue: 20, maxValue: 500, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.38, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.sampleRate = sampleRate;
    this.maxDelayMs = 0.02;
    this.maxDelaySamples = Math.ceil(this.sampleRate * this.maxDelayMs) + 16;
    this.delayLineL = new Float32Array(this.maxDelaySamples);
    this.delayLineR = new Float32Array(this.maxDelaySamples);
    this.writeIndex = 0;

    // Transient detector state
    this.fastEnv = 0;
    this.slowEnv = 0;
    this.heldAttack = 0;

    // Noise generators (simple LCG) for smooth lowpassed drift
    this.rngA = 123456789;
    this.rngB = 362436069;

    // LPF state for drift
    this.driftALP = 0;
    this.driftBLP = 0;

    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'setSampleRate') {
        this.sampleRate = e.data.value;
        const newMax = Math.ceil(this.sampleRate * 0.02) + 16;
        if (newMax > this.maxDelaySamples) {
          this.delayLineL = new Float32Array(newMax);
          this.delayLineR = new Float32Array(newMax);
          this.maxDelaySamples = newMax;
        }
      }
    };
  }

  nextRng(v) {
    // Xorshift-ish LCG
    v ^= (v << 13);
    v ^= (v >>> 17);
    v ^= (v << 5);
    return v >>> 0;
  }

  rand01(v) {
    const nv = this.nextRng(v);
    return (nv & 0x7fffffff) / 0x7fffffff; // 0..1
  }

  lp1(x, prev, cutoffHz, sr) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sr;
    const a = dt / (rc + dt);
    return prev + a * (x - prev);
  }

  // very cheap 2-pole-ish smoothing via double LP1
  lp2(x, prev, cutoffHz, sr) {
    const p1 = this.lp1(x, prev, cutoffHz, sr);
    return this.lp1(p1, prev === 0 ? p1 : ( (prev + p1)/2 ), cutoffHz * 0.9, sr); // rough
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const inL = input[0];
    const inR = input[1] || inL;
    const outL = output[0];
    const outR = output[1] || output[0];

    const sr = this.sampleRate;

    // Params (arrays, use [0])
    const preset = parameters['preset']?.[0] ?? 0.0; // 0..11 index mapped
    const looseness = parameters['looseness']?.[0] ?? 0.38;
    const organic = parameters['organic']?.[0] ?? 0.35;
    const expression = parameters['expression']?.[0] ?? 0.25;
    const bias = parameters['bias']?.[0] ?? 0.5; // 0..1
    const sensitivity = parameters['sensitivity']?.[0] ?? 0.45;
    const releaseMs = parameters['releaseMs']?.[0] ?? 90;
    const mixAmt = parameters['mix']?.[0] ?? 0.38;

    // Preset max ms
    const presetMsList = [0.9, 1.4, 0.55, 0.8, 0.65, 1.1, 0.85, 1.25, 1.35, 1.0, 0.7, 0.75];
    // map continuous? preset comes as index value 0-11 approx via enum; use nearest
    const pIdx = Math.max(0, Math.min(11, Math.round(preset * 11)));
    const presetMs = presetMsList[pIdx] ?? 0.9;

    const msToSamps = sr / 1000;

    // Transient
    const coefFastAtk = 0.08;
    const coefFastRel = 0.002;
    const coefSlowAtk = 0.006;
    const coefSlowRel = 0.0005;
    const block = inL.length;
    for (let i = 0; i < block; i++) {
      const l = inL[i];
      const r = inR[i];
      const lvl = Math.max(Math.abs(l), Math.abs(r));

      // env
      if (lvl > this.fastEnv) this.fastEnv += coefFastAtk * (lvl - this.fastEnv);
      else this.fastEnv += coefFastRel * (lvl - this.fastEnv);
      if (lvl > this.slowEnv) this.slowEnv += coefSlowAtk * (lvl - this.slowEnv);
      else this.slowEnv += coefSlowRel * (lvl - this.slowEnv);

      const onset = Math.max(0, this.fastEnv - this.slowEnv);
      const thresh = 0.22 + (0.006 - 0.22) * sensitivity; // scale approx
      const attackMask = onset > thresh ? 1 : 0;

      // held attack
      const relSamples = Math.max(1, releaseMs * msToSamps);
      const relCoefHeld = 1 / relSamples;
      this.heldAttack = attackMask > this.heldAttack ? attackMask : this.heldAttack * (1 - relCoefHeld);
      const motionOpen = 1 - Math.min(1, this.heldAttack * 0.82);

      // drift noise
      this.rngA = this.nextRng(this.rngA);
      this.rngB = this.nextRng(this.rngB);
      const nA = ((this.rngA & 0x7fffffff) / 0x7fffffff) * 2 - 1;
      const nB = ((this.rngB & 0x7fffffff) / 0x7fffffff) * 2 - 1;

      const cutoffDrift = 0.36;
      this.driftALP = this.lp1(nA, this.driftALP, cutoffDrift, sr);
      this.driftBLP = this.lp1(nB, this.driftBLP, cutoffDrift, sr);

      const organicScale = 0.25 + (0.7 - 0.25) * organic;
      const looseMs = presetMs * looseness;
      const driftMsA = this.driftALP * organicScale * looseMs;
      const driftMsB = this.driftBLP * organicScale * looseMs;
      const biasMs = (bias - 0.5) * looseMs * 0.9;
      const baseMs = 3.2 + looseMs * 0.7;
      const delayMsA = baseMs + motionOpen * (driftMsA + biasMs);
      const delayMsB = baseMs + motionOpen * (driftMsB + biasMs);

      const dA = Math.max(1, Math.min(this.maxDelaySamples - 2, delayMsA * msToSamps));
      const dB = Math.max(1, Math.min(this.maxDelaySamples - 2, delayMsB * msToSamps));

      // read
      const readA = (this.writeIndex - Math.floor(dA) + this.maxDelaySamples) % this.maxDelaySamples;
      const readB = (this.writeIndex - Math.floor(dB) + this.maxDelaySamples) % this.maxDelaySamples;
      const fracA = dA - Math.floor(dA);
      const fracB = dB - Math.floor(dB);
      const rA1 = this.delayLineL[readA];
      const rA2 = this.delayLineL[(readA + 1) % this.maxDelaySamples];
      const rB1 = this.delayLineR[readB];
      const rB2 = this.delayLineR[(readB + 1) % this.maxDelaySamples];
      const hL = rA1 + fracA * (rA2 - rA1);
      const hR = rB1 + fracB * (rB2 - rB1);

      // write
      this.delayLineL[this.writeIndex] = l;
      this.delayLineR[this.writeIndex] = r;
      this.writeIndex = (this.writeIndex + 1) % this.maxDelaySamples;

      const exprM = 1 + this.driftALP * (expression * 0.035);
      const vL = hL * exprM;
      const vR = hR * exprM;

      outL[i] = l * (1 - mixAmt) + vL * mixAmt;
      outR[i] = r * (1 - mixAmt) + vR * mixAmt;
    }
    return true;
  }
}

registerProcessor('humanize-processor', HumanizeProcessor);
