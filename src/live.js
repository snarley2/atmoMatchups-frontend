import { io } from "socket.io-client";

export const LIVE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const liveSocket = io(LIVE_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 250,
  reconnectionDelayMax: 2000,
});
