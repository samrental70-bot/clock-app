import { createClient } from "@supabase/supabase-js";
import {
  buildDailyReport,
  calendarDateKeyInTimeZone,
  cleanText,
  datePartsInTimeZone,
  DEFAULT_TIME_ZONE,
  finishDailyReportSend,
  formatDailyReportEmailHtml,
  formatDailyReportEmailText,
  formatDailyReportWhatsAppText,
  reserveDailyReportSend,
} from "./dailyReport.js";
import {
  emailConfigStatus,
  isValidEmail,
  normalizePhone,
  publicEmailConfig,
  publicWhatsAppConfig,
  sendGmailMessage,
  sendWhatsAppTemplate,
  whatsappConfigStatus,
} from "./reportDelivery.js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
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

function queryParam(req, name) {
  try {
    const host = headerValue(req, "x-forwarded-host") || headerValue(req, "host") || "localhost";
    const proto = headerValue(req, "x-forwarded-proto") || "https";
    const url = new URL(req.url || "", `${proto}://${host}`);
    return url.searchParams.get(name) || "";
  } catch {
    return "";
  }
}

function queryFlag(req, name) {
  const value = cleanText(queryParam(req, name)).toLowerCase();
  return ["1", "true", "yes", "y"].includes(value);
}

function cronEnabled() {
  return String(process.env.DAILY_REPORT_CRON_ENABLED || "").toLowerCase() === "true";
}

function sendFlagEnabled(name) {
  return String(process.env[name] || "").toLowerCase() === "true";
}

function parseRecipients(value) {
  return cleanText(value)
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 20);
}

function sameLocalMinute(timeZone, expectedTime, now) {
  const [hour, minute] = cleanText(expectedTime || "12:00").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const parts = datePartsInTimeZone(now, timeZone || DEFAULT_TIME_ZONE);
  return Boolean(parts && parts.hour === hour && parts.minute === minute);
}

function maskRecipient(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (text.includes("@")) {
    const [name, domain] = text.split("@");
    return `${name.slice(0, 2)}***@${domain || "***"}`;
  }
  const digits = text.replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `${text.startsWith("+") ? "+" : ""}***${digits.slice(-4)}`;
}

async function maybeSendEmailRecipient({ supabase, companyId, report, recipientEmail, subject, text, html, config, configStatus, dryRun }) {
  const maskedRecipient = maskRecipient(recipientEmail);
  if (!isValidEmail(recipientEmail)) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, warning: "Invalid email recipient." };
  }
  if (!config.configured) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, configured: false, config: configStatus, warning: "Gmail sending is not configured yet." };
  }
  if (!config.sendEnabled || dryRun) {
    return {
      recipient: maskedRecipient,
      sent: false,
      dryRun: true,
      configured: config.configured,
      sendEnabled: config.sendEnabled,
      config: configStatus,
      warning: config.sendEnabled ? "Dry-run requested; no email sent." : "Email sending is disabled until GMAIL_SEND_ENABLED=true.",
    };
  }

  const reservation = await reserveDailyReportSend(supabase, {
    companyId,
    reportDate: report.reportDate,
    channel: "email",
    recipient: recipientEmail.toLowerCase(),
  });
  if (reservation.missingTable) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, config: configStatus, warning: "daily_report_logs SQL must be applied before real email sending is enabled." };
  }
  if (reservation.duplicate) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, config: configStatus, warning: "Duplicate daily email report already reserved or sent for this recipient/date." };
  }
  if (!reservation.ok) {
    return { recipient: maskedRecipient, sent: false, dryRun: false, config: configStatus, error: reservation.error?.message || "Daily report duplicate-send reservation failed." };
  }

  try {
    const result = await sendGmailMessage({ config, recipientEmail, subject, text, html });
    await finishDailyReportSend(supabase, {
      logId: reservation.id,
      status: "sent",
      providerMessageId: result?.id || null,
    });
    return { recipient: maskedRecipient, sent: true, dryRun: false, config: configStatus, providerMessageId: result?.id || null };
  } catch (err) {
    await finishDailyReportSend(supabase, {
      logId: reservation.id,
      status: "failed",
      error: err.message || "Gmail send failed",
    });
    return { recipient: maskedRecipient, sent: false, dryRun: false, config: configStatus, error: err.message || "Gmail send failed" };
  }
}

