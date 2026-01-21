import asyncio
import json
import threading
import websockets
from .control import ControlConnection
from .fan import FanDeviceConnection
from ..data.store import Store
from ..auth.jwt import verify_jwt

class Server:
    def __init__(self, store: Store, host='localhost', port=8080):
        self.store = store
        self.host = host
        self.port = port
        self.connections = {}
    
    def get_device_state(self, device_id):
        for conn in self.connections.values():
            if conn.type == "device" and conn.device.id == device_id:
                return conn.serialize_state()
        return None

    async def handle(self, ws):
        conn = None

        try:
            async for message in ws:
                cmd, *args = message.strip().split(" ")

                if cmd == "HELLO":
                    if conn:
                        await ws.send("x error duplicate HELLO")
                        return
                    
                    if len(args) < 2:
                        await ws.send("x error invalid HELLO format")
                        return

                    device_type = args[0]

                    if device_type == "client":
                        # join token args
                        token = " ".join(args[1:])
                        payload = verify_jwt(token)
                        if not payload:
                            ws.transport.close()
                            return
                        user_id = payload.get("sub")
                        if not user_id:
                            ws.transport.close()
                            return
                        user = self.store.get_user_by_id(user_id)
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
                                'state': self.get_device_state(d.id),
                            }
                            for d in devices
                        }
                        await ws.send(f"DEVICE_ALL {json.dumps(snapshot)}")

                    elif device_type == "fan":
                        identification, secret = args[1], args[2]
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