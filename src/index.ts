import "dotenv/config";
import { createApp } from "./auth/app.js";
import { Store } from "./data/store.js";
import { Server } from "./ws/server.js";
import { prisma } from "./data/prisma.js";

const WS_PORT = Number(process.env.WS_PORT ?? 3000);
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 5000);

const store = new Store(prisma);

const server = new Server(store, "0.0.0.0", WS_PORT);
server.start();

const app = createApp(store);
app.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`✓ http server running on ${HTTP_PORT}`);
});

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
