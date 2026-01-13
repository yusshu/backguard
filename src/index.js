const dotenv = require("dotenv");
dotenv.config({ quiet: true });

const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const HEARTBEAT_INTERVAL = 15000; // 15 seconds

const wss = new WebSocket.WebSocketServer({ host: '0.0.0.0', port: PORT });

// Client/Device sends:
// HELLO <type> <id> <secret>
//
// Client can send to a Fan:
// DEVICE <deviceId> SET_STATUS fast
// DEVICE <deviceId> SET_WIFI {...}
//
// Client can receive:
// DEVICE <deviceId> {...}
//
// Fan device sends to the server:
// AMBIENT <temp> <humidity>
// STATUS <status>


// map to store connections
let connectionIdCounter = 1;
const connections = new Map();

function broadcastToClients(message) {
  for (const connection of connections.values()) {
    if (connection.type === 'client' 
      && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(message);
    }
  }
}

class Connection {
  constructor(ws, type = 'unknown') {
    this.id = connectionIdCounter++;
    this.ws = ws;
    this.type = type;
  }

  handle(cmd, args) {
    console.warn(`received command: '${cmd}' with args: '${args}' but no handler is defined`);
  }
}

class DeviceConnection extends Connection {
  constructor(ws, device) {
    super(ws, "device");
    this.device = device;
  }

  handleFromClient(cmd, args) {
    console.warn(`received command from client: '${cmd}' with args: '${args}' but no handler is defined`);
  }

  serializeState() {
    return {};
  }
}

class FanDeviceConnection extends DeviceConnection {
  constructor(ws, device) {
    super(ws, device);
    this._status = 'off'; // off | slow | medium | fast
    this._rotates = false;
    this._temperature = null; // unknown temperature
    this._humidity = null; // unknown humidity
  }

  handleFromClient(client, cmd, args) {
    if (cmd === 'SET_STATUS') {
      const status = args[0];
      if (this.setStatus(status)) {
        console.log(`[fan ${this.device.id}] ${client.user.name} set fan status to ${status}`);
        return true;
      }
      client.ws.send("x error invalid status");
      return true;
    } else if (cmd === 'SET_ROTATES') {
      const rotatesStr = args[0];
      if (rotatesStr === 'true' || rotatesStr === 'false') {
        const rotates = rotatesStr === 'true';
        console.log(`[fan ${this.device.id}] ${client.user.name} set fan rotates to ${rotates}`);
        this.ws.send(`SET_ROTATES ${rotates}`);
        return true;
      }
      client.ws.send("x error invalid rotates value");
      return true;
    } else if (cmd === 'SET_WIFI') {
      const jsonPart = args.join(' ').trim();
      try {
        const wifiConfig = JSON.parse(jsonPart);

        if (!wifiConfig.ssid || typeof wifiConfig.ssid !== "string") {
          client.ws.send("x error missing SSID");
          return true;
        }

        if (!wifiConfig.password || typeof wifiConfig.password !== "string") {
          client.ws.send("x error missing password");
          return true;
        }

        console.log(
          `[fan ${this.device.id}] updated WiFi config: SSID=${wifiConfig.ssid} PASSWORD=${"*".repeat(wifiConfig.password.length)}`
        );

        this.ws.send(`SET_WIFI ${JSON.stringify(wifiConfig)}`);
        return true;
      } catch {
        client.ws.send("x error invalid WiFi config");
        return;
      }
    } else {
      console.warn(`unknown command from client to device: '${cmd}' with args: '${args}'`);
      return false;
    }
  }

  serializeState() {
    return {
      status: this._status,
      rotates: this._rotates,
      temperature: this._temperature,
      humidity: this._humidity,
    };
  }

  broadcastStatusUpdate() {
    broadcastToClients(`DEVICE ${this.device.id} ${JSON.stringify(this.serializeState())}`);
  }

