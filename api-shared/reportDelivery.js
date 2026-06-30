import { loadSharedServerEnv } from "./sharedEnv.js";
import { cleanText, formatHoursDecimal, formatMoney } from "./dailyReport.js";

function readEnv(name) {
  loadSharedServerEnv();
  return process.env[name] || "";
}

function envFlagEnabled(name) {
  return String(readEnv(name)).toLowerCase() === "true";
}

export function emailConfigStatus() {
  const clientId = readEnv("GMAIL_CLIENT_ID");
  const clientSecret = readEnv("GMAIL_CLIENT_SECRET");
  const refreshToken = readEnv("GMAIL_REFRESH_TOKEN");
  const senderEmail = readEnv("GMAIL_SENDER_EMAIL");
  return {
    clientId,
    clientSecret,
    refreshToken,
    senderEmail,
    configured: Boolean(clientId && clientSecret && refreshToken && senderEmail),
    sendEnabled: envFlagEnabled("GMAIL_SEND_ENABLED"),
  };
}

export function publicEmailConfig(config = emailConfigStatus()) {
  return {
    configured: Boolean(config.configured),
    sendEnabled: Boolean(config.sendEnabled),
    senderConfigured: Boolean(config.senderEmail),
  };
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText(value));
}

function encodeMimeHeader(value) {
  const text = cleanText(value);
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function base64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getGmailAccessToken(config) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || "Gmail token refresh failed");
  }
  return json.access_token;
}

export async function sendGmailMessage({ config, recipientEmail, subject, text, html }) {
  const boundary = `opera_daily_${Date.now().toString(36)}`;
  const raw = [
    `From: OPERA.AI <${config.senderEmail}>`,
    `To: ${recipientEmail}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const accessToken = await getGmailAccessToken(config);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64Url(raw) }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message || "Gmail send failed");
  }
  return json;
}

export function normalizePhone(value) {
  return cleanText(value).replace(/[^\d+]/g, "");
}

export function whatsappConfigStatus() {
  const token = readEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = readEnv("WHATSAPP_PHONE_NUMBER_ID");
  const businessAccountId = readEnv("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const templateName = readEnv("WHATSAPP_DAILY_REPORT_TEMPLATE_NAME");
  const templateLanguage = readEnv("WHATSAPP_DAILY_REPORT_TEMPLATE_LANGUAGE") || "en";
  return {
    token,
    phoneNumberId,
    businessAccountId,
    templateName,
    templateLanguage,
    configured: Boolean(token && phoneNumberId && templateName),
    businessAccountConfigured: Boolean(businessAccountId),
    sendEnabled: envFlagEnabled("WHATSAPP_SEND_ENABLED"),
  };
}

export function publicWhatsAppConfig(config = whatsappConfigStatus()) {
  return {
    configured: Boolean(config.configured),
    sendEnabled: Boolean(config.sendEnabled),
    businessAccountConfigured: Boolean(config.businessAccountConfigured),
    templateName: config.templateName || "daily_timesheet_report",
    templateLanguage: config.templateLanguage || "en",
  };
}

export async function sendWhatsAppTemplate({ config, recipientPhone, report }) {
  const graphVersion = readEnv("WHATSAPP_GRAPH_VERSION") || "v20.0";
  const endpoint = `https://graph.facebook.com/${graphVersion}/${config.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: normalizePhone(recipientPhone),
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage || "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: report.companyName },
            { type: "text", text: report.reportDateLabel },
            { type: "text", text: String(report.employeesWorked) },
            { type: "text", text: formatHoursDecimal(report.completedMinutes) },
            { type: "text", text: formatMoney(report.labour) },
            { type: "text", text: report.appTimesheetsUrl },
          ],
        },
      ],
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message || "WhatsApp Cloud API send failed");
  }
  return json;
}
