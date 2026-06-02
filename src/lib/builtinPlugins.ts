export interface BuiltinPluginDef {
  id: string;
  name: string;
  vendor: string;
  category: string;
  description: string;
  params: PluginParam[];
  createNode: (ctx: AudioContext) => BuiltinPluginNode;
}

export interface PluginParam {
  id: string;
  name: string;
  min: number;
  max: number;
  default: number;
  unit: string;
  step?: number;
}

export interface BuiltinPluginNode {
  input: AudioNode;
  output: AudioNode;
  setParam: (id: string, value: number) => void;
  destroy: () => void;
}

// ── EQ — 3-band parametric equalizer ─────────────────────────────────────────
function createEQ(ctx: AudioContext): BuiltinPluginNode {
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 200;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 1;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 8000;

  low.connect(mid);
  mid.connect(high);

  return {
    input: low,
    output: high,
    setParam(id, value) {
      if (id === "low_gain") low.gain.value = value;
      if (id === "mid_gain") mid.gain.value = value;
      if (id === "high_gain") high.gain.value = value;
      if (id === "mid_freq") mid.frequency.value = value;
    },
    destroy() {
      low.disconnect();
      mid.disconnect();
      high.disconnect();
    },
  };
}

// ── Compressor — dynamics control ─────────────────────────────────────────────
function createCompressor(ctx: AudioContext): BuiltinPluginNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;

  return {
    input: comp,
    output: comp,
    setParam(id, value) {
      if (id === "threshold") comp.threshold.value = value;
      if (id === "ratio") comp.ratio.value = value;
      if (id === "attack") comp.attack.value = value;
      if (id === "release") comp.release.value = value;
      if (id === "knee") comp.knee.value = value;
    },
    destroy() { comp.disconnect(); },
  };
}

// ── Reverb — algorithmic (generated impulse response) ────────────────────────
function generateImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function createReverb(ctx: AudioContext): BuiltinPluginNode {
  const convolver = ctx.createConvolver();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const input = ctx.createGain();
  const output = ctx.createGain();

  dry.gain.value = 0.7;
  wet.gain.value = 0.3;

  convolver.buffer = generateImpulse(ctx, 2.5, 3);

  input.connect(dry);
  input.connect(convolver);
  convolver.connect(wet);
  dry.connect(output);
  wet.connect(output);

  return {
    input,
    output,
    setParam(id, value) {
      if (id === "wet") wet.gain.value = value;
      if (id === "dry") dry.gain.value = value;
      if (id === "decay") {
        convolver.buffer = generateImpulse(ctx, value, 3);
      }
    },
    destroy() {
      input.disconnect();
      convolver.disconnect();
      dry.disconnect();
      wet.disconnect();
    },
  };
}

// ── Delay — tempo-synced echo ─────────────────────────────────────────────────
function createDelay(ctx: AudioContext): BuiltinPluginNode {
  const input = ctx.createGain();
  const delay = ctx.createDelay(2.0);
  const feedback = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const output = ctx.createGain();

  delay.delayTime.value = 0.25;
  feedback.gain.value = 0.35;
  dry.gain.value = 0.8;
  wet.gain.value = 0.4;

  input.connect(dry);
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  dry.connect(output);
  wet.connect(output);

  return {
    input,
    output,
    setParam(id, value) {
      if (id === "time") delay.delayTime.value = value;
      if (id === "feedback") feedback.gain.value = value;
      if (id === "wet") wet.gain.value = value;
    },
    destroy() {
      input.disconnect();
      delay.disconnect();
      feedback.disconnect();
      dry.disconnect();
      wet.disconnect();
    },
  };
}

// ── Distortion — waveshaper saturation ───────────────────────────────────────
function makeDistortionCurve(amount: number): Float32Array {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function createDistortion(ctx: AudioContext): BuiltinPluginNode {
  const waveshaper = ctx.createWaveShaper();
  const preGain = ctx.createGain();
  const postGain = ctx.createGain();

  preGain.gain.value = 2;
  postGain.gain.value = 0.7;
  waveshaper.curve = makeDistortionCurve(200);
  waveshaper.oversample = "4x";

  preGain.connect(waveshaper);
  waveshaper.connect(postGain);

  return {
    input: preGain,
    output: postGain,
    setParam(id, value) {
      if (id === "drive") {
        preGain.gain.value = 1 + value * 4;
        waveshaper.curve = makeDistortionCurve(value * 400);
      }
      if (id === "output") postGain.gain.value = value;
    },
    destroy() {
      preGain.disconnect();
      waveshaper.disconnect();
      postGain.disconnect();
    },
  };
}

// ── Chorus — LFO modulated delay ─────────────────────────────────────────────
function createChorus(ctx: AudioContext): BuiltinPluginNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const delay = ctx.createDelay(0.05);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const wet = ctx.createGain();
  const dry = ctx.createGain();

  delay.delayTime.value = 0.025;
  lfo.frequency.value = 1.5;
  lfoGain.gain.value = 0.003;
  wet.gain.value = 0.5;
  dry.gain.value = 0.8;

  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  lfo.start();

  input.connect(dry);
  input.connect(delay);
  delay.connect(wet);
  dry.connect(output);
  wet.connect(output);

  return {
    input,
    output,
    setParam(id, value) {
      if (id === "rate") lfo.frequency.value = value;
      if (id === "depth") lfoGain.gain.value = value * 0.005;
      if (id === "wet") wet.gain.value = value;
    },
    destroy() {
      lfo.stop();
      lfo.disconnect();
      lfoGain.disconnect();
      input.disconnect();
      delay.disconnect();
      wet.disconnect();
      dry.disconnect();
    },
  };
}