async function maybeSendWhatsAppRecipient({ supabase, companyId, report, recipientPhone, message, config, configStatus, dryRun }) {
  const normalizedPhone = normalizePhone(recipientPhone);
  const maskedRecipient = maskRecipient(normalizedPhone);
  if (!normalizedPhone) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, warning: "Invalid WhatsApp recipient." };
  }
  if (!config.configured) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, configured: false, config: configStatus, warning: "WhatsApp Business is not configured yet." };
  }
  if (!config.sendEnabled || dryRun) {
    return {
      recipient: maskedRecipient,
      sent: false,
      dryRun: true,
      configured: config.configured,
      sendEnabled: config.sendEnabled,
      config: configStatus,
      warning: config.sendEnabled ? "Dry-run requested; no WhatsApp message sent." : "WhatsApp sending is disabled until WHATSAPP_SEND_ENABLED=true.",
    };
  }

  const reservation = await reserveDailyReportSend(supabase, {
    companyId,
    reportDate: report.reportDate,
    channel: "whatsapp",
    recipient: normalizedPhone,
  });
  if (reservation.missingTable) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, config: configStatus, warning: "daily_report_logs SQL must be applied before real WhatsApp sending is enabled." };
  }
  if (reservation.duplicate) {
    return { recipient: maskedRecipient, sent: false, dryRun: true, config: configStatus, warning: "Duplicate daily WhatsApp report already reserved or sent for this recipient/date." };
  }
  if (!reservation.ok) {
    return { recipient: maskedRecipient, sent: false, dryRun: false, config: configStatus, error: reservation.error?.message || "Daily report duplicate-send reservation failed." };
  }

  try {
    const result = await sendWhatsAppTemplate({ config, recipientPhone: normalizedPhone, report });
    await finishDailyReportSend(supabase, {
      logId: reservation.id,
      status: "sent",
      providerMessageId: result?.messages?.[0]?.id || null,
    });
    return { recipient: maskedRecipient, sent: true, dryRun: false, config: configStatus, providerMessageId: result?.messages?.[0]?.id || null, message };
  } catch (err) {
    await finishDailyReportSend(supabase, {
      logId: reservation.id,
      status: "failed",
      error: err.message || "WhatsApp send failed",
    });
    return { recipient: maskedRecipient, sent: false, dryRun: false, config: configStatus, error: err.message || "WhatsApp send failed" };
  }
}

