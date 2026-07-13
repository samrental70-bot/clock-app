import { createClient } from "@supabase/supabase-js";
import { getSharedAiConfig, getSharedAiStatus } from "../api-shared/sharedEnv.js";
import { verifyUserToken } from "./_verifyUserToken.js";

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

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function sendApiError(res, status, code, message, extra = {}) {
  sendJson(res, status, {
    ok: false,
    code,
    error: message,
    message,
    ...extra,
  });
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

function normalizeCurrency(value) {
  const text = normalizeText(value, "CAD").toUpperCase();
  return text || "CAD";
}

function normalizeNumberOrNull(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function normalizeReceiptJson(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const total = normalizeNumberOrNull(source.total_amount ?? source.receipt_total ?? source.total ?? source.amount);
  const subtotal = normalizeNumberOrNull(source.subtotal ?? source.receipt_subtotal);
  const hst = normalizeNumberOrNull(source.hst ?? source.tax ?? source.receipt_hst);
  const materialCategory = normalizeText(
    source.material_category ?? source.likely_category ?? source.category,
    "other"
  );
  return {
    supplier: normalizeText(source.supplier ?? source.store ?? source.vendor) || null,
    receipt_date: normalizeText(source.receipt_date ?? source.date) || null,
    subtotal,
    hst,
    total_amount: total,
    currency: normalizeCurrency(source.currency),
    material_category: materialCategory || "other",
    material_type: normalizeText(source.material_type ?? source.material ?? source.type) || null,
    confidence: normalizeNumberOrNull(source.confidence),
    notes: normalizeText(source.notes) || null,
    raw_extracted_json: source,
  };
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
    receipt_supplier: row?.receipt_supplier || "",
    receipt_date: row?.receipt_date || "",
    receipt_total: row?.receipt_total ?? null,
    receipt_material_category: row?.receipt_material_category || "",
    receipt_material_type: row?.receipt_material_type || "",
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
  const aiConfig = getSharedAiConfig();
  const apiKey = aiConfig.apiKey;
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      code: "provider_not_configured",
      action,
      message: "AI not configured yet.",
      provider: "openai",
      sourceType: aiConfig.sourceType,
    };
  }

  const model = aiConfig.model || "gpt-4.1-mini";
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
      "supplier, receipt_date, subtotal, hst, total_amount, currency, material_category, material_type, confidence, notes, line_items.",
      "Use null when a value is not visible. Currency defaults to CAD.",
      "material_category must be one of lumber, drywall, electrical, plumbing, paint, flooring, fasteners, tools, rental, safety, general material, other.",
      "material_type should be a short practical material type such as screws, primer, lumber, drywall compound, rental, or other.",
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
  } else if (action === "receipt_ocr") {
    return {
      ok: false,
      configured: true,
      code: "image_unavailable",
      action,
      message: "Receipt image is not available for OCR. Review and save receipt details manually.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        instructions: wantsJson ? `${baseInstructions} Return only valid JSON.` : baseInstructions,
        input: [{ role: "user", content }],
        temperature: 0.2,
      }),
    });
  } catch (err) {
    const timedOut = err?.name === "AbortError";
    return {
      ok: false,
      configured: true,
      code: timedOut ? "provider_timeout" : "provider_request_failed",
      action,
      message: timedOut ? "Receipt OCR timed out. Review and save receipt details manually." : "Receipt OCR request failed. Review and save receipt details manually.",
    };
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || "AI request failed.";
    return { ok: false, configured: true, code: "provider_bad_response", action, message };
  }

  const text = outputTextFromResponse(data);
  const parsedJson = wantsJson ? parseJsonFromText(text) : null;
  const json = action === "receipt_ocr" ? normalizeReceiptJson(parsedJson) : parsedJson;
  return {
    ok: true,
    configured: true,
    code: "",
    action,
    model,
    text,
    json,
    warning: wantsJson && !parsedJson ? "AI response was not valid JSON. Review and save receipt details manually." : "",
    warningCode: wantsJson && !parsedJson ? "provider_bad_response" : "",
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
    sendApiError(res, 405, "method_not_allowed", "Method not allowed");
    return;
  }

  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    sendApiError(res, 500, "server_misconfigured", "Server misconfigured");
    return;
  }

  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    sendApiError(res, 401, "invalid_auth", "Missing authorization");
    return;
  }

  const body = parseBody(req);
  const action = normalizeText(body.action).toLowerCase();
  const companyId = normalizeText(body.companyId || body.company_id);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { user: caller, error: userErr } = await verifyUserToken(url, token, { fallbackClient: supabase });
  if (userErr || !caller?.id) {
    sendApiError(res, 401, "invalid_auth", "Invalid authorization");
    return;
  }

  if (action === "status") {
    const aiStatus = getSharedAiStatus();
    const configured = Boolean(aiStatus.configured);
    sendJson(res, 200, {
      ok: true,
      action,
      configured,
      code: configured ? "" : "provider_not_configured",
      message: configured ? "AI configured" : "AI not configured yet.",
      provider: aiStatus.provider,
      model: aiStatus.model,
      sourceType: aiStatus.sourceType,
      keyName: aiStatus.keyName,
    });
    return;
  }

  if (!action) {
    sendApiError(res, 400, "validation_failed", "action is required");
    return;
  }

  if (!companyId) {
    sendApiError(res, 400, "validation_failed", "companyId is required");
    return;
  }

  const { data: member, error: memberError } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", caller.id)
    .maybeSingle();
  if (memberError || !member) {
    sendApiError(res, 403, "forbidden_company", "Caller is not in this company");
    return;
  }

  const callerIsAdmin = isAdminRole(member.role);
  if (["photo_tags", "daily_summary", "customer_update", "alerts"].includes(action) && !callerIsAdmin) {
    sendApiError(res, 403, "forbidden_role", "AI review is supervisor-only");
    return;
  }

  try {
    if (action === "receipt_ocr" || action === "photo_tags" || action === "receipt_autoread") {
      const mediaId = normalizeText(body.mediaId || body.media_id);
      if (!mediaId) {
        sendApiError(res, 400, "validation_failed", "mediaId is required");
        return;
      }
      const { data: row, error } = await supabase
        .from("project_media")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", mediaId)
        .maybeSingle();
      if (error || !row) {
        sendApiError(res, 404, "media_not_found", "Media record not found");
        return;
      }
      if (!callerIsAdmin && String(row.user_id) !== String(caller.id)) {
        sendApiError(res, 403, "forbidden_media", "Not allowed");
        return;
      }
      // receipt_autoread: the background read triggered when a team member
      // sends a receipt. Runs the same OpenAI receipt read, but PERSISTS the
      // extracted fields + AI-review status to project_media server-side, so
      // the manager sees the result (and the AI-reviewed tick) even if the
      // sender closed the app immediately.
      if (action === "receipt_autoread") {
        const aiResult = await callOpenAi({ action: "receipt_ocr", mediaRow: row });
        const nowIso = new Date().toISOString();
        const patch = { ai_processed_at: nowIso };
        if (aiResult?.ok && aiResult.json) {
          const j = aiResult.json;
          patch.ai_extracted_json = j.raw_extracted_json || j;
          patch.ai_review_status = "confirmed";
          patch.ai_confidence = normalizeNumberOrNull(j.confidence);
          patch.ai_error = null;
          patch.receipt_ocr_status = "reviewed";
          patch.receipt_ocr_confidence = normalizeNumberOrNull(j.confidence);
          patch.receipt_source = "ocr_auto";
          if (j.supplier != null) patch.receipt_supplier = j.supplier;
          if (j.receipt_date != null) patch.receipt_date = j.receipt_date;
          if (j.total_amount != null) {
            patch.receipt_total = j.total_amount;
            patch.amount = j.total_amount;
          }
          if (j.subtotal != null) patch.receipt_subtotal = j.subtotal;
          if (j.hst != null) patch.receipt_hst = j.hst;
          if (j.currency != null) patch.receipt_currency = j.currency;
          if (j.material_category != null) patch.receipt_material_category = j.material_category;
          if (j.material_type != null) patch.receipt_material_type = j.material_type;
        } else {
          patch.ai_review_status = "failed";
          patch.ai_error = normalizeText(aiResult?.message) || "Receipt could not be read automatically.";
          patch.receipt_ocr_status = "failed";
        }
        // Tolerate projects that haven't applied the newer receipt columns yet:
        // retry with only the always-present ai_* fields if the full patch fails.
        let updateError = null;
        ({ error: updateError } = await supabase.from("project_media").update(patch).eq("id", mediaId));
        if (updateError) {
          const minimal = {
            ai_extracted_json: patch.ai_extracted_json ?? null,
            ai_review_status: patch.ai_review_status,
            ai_processed_at: patch.ai_processed_at,
            ai_error: patch.ai_error ?? null,
          };
          await supabase.from("project_media").update(minimal).eq("id", mediaId);
        }
        sendJson(res, 200, {
          ok: Boolean(aiResult?.ok),
          action,
          configured: Boolean(aiResult?.configured),
          reviewStatus: patch.ai_review_status,
          message: aiResult?.message || "",
          json: aiResult?.json || null,
        });
        return;
      }
      const result = await callOpenAi({ action, mediaRow: row });
      sendJson(res, 200, result);
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
      sendJson(res, 200, { ...result, context_counts: {
        media: context.media.length,
        timesheets: context.timesheets.length,
        list_items: context.list_items.length,
      } });
      return;
    }

    sendApiError(res, 400, "unsupported_action", "Unsupported action");
  } catch (err) {
    console.warn("[AI_FIELD_DOCS] request failed", err);
    sendApiError(res, 500, "server_error", err?.message || "AI request failed");
  }
}
