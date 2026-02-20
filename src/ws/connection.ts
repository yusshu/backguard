type WebSocket = any;

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

