import { createClient } from "@supabase/supabase-js";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_GROUP_MEMBERS = 50;
const DEFAULT_MESSAGE_LIMIT = 50;

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

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanRole(value) {
  const role = cleanText(value).toLowerCase();
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  if (role === "supervisor") return "supervisor";
  return "employee";
}

function isArchivedStatus(value) {
  return cleanText(value).toLowerCase() === "archived";
}

function isInactiveMemberStatus(value) {
  const status = cleanText(value).toLowerCase();
  return ["archived", "inactive", "disabled", "removed", "deleted"].includes(status);
}

function isMissingMemberStatusColumnError(error) {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return msg.includes("column") && (msg.includes("status") || msg.includes("employment_status"));
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => cleanText(value)).filter(Boolean))];
}

function maskName(profile, fallback = "User") {
  return cleanText(profile?.full_name || profile?.display_name || profile?.email || fallback) || fallback;
}

function safeLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MESSAGE_LIMIT;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function isDuplicateError(error) {
  return String(error?.code || "").toLowerCase() === "23505" || String(error?.message || "").toLowerCase().includes("duplicate key");
}

async function getAuthedUser(supabase, req) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const error = new Error("Missing authorization");
    error.status = 401;
    throw error;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    const authError = new Error("Invalid or expired session");
    authError.status = 401;
    throw authError;
  }
  return data.user;
}

async function getActiveMembership(supabase, companyId, userId) {
  let { data: member, error: memberError } = await supabase
    .from("company_members")
    .select("role, status, employment_status")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError && isMissingMemberStatusColumnError(memberError)) {
    ({ data: member, error: memberError } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle());
  }
  if (memberError) throw memberError;
  if (!member) {
    const error = new Error("User is not a member of this company");
    error.status = 403;
    throw error;
  }
  if (isInactiveMemberStatus(member.status) || isInactiveMemberStatus(member.employment_status)) {
    const error = new Error("Inactive members cannot use company chat");
    error.status = 403;
    throw error;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, employment_status")
    .eq("id", userId)
    .maybeSingle();
  if (profileError && String(profileError.message || "").toLowerCase().includes("employment_status")) {
    return { user_id: userId, role: cleanRole(member.role), profile: profile || null };
  }
  if (profileError) throw profileError;
  if (isArchivedStatus(profile?.employment_status)) {
    const error = new Error("Archived users cannot use company chat");
    error.status = 403;
    throw error;
  }

  return { user_id: userId, role: cleanRole(member.role), profile: profile || null };
}

