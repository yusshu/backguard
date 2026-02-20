import type { Server } from "../ws/server.js";
import type { Device } from "../data/models.js";
import {DeviceConnection, DeviceState} from "./device.js";

const GMT_MINUS_5_OFFSET_MS = -5 * 60 * 60 * 1000;

const parseTime = (value: string): [number, number] | null => {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return [hour, minute];
};

const currentMinutesInGmtMinus5 = (): number => {
  const shifted = new Date(Date.now() + GMT_MINUS_5_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

export class FanDeviceConnection extends DeviceConnection {
  private server: Server;
  private state: DeviceState;

  private constructor(server: Server, ws: any, device: Device, state: DeviceState) {
    super(ws, device);
    this.server = server;
    this.state = state;
  }

  static async create(server: Server, ws: any, device: Device): Promise<FanDeviceConnection> {
    const threshold = await server.store.getDeviceConfig(device.id, "threshold_temp");

    const state: DeviceState = {
      status: "off",
      rotates: false,
      temperature: null,
      humidity: null,
      mode: ((await server.store.getDeviceConfig(device.id, "mode")) as DeviceState["mode"]) ?? "manual",
      scheduled_start: (await server.store.getDeviceConfig(device.id, "scheduled_start")) || null,
      scheduled_end: (await server.store.getDeviceConfig(device.id, "scheduled_end")) || null,
      threshold_temp: threshold ? Number(threshold) : null,
      scheduled_or_thresholded_status:
        ((await server.store.getDeviceConfig(device.id, "scheduled_or_thresholded_status")) as DeviceState["scheduled_or_thresholded_status"]) || null,
    };

    return new FanDeviceConnection(server, ws, device, state);
  }

  async handleFromClient(client: import("../ws/connection.js").Connection, cmd: string, args: string[]): Promise<boolean> {
    if (cmd === "SWITCH_MODE") {
      const mode = args[0] as DeviceState["mode"];
      if (!["manual", "scheduled", "threshold"].includes(mode)) {
        await client.ws.send("x error invalid mode");
        return true;
      }

      if (this.state.mode !== mode) {
        await this.server.store.setDeviceConfig(this.device.id, "mode", mode);
        this.state.mode = mode;
        this.broadcast();
      }

      return true;
    }

    if (cmd === "SCHEDULE") {
      try {
        const start = args[0] && args[0] !== "null" ? args[0] : null;
        const end = args[1] && args[1] !== "null" ? args[1] : null;

        await this.server.store.setDeviceConfig(this.device.id, "scheduled_start", start ?? "");
        await this.server.store.setDeviceConfig(this.device.id, "scheduled_end", end ?? "");

        this.state.scheduled_start = start;
        this.state.scheduled_end = end;
        this.broadcast();
        return true;
      } catch {
        await client.ws.send("x error invalid schedule");
        return true;
      }
    }

    if (cmd === "SET_THRESHOLD") {
      try {
        const temp = args[0] !== "null" ? Number(args[0]) : null;
        if (temp !== null && Number.isNaN(temp)) {
          throw new Error("invalid threshold");
        }

        await this.server.store.setDeviceConfig(this.device.id, "threshold_temp", temp === null ? "" : String(temp));
        this.state.threshold_temp = temp;
        this.broadcast();
        return true;
      } catch {
        await client.ws.send("x error invalid threshold temperature");
        return true;
      }
    }

    if (cmd === "SET_SCHEDULED_OR_THRESHOLDED_STATUS") {
      const status = args[0] as DeviceState["status"];
      if (!["off", "slow", "medium", "fast"].includes(status)) {
        await client.ws.send("x error invalid status");
        return true;
      }

      await this.server.store.setDeviceConfig(this.device.id, "scheduled_or_thresholded_status", status);
      this.state.scheduled_or_thresholded_status = status;
      this.broadcast();
      return true;
    }

    if (cmd === "SET_STATUS") {
      const status = args[0] as DeviceState["status"];
      if (!["off", "slow", "medium", "fast"].includes(status)) {
        await client.ws.send("x error invalid status");
        return true;
      }

      await this.ws.send(`SET_STATUS ${status}`);
      return true;
    }

    if (cmd === "SET_ROTATES") {
      if (!["true", "false"].includes(args[0])) {
        await client.ws.send("x error invalid rotates value");
        return true;
      }

      await this.ws.send(`SET_ROTATES ${args[0]}`);
      return true;
    }

    if (cmd === "SET_WIFI") {
      try {
        const cfg = JSON.parse(args.join(" ")) as { ssid?: unknown; password?: unknown };
        if (typeof cfg.ssid !== "string") throw new Error("ssid");
        if (typeof cfg.password !== "string") throw new Error("password");

        await this.ws.send(`SET_WIFI ${JSON.stringify(cfg)}`);
        return true;
      } catch {
        await client.ws.send("x error invalid WiFi config");
        return true;
      }
    }

    return false;
  }

  async handle(cmd: string, args: string[]): Promise<boolean> {
    if (cmd === "STATUS" && ["off", "slow", "medium", "fast"].includes(args[0] as DeviceState["status"])) {
      this.state.status = args[0] as DeviceState["status"];
      this.broadcast();
      return true;
    }

    if (cmd === "ROTATES" && ["true", "false"].includes(args[0])) {
      this.state.rotates = args[0] === "true";
      this.broadcast();
      return true;
    }

    if (cmd === "AMBIENT") {
      this.state.temperature = Number(args[0]);
      this.state.humidity = Number(args[1]);
      this.broadcast();
      return true;
    }

    return false;
  }

  serializeState(): DeviceState {
    return this.state;
  }

  broadcast(): void {
    this.server.broadcastToClients(`DEVICE ${this.device.id} ${JSON.stringify(this.serializeState())}`);
  }

  async tick(): Promise<void> {
    if (this.state.mode === "manual") return;

    let desiredStatus: DeviceState["status"] = "off";

    if (this.state.mode === "scheduled") {
      if (!this.state.scheduled_start || !this.state.scheduled_end) return;

      const start = parseTime(this.state.scheduled_start);
      const end = parseTime(this.state.scheduled_end);
      if (!start || !end) return;

      const startMinutes = start[0] * 60 + start[1];
      const endMinutes = end[0] * 60 + end[1];
      const now = currentMinutesInGmtMinus5();

      const active = startMinutes < endMinutes ? now >= startMinutes && now < endMinutes : now >= startMinutes || now < endMinutes;

      if (active && this.state.scheduled_or_thresholded_status) {
        desiredStatus = this.state.scheduled_or_thresholded_status;
      }
    }

    if (this.state.mode === "threshold") {
      if (!this.state.scheduled_or_thresholded_status || this.state.temperature === null || this.state.threshold_temp === null) {
        return;
      }

      if (this.state.temperature >= this.state.threshold_temp) {
        desiredStatus = this.state.scheduled_or_thresholded_status;
      }
    }

    if (desiredStatus !== this.state.status) {
      await this.ws.send(`SET_STATUS ${desiredStatus}`);
    }
  }
}
