import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEV_REF = "jvlxahskximvbajjwbut";
const DEV_APP_URL = process.env.DEV_APP_URL || "https://project-rui1d-development.vercel.app";

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function maskRef(url) {
  const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!match) return "";
  const ref = match[1];
  return `...${ref.slice(-6)}`;
}

async function expectTableReadable(supabase, table, select = "id") {
  const { error } = await supabase.from(table).select(select).limit(1);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function smokePost(path, expectedStatuses) {
  const response = await fetch(`${DEV_APP_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${path}: expected ${expectedStatuses.join("/")} but got ${response.status}`);
  }
  return response.status;
}

const env = {
  ...readEnvFile(".env.development"),
  ...process.env,
};

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey) {
  console.error("[b2-dev-readiness] missing development SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!url.includes(DEV_REF)) {
  console.error(`[b2-dev-readiness] blocked: expected dev Supabase ref ...${DEV_REF.slice(-6)}, got ${maskRef(url) || "unknown"}`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];

try {
  await expectTableReadable(supabase, "employee_pay_rates", "id, company_id, employee_id, hourly_rate, effective_date");
  results.push("employee_pay_rates readable");
  await expectTableReadable(supabase, "daily_report_logs", "id, company_id, report_date, channel, status");
  results.push("daily_report_logs readable");
  await expectTableReadable(supabase, "chat_conversations", "id, company_id, type, name, is_default");
  results.push("chat_conversations readable");
  await expectTableReadable(supabase, "chat_conversation_members", "id, company_id, conversation_id, user_id");
  results.push("chat_conversation_members readable");
  await expectTableReadable(supabase, "chat_messages", "id, company_id, conversation_id, sender_user_id, body");
  results.push("chat_messages readable");
  await expectTableReadable(supabase, "live_locations", "id, company_id, employee_id, timesheet_id, latitude, longitude, status");
  results.push("live_locations readable");
  await expectTableReadable(
    supabase,
    "project_media",
    "id, receipt_supplier, receipt_date, receipt_subtotal, receipt_hst, receipt_total, receipt_currency, receipt_material_category, receipt_material_type, receipt_ocr_status"
  );
  results.push("project_media receipt OCR columns readable");

  const apiResults = [];
  apiResults.push(`/api/chat ${await smokePost("/api/chat", [401])}`);
  apiResults.push(`/api/project-media ${await smokePost("/api/project-media", [401])}`);
  apiResults.push(`/api/create-project-task ${await smokePost("/api/create-project-task", [401])}`);
  apiResults.push(`/api/ai-field-docs ${await smokePost("/api/ai-field-docs", [401])}`);
  apiResults.push(`/api/send-daily-timesheet-report ${await smokePost("/api/send-daily-timesheet-report", [400])}`);

  console.log(`[b2-dev-readiness] dev Supabase ${maskRef(url)} verified`);
  for (const line of results) console.log(`- ${line}`);
  for (const line of apiResults) console.log(`- ${line}`);
} catch (error) {
  console.error(`[b2-dev-readiness] failed: ${error.message}`);
  process.exit(1);
}
