import { createClient } from "@supabase/supabase-js";
import { loadSharedServerEnv } from "./sharedEnv.js";
import {
  assertCompanyAdmin,
  buildDailyReport,
  calendarDateKeyInTimeZone,
  cleanText,
  DEFAULT_TIME_ZONE,
  finishDailyReportSend,
  formatDailyReportEmailHtml,
  formatDailyReportEmailText,
  reserveDailyReportSend,
} from "./dailyReport.js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function headerValue(req, name) {
  const key = String(name || "").toLowerCase();
  const value = req.headers?.[key] ?? req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestOrigin(req) {
  const host = headerValue(req, "x-forwarded-host") || headerValue(req, "host");
  if (!host) return "https://project-rui1d.vercel.app";
  const proto = headerValue(req, "x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function emailConfigStatus() {
  loadSharedServerEnv();
  const clientId = process.env.GMAIL_CLIENT_ID || "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || "";
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN || "";
  const senderEmail = process.env.GMAIL_SENDER_EMAIL || "";
  const sendEnabled = String(process.env.GMAIL_SEND_ENABLED || "").toLowerCase() === "true";
  return {
    clientId,
    clientSecret,
    refreshToken,
    senderEmail,
    configured: Boolean(clientId && clientSecret && refreshToken && senderEmail),
    sendEnabled,
  };
}

function publicEmailConfig(config) {
  return {
    configured: config.configured,
    sendEnabled: config.sendEnabled,
    senderConfigured: Boolean(config.senderEmail),
  };
}

function isValidEmail(value) {
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

async function sendGmailMessage({ config, recipientEmail, subject, text, html }) {
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

export default async function handler(req, res) {
  loadSharedServerEnv();

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ ok: false, error: "Server misconfigured" });
    return;
  }

  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ ok: false, error: "Missing authorization" });
    return;
  }

  const body = parseBody(req);
  const companyId = cleanText(body.company_id);
  const reportDate = cleanText(body.report_date) || calendarDateKeyInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const recipientEmail = cleanText(body.recipient_email);
  const shouldSend = body.send === true;

  if (!companyId) {
    res.status(400).json({ ok: false, error: "company_id is required" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    res.status(400).json({ ok: false, error: "report_date must be YYYY-MM-DD" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const caller = userData?.user;
  if (userErr || !caller?.id) {
    res.status(401).json({ ok: false, error: "Invalid authorization" });
    return;
  }

  try {
    await assertCompanyAdmin(supabase, { companyId, userId: caller.id });
    const report = await buildDailyReport(supabase, {
      companyId,
      reportDate,
      origin: requestOrigin(req),
    });
    const subject = `OPERA.AI Daily Field Report - ${report.companyName} - ${report.reportDateLabel}`;
    const text = formatDailyReportEmailText(report);
    const html = formatDailyReportEmailHtml(report);
    const config = emailConfigStatus();
    const configStatus = publicEmailConfig(config);

    if (!shouldSend) {
      res.status(200).json({
        ok: true,
        dryRun: true,
        configured: configStatus.configured,
        sendEnabled: configStatus.sendEnabled,
        config: configStatus,
        subject,
        text,
        html,
        summary: report,
        warning: configStatus.configured ? "" : "Gmail sending is not configured yet.",
      });
      return;
    }

    if (!isValidEmail(recipientEmail)) {
      res.status(400).json({ ok: false, error: "A valid recipient_email is required to send", subject, text, config: configStatus });
      return;
    }
    if (!config.configured) {
      res.status(200).json({
        ok: true,
        dryRun: true,
        sent: false,
        configured: false,
        sendEnabled: false,
        config: configStatus,
        subject,
        text,
        html,
        summary: report,
        warning: "Gmail sending is not configured yet.",
      });
      return;
    }
    if (!config.sendEnabled) {
      res.status(200).json({
        ok: true,
        dryRun: true,
        sent: false,
        configured: true,
        sendEnabled: false,
        config: configStatus,
        subject,
        text,
        html,
        summary: report,
        warning: "Email sending is disabled until Controller approval sets GMAIL_SEND_ENABLED=true.",
      });
      return;
    }

    const reservation = await reserveDailyReportSend(supabase, {
      companyId,
      reportDate: report.reportDate,
      channel: "email",
      recipient: recipientEmail.toLowerCase(),
    });
    if (reservation.missingTable) {
      res.status(200).json({
        ok: true,
        dryRun: true,
        sent: false,
        configured: true,
        sendEnabled: true,
        config: configStatus,
        subject,
        text,
        html,
        summary: report,
        warning: "daily_report_logs SQL must be applied before real email sending is enabled.",
      });
      return;
    }
    if (reservation.duplicate) {
      res.status(200).json({
        ok: true,
        dryRun: true,
        sent: false,
        configured: true,
        sendEnabled: true,
        config: configStatus,
        subject,
        text,
        html,
        summary: report,
        warning: "Duplicate daily email report already reserved or sent for this recipient/date.",
      });
      return;
    }
    if (!reservation.ok) {
      throw new Error(reservation.error?.message || "Daily report duplicate-send reservation failed");
    }

    try {
      const result = await sendGmailMessage({ config, recipientEmail, subject, text, html });
      await finishDailyReportSend(supabase, {
        logId: reservation.id,
        status: "sent",
        providerMessageId: result?.id || null,
      });
      res.status(200).json({ ok: true, dryRun: false, sent: true, config: configStatus, subject, text, html, summary: report, result });
    } catch (err) {
      await finishDailyReportSend(supabase, {
        logId: reservation.id,
        status: "failed",
        error: err.message || "Gmail send failed",
      });
      res.status(502).json({ ok: false, error: err.message || "Gmail send failed", config: configStatus, subject, text, html, summary: report });
    }
  } catch (err) {
    const status = Number(err?.statusCode || 500);
    res.status(status >= 400 && status < 600 ? status : 500).json({ ok: false, error: err.message || "Email report request failed" });
  }
}
