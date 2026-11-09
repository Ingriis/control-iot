
export class VehicleSocket {
  constructor(url, onState, onMessage) {
    this.url = url;
    this.onState = onState;
    this.onMessage = onMessage;

    this.socket = null;
    this.retryTimer = null;
    this.retryCount = 0;
    this.stopped = true;
    this.connectionId = 0;
  }

  start() {
    if (!this.stopped) return;

    this.stopped = false;
    this.retryCount = 0;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.connectionId++;

    window.clearTimeout(this.retryTimer);
    this.retryTimer = null;

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close(1000, 'Desconexión solicitada');
    }
  }

  open() {
    if (this.stopped || this.socket) return;

    const currentId = ++this.connectionId;

    this.onState(
      this.retryCount > 0 ? 'reconnecting' : 'connecting'
    );

    try {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      socket.addEventListener('open', () => {
        if (currentId !== this.connectionId || this.stopped) {
          socket.close();
          return;
        }

        this.retryCount = 0;
        this.onState('online');
      });

      socket.addEventListener('message', (event) => {
        if (currentId !== this.connectionId || this.stopped) return;
        this.onMessage(event.data);
      });

      socket.addEventListener('error', () => {
        if (currentId !== this.connectionId || this.stopped) return;
        this.onState('reconnecting');
      });

      socket.addEventListener('close', () => {
        if (currentId !== this.connectionId) return;

        this.socket = null;

        if (this.stopped) return;

        this.onState('reconnecting');

        const delay = Math.min(
          1000 * (2 ** this.retryCount),
          15000
        );

        this.retryCount++;

        this.retryTimer = window.setTimeout(() => {
          this.retryTimer = null;
          this.open();
        }, delay);
      });

    } catch {
      if (currentId !== this.connectionId || this.stopped) return;

      this.socket = null;
      this.onState('reconnecting');

      const delay = Math.min(
        1000 * (2 ** this.retryCount),
        15000
      );

      this.retryCount++;

      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = null;
        this.open();
      }, delay);
    }
  }
}