export async function runDailySupervisorReportCron(req) {
  if (!["GET", "POST"].includes(req.method || "")) {
    return { status: 405, body: { ok: false, error: "Method not allowed" } };
  }

  if (!cronEnabled()) {
    return {
      status: 200,
      body: {
        ok: true,
        disabled: true,
        message: "Daily supervisor report cron is disabled until DAILY_REPORT_CRON_ENABLED=true.",
      },
    };
  }

  const cronSecret = process.env.CRON_SECRET || "";
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const providedSecret = bearer || queryParam(req, "secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return { status: 403, body: { ok: false, error: "Cron secret required before enabled daily report checks can run." } };
  }

  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { status: 500, body: { ok: false, error: "Server misconfigured" } };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const configuredTime = cleanText(process.env.DAILY_REPORT_TIME) || "12:00";
  const now = new Date();
  const force = queryFlag(req, "force");
  const dryRunOverride = queryFlag(req, "dryRun") || queryFlag(req, "dry_run") || queryFlag(req, "preview");
  const testCompanyId = cleanText(process.env.DAILY_REPORT_TEST_COMPANY_ID);
  const emailRecipients = parseRecipients(process.env.DAILY_REPORT_CRON_EMAIL_RECIPIENTS || "");
  const whatsappRecipients = parseRecipients(process.env.DAILY_REPORT_CRON_WHATSAPP_RECIPIENTS || "");
  const emailSendingEnabled = sendFlagEnabled("GMAIL_SEND_ENABLED");
  const whatsappSendingEnabled = sendFlagEnabled("WHATSAPP_SEND_ENABLED");
  const emailConfig = emailConfigStatus();
  const whatsappConfig = whatsappConfigStatus();
  const emailConfigPublic = publicEmailConfig(emailConfig);
  const whatsappConfigPublic = publicWhatsAppConfig(whatsappConfig);

  let companyQuery = supabase.from("companies").select("id, name, time_zone").order("name", { ascending: true }).limit(200);
  if (testCompanyId) companyQuery = companyQuery.eq("id", testCompanyId);
  const { data: companies, error } = await companyQuery;
  if (error) {
    return { status: 500, body: { ok: false, error: error.message || "Company scan failed" } };
  }

  const planned = [];
  const skipped = [];
  const delivery = { email: [], whatsapp: [] };
  for (const company of companies || []) {
    const timeZone = company.time_zone || process.env.DEFAULT_COMPANY_TIMEZONE || DEFAULT_TIME_ZONE;
    const reportDate = calendarDateKeyInTimeZone(now, timeZone);
    if (!force && !sameLocalMinute(timeZone, configuredTime, now)) {
      skipped.push({ companyId: company.id, companyName: company.name || "Company", reason: "not-local-report-time", timeZone });
      continue;
    }

    const report = await buildDailyReport(supabase, {
      companyId: company.id,
      reportDate,
      origin: requestOrigin(req),
      now,
    });
    const subject = `OPERA.AI Daily Field Report - ${report.companyName} - ${report.reportDateLabel}`;
    const emailText = formatDailyReportEmailText(report);
    const emailHtml = formatDailyReportEmailHtml(report);
    const whatsappText = formatDailyReportWhatsAppText(report);

    const emailResults = emailRecipients.length
      ? await Promise.all(
          emailRecipients.map((recipientEmail) =>
            maybeSendEmailRecipient({
              supabase,
              companyId: company.id,
              report,
              recipientEmail,
              subject,
              text: emailText,
              html: emailHtml,
              config: emailConfig,
              configStatus: emailConfigPublic,
              dryRun: dryRunOverride,
            })
          )
        )
      : [{ sent: false, dryRun: true, warning: "No cron email recipients configured." }];
    const whatsappResults = whatsappRecipients.length
      ? await Promise.all(
          whatsappRecipients.map((recipientPhone) =>
            maybeSendWhatsAppRecipient({
              supabase,
              companyId: company.id,
              report,
              recipientPhone,
              message: whatsappText,
              config: whatsappConfig,
              configStatus: whatsappConfigPublic,
              dryRun: dryRunOverride,
            })
          )
        )
      : [{ sent: false, dryRun: true, warning: "No cron WhatsApp recipients configured." }];

    delivery.email.push(...emailResults);
    delivery.whatsapp.push(...whatsappResults);
    planned.push({
      companyId: company.id,
      companyName: report.companyName,
      reportDate: report.reportDate,
      timeZone: report.timeZone,
      localTime: configuredTime,
      forced: force,
      email: {
        recipients: emailRecipients.map(maskRecipient),
        sendEnabled: emailSendingEnabled,
        configured: emailConfigPublic.configured,
        dryRun: dryRunOverride || !emailSendingEnabled || !emailConfigPublic.configured || !emailRecipients.length,
        preview: emailText.slice(0, 900),
        results: emailResults,
      },
      whatsapp: {
        recipients: whatsappRecipients.map(maskRecipient),
        sendEnabled: whatsappSendingEnabled,
        configured: whatsappConfigPublic.configured,
        dryRun: dryRunOverride || !whatsappSendingEnabled || !whatsappConfigPublic.configured || !whatsappRecipients.length,
        preview: whatsappText.slice(0, 900),
        results: whatsappResults,
      },
    });
  }

  const allResults = [...delivery.email, ...delivery.whatsapp];
  const sentCount = allResults.filter((item) => item.sent).length;
  const failedCount = allResults.filter((item) => item.error).length;
  const dryRunCount = allResults.filter((item) => item.dryRun).length;

  return {
    status: 200,
    body: {
      ok: true,
      disabled: false,
      dryRun: dryRunOverride || sentCount === 0,
      message:
        sentCount > 0
          ? "Daily supervisor report cron sent configured reports through approved enabled channels."
          : "Daily supervisor report cron checked company-local 12 PM windows. No real sends occurred because one or more gates are still closed or dry-run was requested.",
      configuredTime,
      forced: force,
      channelConfig: {
        email: emailConfigPublic,
        whatsapp: whatsappConfigPublic,
      },
      companiesChecked: (companies || []).length,
      sentCount,
      failedCount,
      dryRunCount,
      planned,
      skipped,
    },
  };
}

export async function handleDailySupervisorReportCron(req, res) {
  const result = await runDailySupervisorReportCron(req);
  res.status(result.status).json(result.body);
}
