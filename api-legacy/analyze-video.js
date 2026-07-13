import { createClient } from "@supabase/supabase-js";
import { resolveSharedEnv, resolveSupabaseServerEnv } from "../server/sharedEnvResolver.js";

const OPENAI_MODEL = resolveSharedEnv("OPENAI_MODEL").value || "gpt-4.1-mini";

function supabaseAdmin() {
  const serverEnv = resolveSupabaseServerEnv();
  if (!serverEnv.ok) return null;
  return createClient(serverEnv.url, serverEnv.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body || {};
}

function fallbackAnalysis(input) {
  const text = `${input.title || ""} ${input.filename || ""} ${input.user_prompt || ""}`.toLowerCase();
  const base = {
    recommended_caption_style: "clean-white",
    recommended_export_format: "mp4-1080p",
    confidence: 0.72,
  };
  if (/(food|bakery|bake|cook|kitchen|restaurant|cafe|coffee|recipe|meal|plate|pizza|cake)/.test(text)) {
    return {
      ...base,
      scene_type: "food",
      mood: "warm",
      ai_summary: "Food or bakery clip. Use a colorful Food Pop grade, cozy cafe ambience, and bold captions for short-form clarity.",
      recommended_ambient_sound: "cafe",
      recommended_effect_preset: "food-pop",
      recommended_caption_style: "bold-yellow",
      confidence: 0.86,
    };
  }
  if (/(rain|snow|winter|storm|cold|ice)/.test(text)) {
    return {
      ...base,
      scene_type: "weather",
      mood: "cinematic",
      ai_summary: "Weather-focused clip. A restrained cinematic grade and rain ambience should add atmosphere without hiding the original sound.",
      recommended_ambient_sound: "rain",
      recommended_effect_preset: /snow|winter|ice/.test(text) ? "cool-urban" : "warm-cinematic",
      confidence: 0.8,
    };
  }
  if (/(talk|interview|podcast|meeting|voice|speech|lesson|tutorial)/.test(text)) {
    return {
      ...base,
      scene_type: "talking",
      mood: "clear",
      ai_summary: "Talking-head or interview-style clip. Keep background audio subtle and prioritize readable captions.",
      recommended_ambient_sound: "room-tone",
      recommended_effect_preset: "clean-enhance",
      recommended_caption_style: "clean-white",
      confidence: 0.84,
    };
  }
  if (/(outdoor|travel|trip|trail|city|street|beach|forest|ocean|nature|walk|vacation)/.test(text)) {
    const city = /city|street|downtown|urban/.test(text);
    const ocean = /beach|ocean|lake|water/.test(text);
    return {
      ...base,
      scene_type: "travel",
      mood: "cinematic",
      ai_summary: "Travel or outdoor clip. Use a warm cinematic grade with ambience matched to the location.",
      recommended_ambient_sound: city ? "city" : ocean ? "ocean" : "forest",
      recommended_effect_preset: "warm-cinematic",
      confidence: 0.82,
    };
  }
  if (/(renovation|construction|worksite|jobsite|tools|drywall|paint|framing|build|contractor)/.test(text)) {
    return {
      ...base,
      scene_type: "worksite",
      mood: "clean",
      ai_summary: "Worksite or renovation clip. Keep the edit accurate and clear with subtle ambience and a clean enhancement preset.",
      recommended_ambient_sound: "light-industrial",
      recommended_effect_preset: "clean-enhance",
      confidence: 0.83,
    };
  }
  if (/(product|demo|unbox|review|showcase|launch)/.test(text)) {
    return {
      ...base,
      scene_type: "product",
      mood: "polished",
      ai_summary: "Product or demo clip. Use a clean preset, soft cinematic bed, and minimal captions to keep focus on the product.",
      recommended_ambient_sound: "soft-cinematic",
      recommended_effect_preset: "clean-enhance",
      recommended_caption_style: "minimal-black-bar",
      confidence: 0.78,
    };
  }
  if (/(party|event|crowd|concert|wedding|birthday|club|dance)/.test(text)) {
    return {
      ...base,
      scene_type: "event",
      mood: "energetic",
      ai_summary: "Event clip with social energy. A punchier urban grade and city/crowd ambience should make the edit feel lively.",
      recommended_ambient_sound: "city",
      recommended_effect_preset: "high-contrast-reel",
      recommended_caption_style: "tiktok-pop",
      confidence: 0.79,
    };
  }
  return {
    ...base,
    scene_type: "general",
    mood: "calm",
    ai_summary: "General short-form clip. Warm cinematic color and soft ambience are safe defaults for V1.1.",
    recommended_ambient_sound: "soft-cinematic",
    recommended_effect_preset: "warm-cinematic",
  };
}

async function openAiAnalysis(input) {
  const openAiKey = resolveSharedEnv("OPENAI_API_KEY");
  if (!openAiKey.found) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey.value}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "Return only JSON for a short-video edit recommendation. Keys: scene_type, mood, ai_summary, recommended_ambient_sound, recommended_effect_preset, recommended_caption_style, recommended_export_format, confidence. Ambient sound must be one of cafe, rain, city, forest, ocean, soft-cinematic, room-tone, light-industrial. Effect preset must be one of clean-enhance, warm-cinematic, cool-urban, food-pop, vintage-film, soft-glow, high-contrast-reel, natural-no-filter. Caption style must be one of clean-white, bold-yellow, tiktok-pop, minimal-black-bar, luxury-serif. Confidence is 0 to 1.",
        },
        {
          role: "user",
          content: JSON.stringify({
            title: input.title,
            filename: input.filename,
            duration: input.duration,
            width: input.width,
            height: input.height,
            aspect_ratio: input.aspect_ratio,
            metadata: input.metadata,
            user_prompt: input.user_prompt,
            available_context: input.optional_thumbnail_frame_info || null,
          }),
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text =
    data.output_text ||
    data.output?.flatMap((item) => item.content || [])?.find((part) => part.type === "output_text")?.text ||
    "";
  if (!text) return null;
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = parseBody(req);
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  if (!body.project_id) {
    res.status(400).json({ error: "project_id is required" });
    return;
  }

  let analysis;
  let usedOpenAi = false;
  try {
    analysis = await openAiAnalysis(body);
    usedOpenAi = Boolean(analysis);
  } catch {
    analysis = null;
  }
  if (!analysis) analysis = fallbackAnalysis(body);

  const patch = {
    scene_type: analysis.scene_type,
    mood: analysis.mood,
    ai_summary: analysis.ai_summary,
    selected_ambient_sound: analysis.recommended_ambient_sound,
    selected_effect_preset: analysis.recommended_effect_preset,
    captions_json: body.keep_existing_captions ? undefined : body.captions_json,
    status: "analyzed",
    updated_at: new Date().toISOString(),
  };
  Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);

  let project = null;
  const admin = supabaseAdmin();
  if (admin) {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: userData } = token ? await admin.auth.getUser(token) : { data: null };
    if (userData?.user?.id) {
      const { data } = await admin
        .from("video_projects")
        .update(patch)
        .eq("id", body.project_id)
        .eq("user_id", userData.user.id)
        .select("*")
        .maybeSingle();
      project = data || null;
    }
  }

  res.status(200).json({ ...analysis, used_openai: usedOpenAi, project });
}
