const dotenv = require("dotenv");
dotenv.config({ quiet: true });

const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let fanStatus = "off"; // off | slow | medium | fast

function isValidStatus(status) {
  return ["off", "slow", "medium", "fast"].includes(status);
}

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on("connection", (ws, req) => {
  console.log("x client connected");

  // send current state immediately
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

      // Broadcast so ESP32 + UI sync
      broadcast(`SET_STATUS ${fanStatus}`);
      broadcast(`STATUS ${fanStatus}`);
      return;
    }

    ws.send("x error unknown command");
  });

  ws.on("close", () => 
    console.log("x client disconnected"));
});

server.listen(PORT, () =>
  console.log(`v server running on port ${PORT}`));
