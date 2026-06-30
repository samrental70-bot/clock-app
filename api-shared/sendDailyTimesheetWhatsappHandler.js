import { createClient } from "@supabase/supabase-js";
import { loadSharedServerEnv } from "./sharedEnv.js";
import {
  assertCompanyAdmin,
  buildDailyReport,
  calendarDateKeyInTimeZone,
  cleanText,
  DEFAULT_TIME_ZONE,
  finishDailyReportSend,
  formatDailyReportWhatsAppText,
  formatHoursDecimal,
  formatMoney,
  reserveDailyReportSend,
} from "./dailyReport.js";

function whatsappGraphVersion() {
  loadSharedServerEnv();
  return process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
}

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

function normalizePhone(value) {
  return cleanText(value).replace(/[^\d+]/g, "");
}

function whatsappConfigStatus() {
  loadSharedServerEnv();
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const templateName = process.env.WHATSAPP_DAILY_REPORT_TEMPLATE_NAME || "";
  const templateLanguage = process.env.WHATSAPP_DAILY_REPORT_TEMPLATE_LANGUAGE || "en";
  const sendEnabled = String(process.env.WHATSAPP_SEND_ENABLED || "").toLowerCase() === "true";
  return {
    token,
    phoneNumberId,
    businessAccountId,
    templateName,
    templateLanguage,
    configured: Boolean(token && phoneNumberId && templateName),
    businessAccountConfigured: Boolean(businessAccountId),
    sendEnabled,
  };
}

function publicWhatsAppConfig(config) {
  return {
    configured: config.configured,
    sendEnabled: config.sendEnabled,
    businessAccountConfigured: config.businessAccountConfigured,
    templateName: config.templateName || "daily_timesheet_report",
    templateLanguage: config.templateLanguage || "en",
  };
}

async function sendWhatsAppTemplate({ config, recipientPhone, report }) {
  const endpoint = `https://graph.facebook.com/${whatsappGraphVersion()}/${config.phoneNumberId}/messages`;
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
    const message = json?.error?.message || "WhatsApp Cloud API send failed";
    throw new Error(message);
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
  const recipientPhone = normalizePhone(body.recipient_phone);
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
    const message = formatDailyReportWhatsAppText(report);
    const config = whatsappConfigStatus();
    const configStatus = publicWhatsAppConfig(config);

    if (!shouldSend) {
      res.status(200).json({
        ok: true,
        dryRun: true,
        configured: configStatus.configured,
        sendEnabled: configStatus.sendEnabled,
        config: configStatus,
        message,
        summary: report,
        warning: configStatus.configured ? "" : "WhatsApp Business is not configured yet.",
      });
      return;
    }

    if (!recipientPhone) {
      res.status(400).json({ ok: false, error: "recipient_phone is required to send", message, summary: report, config: configStatus });
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
        message,
        summary: report,
        warning: "WhatsApp Business is not configured yet.",
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
        message,
        summary: report,
        warning: "WhatsApp sending is disabled until Controller approval sets WHATSAPP_SEND_ENABLED=true.",
      });
      return;
    }

    const reservation = await reserveDailyReportSend(supabase, {
      companyId,
      reportDate: report.reportDate,
      channel: "whatsapp",
      recipient: recipientPhone,
    });
    if (reservation.missingTable) {
      res.status(200).json({
        ok: true,
        dryRun: true,
        sent: false,
        configured: true,
        sendEnabled: true,
        config: configStatus,
        message,
        summary: report,
        warning: "daily_report_logs SQL must be applied before real WhatsApp sending is enabled.",
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
        message,
        summary: report,
        warning: "Duplicate daily WhatsApp report already reserved or sent for this recipient/date.",
      });
      return;
    }
    if (!reservation.ok) {
      throw new Error(reservation.error?.message || "Daily report duplicate-send reservation failed");
    }

    try {
      const result = await sendWhatsAppTemplate({ config, recipientPhone, report });
      await finishDailyReportSend(supabase, {
        logId: reservation.id,
        status: "sent",
        providerMessageId: result?.messages?.[0]?.id || null,
      });
      res.status(200).json({ ok: true, dryRun: false, sent: true, config: configStatus, message, summary: report, result });
    } catch (err) {
      await finishDailyReportSend(supabase, {
        logId: reservation.id,
        status: "failed",
        error: err.message || "WhatsApp send failed",
      });
      res.status(502).json({ ok: false, error: err.message || "WhatsApp send failed", config: configStatus, message, summary: report });
    }
  } catch (err) {
    const status = Number(err?.statusCode || 500);
    res.status(status >= 400 && status < 600 ? status : 500).json({ ok: false, error: err.message || "WhatsApp report request failed" });
  }
}
