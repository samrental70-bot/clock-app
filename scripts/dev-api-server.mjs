/**
 * Local dev harness for the consolidated Vercel API router.
 * Serves api/[...path].js on a local port so `vite dev` can proxy /api/* to it.
 * Loads env from .env.development (dev Supabase only). Never used in deployments.
 *
 * Usage: node scripts/dev-api-server.mjs [port]
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DEV_REF = "jvlxahskximvbajjwbut";

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
  return out;
}

readEnvFile(resolve(process.cwd(), ".env.development"));

const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "");
if (!supabaseUrl.includes(DEV_REF)) {
  console.error(`[dev-api] Blocked: env does not point at dev ref ${DEV_REF}.`);
  process.exit(1);
}
process.env.SUPABASE_URL = supabaseUrl;
if (!process.env.SUPABASE_ANON_KEY && process.env.VITE_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
}

const routerUrl = pathToFileURL(resolve(process.cwd(), "api/[...path].js")).href;
const { default: handler } = await import(routerUrl);

const port = Number(process.argv[2] || process.env.OPERA_DEV_API_PORT || 5999);

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const segments = url.pathname.split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  const pathSegments = apiIndex >= 0 ? segments.slice(apiIndex + 1) : segments;
  req.query = { path: pathSegments };
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== "path") req.query[key] = value;
  }

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => {
    res.end(typeof body === "string" ? body : JSON.stringify(body));
    return res;
  };

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    req.body = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error("[dev-api] handler error:", err?.message || err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Local dev API error" }));
      }
    });
  });
});

server.listen(port, () => {
  console.log(`[dev-api] serving api/[...path].js on http://localhost:${port} (dev ref ${DEV_REF})`);
});
