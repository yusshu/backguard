type WebSocket = any;
import type { Device } from "../data/models.js";

let connectionIdCounter = 1;
const nextConnectionId = () => connectionIdCounter++;

export class Connection {
  id: number;
  ws: WebSocket;
  type: "client" | "device" | "unknown";

  constructor(ws: WebSocket, type: "client" | "device" | "unknown" = "unknown") {
    this.id = nextConnectionId();
    this.ws = ws;
    this.type = type;
  }

  async handle(_cmd: string, _args: string[]): Promise<boolean> {
    return false;
  }

  async tick(): Promise<void> {}
}

export class DeviceConnection extends Connection {
  device: Device;

  constructor(ws: WebSocket, device: Device) {
    super(ws, "device");
    this.device = device;
  }

  async handleFromClient(_client: Connection, _cmd: string, _args: string[]): Promise<boolean> {
    return false;
  }

  serializeState(): any {
    return {};
  }
}
