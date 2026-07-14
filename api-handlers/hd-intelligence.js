import { createClient } from "@supabase/supabase-js";
import { getSharedAiConfig } from "../api-shared/sharedEnv.js";
import { verifyUserToken } from "./_verifyUserToken.js";

// Home Depot store-intelligence AI: classify list items into departments
// (knowledge-based, no aisle guessing) and read exact name/price/aisle off
// photos. Aisle numbers are NEVER invented here — they only come from the
// crew's confirmed input or what is legibly visible in an aisle-scan photo.

const HD_DEPARTMENTS = [
  "Lumber",
  "Building Materials",
  "Drywall",
  "Electrical",
  "Plumbing",
  "Paint",
  "Flooring",
  "Hardware & Fasteners",
  "Tools",
  "Doors & Windows",
  "Kitchen & Bath",
  "Millwork & Trim",
  "Insulation",
  "Outdoor & Garden",
  "Cleaning",
  "Other",
];

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

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNumberOrNull(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeDepartment(value) {
  const text = normalizeText(value);
  const match = HD_DEPARTMENTS.find((dep) => dep.toLowerCase() === text.toLowerCase());
  return match || "Other";
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

function parseJsonFromText(text) {
  const raw = normalizeText(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* try to extract */
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* noop */
    }
  }
  const aStart = raw.indexOf("[");
  const aEnd = raw.lastIndexOf("]");
  if (aStart >= 0 && aEnd > aStart) {
    try {
      return JSON.parse(raw.slice(aStart, aEnd + 1));
    } catch {
      /* noop */
    }
  }
  return null;
}

async function callOpenAi({ prompt, imageUrl = "", wantsJson = true, model }) {
  const aiConfig = getSharedAiConfig();
  const apiKey = aiConfig.apiKey;
  if (!apiKey) return { ok: false, configured: false, message: "AI not configured." };
  const activeModel = model || (imageUrl ? "gpt-4o" : aiConfig.model || "gpt-4o-mini");
  const content = [{ type: "input_text", text: prompt }];
  if (imageUrl) content.push({ type: "input_image", image_url: imageUrl, detail: "high" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: activeModel,
        instructions:
          "You classify hardware/construction shopping-list items and read product photos for a Home Depot Canada pick list. Never invent aisle numbers or prices that are not visible. Return only valid JSON when asked.",
        input: [{ role: "user", content }],
        temperature: 0.1,
      }),
    });
  } catch (err) {
    return { ok: false, configured: true, message: err?.name === "AbortError" ? "AI timed out." : "AI request failed." };
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, configured: true, message: data?.error?.message || "AI request failed." };
  const text = outputTextFromResponse(data);
  return { ok: true, configured: true, text, json: wantsJson ? parseJsonFromText(text) : null };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    sendJson(res, 500, { ok: false, error: "Server misconfigured" });
    return;
  }
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    sendJson(res, 401, { ok: false, error: "Missing authorization" });
    return;
  }
  const body = parseBody(req);
  const action = normalizeText(body.action).toLowerCase();
  const companyId = normalizeText(body.companyId || body.company_id);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { user: caller, error: userErr } = await verifyUserToken(url, token, { fallbackClient: supabase });
  if (userErr || !caller?.id) {
    sendJson(res, 401, { ok: false, error: "Invalid authorization" });
    return;
  }
  if (!companyId) {
    sendJson(res, 400, { ok: false, error: "companyId is required" });
    return;
  }
  const { data: member, error: memberError } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", caller.id)
    .maybeSingle();
  if (memberError || !member) {
    sendJson(res, 403, { ok: false, error: "Not a member of this company" });
    return;
  }

  try {
    if (action === "classify") {
      // Classify item texts into Home Depot departments. Knowledge-based only.
      const items = Array.isArray(body.items) ? body.items.map((t) => normalizeText(t)).filter(Boolean).slice(0, 60) : [];
      if (!items.length) {
        sendJson(res, 200, { ok: true, classifications: [] });
        return;
      }
      const prompt = [
        "For each shopping-list item below, choose the single best Home Depot department.",
        `Allowed departments: ${HD_DEPARTMENTS.join(", ")}.`,
        'Return JSON: {"items":[{"text":"<original>","department":"<one allowed department>"}]}.',
        "Items:",
        ...items.map((t, i) => `${i + 1}. ${t}`),
      ].join("\n");
      const result = await callOpenAi({ prompt, model: "gpt-4o" });
      const rows = Array.isArray(result?.json?.items) ? result.json.items : [];
      const byText = new Map(rows.map((r) => [normalizeText(r?.text).toLowerCase(), normalizeDepartment(r?.department)]));
      const classifications = items.map((text) => ({ text, department: byText.get(text.toLowerCase()) || "Other" }));
      sendJson(res, 200, {
        ok: Boolean(result?.ok),
        configured: Boolean(result?.configured),
        classifications,
        message: result?.ok ? "" : result?.message || "",
      });
      return;
    }

    if (action === "stores") {
      // List Home Depot store locations in/near a city so the app can offer a
      // dropdown instead of free text. Knowledge-based; the user can still type
      // their own if a store is missing.
      const city = normalizeText(body.city);
      if (!city) {
        sendJson(res, 400, { ok: false, error: "city is required" });
        return;
      }
      const prompt = [
        `List the Home Depot store locations in or near "${city}".`,
        "Use only real, well-known Home Depot locations. Identify each by its area/neighbourhood or nearby street so a local resident recognizes it.",
        'Return JSON: {"stores":[{"name":"<short area name, e.g. Nepean>","address":"<street or area, optional>"}]}.',
        "Do not invent exact street numbers you are unsure of; a recognizable area name is enough. Return an empty list if you do not know any.",
      ].join("\n");
      const result = await callOpenAi({ prompt, model: "gpt-4o" });
      const rows = Array.isArray(result?.json?.stores) ? result.json.stores : [];
      const seen = new Set();
      const stores = [];
      for (const r of rows) {
        const name = normalizeText(r?.name);
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        stores.push({ name, address: normalizeText(r?.address) });
        if (stores.length >= 20) break;
      }
      sendJson(res, 200, {
        ok: Boolean(result?.ok),
        configured: Boolean(result?.configured),
        stores,
        message: result?.ok ? "" : result?.message || "",
      });
      return;
    }

    if (action === "read_item_photo") {
      // Read exact product name + price from a picked-item photo.
      const imageUrl = normalizeText(body.photo_url || body.photoUrl);
      const hint = normalizeText(body.hint);
      if (!imageUrl) {
        sendJson(res, 400, { ok: false, error: "photo_url is required" });
        return;
      }
      const prompt = [
        "Read this photo of a Home Depot product (or its shelf label).",
        hint ? `The shopper called it: "${hint}".` : "",
        'Return JSON: {"exact_name": string|null, "department": one of the allowed departments, "price": number|null, "aisle_no": string|null, "size_or_variant": string|null, "confidence": 0-1}.',
        `Allowed departments: ${HD_DEPARTMENTS.join(", ")}.`,
        "Only include price/aisle if clearly legible in the image. Never guess an aisle.",
      ]
        .filter(Boolean)
        .join("\n");
      const result = await callOpenAi({ prompt, imageUrl });
      const j = result?.json || {};
      sendJson(res, 200, {
        ok: Boolean(result?.ok),
        configured: Boolean(result?.configured),
        exact_name: normalizeText(j.exact_name) || null,
        department: j.department ? normalizeDepartment(j.department) : null,
        price: normalizeNumberOrNull(j.price),
        aisle_no: normalizeText(j.aisle_no) || null,
        size_or_variant: normalizeText(j.size_or_variant) || null,
        confidence: normalizeNumberOrNull(j.confidence),
      });
      return;
    }

    if (action === "read_aisle_scan") {
      // Read an in-store aisle photo: which departments/products are there + aisle number if on the sign.
      const imageUrl = normalizeText(body.photo_url || body.photoUrl);
      if (!imageUrl) {
        sendJson(res, 400, { ok: false, error: "photo_url is required" });
        return;
      }
      const prompt = [
        "This is a photo of a Home Depot aisle (often with an overhead aisle sign).",
        'Return JSON: {"aisle_no": string|null, "departments":[one or more allowed departments], "sample_products":[short strings], "confidence":0-1}.',
        `Allowed departments: ${HD_DEPARTMENTS.join(", ")}.`,
        "Read the aisle number ONLY if it is visible on a sign. Never guess it.",
      ].join("\n");
      const result = await callOpenAi({ prompt, imageUrl });
      const j = result?.json || {};
      sendJson(res, 200, {
        ok: Boolean(result?.ok),
        configured: Boolean(result?.configured),
        aisle_no: normalizeText(j.aisle_no) || null,
        departments: Array.isArray(j.departments) ? j.departments.map(normalizeDepartment) : [],
        sample_products: Array.isArray(j.sample_products) ? j.sample_products.map((s) => normalizeText(s)).filter(Boolean).slice(0, 12) : [],
        confidence: normalizeNumberOrNull(j.confidence),
      });
      return;
    }

    sendJson(res, 400, { ok: false, error: "Unsupported action" });
  } catch (err) {
    console.warn("[HD_INTEL] failed", err);
    sendJson(res, 500, { ok: false, error: err?.message || "Request failed" });
  }
}
