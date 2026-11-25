const DIRECTIONS = {
  ArrowUp: 'forward', ArrowDown: 'backward',
  ArrowLeft: 'left', ArrowRight: 'right',
  w: 'forward', W: 'forward',
  s: 'backward', S: 'backward',
  a: 'left', A: 'left',
  d: 'right', D: 'right',
};

export function initVerticalStick(element, knob, { onDirection, onRelease, canMove }) {
  let pointerId = null;
  let current = null;
  const base = knob.closest('.joy-base');

  const center = () => {
    knob.style.transform = 'translate(-50%, -50%)';
    if (base) base.dataset.direction = 'neutral';
  };

  const release = () => {
    if (pointerId === null) return;
    pointerId = null;
    center();
    if (current) onRelease();
    current = null;
  };

  const update = (event) => {
    const rect = element.getBoundingClientRect();
    const maxOffset = Math.max(20, Math.min(44, Math.round(rect.height * 0.38)));
    const deadzone = Math.max(8, Math.round(maxOffset * 0.30));

    let y = event.clientY - (rect.top + rect.height / 2);
    y = Math.max(-maxOffset, Math.min(maxOffset, y));

    knob.style.transform = `translate(-50%, calc(-50% + ${y}px))`;
    const name = Math.abs(y) < deadzone ? null : (y < 0 ? 'forward' : 'backward');
    if (base) base.dataset.direction = name || 'neutral';

    if (name && name !== current && canMove()) {
      current = name;
      onDirection(name);
    } else if (!name && current) {
      current = null;
      onRelease();
    }
  };

  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pointerId = event.pointerId;
    try { element.setPointerCapture(event.pointerId); } catch {}
    update(event);
  });
  element.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
  element.addEventListener('pointerup', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('pointercancel', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('lostpointercapture', () => { if (pointerId !== null) release(); });

  const V_KEYS = { ArrowUp: 'forward', w: 'forward', W: 'forward', ArrowDown: 'backward', s: 'backward', S: 'backward' };

  element.addEventListener('keydown', (event) => {
    const name = V_KEYS[event.key];
    if (!name || event.repeat || !canMove()) return;
    event.preventDefault();
    current = name;
    if (base) base.dataset.direction = name;
    const maxOffset = Math.max(20, Math.min(44, Math.round(element.getBoundingClientRect().height * 0.38)));
    knob.style.transform = `translate(-50%, calc(-50% + ${name === 'forward' ? -maxOffset : maxOffset}px))`;
    onDirection(name);
  });

  element.addEventListener('keyup', (event) => {
    if (V_KEYS[event.key] && current) {
      event.preventDefault();
      current = null;
      center();
      onRelease();
    }
  });

  element.addEventListener('blur', () => { if (current) { current = null; center(); onRelease(); } });
  return { reset: () => { current = null; pointerId = null; center(); } };
}

export function initHorizontalStick(element, knob, { onDirection, onRelease, canMove }) {
  let pointerId = null;
  let current = null;
  const base = knob.closest('.joy-base');

  const center = () => {
    knob.style.transform = 'translate(-50%, -50%)';
    knob.style.setProperty('--joy-tilt', '0deg');
    if (base) base.dataset.direction = 'neutral';
  };

  const release = () => {
    if (pointerId === null) return;
    pointerId = null;
    center();
    if (current) onRelease();
    current = null;
  };

  const update = (event) => {
    const rect = element.getBoundingClientRect();
    const maxOffset = Math.max(20, Math.min(44, Math.round(rect.width * 0.38)));
    const deadzone = Math.max(8, Math.round(maxOffset * 0.30));

    let x = event.clientX - (rect.left + rect.width / 2);
    x = Math.max(-maxOffset, Math.min(maxOffset, x));

    knob.style.transform = `translate(calc(-50% + ${x}px), -50%)`;
    const tilt = Math.abs(x) < deadzone ? 0 : Math.round((-x / maxOffset) * 22);
    knob.style.setProperty('--joy-tilt', `${tilt}deg`);

    const name = Math.abs(x) < deadzone ? null : (x > 0 ? 'right' : 'left');
    if (base) base.dataset.direction = name || 'neutral';

    if (name && name !== current && canMove()) {
      current = name;
      onDirection(name);
    } else if (!name && current) {
      current = null;
      onRelease();
    }
  };

  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pointerId = event.pointerId;
    try { element.setPointerCapture(event.pointerId); } catch {}
    update(event);
  });
  element.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
  element.addEventListener('pointerup', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('pointercancel', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('lostpointercapture', () => { if (pointerId !== null) release(); });

  const H_KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };

  element.addEventListener('keydown', (event) => {
    const name = H_KEYS[event.key];
    if (!name || event.repeat || !canMove()) return;
    event.preventDefault();
    current = name;
    if (base) base.dataset.direction = name;
    const maxOffset = Math.max(20, Math.min(44, Math.round(element.getBoundingClientRect().width * 0.38)));
    knob.style.transform = `translate(calc(-50% + ${name === 'right' ? maxOffset : -maxOffset}px), -50%)`;
    knob.style.setProperty('--joy-tilt', name === 'left' ? '22deg' : '-22deg');
    onDirection(name);
  });

  element.addEventListener('keyup', (event) => {
    if (H_KEYS[event.key] && current) {
      event.preventDefault();
      current = null;
      center();
      onRelease();
    }
  });

  element.addEventListener('blur', () => { if (current) { current = null; center(); onRelease(); } });
  return { reset: () => { current = null; pointerId = null; center(); } };
}

