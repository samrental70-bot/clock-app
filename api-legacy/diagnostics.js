import { getSafeEnvStatus } from "../server/sharedEnvResolver.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const envStatus = getSafeEnvStatus([
    "OPENAI_API_KEY",
    { name: "SUPABASE_URL", aliases: ["VITE_SUPABASE_URL"] },
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  const statusMap = Object.fromEntries(envStatus.map((item) => [item.name, item]));
  res.status(200).json({
    ok: true,
    app: "OPERA.AI",
    openai_configured: statusMap.OPENAI_API_KEY.found,
    supabase_service_configured: statusMap.SUPABASE_SERVICE_ROLE_KEY.found,
    env_status: envStatus,
  });
}
