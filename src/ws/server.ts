import { WebSocketServer, WebSocket } from "ws";
import { ControlConnection } from "./control.js";
import { FanDeviceConnection } from "./fan.js";
import { verifyJwt } from "../auth/jwt.js";
import { Store } from "../data/store.js";

const HEARTBEAT_INTERVAL = 15000; // 15 seconds

export class Server {
  store: Store;
  host: string;
  port: number;
  connections = new Map<number, any>();

  constructor(store: Store, host = "localhost", port = 8080) {
    this.store = store;
    this.host = host;
    this.port = port;

    setInterval(() => {
      for (const conn of this.connections.values()) {
        const ws = conn.ws;
        if (ws.isAlive === false) {
          console.log("x terminating dead client");
          ws.terminate();
          continue;
        }

        ws.isAlive = false;
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  getDeviceState(deviceId: string): Record<string, unknown> | null {
    for (const conn of this.connections.values()) {
      if (conn.type === "device" && conn.device.id === deviceId) {
        return conn.serializeState();
      }
    }

    return null;
  }

  start(): void {
    const wss = new WebSocketServer({ host: this.host, port: this.port });

    setInterval(async () => {
      for (const conn of [...this.connections.values()]) {
        try {
          if (typeof conn.tick === "function") {
            await conn.tick();
          }
        } catch (error) {
          console.error("x tick error", error);
        }
      }
    }, 1000);

    wss.on("connection", (ws) => {
      let conn: any = null;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", async (buf) => {
        const message = String(buf);
        const [cmd, ...args] = message.trim().split(" ");

        if (cmd === "HELLO") {
          if (conn) {
            console.log("x duplicate HELLO received, closing connection");
            await ws.send("x error duplicate HELLO");
            ws.close();
            return;
          }

          if (args.length < 2) {
            console.log("x invalid HELLO format");
            await ws.send("x error invalid HELLO format");
            ws.close();
            return;
          }

          const deviceType = args[0];

          if (deviceType === "client") {
            const token = args.slice(1).join(" ");
            const payload = verifyJwt(token);
            if (!payload) {
              ws.close();
              return;
            }

            const user = await this.store.getUserById(payload.sub);
            if (!user) {
              ws.close();
              return;
            }

            console.log(`control connected: ${user.id} (${user.name})`);
            conn = new ControlConnection(this, ws, user);

            const devices = await this.store.getAllDevices();
            const snapshot = Object.fromEntries(
              devices.map((d) => [d.id, { id: d.id, name: d.name, type: d.type, state: this.getDeviceState(d.id) }]),
            );

            await ws.send(`DEVICE_ALL ${JSON.stringify(snapshot)}`);
          } else if (deviceType === "fan") {
            if (args.length < 3) {
              await ws.send("x error invalid HELLO format");
              ws.close();
              return;
            }

            const identification = args[1];
            const secret = args[2];
            const device = await this.store.getOrRegisterDevice(identification, secret);
            if (!device) {
              console.log("x failed to register device");
              ws.close();
              return;
            }

            console.log(`device connected: ${device.id} (${device.name}) from IP ${ws._socket.remoteAddress}`);
            conn = await FanDeviceConnection.create(this, ws, device);

            for (const existingConn of [...this.connections.values()]) {
              if (existingConn.type === "device" && existingConn.device.id === device.id) {
                console.log("x duplicate device connection detected, closing existing connection");
                existingConn.ws.close();
              }
            }
          } else {
            await ws.send("x error unknown device type");
            ws.close();
            return;
          }

          if (this.connections.has(conn.id)) {
            console.log("x duplicate connection ID, closing new connection");
            ws.close();
            return;
          }

          this.connections.set(conn.id, conn);
          return;
        }

        if (!conn) {
          await ws.send("x error must send HELLO first");
          ws.close();
          return;
        }

        const handled = await conn.handle(cmd, args);
        if (!handled) {
          await ws.send("x error unknown command");
        }
      });

      ws.on("close", () => {
        if (!conn) return;

        console.log(`connection closed: ${conn.type} ${conn.id}`);
        this.connections.delete(conn.id);
        if (conn.type === "device") {
          this.broadcastToClients(`DEVICE ${conn.device.id} null`);
        }
      });
    });
  }

  broadcastToClients(message: string): void {
    for (const conn of this.connections.values()) {
      if (conn.type === "client" && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    }
  }
}