// ── Plugin registry ───────────────────────────────────────────────────────────
export const BUILTIN_PLUGINS: BuiltinPluginDef[] = [
  {
    id: "builtin-eq",
    name: "322.EQ",
    vendor: "322.STUDIO",
    category: "EQ",
    description: "3-band parametric equalizer",
    params: [
      { id: "low_gain", name: "Low Gain", min: -12, max: 12, default: 0, unit: "dB" },
      { id: "mid_gain", name: "Mid Gain", min: -12, max: 12, default: 0, unit: "dB" },
      { id: "mid_freq", name: "Mid Freq", min: 200, max: 8000, default: 1000, unit: "Hz" },
      { id: "high_gain", name: "High Gain", min: -12, max: 12, default: 0, unit: "dB" },
    ],
    createNode: createEQ,
  },
  {
    id: "builtin-comp",
    name: "322.COMP",
    vendor: "322.STUDIO",
    category: "Dynamics",
    description: "Dynamics compressor",
    params: [
      { id: "threshold", name: "Threshold", min: -60, max: 0, default: -24, unit: "dB" },
      { id: "ratio", name: "Ratio", min: 1, max: 20, default: 4, unit: ":1" },
      { id: "attack", name: "Attack", min: 0.001, max: 0.5, default: 0.003, unit: "s", step: 0.001 },
      { id: "release", name: "Release", min: 0.01, max: 2, default: 0.2, unit: "s", step: 0.01 },
    ],
    createNode: createCompressor,
  },
  {
    id: "builtin-reverb",
    name: "322.VERB",
    vendor: "322.STUDIO",
    category: "Reverb",
    description: "Algorithmic reverb",
    params: [
      { id: "decay", name: "Decay", min: 0.1, max: 10, default: 2.5, unit: "s", step: 0.1 },
      { id: "wet", name: "Wet", min: 0, max: 1, default: 0.3, unit: "", step: 0.01 },
      { id: "dry", name: "Dry", min: 0, max: 1, default: 0.7, unit: "", step: 0.01 },
    ],
    createNode: createReverb,
  },
  {
    id: "builtin-delay",
    name: "322.DELAY",
    vendor: "322.STUDIO",
    category: "Delay",
    description: "Echo delay with feedback",
    params: [
      { id: "time", name: "Time", min: 0.01, max: 2, default: 0.25, unit: "s", step: 0.01 },
      { id: "feedback", name: "Feedback", min: 0, max: 0.95, default: 0.35, unit: "", step: 0.01 },
      { id: "wet", name: "Wet", min: 0, max: 1, default: 0.4, unit: "", step: 0.01 },
    ],
    createNode: createDelay,
  },
  {
    id: "builtin-dist",
    name: "322.DIST",
    vendor: "322.STUDIO",
    category: "Distortion",
    description: "Waveshaper saturation/distortion",
    params: [
      { id: "drive", name: "Drive", min: 0, max: 1, default: 0.3, unit: "", step: 0.01 },
      { id: "output", name: "Output", min: 0, max: 1, default: 0.7, unit: "", step: 0.01 },
    ],
    createNode: createDistortion,
  },
  {
    id: "builtin-chorus",
    name: "322.CHORUS",
    vendor: "322.STUDIO",
    category: "Modulation",
    description: "Chorus / ensemble effect",
    params: [
      { id: "rate", name: "Rate", min: 0.1, max: 10, default: 1.5, unit: "Hz", step: 0.1 },
      { id: "depth", name: "Depth", min: 0, max: 1, default: 0.5, unit: "", step: 0.01 },
      { id: "wet", name: "Wet", min: 0, max: 1, default: 0.5, unit: "", step: 0.01 },
    ],
    createNode: createChorus,
  },
];
