/**
 * 322.BOOTH — Pitch Correction AudioWorklet Processor
 * Runs in the audio thread (separate OS-level thread from the UI).
 * 
 * Algorithm:
 *  1. Autocorrelation pitch detection (simplified YIN) every 512 samples
 *  2. Snap detected pitch to nearest note in the selected scale
 *  3. Apply pitch shift via PSOLA-inspired overlap-add interpolation
 */

const FRAME = 1024;
const HOP   = 512;
const MIN_HZ = 70;
const MAX_HZ = 1400;
const RING   = FRAME * 8;

const SCALES = {
  chromatic: [0,1,2,3,4,5,6,7,8,9,10,11],
  major:     [0,2,4,5,7,9,11],
  minor:     [0,2,3,5,7,8,10],
  pentatonic:[0,2,4,7,9],
  dorian:    [0,2,3,5,7,9,10],
};

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

/** Generate a Hann window of length n */
function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffers
    this._inRing  = new Float32Array(RING);
    this._outRing = new Float32Array(RING);
    this._outGain = new Float32Array(RING); // accumulator for OLA normalization

    this._writeHead = FRAME;   // write pointer (inRing)
    this._readHead  = 0.0;     // fractional read pointer (for output)
    this._outWrite  = 0;       // OLA output write pointer
    this._outRead   = 0;       // output read pointer

    this._hopCounter = 0;
    this._pitchRatio = 1.0;
    this._lastRatio  = 1.0;

    // User-controlled params
    this._strength = 0.85;
    this._scale    = SCALES.chromatic;
    this._root     = 0;
    this._active   = true;
    this._speed    = 0.12; // correction speed (0=instant, 1=very slow)

    this._window = hann(FRAME);
    this._sr = 48000; // will be overridden by sampleRate global

    // Post detected pitch to UI every N blocks to avoid flooding
    this._uiCounter = 0;
    this._lastFreq  = 0;
    this._lastTarget= 0;

    this.port.onmessage = ({ data }) => {
      if (data.strength !== undefined) this._strength = Math.max(0, Math.min(1, data.strength));
      if (data.scale    !== undefined) this._scale    = SCALES[data.scale] || SCALES.chromatic;
      if (data.root     !== undefined) this._root     = ((data.root % 12) + 12) % 12;
      if (data.active   !== undefined) this._active   = data.active;
      if (data.speed    !== undefined) this._speed    = Math.max(0.01, Math.min(0.99, data.speed));
    };
  }

  // ── Pitch detection ────────────────────────────────────────────────────────
  _detectPitch(frame) {
    const sr = sampleRate || this._sr;

    // RMS gate — silence = no pitch
    let rms = 0;
    for (let i = 0; i < FRAME; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / FRAME);
    if (rms < 0.008) return -1;

    const minTau = Math.floor(sr / MAX_HZ);
    const maxTau = Math.floor(sr / MIN_HZ);

    // Difference function (YIN step 2)
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      const n = FRAME - tau;
      for (let j = 0; j < n; j++) {
        const diff = frame[j] - frame[j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }

    // Cumulative mean normalized difference (YIN step 3)
    const cmnd = new Float32Array(maxTau + 1);
    cmnd[0] = 1;
    let runSum = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      runSum += d[tau];
      cmnd[tau] = runSum > 0 ? (d[tau] * tau) / runSum : 1;
    }

    // Find first dip below threshold (YIN step 4)
    const threshold = 0.12;
    let bestTau = -1;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (cmnd[tau] < threshold) {
        // Parabolic interpolation for sub-sample accuracy
        if (tau > 0 && tau < maxTau) {
          const s0 = cmnd[tau - 1], s1 = cmnd[tau], s2 = cmnd[tau + 1];
          const peak = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
          bestTau = peak;
        } else {
          bestTau = tau;
        }
        break;
      }
    }

    if (bestTau < 0) return -1;
    return sr / bestTau;
  }

  // ── Scale snapping ────────────────────────────────────────────────────────
  _snapToScale(freq) {
    // freq → MIDI note number (float)
    const midi    = 12 * Math.log2(freq / 440) + 69;
    const pc      = ((midi % 12) + 12) % 12;   // pitch class (0–12)
    const octave  = Math.floor(midi / 12);

    let best = pc, bestDist = Infinity;
    for (const n of this._scale) {
      const adj = (n + this._root) % 12;
      const dist = Math.min(Math.abs(pc - adj), 12 - Math.abs(pc - adj));
      if (dist < bestDist) { bestDist = dist; best = adj; }
    }

    return 440 * Math.pow(2, (octave * 12 + best - 69) / 12);
  }

  // ── OLA pitch shift ───────────────────────────────────────────────────────
  _olaFrame() {
    // Read a windowed frame from inRing at the current read position
    const analysisHop = HOP;
    const synthesisHop = Math.round(HOP * this._pitchRatio);

    // Read frame from input ring
    const frame = new Float32Array(FRAME);
    for (let i = 0; i < FRAME; i++) {
      const idx = Math.floor(this._readHead - FRAME + i);
      frame[i] = this._inRing[((idx % RING) + RING) % RING] * this._window[i];
    }

    // Advance read head by analysis hop (pitch ratio adjusts synthesis position)
    this._readHead += analysisHop;
    if (this._readHead > this._writeHead) {
      this._readHead = this._writeHead;
    }

    // Add windowed frame to output buffer at synthesis position
    for (let i = 0; i < FRAME; i++) {
      const outIdx = (this._outWrite + i) % RING;
      this._outRing[outIdx] += frame[i];
      this._outGain[outIdx] += this._window[i] * this._window[i];
    }

    this._outWrite = (this._outWrite + synthesisHop) % RING;
  }

  // ── Audio thread entry point ──────────────────────────────────────────────
  process(inputs, outputs) {
    const input  = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    const blockSize = input.length; // 128 on most platforms

    // Pass-through if not active
    if (!this._active) {
      output.set(input);
      return true;
    }

    // 1. Write input to ring buffer
    for (let i = 0; i < blockSize; i++) {
      this._inRing[this._writeHead % RING] = input[i];
      this._writeHead++;
    }

    // 2. Detect pitch & recalculate ratio every HOP samples
    this._hopCounter += blockSize;
    if (this._hopCounter >= HOP) {
      this._hopCounter = 0;

      const frame = new Float32Array(FRAME);
      for (let i = 0; i < FRAME; i++) {
        const idx = (this._writeHead - FRAME + i + RING * 4) % RING;
        frame[i] = this._inRing[idx];
      }

      const freq = this._detectPitch(frame);
      if (freq > 0) {
        const target = this._snapToScale(freq);
        const corrRatio  = target / freq;
        const targetRatio = 1.0 + (corrRatio - 1.0) * this._strength;

        // Smooth ratio to avoid clicks (glide speed)
        this._pitchRatio += (targetRatio - this._pitchRatio) * (1 - this._speed);
        this._lastFreq   = freq;
        this._lastTarget = target;
      } else {
        // No voice — glide ratio back to 1.0 (bypass)
        this._pitchRatio += (1.0 - this._pitchRatio) * 0.05;
      }

      // OLA frame at each analysis hop
      this._olaFrame();

      // Post to UI every ~20 hops (~200ms)
      this._uiCounter++;
      if (this._uiCounter >= 20) {
        this._uiCounter = 0;
        const sr = sampleRate || 48000;
        const freqToNote = (f) => {
          if (f <= 0) return '—';
          const m = Math.round(12 * Math.log2(f / 440) + 69);
          return NOTE_NAMES[((m % 12) + 12) % 12] + Math.floor(m / 12 - 1);
        };
        this.port.postMessage({
          freq:       Math.round(this._lastFreq),
          target:     Math.round(this._lastTarget),
          note:       freqToNote(this._lastFreq),
          targetNote: freqToNote(this._lastTarget),
          ratio:      +this._pitchRatio.toFixed(3),
        });
      }
    }

    // 3. Read from OLA output buffer
    for (let i = 0; i < blockSize; i++) {
      const idx  = this._outRead % RING;
      const gain = this._outGain[idx];
      output[i]  = gain > 0.001 ? this._outRing[idx] / gain : 0;
      // Clear used sample
      this._outRing[idx] = 0;
      this._outGain[idx] = 0;
      this._outRead++;
    }

    return true;
  }
}

registerProcessor('322-pitch-processor', PitchProcessor);
