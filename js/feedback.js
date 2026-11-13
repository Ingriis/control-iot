/**
 * feedback.js - Sistema de respuesta háptica (vibración) y audio sintetizado 8-bit
 * Diseñado específicamente para pantallas táctiles y estética arcade de los 70s/80s.
 * 100% nativo: usa Web Audio API sin librerías externas ni archivos pesados.
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Inicializar audio con el primer toque en pantalla
['pointerdown', 'touchstart', 'keydown'].forEach((eventType) => {
  window.addEventListener(eventType, () => {
    getAudioContext();
  }, { once: true, passive: true });
});

export function isSoundEnabled() {
  const btn = document.getElementById('soundButton');
  if (!btn) return true;
  return btn.getAttribute('aria-pressed') === 'true';
}

/**
 * Respuesta háptica (vibración del teléfono)
 */
export function triggerHaptic(type = 'tap') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    switch (type) {
      case 'tap':
        navigator.vibrate(12);
        break;
      case 'click':
        navigator.vibrate(20);
        break;
      case 'direction':
        navigator.vibrate(16);
        break;
      case 'speed':
        navigator.vibrate([15, 20, 15]);
        break;
      case 'stop':
        navigator.vibrate([70, 40, 120]);
        break;
      case 'warning':
        navigator.vibrate([40, 30, 40]);
        break;
    }
  } catch {
    // Si el navegador bloquea la vibración, continuar silenciosamente
  }
}

/**
 * Sonido corto de botón o switch
 */
export function playBip(freq = 520, duration = 0.04) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Tono de encendido / apagado (arpegio de cabina arcade)
 */
export function playPowerSound(turnOn = true) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = turnOn ? [261.63, 329.63, 392.00, 523.25] : [523.25, 392.00, 329.63, 196.00];
  const step = 0.05;

  notes.forEach((freq, idx) => {
    const noteTime = now + (idx * step);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteTime);

    gain.gain.setValueAtTime(0.08, noteTime);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + step);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteTime);
    osc.stop(noteTime + step);
  });
}

/**
 * Tono de cambio de velocidad
 */
export function playSpeedSound(speedState) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freqs = { 1: [440], 2: [440, 554], 3: [440, 554, 659] };
  const notes = freqs[speedState] || [440];

  notes.forEach((freq, idx) => {
    const time = now + (idx * 0.035);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.04);
  });
}

/**
 * Tono de modo crucero
 */
export function playCruiseSound(active) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(active ? 600 : 350, now);
  osc.frequency.exponentialRampToValueAtTime(active ? 900 : 250, now + 0.09);

  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.09);
}

/**
 * Golpe industrial de Paro de Emergencia
 */
export function playStopSound() {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Impacto grave
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);

  // Alerta secundaria aguda
  const alertOsc = ctx.createOscillator();
  const alertGain = ctx.createGain();
  alertOsc.type = 'square';
  alertOsc.frequency.setValueAtTime(880, now + 0.04);
  alertGain.gain.setValueAtTime(0.05, now + 0.04);
  alertGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  alertOsc.connect(alertGain);
  alertGain.connect(ctx.destination);
  alertOsc.start(now + 0.04);
  alertOsc.stop(now + 0.14);
}

/**
 * Sonido de movimiento de horquillas
 */
export function playForkSound(up = true) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  const startF = up ? 220 : 340;
  const endF = up ? 340 : 220;

  osc.frequency.setValueAtTime(startF, now);
  osc.frequency.linearRampToValueAtTime(endF, now + 0.12);

  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.12);
}

/**
 * Alarma de reversa (industrial beep)
 */
let reverseTimer = null;
export function startReverseBeep() {
  if (!isSoundEnabled() || reverseTimer) return;
  const beep = () => {
    if (!isSoundEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(750, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  };
  beep();
  reverseTimer = window.setInterval(beep, 380);
}

export function stopReverseBeep() {
  if (reverseTimer) {
    window.clearInterval(reverseTimer);
    reverseTimer = null;
  }
}
