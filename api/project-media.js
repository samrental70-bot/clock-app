import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function normalizeText(value, fallback = null) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeMediaType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["photo", "video", "receipt", "document"].includes(text)) return text;
  return "photo";
}

function normalizeDocumentationType(value, mediaType) {
  const text = String(value || "").trim().toLowerCase();
  if (["before", "after", "daily_progress", "receipt", "video", "clockout", "document", "other"].includes(text)) {
    return text;
  }
  if (mediaType === "receipt") return "receipt";
  if (mediaType === "video") return "video";
  if (mediaType === "document") return "document";
  return "daily_progress";
}

function normalizeIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function normalizeLocation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeRow(input, fallbackUserId) {
  const mediaType = normalizeMediaType(input?.media_type);
  const storagePath = normalizeText(input?.storage_path);
  if (!storagePath) throw new Error("storage_path is required");
  const capturedAt = normalizeIso(input?.captured_at);
  const amount = input?.amount == null || input.amount === "" ? null : Number(input.amount);
  return {
    company_id: input?.company_id,
    project_id: input?.project_id == null ? null : String(input.project_id),
    project_name: normalizeText(input?.project_name),
    cost_centre_id: input?.cost_centre_id == null ? null : String(input.cost_centre_id),
    cost_centre: normalizeText(input?.cost_centre),
    user_id: input?.user_id || fallbackUserId,
    employee_name: normalizeText(input?.employee_name, "Employee"),
    media_type: mediaType,
    documentation_type: normalizeDocumentationType(input?.documentation_type, mediaType),
    storage_bucket: normalizeText(input?.storage_bucket, "project-photos"),
    storage_path: storagePath,
    public_url: normalizeText(input?.public_url),
    captured_at: capturedAt,
    uploaded_at: normalizeIso(input?.uploaded_at || capturedAt),
    duration_seconds: input?.duration_seconds == null || input.duration_seconds === "" ? null : Number(input.duration_seconds),
    amount: Number.isFinite(amount) ? amount : null,
    supplier: normalizeText(input?.supplier),
    receipt_status: normalizeText(input?.receipt_status),
    notes: normalizeText(input?.notes),
    source: normalizeText(input?.source),
    related_timesheet_id: normalizeText(input?.related_timesheet_id),
    location: normalizeLocation(input?.location),
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
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing authorization" });
    return;
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const caller = userData?.user;
  if (userErr || !caller?.id) {
    res.status(401).json({ error: "Invalid authorization" });
    return;
  }

  let row;
  try {
    row = normalizeRow(body.row || body, caller.id);
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid media row" });
    return;
  }

  if (!row.company_id) {
    res.status(400).json({ error: "company_id is required" });
    return;
  }

  const { data: callerMember, error: callerMemberErr } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", row.company_id)
    .eq("user_id", caller.id)
    .maybeSingle();

  if (callerMemberErr || !callerMember) {
    res.status(403).json({ error: "Caller is not in this company" });
    return;
  }

  const callerRole = String(callerMember.role || "").trim().toLowerCase();
  const callerIsAdmin = ["owner", "admin", "supervisor"].includes(callerRole);
  if (String(row.user_id) !== String(caller.id)) {
    if (!callerIsAdmin) {
      res.status(403).json({ error: "Cannot save media for another user" });
      return;
    }
    const { data: targetMember, error: targetMemberErr } = await supabase
      .from("company_members")
      .select("id")
      .eq("company_id", row.company_id)
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (targetMemberErr || !targetMember) {
      res.status(403).json({ error: "Target user is not in this company" });
      return;
    }
  }

  const { data, error } = await supabase
    .from("project_media")
    .upsert(row, { onConflict: "company_id,storage_bucket,storage_path" })
    .select("id")
    .single();

  if (error) {
    console.warn("[PROJECT_MEDIA_API] upsert failed", error);
    res.status(500).json({ error: error.message || "Project media save failed" });
    return;
  }

  res.status(200).json({ ok: true, id: data?.id || null });
}
