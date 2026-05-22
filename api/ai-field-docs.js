import { createClient } from "@supabase/supabase-js";

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

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isAdminRole(role) {
  return ["owner", "admin", "supervisor"].includes(normalizeRole(role));
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeMediaType(value) {
  const text = normalizeText(value).toLowerCase();
  if (["photo", "video", "receipt", "document"].includes(text)) return text;
  return "photo";
}

function normalizeDocumentationType(value, mediaType = "photo") {
  const text = normalizeText(value).toLowerCase();
  if (["before", "after", "daily_progress", "receipt", "video", "clockout", "document", "other"].includes(text)) {
    return text;
  }
  if (mediaType === "receipt") return "receipt";
  if (mediaType === "video") return "video";
  if (mediaType === "document") return "document";
  return "daily_progress";
}

function outputTextFromResponse(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseJsonFromText(text) {
  const raw = normalizeText(text);
  if (!raw) return null;
  const direct = safeJsonParse(raw);
  if (direct) return direct;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const objectJson = safeJsonParse(raw.slice(start, end + 1));
    if (objectJson) return objectJson;
  }
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const arrayJson = safeJsonParse(raw.slice(arrayStart, arrayEnd + 1));
    if (arrayJson) return arrayJson;
  }
  return null;
}

function compactMediaRow(row) {
  const mediaType = normalizeMediaType(row?.media_type);
  return {
    id: row?.id || null,
    project_name: row?.project_name || "",
    cost_centre: row?.cost_centre || "",
    employee_name: row?.employee_name || "",
    media_type: mediaType,
    documentation_type: normalizeDocumentationType(row?.documentation_type, mediaType),
    captured_at: row?.captured_at || row?.created_at || "",
    amount: row?.amount ?? null,
    supplier: row?.supplier || "",
    receipt_status: row?.receipt_status || "",
    duration_seconds: row?.duration_seconds ?? null,
    notes: row?.notes || "",
    source: row?.source || "",
    public_url: row?.public_url || "",
  };
}

function compactTimesheetRow(row) {
  return {
    employee_name: row?.employee_name || row?.employee_email || "",
    project_name: row?.project_name || "",
    cost_centre: row?.cost_centre || "",
    clock_in: row?.clock_in || "",
    clock_out: row?.clock_out || "",
    status: row?.status || "",
  };
}

function compactListItem(row) {
  return {
    kind: row?.kind || "",
    status: row?.status || "",
    text: row?.text || "",
    project_name: row?.project_name || "",
    cost_centre: row?.cost_centre || "",
    created_at: row?.created_at || "",
    completed_at: row?.completed_at || "",
  };
}