  handle(cmd, args) {
    if (cmd === 'STATUS') {
      const status = args[0];
      if (FanDeviceConnection.isValidStatus(status)) {
        this._status = status;
        console.log(`[fan ${this.device.id}] fan updated its status to ${this._status}`);
        this.broadcastStatusUpdate();
      }
      return true;
    } else if (cmd === 'ROTATES') {
      const rotatesStr = args[0];
      if (rotatesStr === 'true' || rotatesStr === 'false') {
        this._rotates = rotatesStr === 'true';
        console.log(`[fan ${this.device.id}] fan updated its rotates to ${this._rotates}`);
        this.broadcastStatusUpdate();
      }
      return true;
    } else if (cmd === 'AMBIENT') {
      const temperature = parseFloat(args[0]);
      const humidity = parseInt(args[1], 10);
      this._temperature = temperature;
      this._humidity = humidity;
      console.log(`[fan ${this.device.id}] ambient data updated: temperature=${this._temperature}°C humidity=${this._humidity}%`);
      this.broadcastStatusUpdate();
      return true;
    }
    console.warn(`unknown command from device: '${cmd}' with args: '${args}'`);
    return false;
  }

  setStatus(status) {
    if (FanDeviceConnection.isValidStatus(status)) {
      this.ws.send(`SET_STATUS ${status}`);
      // this._status = status;
      return true;
    }
    return false;
  }

  static isValidStatus(status) {
    return ["off", "slow", "medium", "fast"].includes(status);
  }
}

class ClientConnection extends Connection {
  constructor(ws, user) {
    super(ws, "client");
    this.user = user;
  }

  handle(cmd, args) {
    if (cmd === 'DEVICE') {
      const [ deviceId, deviceCmd, ...deviceArgs ] = args;

      for (const connection of connections.values()) {
        if (connection.type === 'device' && connection.device.id === deviceId) {
          connection.handleFromClient(this, deviceCmd, deviceArgs);
          return true;
        }
      }
      return true;
    }

    console.warn(`unknown command from client: '${cmd}'`);
    return false;
  }
}

// to-do: wire to an actual database and do actual authentication
function getUserByIdentification(identification, secret) {
  if (identification !== 'andre' && secret !== 'ipoopmypants') {
    return null;
  }
  return { id: 1, name: 'Andre' };
}

function getOrRegisterDevice(identification, secret) {
  return {
    id: identification,
    type: 'fan',
    name: `Fan ${identification}`
  };
}


function heartbeat() {
  this.isAlive = true;
}

const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      console.log("x terminating dead client");
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL);

wss.on("connection", (ws) => {
  let conn = null;

  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws.on("message", (data) => {
    const [ cmd, ...args ] = data.toString().trim().split(' ');

    if (cmd === 'HELLO') {
      if (conn) {
        console.warn("received duplicate HELLO");
        ws.send("x error already sent HELLO");
        ws.close();
        return;
      }

      // this is the first message a connection sends
      const [ deviceType, identification, secret ] = args;

      if (deviceType === 'client') {
        const user = getUserByIdentification(identification, secret);
        if (!user) {
          ws.send("x error authentication failed");
          ws.close();
          return;
        }
        conn = new ClientConnection(ws, user);
        connections.set(conn.id, conn);
        console.log(`client connected: ${user.name}`);
        
        // send devices status to the newly connected client
        const json = {};
        for (const connection of connections.values()) {
          if (connection.type === 'device') {
            json[connection.device.id] = connection.serializeState();
          }
        }
        ws.send(`DEVICE_ALL ${JSON.stringify(json)}`);
        return;
      } else if (deviceType === 'fan') {
        const device = getOrRegisterDevice(identification, secret);
        if (!device) {
          ws.send("x error device authentication failed");
          ws.close();
          return;
        }
        conn = new FanDeviceConnection(ws, device);
        connections.set(conn.id, conn);
        console.log(`fan device connected: ${device.name} (${identification})`);
        return;
      }

      ws.send("x error unknown device type");
      ws.close();
      return;
    } else if (conn) {
      const handled = conn.handle(cmd, args);
      if (!handled) {
        console.warn(`unhandled command from ${conn.type}: '${cmd}' with args: '${args}'`);
        ws.send("x error unknown command");
      }
    } else {
      console.warn("received message before HELLO");
      ws.send("x error must send HELLO first");
      ws.close();
      return;
    }
  });

  ws.on("close", () => {
    console.log("x client disconnected");
    if (conn) {
      connections.delete(conn.id);
    }
  });
});

wss.on("close", () => {
  clearInterval(interval);
});

console.log(`v websocket server running on port ${PORT}`);
