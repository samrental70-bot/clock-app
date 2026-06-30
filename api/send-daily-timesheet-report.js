import sendDailyTimesheetEmail from "../api-shared/sendDailyTimesheetEmailHandler.js";
import sendDailyTimesheetWhatsapp from "../api-shared/sendDailyTimesheetWhatsappHandler.js";

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

export default async function handler(req, res) {
  const body = parseBody(req);
  const channel = String(body.channel || req.query?.channel || "").trim().toLowerCase();
  if (channel === "email") return sendDailyTimesheetEmail(req, res);
  if (channel === "whatsapp") return sendDailyTimesheetWhatsapp(req, res);
  res.status(400).json({ error: "Missing or unsupported report channel" });
}