async function callOpenAi({ action, mediaRow, context }) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_V4 || "";
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      message: "AI not configured yet.",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseInstructions = [
    "You are OPERA.AI's field documentation assistant for construction teams.",
    "Return concise, practical output for supervisors.",
    "Do not invent supplier names, amounts, dates, or safety issues.",
    "When asked for JSON, return valid JSON only.",
  ].join(" ");

  let prompt;
  let wantsJson = true;
  if (action === "receipt_ocr") {
    prompt = [
      "Read this receipt image if available. Return JSON with keys:",
      "supplier, date, subtotal, tax, total_amount, likely_category, line_items, confidence, notes.",
      "Use null when a value is not visible. Categories should be one of Plumbing, Electrical, Drywall, Framing, Flooring, Paint, Tools, Rental, General materials, Other.",
      `Metadata: ${JSON.stringify(compactMediaRow(mediaRow))}`,
    ].join("\n");
  } else if (action === "photo_tags") {
    prompt = [
      "Suggest documentation tags for this field media. Return JSON with keys:",
      "tags, likely_documentation_type, likely_category, confidence, notes.",
      "Allowed tags include before, after, progress, framing, drywall, electrical, plumbing, flooring, painting, cleanup, issue, damage, completed work.",
      "Allowed documentation types: before, after, daily_progress, receipt, video, clockout, document, other.",
      `Metadata: ${JSON.stringify(compactMediaRow(mediaRow))}`,
    ].join("\n");
  } else if (action === "daily_summary") {
    wantsJson = false;
    prompt = [
      "Create a short internal daily work summary from the provided records.",
      "Include work completed, media count, receipts/material activity, and missing documentation risks.",
      "Keep it under 180 words.",
      JSON.stringify(context || {}, null, 2),
    ].join("\n");
  } else if (action === "customer_update") {
    wantsJson = false;
    prompt = [
      "Draft a professional customer update from the provided field records.",
      "Do not mention labour cost or internal employee details.",
      "Mention progress and available photos/receipts only when supported by records.",
      "Keep it friendly, concise, and ready to copy. Do not send anything.",
      JSON.stringify(context || {}, null, 2),
    ].join("\n");
  } else if (action === "alerts") {
    prompt = [
      "Find supervisor-only field documentation alerts. Return JSON with key alerts as an array.",
      "Each alert should have severity, title, detail, project_name, employee_name if relevant.",
      "Look for missing final photo before clock-out, no daily progress photos for active project days, receipts without amount/supplier, high unusual amounts, media without project/task, and long shifts with no media.",
      JSON.stringify(context || {}, null, 2),
    ].join("\n");
  } else {
    return { ok: false, configured: true, message: "Unsupported AI action." };
  }

  const content = [{ type: "input_text", text: prompt }];
  const imageUrl = normalizeText(mediaRow?.public_url);
  const mediaType = normalizeMediaType(mediaRow?.media_type);
  if (imageUrl && ["photo", "receipt"].includes(mediaType) && (action === "receipt_ocr" || action === "photo_tags")) {
    content.push({ type: "input_image", image_url: imageUrl, detail: "low" });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: wantsJson ? `${baseInstructions} Return only valid JSON.` : baseInstructions,
      input: [{ role: "user", content }],
      temperature: 0.2,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || "AI request failed.";
    return { ok: false, configured: true, message };
  }

  const text = outputTextFromResponse(data);
  const parsedJson = wantsJson ? parseJsonFromText(text) : null;
  return {
    ok: true,
    configured: true,
    model,
    text,
    json: parsedJson,
    warning: wantsJson && !parsedJson ? "AI response was not valid JSON. Review the raw output before saving." : "",
  };
}

