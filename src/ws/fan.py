import json
from .connection import DeviceConnection
from ..data.models import Device

class FanDeviceConnection(DeviceConnection):
    VALID_STATUS = {"off", "slow", "medium", "fast"}

    def __init__(self, server, ws, device: Device):
        super().__init__(ws, device)
        self.server = server
        self._status = "off"
        self._rotates = False
        self._temperature = None
        self._humidity = None

    async def handle_from_client(self, client, cmd, args):
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
        }

    def broadcast(self):
        self.server.broadcast_to_clients(
            f"DEVICE {self.device.id} {json.dumps(self.serialize_state())}"
        )