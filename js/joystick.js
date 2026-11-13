const DIRECTIONS = {
  ArrowUp: 'forward', ArrowDown: 'backward',
  ArrowLeft: 'left', ArrowRight: 'right',
};

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
    if (!canMove()) return;
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
    if (!canMove()) return;
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
    const direction = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : null;
    if (!direction || event.repeat || !canMove()) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const maxOffset = Math.max(20, Math.min(44, Math.round(rect.height * 0.38)));
    if (direction !== current) move(direction, maxOffset);
  });
  element.addEventListener('keyup', (event) => {
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && current) {
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
