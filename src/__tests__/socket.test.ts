import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { io as connect, Socket as ClientSocket } from "socket.io-client";
import { initSocket, getIO } from "../config/socket";
import { ENV } from "../config/env.config";

let server: http.Server;
let url: string;
let clients: ClientSocket[] = [];

const tokenFor = (sub: string, opts: jwt.SignOptions = {}, secret = ENV.JWT_SECRET) =>
  jwt.sign({ sub, name: sub, email: `${sub}@test.com`, role: "user", sellerId: null }, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
    ...opts,
  });

function open(auth?: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  const socket = connect(url, {
    transports: ["websocket"],
    reconnection: false,
    auth,
    extraHeaders,
  });
  clients.push(socket);
  return socket;
}

const connected = (s: ClientSocket) =>
  new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });

const rejected = (s: ClientSocket) =>
  new Promise<Error>((resolve, reject) => {
    s.once("connect_error", (e) => resolve(e));
    s.once("connect", () => reject(new Error("connection should have been rejected")));
  });

const nextEvent = <T = unknown>(s: ClientSocket, event: string) =>
  new Promise<T>((resolve) => s.once(event, (data: T) => resolve(data)));

const pause = (ms = 150) => new Promise((r) => setTimeout(r, ms));

/** Opens an authenticated client and joins its own room, waiting until the server processed it. */
async function joined(userId: string) {
  const socket = open({ token: tokenFor(userId) });
  await connected(socket);
  socket.emit("register", userId);
  await pause(50);
  return socket;
}

beforeEach(async () => {
  server = http.createServer();
  initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.forEach((c) => c.disconnect());
  clients = [];
  await new Promise<void>((resolve) => getIO().close(() => resolve()));
});

describe("socket authentication", () => {
  it("rejects a connection without a token", async () => {
    const error = await rejected(open());

    expect(error.message).toBe("Authentication required");
  });

  it("rejects a malformed token", async () => {
    const error = await rejected(open({ token: "not-a-jwt" }));

    expect(error.message).toBe("Invalid or expired token");
  });

  it("rejects an expired token", async () => {
    const expired = tokenFor("u1", { expiresIn: -10 });

    const error = await rejected(open({ token: expired }));

    expect(error.message).toBe("Invalid or expired token");
  });

  it("rejects a token signed with another secret", async () => {
    const forged = tokenFor("u1", {}, "another-secret");

    const error = await rejected(open({ token: forged }));

    expect(error.message).toBe("Invalid or expired token");
  });

  it("accepts a valid token sent in the handshake auth", async () => {
    const socket = open({ token: tokenFor("u1") });

    await expect(connected(socket)).resolves.toBeUndefined();
    expect(socket.connected).toBe(true);
  });

  it("accepts a valid token sent in the Authorization header", async () => {
    const socket = open(undefined, { Authorization: `Bearer ${tokenFor("u1")}` });

    await expect(connected(socket)).resolves.toBeUndefined();
  });
});

describe("socket rooms", () => {
  it("delivers events emitted to the user's room after registering", async () => {
    const socket = await joined("u1");
    const received = nextEvent(socket, "order:new");

    getIO().to("user:u1").emit("order:new", { orderId: 3 });

    await expect(received).resolves.toEqual({ orderId: 3 });
  });

  it("refuses to join another user's room and reports an error", async () => {
    const intruder = open({ token: tokenFor("intruder") });
    await connected(intruder);
    const error = nextEvent<{ message: string }>(intruder, "error");

    intruder.emit("register", "victim");

    await expect(error).resolves.toEqual({ message: "Unauthorized room" });
  });

  it("does not leak the victim's events to a client that tried to join their room", async () => {
    const intruder = open({ token: tokenFor("intruder") });
    await connected(intruder);
    intruder.emit("register", "victim");
    await pause(50);
    let leaked = false;
    intruder.on("stock:low", () => (leaked = true));

    getIO().to("user:victim").emit("stock:low", { productId: 1 });
    await pause();

    expect(leaked).toBe(false);
  });

  it("delivers an event only to the intended recipient", async () => {
    const alice = await joined("alice");
    const bob = await joined("bob");
    let bobReceived = false;
    bob.on("review:new", () => (bobReceived = true));
    const aliceReceived = nextEvent(alice, "review:new");

    getIO().to("user:alice").emit("review:new", { productId: 1, rating: 5 });

    await expect(aliceReceived).resolves.toEqual({ productId: 1, rating: 5 });
    await pause();
    expect(bobReceived).toBe(false);
  });

  it("does not deliver events to a connected client that never registered", async () => {
    const lurker = open({ token: tokenFor("lurker") });
    await connected(lurker);
    let received = false;
    lurker.on("order:status", () => (received = true));

    getIO().to("user:lurker").emit("order:status", { orderId: 1, status: "confirmed" });
    await pause();

    expect(received).toBe(false);
  });

  it("delivers to every connection of the same user", async () => {
    const phone = await joined("carol");
    const laptop = await joined("carol");
    const onPhone = nextEvent(phone, "order:new");
    const onLaptop = nextEvent(laptop, "order:new");

    getIO().to("user:carol").emit("order:new", { orderId: 8 });

    await expect(Promise.all([onPhone, onLaptop])).resolves.toEqual([{ orderId: 8 }, { orderId: 8 }]);
  });

  it("stops delivering after the client disconnects", async () => {
    const socket = await joined("dave");
    const sockets = await getIO().in("user:dave").fetchSockets();
    expect(sockets).toHaveLength(1);

    socket.disconnect();
    await pause();

    expect(await getIO().in("user:dave").fetchSockets()).toHaveLength(0);
  });
});

describe("getIO", () => {
  it("returns the initialized server", () => {
    expect(getIO()).toBeDefined();
  });
});
