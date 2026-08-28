import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function apiDevServer(): Plugin {
  return {
    name: "api-dev-server",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) return next();

        const parsed = new URL(url, "http://localhost");
        const route = parsed.pathname.replace(/^\/api\//, "").replace(/\/$/, "");

        const query: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => {
          query[key] = value;
        });

        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          const handler = mod.default;

          const shimReq = Object.assign(req, {
            query,
            body: await readBody(req),
          });

          const shimRes = {
            statusCode: 200,
            status(code: number) {
              res.statusCode = code;
              return shimRes;
            },
            setHeader(name: string, value: string) {
              res.setHeader(name, value);
              return shimRes;
            },
            send(payload: string) {
              res.end(payload);
              return shimRes;
            },
          };

          await handler(shimReq, shimRes);
        } catch (err) {
          const message = err instanceof Error ? err.message : "handler failed";
          server.config.logger.error(`[api] ${route}: ${message}`);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}
