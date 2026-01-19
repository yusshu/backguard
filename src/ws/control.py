from .connection import Connection

class ControlConnection(Connection):
    def __init__(self, server, ws, user):
        super().__init__(ws, "client")
        self.server = server
        self.user = user

    async def handle(self, cmd, args):
        if cmd == "DEVICE":
            device_id, device_cmd, *device_args = args
            print(f"→ client {self.user.username} sent command to device {device_id}: {device_cmd} {' '.join(device_args)}")
            for conn in self.server.connections.values():
                if conn.type == "device" and conn.device.id == device_id:
                    return await conn.handle_from_client(self, device_cmd, device_args)
            return True
        return False