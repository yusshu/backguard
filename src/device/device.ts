import type {Device} from "../data/models.js";
import {Connection} from "../ws/connection.js";

export interface DeviceState {
  status: "off" | "slow" | "medium" | "fast";
  rotates: boolean;
  temperature: number | null;
  humidity: number | null;
  mode: "manual" | "scheduled" | "threshold";
  scheduled_start: string | null;
  scheduled_end: string | null;
  threshold_temp: number | null;
  scheduled_or_thresholded_status: "off" | "slow" | "medium" | "fast" | null;
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
