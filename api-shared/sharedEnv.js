import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_BRIDGE_ROOT = "C:\\Users\\samra\\bridge-app";
const ENV_FILE_NAMES = [".env.local", ".env", ".env.development", ".env.production.local"];

const AI_ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_V4",
  "BRIDGE_OPENAI_API_KEY",
  "COMMON_OPENAI_API_KEY",
];

const AI_MODEL_ENV_NAMES = [
  "OPENAI_RECEIPT_OCR_MODEL",
  "OPENAI_MODEL",
  "BRIDGE_OPENAI_MODEL",
  "COMMON_OPENAI_MODEL",
];

const REPORT_DELIVERY_ENV_NAMES = [
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
  "GMAIL_SEND_ENABLED",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_DAILY_REPORT_TEMPLATE_NAME",
  "WHATSAPP_DAILY_REPORT_TEMPLATE_LANGUAGE",
  "WHATSAPP_GRAPH_VERSION",
  "WHATSAPP_SEND_ENABLED",
  "DAILY_REPORT_CRON_ENABLED",
  "DAILY_REPORT_TIME",
  "DAILY_REPORT_TEST_COMPANY_ID",
  "DAILY_REPORT_CRON_EMAIL_RECIPIENTS",
  "DAILY_REPORT_CRON_WHATSAPP_RECIPIENTS",
  "DEFAULT_COMPANY_TIMEZONE",
  "CRON_SECRET",
];

let sharedEnvLoaded = false;
let sharedEnvSources = [];

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const values = {};
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
    if (key && value) values[key] = value;
  }
  return values;
}

function sourceLabel(filePath, activeProjectRoot, bridgeRoot) {
  const normalized = resolve(filePath);
  if (normalized.startsWith(resolve(activeProjectRoot))) return "active_project_env_file";
  if (normalized.startsWith(resolve(bridgeRoot))) return "bridge_common_env_file";
  return "env_file";
}

export function loadSharedServerEnv({
  activeProjectRoot = process.cwd(),
  bridgeRoot = DEFAULT_BRIDGE_ROOT,
  names = [...AI_ENV_NAMES, ...AI_MODEL_ENV_NAMES, ...REPORT_DELIVERY_ENV_NAMES],
} = {}) {
  if (sharedEnvLoaded) return sharedEnvSources;
  sharedEnvLoaded = true;

  const orderedFiles = [
    ...ENV_FILE_NAMES.map((name) => join(activeProjectRoot, name)),
    ...ENV_FILE_NAMES.map((name) => join(bridgeRoot, name)),
  ];

  const loadedSources = [];
  for (const filePath of orderedFiles) {
    const values = parseEnvFile(filePath);
    const loadedNames = [];
    for (const name of names) {
      if (process.env[name] === undefined && values[name]) {
        process.env[name] = values[name];
        loadedNames.push(name);
      }
    }
    if (loadedNames.length > 0) {
      loadedSources.push({
        sourceType: sourceLabel(filePath, activeProjectRoot, bridgeRoot),
        path: filePath,
        loadedNames,
      });
    }
  }

  sharedEnvSources = loadedSources;
  return sharedEnvSources;
}

function firstEnvValue(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return { name, value };
  }
  return { name: "", value: "" };
}

export function getSharedAiConfig() {
  loadSharedServerEnv();
  const apiKey = firstEnvValue(AI_ENV_NAMES);
  const model = firstEnvValue(AI_MODEL_ENV_NAMES);
  const source = sharedEnvSources.find((item) => item.loadedNames.includes(apiKey.name));
  return {
    configured: Boolean(apiKey.value),
    apiKey: apiKey.value,
    apiKeyName: apiKey.name,
    model: model.value || "gpt-4.1-mini",
    modelName: model.name || "default",
    sourceType: source?.sourceType || (apiKey.value ? "process_env" : "missing"),
  };
}

export function getSharedAiStatus() {
  const config = getSharedAiConfig();
  return {
    configured: config.configured,
    provider: "openai",
    keyName: config.configured ? config.apiKeyName : "",
    model: config.model,
    sourceType: config.sourceType,
  };
}
