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
                        await conn.send("x error duplicate HELLO")
                        return

                    device_type, identification, secret = args

                    if device_type == "client":
                        user = self.store.get_user(identification, secret)
                        if not user:
                            ws.transport.close()
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
                        await conn.send(f"DEVICE_ALL {json.dumps(snapshot)}")
                        print(f"✓ client connected: {user.username}")
                    elif device_type == "fan":
                        device = self.store.get_or_register_device(identification, secret)
                        conn = FanDeviceConnection(self, ws, device)
                        print(f"✓ device connected: {device.id}")
                    else:
                        await ws.send("x error unknown device type")
                        return

                    if conn.id in self.connections:
                        print(f"x duplicate connection for id: {conn.id}")
                        await conn.send("x error duplicate connection id")
                        ws.transport.close()
                        return
                    self.connections[conn.id] = conn
                    continue

                if not conn:
                    await ws.send("x error must send HELLO first")
                    return

                handled = await conn.handle(cmd, args)
                if not handled:
                    await conn.send("x error unknown command")
        except websockets.ConnectionClosedOK:
            pass
        except websockets.ConnectionClosedError as e:
            print(f"x connection closed with error: {e}")
        finally:
            if conn:
                self.connections.pop(conn.id, None)
                if conn.type == 'device':
                    print(f"x device disconnected: {conn.device.id}")
                else:
                    print(f"x client disconnected: {conn.user.username}")
            else:
                print("x connection closed before HELLO")

    async def serve(self):
        self.loop = asyncio.get_running_loop()
        async with websockets.serve(
            self.handle,
            self.host,
            self.port,
            ping_interval=None,
            ping_timeout=None,
            compression=None,
        ) as server:
            print(f"✓ websocket server running on port {self.port}")
            await server.serve_forever()

    def start(self):
        def run():
            asyncio.run(self.serve())

        thread = threading.Thread(target=run, daemon=True)
        thread.start()

    async def broadcast_to_clients(self, message):
        for conn in self.connections.values():
            if conn.type == "client":
                await conn.send(message)