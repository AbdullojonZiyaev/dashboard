// Chooses where messages come from.
// Without VITE_WS_URL the built-in simulator is used. With it, the dashboard connects
// to the backend's WebSocket and expects each frame to be one message, or an array of
// messages, in the same JSON format the sensor nodes send.

import { createSimulator } from "./simulator.js";

export function createFeed() {
  const url = import.meta.env.VITE_WS_URL;
  return url ? createWebSocketFeed(url) : createSimulator();
}

function createWebSocketFeed(url) {
  return {
    label: `Live · ${url}`,
    now: () => Date.now() / 1000,
    start(onMessages, onStatus) {
      let ws;
      let retry;
      let stopped = false;
      const connect = () => {
        ws = new WebSocket(url);
        ws.onopen = () => onStatus?.("connected");
        ws.onmessage = (e) => {
          let data;
          try {
            data = JSON.parse(e.data);
          } catch {
            data = null; // counted as rejected by the store
          }
          onMessages(Array.isArray(data) ? data : [data]);
        };
        ws.onclose = () => {
          onStatus?.("disconnected");
          if (!stopped) retry = setTimeout(connect, 3000);
        };
      };
      connect();
      return () => {
        stopped = true;
        clearTimeout(retry);
        ws?.close();
      };
    },
  };
}