async function loadContextRows(supabase, { companyId, callerId, callerIsAdmin, filters }) {
  const safeFilters = filters || {};
  const from = normalizeText(safeFilters.dateFrom);
  const to = normalizeText(safeFilters.dateTo);
  let mediaQuery = supabase
    .from("project_media")
    .select("*")
    .eq("company_id", companyId)
    .order("captured_at", { ascending: false })
    .limit(300);
  if (!callerIsAdmin) mediaQuery = mediaQuery.eq("user_id", callerId);
  if (from) mediaQuery = mediaQuery.gte("captured_at", `${from}T00:00:00`);
  if (to) mediaQuery = mediaQuery.lte("captured_at", `${to}T23:59:59.999`);
  if (safeFilters.mediaType && safeFilters.mediaType !== "all") mediaQuery = mediaQuery.eq("media_type", safeFilters.mediaType);
  if (safeFilters.documentationType && safeFilters.documentationType !== "all") mediaQuery = mediaQuery.eq("documentation_type", safeFilters.documentationType);
  if (safeFilters.employeeId && safeFilters.employeeId !== "all") mediaQuery = mediaQuery.eq("user_id", safeFilters.employeeId);
  if (safeFilters.projectName && safeFilters.projectName !== "all") mediaQuery = mediaQuery.eq("project_name", safeFilters.projectName);
  if (safeFilters.costCentre && safeFilters.costCentre !== "all") mediaQuery = mediaQuery.eq("cost_centre", safeFilters.costCentre);

  const { data: mediaRows, error: mediaError } = await mediaQuery;
  if (mediaError) throw mediaError;

  let timesheetQuery = supabase
    .from("timesheets")
    .select("employee_name, employee_email, user_id, project_name, cost_centre, clock_in, clock_out, status")
    .eq("company_id", companyId)
    .order("clock_in", { ascending: false })
    .limit(200);
  if (!callerIsAdmin) timesheetQuery = timesheetQuery.eq("user_id", callerId);
  if (from) timesheetQuery = timesheetQuery.gte("clock_in", `${from}T00:00:00`);
  if (to) timesheetQuery = timesheetQuery.lte("clock_in", `${to}T23:59:59.999`);
  const { data: timesheetRows } = await timesheetQuery;

  let listQuery = supabase
    .from("project_list_items")
    .select("kind, status, text, project_name, cost_centre, created_at, completed_at, user_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!callerIsAdmin) listQuery = listQuery.eq("user_id", callerId);
  if (from) listQuery = listQuery.gte("created_at", `${from}T00:00:00`);
  if (to) listQuery = listQuery.lte("created_at", `${to}T23:59:59.999`);
  const { data: listRows } = await listQuery;

  return {
    filters: safeFilters,
    media: (mediaRows || []).map(compactMediaRow),
    timesheets: (timesheetRows || []).map(compactTimesheetRow),
    list_items: (listRows || []).map(compactListItem),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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
  const action = normalizeText(body.action).toLowerCase();
  const companyId = normalizeText(body.companyId || body.company_id);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const caller = userData?.user;
  if (userErr || !caller?.id) {
    res.status(401).json({ ok: false, error: "Invalid authorization" });
    return;
  }

  if (action === "status") {
    res.status(200).json({
      ok: true,
      configured: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_V4),
      message: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_V4 ? "AI configured" : "AI not configured yet.",
    });
    return;
  }

  if (!action) {
    res.status(400).json({ ok: false, error: "action is required" });
    return;
  }

  if (!companyId) {
    res.status(400).json({ ok: false, error: "companyId is required" });
    return;
  }

  const { data: member, error: memberError } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", caller.id)
    .maybeSingle();
  if (memberError || !member) {
    res.status(403).json({ ok: false, error: "Caller is not in this company" });
    return;
  }

  const callerIsAdmin = isAdminRole(member.role);
  if (["receipt_ocr", "photo_tags", "daily_summary", "customer_update", "alerts"].includes(action) && !callerIsAdmin) {
    res.status(403).json({ ok: false, error: "AI review is supervisor-only" });
    return;
  }

  try {
    if (action === "receipt_ocr" || action === "photo_tags") {
      const mediaId = normalizeText(body.mediaId || body.media_id);
      if (!mediaId) {
        res.status(400).json({ ok: false, error: "mediaId is required" });
        return;
      }
      const { data: row, error } = await supabase
        .from("project_media")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", mediaId)
        .maybeSingle();
      if (error || !row) {
        res.status(404).json({ ok: false, error: "Media record not found" });
        return;
      }
      if (!callerIsAdmin && String(row.user_id) !== String(caller.id)) {
        res.status(403).json({ ok: false, error: "Not allowed" });
        return;
      }
      const result = await callOpenAi({ action, mediaRow: row });
      res.status(200).json(result);
      return;
    }

    if (action === "daily_summary" || action === "customer_update" || action === "alerts") {
      const context = await loadContextRows(supabase, {
        companyId,
        callerId: caller.id,
        callerIsAdmin,
        filters: body.filters || {},
      });
      const result = await callOpenAi({ action, context });
      res.status(200).json({ ...result, context_counts: {
        media: context.media.length,
        timesheets: context.timesheets.length,
        list_items: context.list_items.length,
      } });
      return;
    }

    res.status(400).json({ ok: false, error: "Unsupported action" });
  } catch (err) {
    console.warn("[AI_FIELD_DOCS] request failed", err);
    res.status(500).json({ ok: false, error: err?.message || "AI request failed" });
  }
}
