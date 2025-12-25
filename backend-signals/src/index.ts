import Fastify from "fastify";
import { getSignals } from "./api.js";

const app = Fastify();

app.get("/api/signals", async (req, reply) => {
  const { chainId, token } = req.query as any;
  if (!chainId || !token) {
    return reply.code(400).send({ error: "Missing params" });
  }

  return getSignals(Number(chainId), token.toLowerCase());
});

app.listen({ port: 4001, host: "0.0.0.0" });
console.log("Signals backend running on :4001");
