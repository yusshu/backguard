import json
from .connection import DeviceConnection
from ..data.models import Device

class FanDeviceConnection(DeviceConnection):
    VALID_STATUS = {"off", "slow", "medium", "fast"}
    VALID_MODE = {"manual", "scheduled", "threshold"}

    def __init__(self, server, ws, device: Device):
        super().__init__(ws, device)
        self.server = server
        self._status = "off"
        self._rotates = False
        self._temperature = None
        self._humidity = None

        self._mode = server.store.get_device_config(device.id, "mode") or "manual"
        self._scheduled_start = server.store.get_device_config(device.id, "scheduled_start") or None
        self._scheduled_end = server.store.get_device_config(device.id, "scheduled_end") or None
        self._threshold_temp = float(server.store.get_device_config(device.id, "threshold_temp")) if server.store.get_device_config(device.id, "threshold_temp") is not None else None
        self._scheduled_or_thresholded_status = server.store.get_device_config(device.id, "scheduled_or_thresholded_status") or None

    async def handle_from_client(self, client, cmd, args):
        # commands that do not interact with the device
        if cmd == "SWITCH_MODE":
            mode = args[0]
            if mode in self.VALID_MODE:
                if mode != self._mode:
                    self.server.store.set_device_config(self.device.id, "mode", mode)
                    self._mode = mode
                    self.broadcast()
                return True
            await client.ws.send("x error invalid mode")
            return True
        
        if cmd == "SCHEDULE":
            try:
                start = args[0] if args[0] != "null" else None
                end = args[1] if args[1] != "null" else None
                self.server.store.set_device_config(self.device.id, "scheduled_start", start or "")
                self.server.store.set_device_config(self.device.id, "scheduled_end", end or "")
                self._scheduled_start = start
                self._scheduled_end = end
                self.broadcast()
                return True
            except Exception:
                await client.ws.send("x error invalid schedule")
                return True
        
        if cmd == "SET_THRESHOLD":
            try:
                temp = float(args[0]) if args[0] != "null" else None
                self.server.store.set_device_config(self.device.id, "threshold_temp", str(temp) if temp is not None else "")
                self._threshold_temp = temp
                self.broadcast()
                return True
            except Exception:
                await client.ws.send("x error invalid threshold temperature")
                return True
        
        if cmd == "SET_SCHEDULED_OR_THRESHOLDED_STATUS":
            status = args[0]
            if status in self.VALID_STATUS:
                self.server.store.set_device_config(self.device.id, "scheduled_or_thresholded_status", status)
                self._scheduled_or_thresholded_status = status
                self.broadcast()
                return True
            await client.ws.send("x error invalid status")
            return True

        # commands that interact with the device
        if cmd == "SET_STATUS":
            status = args[0]
            if status in self.VALID_STATUS:
                await self.ws.send(f"SET_STATUS {status}")
                return True
            await client.ws.send("x error invalid status")
            return True

        if cmd == "SET_ROTATES":
            if args[0] in ("true", "false"):
                await self.ws.send(f"SET_ROTATES {args[0]}")
                return True
            await client.ws.send("x error invalid rotates value")
            return True

        if cmd == "SET_WIFI":
            try:
                cfg = json.loads(" ".join(args))
                if not isinstance(cfg.get("ssid"), str):
                    raise ValueError("ssid")
                if not isinstance(cfg.get("password"), str):
                    raise ValueError("password")
                await self.ws.send(f"SET_WIFI {json.dumps(cfg)}")
                return True
            except Exception:
                await client.ws.send("x error invalid WiFi config")
                return True

        return False

    async def handle(self, cmd, args):
        if cmd == "STATUS" and args[0] in self.VALID_STATUS:
            self._status = args[0]
            self.broadcast()
            return True

        if cmd == "ROTATES" and args[0] in ("true", "false"):
            self._rotates = args[0] == "true"
            self.broadcast()
            return True

        if cmd == "AMBIENT":
            self._temperature = float(args[0])
            self._humidity = int(args[1])
            self.broadcast()
            return True

        return False

    def serialize_state(self):
        return {
            "status": self._status,
            "rotates": self._rotates,
            "temperature": self._temperature,
            "humidity": self._humidity,
            "mode": self._mode,
            "scheduled_start": self._scheduled_start,
            "scheduled_end": self._scheduled_end,
            "threshold_temp": self._threshold_temp,
            "scheduled_or_thresholded_status": self._scheduled_or_thresholded_status,
        }

    def broadcast(self):
        self.server.broadcast_to_clients(
            f"DEVICE {self.device.id} {json.dumps(self.serialize_state())}"
        )