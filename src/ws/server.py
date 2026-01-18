import asyncio
import json
import threading
import websockets
from .control import ControlConnection
from .fan import FanDeviceConnection
from ..data.store import Store

class Server:
    def __init__(self, store: Store, host='localhost', port=8080):
        self.store = store
        self.host = host
        self.port = port
        self.connections = {}
    
    async def handle(self, ws):
        conn = None

        try:
            async for message in ws:
                cmd, *args = message.strip().split(" ")

                if cmd == "HELLO":
                    if conn:
                        await ws.send("x error duplicate HELLO")
                        return

                    device_type, identification, secret = args

                    if device_type == "client":
                        user = self.store.get_user(identification, secret)
                        if not user:
                            await ws.send("x error authentication failed")
                            return
                        conn = ControlConnection(self, ws, user)

                        snapshot = {
                            c.device.id: {
                                'id': c.device.id,
                                'name': c.device.name,
                                'type': c.device.type,
                                'state': c.serialize_state(),
                            }
                            for c in self.connections.values()
                            if c.type == "device"
                        }
                        await ws.send(f"DEVICE_ALL {json.dumps(snapshot)}")

                    elif device_type == "fan":
                        device = self.store.get_or_register_device(identification, secret)
                        conn = FanDeviceConnection(self, ws, device)
                        print(f"✓ device connected: {device.id}")
                    else:
                        await ws.send("x error unknown device type")
                        return

                    self.connections[conn.id] = conn
                    continue

                if not conn:
                    await ws.send("x error must send HELLO first")
                    return

                handled = await conn.handle(cmd, args)
                if not handled:
                    await ws.send("x error unknown command")
        finally:
            if conn:
                self.connections.pop(conn.id, None)
            print("x client disconnected")

    async def serve(self):
        async with websockets.serve(self.handle, self.host, self.port):
            print(f"✓ websocket server running on port {self.port}")
            await asyncio.Future()

    def start(self):
        def run():
            asyncio.run(self.serve())

        thread = threading.Thread(target=run, daemon=True)
        thread.start()

    def broadcast_to_clients(self, message):
        for conn in self.connections.values():
            if conn.type == "client":
                asyncio.create_task(conn.ws.send(message))