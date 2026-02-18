import { Connection } from "./connection.js";
import type { Server } from "./server.js";
import type { User } from "../data/models.js";

export class ControlConnection extends Connection {
  server: Server;
  user: User;

  constructor(server: Server, ws: any, user: User) {
    super(ws, "client");
    this.server = server;
    this.user = user;
  }

  async handle(cmd: string, args: string[]): Promise<boolean> {
    if (cmd !== "DEVICE") return false;

    const [deviceId, deviceCmd, ...deviceArgs] = args;
    if (!deviceId || !deviceCmd) return true;

    for (const conn of this.server.connections.values()) {
      if (conn.type === "device" && conn.device.id === deviceId) {
        return conn.handleFromClient(this, deviceCmd, deviceArgs);
      }
    }

    return true;
  }
}
