import aiFieldDocsHandler from "../api-handlers/ai-field-docs.js";
import assignDefaultProjectsHandler from "../api-handlers/assign-default-projects.js";
import autoClockoutHandler from "../api-handlers/auto-clockout.js";
import chatHandler from "../api-handlers/chat.js";
import createEmployeeHandler from "../api-handlers/create-employee.js";
import createProjectTaskHandler from "../api-handlers/create-project-task.js";
import dailySupervisorReportCronHandler from "../api-handlers/daily-supervisor-report-cron.js";
import hdIntelligenceHandler from "../api-handlers/hd-intelligence.js";
import payrollBalanceReminderHandler from "../api-handlers/payroll-balance-reminder.js";
import projectMediaHandler from "../api-handlers/project-media.js";
import sendDailyTimesheetReportHandler from "../api-handlers/send-daily-timesheet-report.js";
import sendPushHandler from "../api-handlers/send-push.js";
import updateEmployeeLoginHandler from "../api-handlers/update-employee-login.js";
import updateEmployeeProfileHandler from "../api-handlers/update-employee-profile.js";
import updateProjectHandler from "../api-handlers/update-project.js";

const ROUTE_HANDLERS = {
  "ai-field-docs": aiFieldDocsHandler,
  "assign-default-projects": assignDefaultProjectsHandler,
  "auto-clockout": autoClockoutHandler,
  "chat": chatHandler,
  "create-employee": createEmployeeHandler,
  "create-project-task": createProjectTaskHandler,
  "daily-supervisor-report-cron": dailySupervisorReportCronHandler,
  "hd-intelligence": hdIntelligenceHandler,
  "payroll-balance-reminder": payrollBalanceReminderHandler,
  "project-media": projectMediaHandler,
  "send-daily-timesheet-report": sendDailyTimesheetReportHandler,
  "send-push": sendPushHandler,
  "update-employee-login": updateEmployeeLoginHandler,
  "update-employee-profile": updateEmployeeProfileHandler,
  "update-project": updateProjectHandler,
};

function normalizeRoutePath(req) {
  const queryPath = req?.query?.path;
  if (Array.isArray(queryPath) && queryPath.length > 0) {
    return String(queryPath[0] || "").trim();
  }
  if (typeof queryPath === "string" && queryPath.trim()) {
    return queryPath.trim().split("/")[0];
  }
  const rawUrl = String(req?.url || "");
  const cleanUrl = rawUrl.split("?")[0] || "";
  const segments = cleanUrl.split("/").filter(Boolean);
  const apiIndex = segments.findIndex((segment) => segment === "api");
  if (apiIndex >= 0 && segments.length > apiIndex + 1) {
    return String(segments[apiIndex + 1] || "").trim();
  }
  return "";
}

function applyCorsHeaders(req, res) {
  const origin = String(req.headers?.origin || "");
  const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (!isLocalDevOrigin) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
  return true;
}

export default async function handler(req, res) {
  applyCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  const routeKey = normalizeRoutePath(req);
  const routeHandler = ROUTE_HANDLERS[routeKey];
  if (!routeHandler) {
    res.status(404).json({
      error: routeKey ? `Unknown API route: ${routeKey}` : "Missing API route",
    });
    return;
  }
  return routeHandler(req, res);
}
