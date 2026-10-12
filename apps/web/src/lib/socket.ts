import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";
import type { Ack } from "./types";

export function connectSocket(token: string): Socket {
  return io(API_URL, {
    auth: { token },
    transports: ["websocket"],
  });
}

/** Émet un événement et attend l'accusé de réception du serveur (10 s maximum). */
export function request<T = unknown>(socket: Socket, event: string, payload: unknown): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) return reject(new Error("Le serveur ne répond pas"));
      if (!res.ok) return reject(new Error(res.error));
      resolve(res.data);
    });
  });
}
