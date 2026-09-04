import { Server, Socket } from "socket.io";
import type { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { ENV } from "./env.config";

let io: Server | null = null;

export function initSocket(server: HTTPServer) {
  io = new Server(server, {
    cors: { origin: ENV.CORS_ORIGIN },
  });

  // Authenticate socket connections using the same JWT as HTTP
  io.use((socket: Socket, next) => {
    const token =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.headers?.authorization?.split(" ")[1] as string);

    if (!token) {
      return next(new Error("Authentication required"));
    }

    jwt.verify(token, ENV.JWT_SECRET, (err, decoded) => {
      if (err || !decoded) {
        return next(new Error("Invalid or expired token"));
      }
      // Attach user payload to socket data for downstream use
      (socket as any).user = decoded;
      next();
    });
  });

  io.on("connection", (socket: Socket) => {
    const socketUser = (socket as any).user;

    socket.on("register", (userId: string) => {
      // Only allow a user to join their own room
      if (socketUser?.sub && socketUser.sub === userId) {
        socket.join(`user:${userId}`);
      } else {
        socket.emit("error", { message: "Unauthorized room" });
      }
    });

    socket.on("disconnect", () => {
      // cleanup handled automatically by Socket.IO
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized. Call initSocket(server) first.");
  return io;
}