async function fetchActiveCompanyMembers(supabase, companyId) {
  let { data: members, error: membersError } = await supabase
    .from("company_members")
    .select("user_id, role, status, employment_status")
    .eq("company_id", companyId);
  if (membersError && isMissingMemberStatusColumnError(membersError)) {
    ({ data: members, error: membersError } = await supabase
      .from("company_members")
      .select("user_id, role")
      .eq("company_id", companyId));
  }
  if (membersError) throw membersError;

  const memberRows = members || [];
  const userIds = uniqueStrings(memberRows.map((member) => member.user_id));
  if (!userIds.length) return [];

  let profiles = [];
  const { data: profileRows, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email, employment_status")
    .in("id", userIds);
  if (!profilesError) profiles = profileRows || [];

  const profileById = Object.fromEntries(profiles.map((profile) => [String(profile.id), profile]));
  return memberRows
    .map((member) => {
      const userId = String(member.user_id);
      const profile = profileById[userId] || {};
      return {
        user_id: userId,
        role: cleanRole(member.role),
        name: maskName(profile, "User"),
        email: cleanText(profile.email),
        archived:
          isArchivedStatus(profile.employment_status) ||
          isInactiveMemberStatus(member.status) ||
          isInactiveMemberStatus(member.employment_status),
      };
    })
    .filter((member) => !member.archived);
}

async function upsertMembers(supabase, { companyId, conversationId, userIds, ownerId }) {
  const rows = uniqueStrings(userIds).map((userId) => ({
    company_id: companyId,
    conversation_id: conversationId,
    user_id: userId,
    role: userId === ownerId ? "owner" : "member",
    left_at: null,
  }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("chat_conversation_members")
    .upsert(rows, { onConflict: "conversation_id,user_id" });
  if (error) throw error;
}

async function ensureDefaultConversation(supabase, { companyId, callerId }) {
  let { data: existing, error: existingError } = await supabase
    .from("chat_conversations")
    .select("id, name, type, is_default")
    .eq("company_id", companyId)
    .eq("type", "company")
    .eq("is_default", true)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!existing?.id) {
    const { data: inserted, error: insertError } = await supabase
      .from("chat_conversations")
      .insert({
        company_id: companyId,
        type: "company",
        name: "All employees",
        is_default: true,
        created_by: callerId,
      })
      .select("id, name, type, is_default")
      .single();
    if (insertError && isDuplicateError(insertError)) {
      const retry = await supabase
        .from("chat_conversations")
        .select("id, name, type, is_default")
        .eq("company_id", companyId)
        .eq("type", "company")
        .eq("is_default", true)
        .maybeSingle();
      if (retry.error) throw retry.error;
      existing = retry.data;
    } else if (insertError) {
      throw insertError;
    } else {
      existing = inserted;
    }
  }

  const activeMembers = await fetchActiveCompanyMembers(supabase, companyId);
  await upsertMembers(supabase, {
    companyId,
    conversationId: existing.id,
    userIds: activeMembers.map((member) => member.user_id),
    ownerId: callerId,
  });

  return existing;
}

async function assertConversationMembership(supabase, { companyId, conversationId, userId }) {
  const { data, error } = await supabase
    .from("chat_conversation_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    const membershipError = new Error("You are not a member of this conversation");
    membershipError.status = 403;
    throw membershipError;
  }
}

async function listConversations(supabase, { companyId, callerId }) {
  await ensureDefaultConversation(supabase, { companyId, callerId });

  const { data: memberRows, error: memberError } = await supabase
    .from("chat_conversation_members")
    .select("conversation_id, last_read_at")
    .eq("company_id", companyId)
    .eq("user_id", callerId)
    .is("left_at", null);
  if (memberError) throw memberError;

  const conversationIds = uniqueStrings((memberRows || []).map((row) => row.conversation_id));
  const activeMembers = await fetchActiveCompanyMembers(supabase, companyId);
  if (!conversationIds.length) return { conversations: [], members: activeMembers };

  const { data: conversations, error: conversationsError } = await supabase
    .from("chat_conversations")
    .select("id, type, name, is_default, direct_key, created_at, updated_at, last_message_at")
    .eq("company_id", companyId)
    .in("id", conversationIds)
    .is("archived_at", null);
  if (conversationsError) throw conversationsError;

  const { data: latestMessages, error: latestError } = await supabase
    .from("chat_messages")
    .select("conversation_id, body, sender_user_id, created_at")
    .eq("company_id", companyId)
    .in("conversation_id", conversationIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(50, conversationIds.length * 2));
  if (latestError) throw latestError;

  const { data: allConversationMembers, error: allMembersError } = await supabase
    .from("chat_conversation_members")
    .select("conversation_id, user_id")
    .eq("company_id", companyId)
    .in("conversation_id", conversationIds)
    .is("left_at", null);
  if (allMembersError) throw allMembersError;

  const memberIdsByConversation = {};
  for (const row of allConversationMembers || []) {
    const key = String(row.conversation_id);
    if (!memberIdsByConversation[key]) memberIdsByConversation[key] = [];
    memberIdsByConversation[key].push(String(row.user_id));
  }

  const latestByConversation = {};
  for (const message of latestMessages || []) {
    if (!latestByConversation[String(message.conversation_id)]) {
      latestByConversation[String(message.conversation_id)] = message;
    }
  }

  const rows = (conversations || [])
    .map((conversation) => ({
      id: conversation.id,
      type: conversation.type,
      name: conversation.type === "company" ? "All employees" : conversation.name || "Chat",
      is_default: Boolean(conversation.is_default),
      last_message_at: conversation.last_message_at || conversation.updated_at || conversation.created_at,
      last_message: latestByConversation[String(conversation.id)]?.body || "",
      last_sender_user_id: latestByConversation[String(conversation.id)]?.sender_user_id || null,
      member_user_ids: memberIdsByConversation[String(conversation.id)] || [],
    }))
    .sort((a, b) => {
      const aDefaultCompany = a.type === "company" && a.is_default;
      const bDefaultCompany = b.type === "company" && b.is_default;
      if (aDefaultCompany !== bDefaultCompany) return aDefaultCompany ? -1 : 1;
      return String(b.last_message_at || "").localeCompare(String(a.last_message_at || ""));
    });

  return { conversations: rows, members: activeMembers };
}

async function listMessages(supabase, { companyId, conversationId, callerId, limit }) {
  await assertConversationMembership(supabase, { companyId, conversationId, userId: callerId });
  const safeMessageLimit = safeLimit(limit);
  const { data: rows, error } = await supabase
    .from("chat_messages")
    .select("id, sender_user_id, body, created_at, edited_at, deleted_at")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(safeMessageLimit);
  if (error) throw error;

  const messages = (rows || []).reverse();
  const senderIds = uniqueStrings(messages.map((message) => message.sender_user_id));
  let profiles = [];
  if (senderIds.length) {
    const { data: profileRows } = await supabase.from("profiles").select("id, full_name, email").in("id", senderIds);
    profiles = profileRows || [];
  }
  const profileById = Object.fromEntries(profiles.map((profile) => [String(profile.id), profile]));

  return messages.map((message) => ({
    id: message.id,
    sender_user_id: message.sender_user_id,
    sender_name: maskName(profileById[String(message.sender_user_id)], "User"),
    body: message.deleted_at ? "" : message.body,
    deleted: Boolean(message.deleted_at),
    created_at: message.created_at,
    edited_at: message.edited_at,
  }));
}

async function sendMessage(supabase, { companyId, conversationId, callerId, body, clientId }) {
  await assertConversationMembership(supabase, { companyId, conversationId, userId: callerId });
  const cleanBody = cleanText(body).replace(/\s+/g, " ");
  if (!cleanBody) {
    const error = new Error("Message cannot be empty");
    error.status = 400;
    throw error;
  }
  if (cleanBody.length > MAX_MESSAGE_LENGTH) {
    const error = new Error(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
    error.status = 400;
    throw error;
  }

  const payload = {
    company_id: companyId,
    conversation_id: conversationId,
    sender_user_id: callerId,
    body: cleanBody,
    client_id: clientId || null,
  };
  let { data, error } = await supabase.from("chat_messages").insert(payload).select("id, created_at").single();
  if (error && isDuplicateError(error) && clientId) {
    const retry = await supabase
      .from("chat_messages")
      .select("id, created_at")
      .eq("company_id", companyId)
      .eq("conversation_id", conversationId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (retry.error) throw retry.error;
    data = retry.data;
  } else if (error) {
    throw error;
  }

  const now = new Date().toISOString();
  await supabase
    .from("chat_conversations")
    .update({ updated_at: now, last_message_at: now })
    .eq("company_id", companyId)
    .eq("id", conversationId);

  return { id: data?.id, created_at: data?.created_at || now };
}

async function createDirectConversation(supabase, { companyId, callerId, targetUserId }) {
  const target = cleanText(targetUserId);
  if (!target || target === callerId) {
    const error = new Error("Choose another team member");
    error.status = 400;
    throw error;
  }
  const members = await fetchActiveCompanyMembers(supabase, companyId);
  if (!members.some((member) => member.user_id === target)) {
    const error = new Error("Team member not found in this company");
    error.status = 404;
    throw error;
  }
  const directKey = [callerId, target].sort().join(":");

  let { data: conversation, error: existingError } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("company_id", companyId)
    .eq("type", "direct")
    .eq("direct_key", directKey)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!conversation?.id) {
    const targetMember = members.find((member) => member.user_id === target);
    const { data: inserted, error: insertError } = await supabase
      .from("chat_conversations")
      .insert({
        company_id: companyId,
        type: "direct",
        name: targetMember?.name || "Direct message",
        direct_key: directKey,
        created_by: callerId,
      })
      .select("id")
      .single();
    if (insertError && isDuplicateError(insertError)) {
      const retry = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("company_id", companyId)
        .eq("type", "direct")
        .eq("direct_key", directKey)
        .maybeSingle();
      if (retry.error) throw retry.error;
      conversation = retry.data;
    } else if (insertError) {
      throw insertError;
    } else {
      conversation = inserted;
    }
  }

  await upsertMembers(supabase, {
    companyId,
    conversationId: conversation.id,
    userIds: [callerId, target],
    ownerId: callerId,
  });
  return conversation;
}

async function createGroupConversation(supabase, { companyId, callerId, name, memberUserIds }) {
  const groupName = cleanText(name).slice(0, 80);
  if (!groupName) {
    const error = new Error("Group name is required");
    error.status = 400;
    throw error;
  }
  const requestedIds = uniqueStrings([callerId, ...uniqueStrings(memberUserIds)]);
  if (requestedIds.length > MAX_GROUP_MEMBERS) {
    const error = new Error(`Groups can include up to ${MAX_GROUP_MEMBERS} members`);
    error.status = 400;
    throw error;
  }
  const activeMembers = await fetchActiveCompanyMembers(supabase, companyId);
  const activeMemberIds = new Set(activeMembers.map((member) => member.user_id));
  const memberIds = requestedIds.filter((userId) => activeMemberIds.has(userId));
  if (!memberIds.includes(callerId) || memberIds.length < 2) {
    const error = new Error("Choose at least one active team member");
    error.status = 400;
    throw error;
  }

  const { data: conversation, error } = await supabase
    .from("chat_conversations")
    .insert({
      company_id: companyId,
      type: "group",
      name: groupName,
      created_by: callerId,
    })
    .select("id")
    .single();
  if (error) throw error;

  await upsertMembers(supabase, {
    companyId,
    conversationId: conversation.id,
    userIds: memberIds,
    ownerId: callerId,
  });
  return conversation;
}

export default async function handler(req, res) {
  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const user = await getAuthedUser(supabase, req);
    const body = parseBody(req);
    const query = req.query || {};
    const action = cleanText(body.action || query.action || (req.method === "GET" ? "list" : "")).toLowerCase();
    const companyId = cleanText(body.company_id || body.companyId || query.company_id || query.companyId);
    if (!companyId) {
      res.status(400).json({ error: "Missing company_id" });
      return;
    }

    await getActiveMembership(supabase, companyId, user.id);

    if (req.method === "GET" && action === "list") {
      const data = await listConversations(supabase, { companyId, callerId: user.id });
      res.status(200).json({ ok: true, ...data });
      return;
    }

    if (req.method === "GET" && action === "messages") {
      const conversationId = cleanText(query.conversation_id || query.conversationId);
      if (!conversationId) {
        res.status(400).json({ error: "Missing conversation_id" });
        return;
      }
      const messages = await listMessages(supabase, {
        companyId,
        conversationId,
        callerId: user.id,
        limit: query.limit,
      });
      res.status(200).json({ ok: true, messages });
      return;
    }

    if (req.method === "POST" && action === "send") {
      const conversationId = cleanText(body.conversation_id || body.conversationId);
      if (!conversationId) {
        res.status(400).json({ error: "Missing conversation_id" });
        return;
      }
      const result = await sendMessage(supabase, {
        companyId,
        conversationId,
        callerId: user.id,
        body: body.body,
        clientId: cleanText(body.client_id || body.clientId).slice(0, 120),
      });
      res.status(200).json({ ok: true, message: result });
      return;
    }

    if (req.method === "POST" && action === "create_direct") {
      const conversation = await createDirectConversation(supabase, {
        companyId,
        callerId: user.id,
        targetUserId: body.target_user_id || body.targetUserId,
      });
      res.status(200).json({ ok: true, conversation });
      return;
    }

    if (req.method === "POST" && action === "create_group") {
      const conversation = await createGroupConversation(supabase, {
        companyId,
        callerId: user.id,
        name: body.name,
        memberUserIds: body.member_user_ids || body.memberUserIds,
      });
      res.status(200).json({ ok: true, conversation });
      return;
    }

    res.status(405).json({ error: "Unsupported chat action" });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.warn("[CHAT_API] failed", error);
    res.status(status).json({ error: error?.message || "Chat request failed" });
  }
}
