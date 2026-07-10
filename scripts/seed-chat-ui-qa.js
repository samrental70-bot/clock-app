/**
 * Dev-only QA seeding for chat UI screenshots.
 * Creates two QA users, a group conversation, and safe test messages
 * on the approved development Supabase (ref jvlxahskximvbajjwbut) ONLY.
 * Additive test data only — never deletes or updates existing rows.
 *
 * Usage: node scripts/seed-chat-ui-qa.js <credentials-output-path>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEV_REF = "jvlxahskximvbajjwbut";
const QA_USER_A = { email: "qa.chat.designer@operadev.test", name: "Sofia Alvarez" };
const QA_USER_B = { email: "qa.chat.partner@operadev.test", name: "Marcus Chen" };
const QA_GROUP_NAME = "Sky Tower — Site Crew";

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function maskRef(url) {
  const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? `...${match[1].slice(-6)}` : "";
}

function minutesAgoIso(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

async function ensureQaUser(supabase, { email, name }, password) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, qa_seed: "chat-ui" },
  });
  let userId = created?.user?.id || null;
  if (createErr) {
    const message = String(createErr.message || "").toLowerCase();
    if (!message.includes("already") && !message.includes("registered") && !message.includes("exists")) {
      throw createErr;
    }
    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (profileErr) throw profileErr;
    userId = profileRow?.id || null;
    if (!userId) {
      let page = 1;
      while (!userId && page <= 20) {
        const { data: pageData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) throw listErr;
        const match = (pageData?.users || []).find(
          (user) => String(user.email || "").toLowerCase() === email.toLowerCase()
        );
        if (match) userId = match.id;
        if (!pageData?.users?.length) break;
        page += 1;
      }
    }
    if (!userId) throw new Error(`Could not locate existing QA user ${email}`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateErr) throw updateErr;
  }
  return userId;
}

async function main() {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("Pass the credentials output path as the first argument.");

  const env = { ...readEnvFile(".env.development"), ...process.env };
  const supabaseUrl = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) throw new Error("Missing dev Supabase env in .env.development.");
  if (!supabaseUrl.includes(DEV_REF)) {
    throw new Error(`Blocked: expected dev ref ${DEV_REF}, got ${maskRef(supabaseUrl) || "unknown"}.`);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const password = `Qa!${randomBytes(12).toString("base64url")}`;
  const userAId = await ensureQaUser(supabase, QA_USER_A, password);
  const userBId = await ensureQaUser(supabase, QA_USER_B, password);

  for (const [userId, meta] of [
    [userAId, QA_USER_A],
    [userBId, QA_USER_B],
  ]) {
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, email: meta.email, full_name: meta.name, role: "employee" }, { onConflict: "id" });
    if (profileErr) throw profileErr;
  }

  const { data: memberRows, error: memberErr } = await supabase.from("company_members").select("company_id");
  if (memberErr) throw memberErr;
  const counts = new Map();
  for (const row of memberRows || []) {
    const cid = String(row?.company_id || "").trim();
    if (cid) counts.set(cid, (counts.get(cid) || 0) + 1);
  }
  if (!counts.size) throw new Error("No company found on dev DB.");
  const companyId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  for (const userId of [userAId, userBId]) {
    const { data: existing, error: existErr } = await supabase
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existErr) throw existErr;
    if (!existing?.id) {
      const { error: insertErr } = await supabase
        .from("company_members")
        .insert({ company_id: companyId, user_id: userId, role: "employee" });
      if (insertErr) throw insertErr;
    }
  }

  let { data: group, error: groupErr } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("company_id", companyId)
    .eq("type", "group")
    .eq("name", QA_GROUP_NAME)
    .maybeSingle();
  if (groupErr) throw groupErr;
  if (!group?.id) {
    const { data: inserted, error: insertErr } = await supabase
      .from("chat_conversations")
      .insert({ company_id: companyId, type: "group", name: QA_GROUP_NAME, created_by: userAId })
      .select("id")
      .single();
    if (insertErr) throw insertErr;
    group = inserted;
  }
  const { error: membersErr } = await supabase.from("chat_conversation_members").upsert(
    [
      { company_id: companyId, conversation_id: group.id, user_id: userAId, role: "owner", left_at: null },
      { company_id: companyId, conversation_id: group.id, user_id: userBId, role: "member", left_at: null },
    ],
    { onConflict: "conversation_id,user_id" }
  );
  if (membersErr) throw membersErr;

  const { data: existingMessages, error: existingMsgErr } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("company_id", companyId)
    .eq("conversation_id", group.id)
    .limit(1);
  if (existingMsgErr) throw existingMsgErr;

  if (!existingMessages?.length) {
    const script = [
      { sender: userBId, minutesAgo: 96, body: "Morning team — concrete pour for level 3 is confirmed for 7:30 AM. Pump truck arrives at 7." },
      { sender: userAId, minutesAgo: 92, body: "Copy that. Formwork inspection passed yesterday evening, we are clear to pour." },
      { sender: userBId, minutesAgo: 88, body: "Great. Can you get the crew list posted? We need two extra hands on the vibrator." },
      { sender: userAId, minutesAgo: 61, body: "Done. Also flagged the north scaffold — guardrail bracket needs replacing before the afternoon shift." },
      { sender: userBId, minutesAgo: 47, body: "Thanks for catching that. Ordered the bracket, ETA 1 PM. Keep that bay taped off until then." },
      { sender: userAId, minutesAgo: 12, body: "Will do. Sending the pre-pour checklist now so everyone can tick off their part." },
    ];
    for (const entry of script) {
      const { error: msgErr } = await supabase.from("chat_messages").insert({
        company_id: companyId,
        conversation_id: group.id,
        sender_user_id: entry.sender,
        body: entry.body,
        message_type: "text",
        metadata: {},
        client_id: `qa-chat-ui-${entry.minutesAgo}`,
        created_at: minutesAgoIso(entry.minutesAgo),
      });
      if (msgErr && !String(msgErr.message || "").toLowerCase().includes("duplicate")) throw msgErr;
    }

    const { data: checklistMsg, error: checklistMsgErr } = await supabase
      .from("chat_messages")
      .insert({
        company_id: companyId,
        conversation_id: group.id,
        sender_user_id: userAId,
        body: "Pre-pour checklist",
        message_type: "checklist",
        metadata: {},
        client_id: "qa-chat-ui-checklist",
        created_at: minutesAgoIso(8),
      })
      .select("id")
      .single();
    if (checklistMsgErr && !String(checklistMsgErr.message || "").toLowerCase().includes("duplicate")) {
      throw checklistMsgErr;
    }
    if (checklistMsg?.id) {
      const items = ["Formwork braced and signed off", "Rebar spacing verified", "Pump line pressure tested"];
      const { error: itemsErr } = await supabase.from("chat_message_checklist_items").insert(
        items.map((text, index) => ({
          company_id: companyId,
          conversation_id: group.id,
          message_id: checklistMsg.id,
          text,
          is_checked: index === 0,
          position: index,
        }))
      );
      if (itemsErr) throw itemsErr;
    }

    const { error: touchErr } = await supabase
      .from("chat_conversations")
      .update({ last_message_at: minutesAgoIso(8), updated_at: minutesAgoIso(8) })
      .eq("id", group.id);
    if (touchErr) throw touchErr;
  }

  writeFileSync(
    outPath,
    JSON.stringify({ email: QA_USER_A.email, password, companyId, conversationId: group.id }, null, 2)
  );
  console.log(
    JSON.stringify(
      { ok: true, companyId, conversationId: group.id, loginEmail: QA_USER_A.email, credsSavedTo: outPath },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[seed-chat-ui-qa] failed:", err?.message || err);
  process.exit(1);
});