export function initJoystick(element, knob, { onDirection, onRelease, canMove }) {
  let pointerId = null;
  let current = null;
  const base = knob.closest('.joy-base');

  const center = () => {
    knob.style.transform = 'translate(-50%, -50%)';
    knob.style.setProperty('--joy-tilt', '0deg');
    if (base) base.dataset.direction = 'neutral';
  };
  const release = () => {
    if (pointerId === null) return;
    pointerId = null;
    center();
    if (current) onRelease();
    current = null;
  };

  const update = (event) => {
    const rect = element.getBoundingClientRect();
    const maxOffset = Math.max(20, Math.min(44, Math.round(rect.width * 0.38)));
    const deadzone = Math.max(8, Math.round(maxOffset * 0.30));

    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > maxOffset) {
      x *= maxOffset / distance;
      y *= maxOffset / distance;
    }
    knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    const tilt = distance < deadzone ? 0 : Math.round((-x / maxOffset) * 22);
    knob.style.setProperty('--joy-tilt', `${tilt}deg`);
    const name = distance < deadzone ? null : Math.abs(x) > Math.abs(y)
      ? (x > 0 ? 'right' : 'left')
      : (y > 0 ? 'backward' : 'forward');
    if (base) base.dataset.direction = name || 'neutral';
    if (name && name !== current && canMove()) {
      current = name;
      onDirection(name);
    } else if (!name && current) {
      current = null;
      onRelease();
    }
  };

  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pointerId = event.pointerId;
    try { element.setPointerCapture(event.pointerId); } catch {}
    update(event);
  });
  element.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
  element.addEventListener('pointerup', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('pointercancel', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('lostpointercapture', () => { if (pointerId !== null) release(); });
  element.addEventListener('keydown', (event) => {
    const name = DIRECTIONS[event.key];
    if (!name || event.repeat || !canMove()) return;
    event.preventDefault();
    current = name;
    if (base) base.dataset.direction = name;
    knob.style.setProperty('--joy-tilt', name === 'left' ? '22deg' : name === 'right' ? '-22deg' : '0deg');
    onDirection(name);
  });
  element.addEventListener('keyup', (event) => {
    if (DIRECTIONS[event.key] && current) {
      event.preventDefault();
      current = null;
      center();
      onRelease();
    }
  });
  element.addEventListener('blur', () => { if (current) { current = null; center(); onRelease(); } });
  return { reset: () => { current = null; pointerId = null; center(); } };
}

export function initVerticalJoystick(element, knob, { onDirection, onNeutral, canMove }) {
  let pointerId = null;
  let current = null;
  const base = knob.closest('.fork-joy-base');

  const center = () => {
    knob.style.transform = 'translate(-50%, -50%)';
    if (base) base.dataset.direction = 'neutral';
  };
  const release = () => {
    if (pointerId === null) return;
    pointerId = null;
    const wasMoving = current !== null;
    current = null;
    center();
    if (wasMoving) onNeutral?.();
  };
  const move = (direction, maxOffset) => {
    current = direction;
    if (base) base.dataset.direction = direction;
    knob.style.transform = `translate(-50%, calc(-50% + ${direction === 'up' ? -maxOffset : maxOffset}px))`;
    onDirection(direction);
  };
  const update = (event) => {
    const rect = element.getBoundingClientRect();
    const maxOffset = Math.max(20, Math.min(44, Math.round(rect.height * 0.38)));
    const deadzone = Math.max(8, Math.round(maxOffset * 0.30));

    const y = Math.max(-maxOffset, Math.min(maxOffset, event.clientY - (rect.top + rect.height / 2)));
    knob.style.transform = `translate(-50%, calc(-50% + ${y}px))`;

    const direction = Math.abs(y) < deadzone ? null : y < 0 ? 'up' : 'down';
    if (base) base.dataset.direction = direction || 'neutral';
    if (direction && direction !== current && canMove()) {
      current = direction;
      onDirection(direction);
    } else if (!direction && current) {
      current = null;
      onNeutral?.();
    }
  };

  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pointerId = event.pointerId;
    try { element.setPointerCapture(event.pointerId); } catch {}
    update(event);
  });
  element.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
  element.addEventListener('pointerup', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('pointercancel', (event) => { if (event.pointerId === pointerId) release(); });
  element.addEventListener('lostpointercapture', () => { if (pointerId !== null) release(); });
  element.addEventListener('keydown', (event) => {
    const direction = (event.key === 'ArrowUp' || event.key === 'q' || event.key === 'Q') ? 'up' : (event.key === 'ArrowDown' || event.key === 'e' || event.key === 'E') ? 'down' : null;
    if (!direction || event.repeat || !canMove()) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const maxOffset = Math.max(20, Math.min(44, Math.round(rect.height * 0.38)));
    if (direction !== current) move(direction, maxOffset);
  });
  element.addEventListener('keyup', (event) => {
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'q' || event.key === 'Q' || event.key === 'e' || event.key === 'E') && current) {
      event.preventDefault();
      current = null;
      center();
      onNeutral?.();
    }
  });
  element.addEventListener('blur', () => {
    if (current) { current = null; center(); onNeutral?.(); }
  });
  return { reset: () => { current = null; pointerId = null; center(); } };
}
