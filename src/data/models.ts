export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  password: string;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  secret: string;
}

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
