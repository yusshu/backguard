const dotenv = require("dotenv");
dotenv.config({ quiet: true });

const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const wss = new WebSocket.WebSocketServer({ host: '0.0.0.0', port: PORT });

let fanStatus = "off"; // off | slow | medium | fast

function isValidStatus(status) {
  return ["off", "slow", "medium", "fast"].includes(status);
}

function broadcast(message) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on("connection", (ws) => {
  console.log("x client connected");

  // Send current state immediately
  ws.send(`STATUS ${fanStatus}`);

  ws.on("message", (data) => {
    const msg = data.toString().trim();
    console.log("d received:", msg);

    if (msg === "CHECK_STATUS") {
      ws.send(`STATUS ${fanStatus}`);
      return;
    }

    if (msg.startsWith("STATUS ")) {
      const status = msg.split(" ")[1];

      if (isValidStatus(status)) {
        fanStatus = status;
        console.log("v fan status updated by device:", fanStatus);
        broadcast(`STATUS ${fanStatus}`);
      }
      return;
    }

    if (msg.startsWith("SET_STATUS ")) {
      const status = msg.split(" ")[1];

      if (!isValidStatus(status)) {
        ws.send("x error invalid status");
        return;
      }

      fanStatus = status;
      console.log("v fan status set by client:", fanStatus);

      broadcast(`SET_STATUS ${fanStatus}`);
      broadcast(`STATUS ${fanStatus}`);
      return;
    }

    if (msg.startsWith("SET_WIFI ")) {
      const jsonPart = msg.substring(9);
      try {
        const wifiConfig = JSON.parse(jsonPart);

        if (!wifiConfig.ssid || typeof wifiConfig.ssid !== "string") {
          ws.send("x error missing SSID");
          return;
        }

        if (!wifiConfig.password || typeof wifiConfig.password !== "string") {
          ws.send("x error missing password");
          return;
        }

        console.log(
          `v updated WiFi config: SSID=${wifiConfig.ssid} PASSWORD=${"*".repeat(wifiConfig.password.length)}`
        );

        broadcast(`SET_WIFI ${JSON.stringify(wifiConfig)}`);
        return;
      } catch {
        ws.send("x error invalid WiFi config");
        return;
      }
    }

    ws.send("x error unknown command");
  });

  ws.on("close", () => {
    console.log("x client disconnected");
  });
});

console.log(`v WebSocket server running on port ${PORT}`);
