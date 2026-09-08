export function cdpClient(webSocketUrl, { signal, connectionTimeoutMs = 10_000 } = {}) {
  if (typeof WebSocket !== "function") {
    return Promise.reject(new Error("This audit requires the native Node.js WebSocket implementation."));
  }
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 1;
    let opened = false;
    let closed = false;
    const connectionTimer = setTimeout(() => {
      if (opened) return;
      try { socket.close(); } catch {}
      reject(new Error(`CDP did not connect within ${connectionTimeoutMs} ms.`));
    }, connectionTimeoutMs);
    const rejectPending = (error) => {
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      try { socket.close(); } catch {}
    };
    const onAbort = () => {
      const error = new Error("Browser audit control was aborted.");
      rejectPending(error);
      close();
      if (!opened) reject(error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.addEventListener("open", () => {
      opened = true;
      clearTimeout(connectionTimer);
      resolve({
        send(method, params = {}) {
          if (closed || socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error(`CDP is not open for ${method}.`));
          }
          const id = nextId;
          nextId += 1;
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close,
      });
    }, { once: true });
    socket.addEventListener("message", (event) => {
      Promise.resolve(cdpMessageText(event.data)).then((text) => settleCdpMessage(text, pending)).catch((error) => {
        rejectPending(error);
        close();
      });
    });
    socket.addEventListener("error", () => {
      const error = new Error(`CDP WebSocket failed: ${webSocketUrl}`);
      clearTimeout(connectionTimer);
      rejectPending(error);
      if (!opened) reject(error);
    });
    socket.addEventListener("close", () => {
      clearTimeout(connectionTimer);
      const error = new Error("CDP WebSocket closed before all commands completed.");
      rejectPending(error);
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      if (!opened) reject(error);
    });
  });
}

function cdpMessageText(data) {
  return typeof data === "string" ? data : data instanceof Blob ? data.text() : new TextDecoder().decode(data);
}

function settleCdpMessage(text, pending) {
  const message = JSON.parse(text);
  if (!message.id || !pending.has(message.id)) return;
  const entry = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
  else entry.resolve(message.result);
}
