export class SpatialAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.stepTimer = 0;
    this.heartbeatTimer = 0;
    this.groanTimer = 6.0;
    this.isMuted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.75;
    this.masterGain.connect(this.ctx.destination);
  }

  playClick(pitch = 950) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.045);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playKeycardPickup() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880.0, 1174.66]; // D5 -> A5 -> D6 tactical chime

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  _playFootstep(isSprinting) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Concrete boot thud (low-passed noise + sub-bass punch)
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.09);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = isSprinting ? 480 : 280;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isSprinting ? 0.34 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
  }

  _playHeartbeat(intensity) {
    if (!this.ctx || this.isMuted || intensity <= 0.05) return;
    const now = this.ctx.currentTime;

    // Lub-dub double sub-bass pulse
    [0, 0.16].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';

      const t = now + offset;
      const peakFreq = idx === 0 ? 64 : 52;
      osc.frequency.setValueAtTime(peakFreq, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.13);

      const vol = intensity * (idx === 0 ? 0.45 : 0.32);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  _playFacilityGroan(pan = 0) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const panner = this.ctx.createStereoPanner();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const baseFreq = 42 + Math.random() * 24;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.72, now + 2.4);

    filter.type = 'lowpass';
    filter.frequency.value = 140;

    panner.pan.value = Math.max(-1, Math.min(1, pan));

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    osc.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 2.6);
  }

  update(dt, player, stalker) {
    if (!this.ctx || this.isMuted) return;

    // 1. Player Footstep Cadence
    if (player.currentSpeed > 0.25) {
      const stepInterval = player.isSprinting ? 0.34 : 0.56;
      this.stepTimer += dt;
      if (this.stepTimer >= stepInterval) {
        this.stepTimer = 0;
        this._playFootstep(player.isSprinting);
      }
    } else {
      this.stepTimer = 0.2;
    }

    // 2. Reactive Proximity Heartbeat (Ramps up when Stalker is within 16m)
    const dist = Math.hypot(
      player.position.x - stalker.position.x,
      player.position.z - stalker.position.z
    );

    if (dist < 16.0) {
      const panicFactor = Math.max(0, Math.min(1, 1 - dist / 16.0));
      const bpm = 68 + panicFactor * 92; // 68 BPM up to 160 BPM
      const beatInterval = 60 / bpm;

      this.heartbeatTimer += dt;
      if (this.heartbeatTimer >= beatInterval) {
        this.heartbeatTimer = 0;
        this._playHeartbeat(panicFactor);
      }
    }

    // 3. Ambient Subterranean Metal Groans (Stereo-panned toward Stalker)
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 9 + Math.random() * 11;
      const dx = stalker.position.x - player.position.x;
      const dz = stalker.position.z - player.position.z;
      const angleToStalker = Math.atan2(-dx, -dz) - player.yaw;
      const stereoPan = -Math.sin(angleToStalker);
      this._playFacilityGroan(stereoPan);
    }
  }
  }
