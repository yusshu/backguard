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
                            ws.transport.close()
                            return
                        conn = ControlConnection(self, ws, user)
                        devices = self.store.get_all_devices()

                        snapshot = {
                            d.id: {
                                'id': d.id,
                                'name': d.name,
                                'type': d.type,
                                # find a state if online, if not, set to null
                                'state': self.connections.get(d.id).state if d.id in self.connections else None,
                            }
                            for d in devices
                        }
                        await ws.send(f"DEVICE_ALL {json.dumps(snapshot)}")

                    elif device_type == "fan":
                        device = self.store.get_or_register_device(identification, secret)
                        conn = FanDeviceConnection(self, ws, device)
                        print(f"✓ device connected: {device.id}")

                        # disconnect previous instances
                        for existing_conn in list(self.connections.values()):
                            if existing_conn.type == "device" and existing_conn.device.id == device.id:
                                existing_conn.ws.transport.close()
                    else:
                        await ws.send("x error unknown device type")
                        return

                    if conn.id in self.connections:
                        ws.transport.close()
                        return
                    self.connections[conn.id] = conn
                    continue

                if not conn:
                    await ws.send("x error must send HELLO first")
                    return

                handled = await conn.handle(cmd, args)
                if not handled:
                    await ws.send("x error unknown command")
        except websockets.ConnectionClosedOK:
            pass
        except websockets.ConnectionClosedError as e:
            print(f"x connection closed with error: {e}")
        finally:
            if conn:
                self.connections.pop(conn.id, None)
                if conn.type == 'device':
                    self.broadcast_to_clients(f"DEVICE {conn.device.id} null")
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
            ping_interval=15,
            ping_timeout=15,
            compression=None,
        ) as server:
            print(f"✓ websocket server running on port {self.port}")
            await server.serve_forever()

    def start(self):
        def run():
            asyncio.run(self.serve())

        thread = threading.Thread(target=run, daemon=True)
        thread.start()

    def broadcast_to_clients(self, message):
        for conn in self.connections.values():
            if conn.type == "client":
                self.loop.call_soon_threadsafe(
                    asyncio.create_task,
                    conn.ws.send(message)
                )