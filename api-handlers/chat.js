import { createClient } from "@supabase/supabase-js";
import { verifyUserToken } from "./_verifyUserToken.js";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_GROUP_MEMBERS = 50;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_CHECKLIST_ITEMS = 40;
const MAX_ATTACHMENTS = 4;
const MAX_CHAT_LIST_ITEMS = 80;

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

function isMissingRelationError(error) {
  const code = String(error?.code || "").toLowerCase();
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return code === "42p01" || msg.includes("does not exist") || msg.includes("schema cache");
}

function isAdminRole(role) {
  return ["owner", "admin", "supervisor"].includes(cleanRole(role));
}

function normalizeMessageType(value) {
  const type = cleanText(value).toLowerCase();
  if (["photo", "checklist"].includes(type)) return type;
  return "text";
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeAttachments(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, MAX_ATTACHMENTS).map((item) => ({
    storage_bucket: cleanText(item?.storage_bucket || item?.storageBucket || "project-photos") || "project-photos",
    storage_path: cleanText(item?.storage_path || item?.storagePath),
    public_url: cleanText(item?.public_url || item?.publicUrl),
    mime_type: cleanText(item?.mime_type || item?.mimeType),
    file_name: cleanText(item?.file_name || item?.fileName).slice(0, 180),
    file_size: Number.isFinite(Number(item?.file_size ?? item?.fileSize)) ? Math.max(0, Math.floor(Number(item?.file_size ?? item?.fileSize))) : null,
  })).filter((item) => item.storage_path);
}

function normalizeChecklistItems(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => (typeof item === "string" ? item : item?.text))
    .map((text) => cleanText(text).replace(/\s+/g, " ").slice(0, 400))
    .filter(Boolean)
    .slice(0, MAX_CHECKLIST_ITEMS);
}

function normalizeChatListItems(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item, index) => {
      const text = cleanText(typeof item === "string" ? item : item?.text).replace(/\s+/g, " ").slice(0, 400);
      if (!text) return null;
      const itemLevel = Number(item?.item_level ?? item?.itemLevel ?? 0) === 1 ? 1 : 0;
      return {
        text,
        temp_key: cleanText(item?.temp_key || item?.tempKey || `item-${index + 1}`),
        parent_temp_key: itemLevel === 1 ? cleanText(item?.parent_temp_key || item?.parentTempKey) : "",
        item_level: itemLevel,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_CHAT_LIST_ITEMS);
}

async function fetchActiveChatListItems(supabase, { companyId, listId }) {
  const { data, error } = await supabase
    .from("chat_list_items")
    .select("id, list_id, item_number, text, is_done, completed_at, completed_by, created_by, created_at, updated_at, deleted_at, parent_item_id, item_level, child_order, sort_order, assigned_user_id")
    .eq("company_id", companyId)
    .eq("list_id", listId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function reindexChatListHierarchy(supabase, { companyId, listId, callerId }) {
  const rows = await fetchActiveChatListItems(supabase, { companyId, listId });
  const topLevelIds = new Set(rows.filter((row) => Number(row?.item_level || 0) === 0 || !row?.parent_item_id).map((row) => String(row.id)));
  const normalized = [];
  let mainNumber = 0;
  const childCountByParent = new Map();

  for (const row of rows) {
    const parentId = cleanText(row?.parent_item_id);
    const isChild = parentId && topLevelIds.has(parentId) && Number(row?.item_level || 0) === 1;
    if (!isChild) {
      mainNumber += 1;
      normalized.push({
        id: row.id,
        parent_item_id: null,
        item_level: 0,
        item_number: mainNumber,
        child_order: 0,
        sort_order: normalized.length + 1,
      });
      topLevelIds.add(String(row.id));
      childCountByParent.set(String(row.id), 0);
      continue;
    }
    const nextChildOrder = (childCountByParent.get(parentId) || 0) + 1;
    childCountByParent.set(parentId, nextChildOrder);
    const parentRow = normalized.find((item) => String(item.id) === parentId);
    normalized.push({
      id: row.id,
      parent_item_id: parentId,
      item_level: 1,
      item_number: Number(parentRow?.item_number || mainNumber || 1),
      child_order: nextChildOrder,
      sort_order: normalized.length + 1,
    });
  }

  for (const row of normalized) {
    const { error } = await supabase
      .from("chat_list_items")
      .update({
        parent_item_id: row.parent_item_id,
        item_level: row.item_level,
        item_number: row.item_number,
        child_order: row.child_order,
        sort_order: row.sort_order,
        updated_at: new Date().toISOString(),
        updated_by: callerId,
      })
      .eq("company_id", companyId)
      .eq("id", row.id);
    if (error) throw error;
  }
  return normalized;
}

function normalizeChatNotificationPreview(type, body, attachments) {
  if (type === "photo") return "Sent a photo";
  if (type === "checklist") return "Shared a checklist";
  const text = cleanText(body).replace(/\s+/g, " ");
  if (text) return text.slice(0, 240);
  if (Array.isArray(attachments) && attachments.length > 0) return "Sent an attachment";
  return "New message";
}

async function getAuthedUser(supabase, req) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const error = new Error("Missing authorization");
    error.status = 401;
    throw error;
  }
  const { user, error } = await verifyUserToken(getSupabaseUrl(), token, { fallbackClient: supabase });
  if (error || !user?.id) {
    const authError = new Error("Invalid or expired session");
    authError.status = 401;
    throw authError;
  }
  return user;
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
    .select("id, role")
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
  return data;
}

async function getConversation(supabase, { companyId, conversationId }) {
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, company_id, type, name, is_default, created_by, archived_at")
    .eq("company_id", companyId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id || data.archived_at) {
    const notFound = new Error("Conversation not found");
    notFound.status = 404;
    throw notFound;
  }
  return data;
}

async function getConversationMembers(supabase, { companyId, conversationId }) {
  const { data, error } = await supabase
    .from("chat_conversation_members")
    .select("id, user_id, role, joined_at, left_at")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function markConversationRead(supabase, { companyId, conversationId, userId }) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chat_conversation_members")
    .update({ last_read_at: now })
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .is("left_at", null);
  if (error) throw error;
  return { last_read_at: now };
}

function canManageConversation(companyRole, conversationMember) {
  return isAdminRole(companyRole) || cleanText(conversationMember?.role).toLowerCase() === "owner";
}

function memberByIdSafe(members, userId) {
  return (members || []).find((member) => String(member.user_id) === String(userId)) || {};
}

async function listConversations(supabase, { companyId, callerId, callerRole }) {
  await ensureDefaultConversation(supabase, { companyId, callerId });

  const { data: memberRows, error: memberError } = await supabase
    .from("chat_conversation_members")
    .select("conversation_id, role, last_read_at")
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

  let pins = [];
  const { data: pinRows, error: pinError } = await supabase
    .from("chat_pins")
    .select("conversation_id, message_id, pin_type, created_at")
    .eq("company_id", companyId)
    .eq("user_id", callerId)
    .in("conversation_id", conversationIds)
    .is("unpinned_at", null);
  if (pinError && !isMissingRelationError(pinError)) throw pinError;
  if (!pinError) pins = pinRows || [];
  const conversationPins = new Map(
    pins
      .filter((pin) => pin.pin_type === "conversation" && !pin.message_id)
      .map((pin) => [String(pin.conversation_id), pin.created_at])
  );
  const callerMembershipByConversation = Object.fromEntries(
    (memberRows || []).map((row) => [String(row.conversation_id), { role: cleanText(row.role).toLowerCase() }])
  );

  const rows = (conversations || [])
    .map((conversation) => {
      const key = String(conversation.id);
      const callerConversationMember = callerMembershipByConversation[key] || null;
      const canManage = canManageConversation(callerRole, callerConversationMember);
      return {
        id: conversation.id,
        type: conversation.type,
        name: conversation.type === "company" ? "All employees" : conversation.name || "Chat",
        is_default: Boolean(conversation.is_default),
        last_message_at: conversation.last_message_at || conversation.updated_at || conversation.created_at,
        last_message: latestByConversation[key]?.body || "",
        last_sender_user_id: latestByConversation[key]?.sender_user_id || null,
        member_user_ids: memberIdsByConversation[key] || [],
        members: (memberIdsByConversation[key] || []).map((userId) => ({
          user_id: userId,
          name: memberByIdSafe(activeMembers, userId).name || "User",
          email: memberByIdSafe(activeMembers, userId).email || "",
        })),
        pinned: conversationPins.has(key),
        pinned_at: conversationPins.get(key) || null,
        caller_member_role: callerConversationMember?.role || "member",
        can_manage: canManage,
        can_leave: conversation.type === "group" && !conversation.is_default,
        can_archive: isAdminRole(callerRole) && conversation.type !== "company" && !conversation.is_default,
      };
    })
    .sort((a, b) => {
      const aDefaultCompany = a.type === "company" && a.is_default;
      const bDefaultCompany = b.type === "company" && b.is_default;
      if (aDefaultCompany !== bDefaultCompany) return aDefaultCompany ? -1 : 1;
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return String(b.last_message_at || "").localeCompare(String(a.last_message_at || ""));
    });

  return { conversations: rows, members: activeMembers };
}

async function listMessages(supabase, { companyId, conversationId, callerId, callerRole, limit }) {
  await assertConversationMembership(supabase, { companyId, conversationId, userId: callerId });
  const safeMessageLimit = safeLimit(limit);
  const { data: rows, error } = await supabase
    .from("chat_messages")
    .select("id, client_id, sender_user_id, body, message_type, metadata, created_at, edited_at, deleted_at, deleted_by")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(safeMessageLimit);
  if (error) throw error;

  const messages = (rows || []).reverse();
  const messageIds = uniqueStrings(messages.map((message) => message.id));
  const senderIds = uniqueStrings(messages.map((message) => message.sender_user_id));
  let profiles = [];
  if (senderIds.length) {
    const { data: profileRows } = await supabase.from("profiles").select("id, full_name, email").in("id", senderIds);
    profiles = profileRows || [];
  }
  const profileById = Object.fromEntries(profiles.map((profile) => [String(profile.id), profile]));
  const activeMembers = await fetchActiveCompanyMembers(supabase, companyId);
  const { data: readRows, error: readError } = await supabase
    .from("chat_conversation_members")
    .select("user_id, role, last_read_at, joined_at, left_at")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .is("left_at", null);
  if (readError) throw readError;

  let attachmentRows = [];
  let checklistRows = [];
  let pinRows = [];
  if (messageIds.length) {
    const attachments = await supabase
      .from("chat_message_attachments")
      .select("id, message_id, storage_bucket, storage_path, public_url, mime_type, file_name, file_size, created_at")
      .eq("company_id", companyId)
      .in("message_id", messageIds)
      .order("created_at", { ascending: true });
    if (attachments.error && !isMissingRelationError(attachments.error)) throw attachments.error;
    attachmentRows = attachments.error ? [] : attachments.data || [];

    const checklist = await supabase
      .from("chat_message_checklist_items")
      .select("id, message_id, text, is_checked, position, checked_at, checked_by, created_at")
      .eq("company_id", companyId)
      .in("message_id", messageIds)
      .order("position", { ascending: true });
    if (checklist.error && !isMissingRelationError(checklist.error)) throw checklist.error;
    checklistRows = checklist.error ? [] : checklist.data || [];

    const pins = await supabase
      .from("chat_pins")
      .select("message_id, pin_type, created_at")
      .eq("company_id", companyId)
      .eq("user_id", callerId)
      .in("message_id", messageIds)
      .is("unpinned_at", null);
    if (pins.error && !isMissingRelationError(pins.error)) throw pins.error;
    pinRows = pins.error ? [] : pins.data || [];
  }
  const attachmentsByMessage = {};
  for (const attachment of attachmentRows) {
    const key = String(attachment.message_id);
    if (!attachmentsByMessage[key]) attachmentsByMessage[key] = [];
    attachmentsByMessage[key].push({
      id: attachment.id,
      storage_bucket: attachment.storage_bucket,
      storage_path: attachment.storage_path,
      public_url: attachment.public_url,
      mime_type: attachment.mime_type,
      file_name: attachment.file_name,
      file_size: attachment.file_size,
      created_at: attachment.created_at,
    });
  }
  const checklistByMessage = {};
  for (const item of checklistRows) {
    const key = String(item.message_id);
    if (!checklistByMessage[key]) checklistByMessage[key] = [];
    checklistByMessage[key].push({
      id: item.id,
      text: item.text,
      is_checked: Boolean(item.is_checked),
      position: item.position,
      checked_at: item.checked_at,
      checked_by: item.checked_by,
      created_at: item.created_at,
    });
  }
  const pinByMessage = new Map(pinRows.map((pin) => [String(pin.message_id), pin]));
  // Only THIS conversation's active members (readRows), not the whole company
  // roster — otherwise every group would look like it contains everyone. The
  // company-wide chat still lists everyone because all members are enrolled in it.
  const conversationMembers = (readRows || []).map((row) => {
    const info = memberByIdSafe(activeMembers, row.user_id) || {};
    return {
      user_id: row.user_id,
      role: row.role || info.role || "member",
      name: info.name || "User",
      email: info.email || "",
      last_read_at: row.last_read_at || null,
    };
  });

  return {
    messages: messages.map((message) => ({
      id: message.id,
      client_id: message.client_id || null,
      sender_user_id: message.sender_user_id,
      sender_name: maskName(profileById[String(message.sender_user_id)], "User"),
      message_type: message.message_type || "text",
      body: message.deleted_at ? "" : message.body,
      deleted: Boolean(message.deleted_at),
      metadata: message.deleted_at ? {} : normalizeMetadata(message.metadata),
      attachments: message.deleted_at ? [] : attachmentsByMessage[String(message.id)] || [],
      checklist_items: message.deleted_at ? [] : checklistByMessage[String(message.id)] || [],
      pinned: pinByMessage.has(String(message.id)),
      pinned_at: pinByMessage.get(String(message.id))?.created_at || null,
      can_delete: !message.deleted_at && (String(message.sender_user_id) === String(callerId) || isAdminRole(callerRole)),
      can_pin: !message.deleted_at,
      created_at: message.created_at,
      edited_at: message.edited_at,
      deleted_by: message.deleted_by || null,
    })),
    conversation_members: conversationMembers,
  };
}

async function touchConversation(supabase, { companyId, conversationId }) {
  const now = new Date().toISOString();
  await supabase
    .from("chat_conversations")
    .update({ updated_at: now, last_message_at: now })
    .eq("company_id", companyId)
    .eq("id", conversationId);
}

async function listChatLists(supabase, { companyId, conversationId, callerId, callerRole }) {
  await assertConversationMembership(supabase, { companyId, conversationId, userId: callerId });
  const { data: lists, error } = await supabase
    .from("chat_lists")
    .select("id, company_id, conversation_id, title, list_type, store_name, created_by, pinned, archived_at, created_at, updated_at, updated_by")
    .eq("company_id", companyId)
    .eq("conversation_id", conversationId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(30);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  const listRows = lists || [];
  const listIds = uniqueStrings(listRows.map((list) => list.id));
  let itemRows = [];
  if (listIds.length) {
    try {
      const { data: items, error: itemError } = await supabase
        .from("chat_list_items")
        .select("id, list_id, item_number, text, is_done, completed_at, completed_by, created_by, created_at, updated_at, deleted_at, parent_item_id, item_level, child_order, sort_order, assigned_user_id, department, hd_aisle_no, photo_url, photo_storage_path, hd_exact_name, hd_price")
        .eq("company_id", companyId)
        .in("list_id", listIds)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (itemError) {
        if (!isMissingRelationError(itemError)) throw itemError;
      } else {
        itemRows = items || [];
      }
    } catch (itemError) {
      if (!isMissingRelationError(itemError)) throw itemError;
    }
  }
  const itemsByList = {};
  for (const item of itemRows) {
    const key = String(item.list_id);
    if (!itemsByList[key]) itemsByList[key] = [];
    itemsByList[key].push({
      id: item.id,
      item_number: item.item_number,
      text: item.text,
      is_done: Boolean(item.is_done),
      completed_at: item.completed_at,
      completed_by: item.completed_by,
      created_by: item.created_by,
      created_at: item.created_at,
      updated_at: item.updated_at,
      parent_item_id: item.parent_item_id || null,
      item_level: Number(item.item_level || 0),
      child_order: Number(item.child_order || 0),
      sort_order: Number(item.sort_order || item.item_number || 0),
      assigned_user_id: item.assigned_user_id || null,
      department: item.department || null,
      hd_aisle_no: item.hd_aisle_no || null,
      photo_url: item.photo_url || null,
      photo_storage_path: item.photo_storage_path || null,
      hd_exact_name: item.hd_exact_name || null,
      hd_price: item.hd_price == null ? null : Number(item.hd_price),
    });
  }
  return listRows.map((list) => {
    const items = itemsByList[String(list.id)] || [];
    const openCount = items.filter((item) => !item.is_done).length;
    return {
      id: list.id,
      conversation_id: list.conversation_id,
      title: list.title,
      list_type: list.list_type || "other",
      store_name: list.store_name || null,
      created_by: list.created_by,
      pinned: Boolean(list.pinned),
      created_at: list.created_at,
      updated_at: list.updated_at,
      updated_by: list.updated_by,
      open_count: openCount,
      total_count: items.length,
      can_archive: String(list.created_by) === String(callerId) || isAdminRole(callerRole),
      items,
    };
  });
}

async function getChatListForMember(supabase, { companyId, listId, callerId }) {
  const id = cleanText(listId);
  if (!id) {
    const error = new Error("list_id is required");
    error.status = 400;
    throw error;
  }
  const { data: list, error } = await supabase
    .from("chat_lists")
    .select("id, company_id, conversation_id, title, created_by, archived_at")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!list?.id || list.archived_at) {
    const notFound = new Error("List not found");
    notFound.status = 404;
    throw notFound;
  }
  await assertConversationMembership(supabase, { companyId, conversationId: list.conversation_id, userId: callerId });
  return list;
}

async function createChatList(supabase, { companyId, conversationId, callerId, title, items, listType, storeName }) {
  const convId = cleanText(conversationId);
  const cleanTitle = cleanText(title).replace(/\s+/g, " ").slice(0, 120);
  const cleanItems = normalizeChatListItems(items);
  const normalizedType = ["home_depot", "pending_job", "other"].includes(cleanText(listType).toLowerCase())
    ? cleanText(listType).toLowerCase()
    : "other";
  const cleanStoreName = normalizedType === "home_depot" ? cleanText(storeName).slice(0, 80) || null : null;
  if (!convId || !cleanTitle) {
    const error = new Error("List title is required");
    error.status = 400;
    throw error;
  }
  await assertConversationMembership(supabase, { companyId, conversationId: convId, userId: callerId });
  const insertRow = {
    company_id: companyId,
    conversation_id: convId,
    title: cleanTitle,
    list_type: normalizedType,
    store_name: cleanStoreName,
    created_by: callerId,
    updated_by: callerId,
    pinned: false,
  };
  let { data: list, error } = await supabase.from("chat_lists").insert(insertRow).select("id").single();
  if (error && /list_type|store_name|column/i.test(String(error.message || ""))) {
    // Tolerate a DB that hasn't applied the list-type columns yet.
    const { list_type, store_name, ...fallbackRow } = insertRow;
    ({ data: list, error } = await supabase.from("chat_lists").insert(fallbackRow).select("id").single());
  }
  if (error) throw error;
  if (cleanItems.length) {
    let mainNumber = 0;
    let sortOrder = 0;
    const mainIdByTempKey = new Map();
    const childCountByParentId = new Map();
    for (const item of cleanItems) {
      sortOrder += 1;
      const isChild = Number(item.item_level || 0) === 1 && item.parent_temp_key && mainIdByTempKey.has(item.parent_temp_key);
      if (!isChild) {
        mainNumber += 1;
        const { data: insertedMain, error: mainError } = await supabase
          .from("chat_list_items")
          .insert({
            company_id: companyId,
            conversation_id: convId,
            list_id: list.id,
            item_number: mainNumber,
            text: item.text,
            created_by: callerId,
            updated_by: callerId,
            parent_item_id: null,
            item_level: 0,
            child_order: 0,
            sort_order: sortOrder,
          })
          .select("id")
          .single();
        if (mainError) throw mainError;
        mainIdByTempKey.set(item.temp_key, insertedMain.id);
        childCountByParentId.set(insertedMain.id, 0);
        continue;
      }
      const parentId = mainIdByTempKey.get(item.parent_temp_key);
      const childOrder = (childCountByParentId.get(parentId) || 0) + 1;
      childCountByParentId.set(parentId, childOrder);
      const { error: childError } = await supabase.from("chat_list_items").insert({
        company_id: companyId,
        conversation_id: convId,
        list_id: list.id,
        item_number: mainNumber,
        text: item.text,
        created_by: callerId,
        updated_by: callerId,
        parent_item_id: parentId,
        item_level: 1,
        child_order: childOrder,
        sort_order: sortOrder,
      });
      if (childError) throw childError;
    }
  }
  await touchConversation(supabase, { companyId, conversationId: convId });
  return { id: list.id };
}

async function addChatListItem(supabase, { companyId, callerId, listId, text, parentItemId, assignedUserId }) {
  const list = await getChatListForMember(supabase, { companyId, listId, callerId });
  const cleanItem = cleanText(text).replace(/\s+/g, " ").slice(0, 400);
  if (!cleanItem) {
    const error = new Error("List item text is required");
    error.status = 400;
    throw error;
  }
  const rows = await fetchActiveChatListItems(supabase, { companyId, listId: list.id });
  const cleanParentId = cleanText(parentItemId);
  let nextNumber = rows.filter((row) => Number(row?.item_level || 0) === 0 || !row?.parent_item_id).reduce((max, row) => Math.max(max, Number(row?.item_number || 0)), 0) + 1;
  let itemLevel = 0;
  let parentId = null;
  let childOrder = 0;
  let sortOrder = rows.reduce((max, row) => Math.max(max, Number(row?.sort_order || 0)), 0) + 1;
  if (cleanParentId) {
    const parentRow = rows.find((row) => String(row.id) === cleanParentId);
    if (parentRow && (Number(parentRow?.item_level || 0) === 0 || !parentRow?.parent_item_id)) {
      parentId = cleanParentId;
      itemLevel = 1;
      nextNumber = Number(parentRow.item_number || nextNumber);
      const parentBranchRows = rows.filter(
        (row) => String(row.id) === cleanParentId || String(row.parent_item_id || "") === cleanParentId
      );
      childOrder =
        rows
          .filter((row) => String(row.parent_item_id || "") === cleanParentId)
          .reduce((max, row) => Math.max(max, Number(row?.child_order || 0)), 0) + 1;
      sortOrder = parentBranchRows.reduce((max, row) => Math.max(max, Number(row?.sort_order || 0)), Number(parentRow?.sort_order || 0)) + 1;
      for (const row of rows.filter((row) => Number(row?.sort_order || 0) >= sortOrder)) {
        const { error: shiftError } = await supabase
          .from("chat_list_items")
          .update({ sort_order: Number(row.sort_order || 0) + 1, updated_at: new Date().toISOString(), updated_by: callerId })
          .eq("company_id", companyId)
          .eq("id", row.id);
        if (shiftError) throw shiftError;
      }
    }
  }
  const { data: item, error } = await supabase
    .from("chat_list_items")
    .insert({
      company_id: companyId,
      conversation_id: list.conversation_id,
      list_id: list.id,
      item_number: nextNumber,
      text: cleanItem,
      created_by: callerId,
      updated_by: callerId,
      assigned_user_id: itemLevel === 0 ? cleanText(assignedUserId) || null : null,
      parent_item_id: parentId,
      item_level: itemLevel,
      child_order: childOrder,
      sort_order: sortOrder,
    })
    .select("id, item_number, parent_item_id, item_level, child_order, sort_order, assigned_user_id")
    .single();
  if (error) throw error;
  await reindexChatListHierarchy(supabase, { companyId, listId: list.id, callerId });
  await supabase
    .from("chat_lists")
    .update({ updated_at: new Date().toISOString(), updated_by: callerId })
    .eq("company_id", companyId)
    .eq("id", list.id);
  await touchConversation(supabase, { companyId, conversationId: list.conversation_id });
  return {
    id: item.id,
    item_number: item.item_number,
    parent_item_id: item.parent_item_id || null,
    item_level: item.item_level || 0,
    assigned_user_id: item.assigned_user_id || null,
  };
}

async function getChatListItemForMember(supabase, { companyId, itemId, callerId }) {
  const id = cleanText(itemId);
  if (!id) {
    const error = new Error("item_id is required");
    error.status = 400;
    throw error;
  }
  const { data: item, error } = await supabase
    .from("chat_list_items")
    .select("id, company_id, conversation_id, list_id, text, is_done, deleted_at, parent_item_id, item_level, child_order, item_number, sort_order, assigned_user_id")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!item?.id || item.deleted_at) {
    const notFound = new Error("List item not found");
    notFound.status = 404;
    throw notFound;
  }
  await assertConversationMembership(supabase, { companyId, conversationId: item.conversation_id, userId: callerId });
  return item;
}

async function updateChatListItem(supabase, { companyId, callerId, itemId, text }) {
  const item = await getChatListItemForMember(supabase, { companyId, itemId, callerId });
  const cleanItem = cleanText(text).replace(/\s+/g, " ").slice(0, 400);
  if (!cleanItem) {
    const error = new Error("List item text is required");
    error.status = 400;
    throw error;
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chat_list_items")
    .update({ text: cleanItem, updated_at: now, updated_by: callerId })
    .eq("company_id", companyId)
    .eq("id", item.id);
  if (error) throw error;
  await supabase.from("chat_lists").update({ updated_at: now, updated_by: callerId }).eq("company_id", companyId).eq("id", item.list_id);
  return { id: item.id };
}

async function assignChatListItem(supabase, { companyId, callerId, itemId, assignedUserId }) {
  const item = await getChatListItemForMember(supabase, { companyId, itemId, callerId });
  if (Number(item.item_level || 0) === 1 || item.parent_item_id) {
    const error = new Error("Only main checklist items can be assigned");
    error.status = 400;
    throw error;
  }
  const nextAssignedUserId = cleanText(assignedUserId);
  if (nextAssignedUserId) {
    const activeMembers = await fetchActiveCompanyMembers(supabase, companyId);
    if (!activeMembers.some((member) => String(member.user_id) === nextAssignedUserId)) {
      const error = new Error("Assigned employee must be active in this company");
      error.status = 400;
      throw error;
    }
    const conversationMembers = await getConversationMembers(supabase, {
      companyId,
      conversationId: item.conversation_id,
    });
    if (!conversationMembers.some((member) => String(member.user_id) === nextAssignedUserId)) {
      const error = new Error("Assigned employee must be in this chat");
      error.status = 400;
      throw error;
    }
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chat_list_items")
    .update({
      assigned_user_id: nextAssignedUserId || null,
      updated_at: now,
      updated_by: callerId,
    })
    .eq("company_id", companyId)
    .eq("id", item.id);
  if (error) throw error;
  await supabase.from("chat_lists").update({ updated_at: now, updated_by: callerId }).eq("company_id", companyId).eq("id", item.list_id);
  return { id: item.id, assigned_user_id: nextAssignedUserId || null };
}

async function toggleChatListItem(supabase, { companyId, callerId, itemId, done }) {
  const item = await getChatListItemForMember(supabase, { companyId, itemId, callerId });
  const nextDone = done == null ? !item.is_done : Boolean(done);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chat_list_items")
    .update({
      is_done: nextDone,
      completed_at: nextDone ? now : null,
      completed_by: nextDone ? callerId : null,
      updated_at: now,
      updated_by: callerId,
    })
    .eq("company_id", companyId)
    .eq("id", item.id);
  if (error) throw error;
  if (nextDone && (Number(item.item_level || 0) === 0 || !item.parent_item_id) && item.id) {
    const { error: childError } = await supabase
      .from("chat_list_items")
      .update({
        is_done: true,
        completed_at: now,
        completed_by: callerId,
        updated_at: now,
        updated_by: callerId,
      })
      .eq("company_id", companyId)
      .eq("parent_item_id", item.id)
      .is("deleted_at", null);
    if (childError) throw childError;
  }
  await supabase.from("chat_lists").update({ updated_at: now, updated_by: callerId }).eq("company_id", companyId).eq("id", item.list_id);
  return { id: item.id, is_done: nextDone };
}

async function deleteChatListItem(supabase, { companyId, callerId, itemId }) {
  const item = await getChatListItemForMember(supabase, { companyId, itemId, callerId });
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chat_list_items")
    .update({ deleted_at: now, deleted_by: callerId, updated_at: now, updated_by: callerId })
    .eq("company_id", companyId)
    .eq("id", item.id);
  if (error) throw error;
  if ((Number(item.item_level || 0) === 0 || !item.parent_item_id) && item.id) {
    const { error: childDeleteError } = await supabase
      .from("chat_list_items")
      .update({ deleted_at: now, deleted_by: callerId, updated_at: now, updated_by: callerId })
      .eq("company_id", companyId)
      .eq("parent_item_id", item.id)
      .is("deleted_at", null);
    if (childDeleteError) throw childDeleteError;
  }
  await reindexChatListHierarchy(supabase, { companyId, listId: item.list_id, callerId });
  await supabase.from("chat_lists").update({ updated_at: now, updated_by: callerId }).eq("company_id", companyId).eq("id", item.list_id);
  return { id: item.id, deleted: true };
}

async function reparentChatListItem(supabase, { companyId, callerId, itemId, parentItemId }) {
  const item = await getChatListItemForMember(supabase, { companyId, itemId, callerId });
  const cleanParentId = cleanText(parentItemId);
  let parentId = null;
  let itemLevel = 0;
  if (cleanParentId && cleanParentId !== String(item.id)) {
    const parentItem = await getChatListItemForMember(supabase, { companyId, itemId: cleanParentId, callerId });
    if (String(parentItem.list_id) !== String(item.list_id)) {
      const error = new Error("Sub-point parent must be in the same list");
      error.status = 400;
      throw error;
    }
    if (Number(parentItem.item_level || 0) !== 0 && parentItem.parent_item_id) {
      const error = new Error("Only one level of nesting is supported");
      error.status = 400;
      throw error;
    }
    parentId = cleanParentId;
    itemLevel = 1;
  }
  const { error } = await supabase
    .from("chat_list_items")
    .update({
      parent_item_id: parentId,
      item_level: itemLevel,
      updated_at: new Date().toISOString(),
      updated_by: callerId,
    })
    .eq("company_id", companyId)
    .eq("id", item.id);
  if (error) throw error;
  await reindexChatListHierarchy(supabase, { companyId, listId: item.list_id, callerId });
  await supabase.from("chat_lists").update({ updated_at: new Date().toISOString(), updated_by: callerId }).eq("company_id", companyId).eq("id", item.list_id);
  return { id: item.id, parent_item_id: parentId, item_level: itemLevel };
}

async function archiveChatList(supabase, { companyId, callerId, callerRole, listId }) {
  const list = await getChatListForMember(supabase, { companyId, listId, callerId });
  if (String(list.created_by) !== String(callerId) && !isAdminRole(callerRole)) {
    const error = new Error("Only the list owner or a manager can archive this list");
    error.status = 403;
    throw error;
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chat_lists")
    .update({ archived_at: now, archived_by: callerId, updated_at: now, updated_by: callerId })
    .eq("company_id", companyId)
    .eq("id", list.id);
  if (error) throw error;
  return { id: list.id, archived: true };
}

async function sendMessage(supabase, { companyId, conversationId, callerId, body, clientId, messageType, attachments, checklistItems, metadata }) {
  await assertConversationMembership(supabase, { companyId, conversationId, userId: callerId });
  const type = normalizeMessageType(messageType);
  const attachmentRows = normalizeAttachments(attachments);
  const checklistRows = normalizeChecklistItems(checklistItems);
  let cleanBody = cleanText(body).replace(/\s+/g, " ");
  if (!cleanBody && type === "photo" && attachmentRows.length) cleanBody = attachmentRows[0].file_name || "Photo";
  if (!cleanBody && type === "checklist" && checklistRows.length) cleanBody = "Checklist";
  if (!cleanBody) {
    const error = new Error("Message cannot be empty");
    error.status = 400;
    throw error;
  }
  if (type === "photo" && !attachmentRows.length) {
    const error = new Error("Attach a photo before sending");
    error.status = 400;
    throw error;
  }
  if (type === "checklist" && !checklistRows.length) {
    const error = new Error("Add at least one checklist item");
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
    message_type: type,
    metadata: normalizeMetadata(metadata),
    client_id: clientId || null,
  };
  let insertedNew = true;
  let { data, error } = await supabase.from("chat_messages").insert(payload).select("id, created_at").single();
  if (error && isDuplicateError(error) && clientId) {
    insertedNew = false;
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

  if (insertedNew && data?.id && attachmentRows.length) {
    const rows = attachmentRows.map((attachment) => ({
      company_id: companyId,
      conversation_id: conversationId,
      message_id: data.id,
      sender_user_id: callerId,
      storage_bucket: attachment.storage_bucket,
      storage_path: attachment.storage_path,
      public_url: attachment.public_url || null,
      mime_type: attachment.mime_type || null,
      file_name: attachment.file_name || null,
      file_size: attachment.file_size,
    }));
    const { error: attachmentError } = await supabase.from("chat_message_attachments").insert(rows);
    if (attachmentError) throw attachmentError;
  }

  if (insertedNew && data?.id && checklistRows.length) {
    const rows = checklistRows.map((text, index) => ({
      company_id: companyId,
      conversation_id: conversationId,
      message_id: data.id,
      text,
      position: index,
    }));
    const { error: checklistError } = await supabase.from("chat_message_checklist_items").insert(rows);
    if (checklistError) throw checklistError;
  }

  const now = new Date().toISOString();
  await supabase
    .from("chat_conversations")
    .update({ updated_at: now, last_message_at: now })
    .eq("company_id", companyId)
    .eq("id", conversationId);

  let notificationIds = [];
  if (insertedNew && data?.id) {
    const [conversation, activeMembers, conversationMembers] = await Promise.all([
      getConversation(supabase, { companyId, conversationId }),
      fetchActiveCompanyMembers(supabase, companyId),
      getConversationMembers(supabase, { companyId, conversationId }),
    ]);
    const sender = memberByIdSafe(activeMembers, callerId);
    const senderName = cleanText(sender?.name || sender?.email || "Team member") || "Team member";
    const conversationName =
      conversation?.type === "company"
        ? "All employees"
        : cleanText(conversation?.name || "") || "Chat";
    const preview = normalizeChatNotificationPreview(type, cleanBody, attachmentRows);
    const recipientIds = uniqueStrings(
      conversationMembers
        .map((member) => member?.user_id)
        .filter((userId) => String(userId || "") !== String(callerId))
    );
    if (recipientIds.length) {
      const rows = recipientIds.map((recipientUserId) => ({
        company_id: companyId,
        recipient_user_id: recipientUserId,
        actor_user_id: callerId,
        type: "chat_message",
        title: senderName,
        message: preview,
        read_at: null,
        is_read: false,
        project_id: null,
        project_name: conversationName,
        cost_centre: null,
        related_timesheet_id: null,
        related_folder: `chat:${conversationId}`,
        item_count: null,
      }));
      let notificationInsert = await supabase.from("notifications").insert(rows).select("id");
      if (notificationInsert.error && String(notificationInsert.error.message || "").toLowerCase().includes("is_read")) {
        const retryRows = rows.map((row) => {
          const retryRow = { ...row };
          delete retryRow.is_read;
          return retryRow;
        });
        notificationInsert = await supabase.from("notifications").insert(retryRows).select("id");
      }
      if (notificationInsert.error) {
        console.warn("[CHAT_API] notification insert failed", notificationInsert.error);
      } else {
        notificationIds = (notificationInsert.data || []).map((row) => row.id).filter(Boolean);
      }
    }
  }

  return {
    id: data?.id,
    created_at: data?.created_at || now,
    notification_ids: notificationIds,
  };
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

async function deleteMessage(supabase, { companyId, callerId, callerRole, messageId }) {
  const id = cleanText(messageId);
  if (!id) {
    const error = new Error("message_id is required");
    error.status = 400;
    throw error;
  }
  const { data: message, error } = await supabase
    .from("chat_messages")
    .select("id, conversation_id, sender_user_id, deleted_at")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!message?.id) {
    const notFound = new Error("Message not found");
    notFound.status = 404;
    throw notFound;
  }
  await assertConversationMembership(supabase, { companyId, conversationId: message.conversation_id, userId: callerId });
  if (String(message.sender_user_id) !== String(callerId) && !isAdminRole(callerRole)) {
    const forbidden = new Error("You can only delete your own messages");
    forbidden.status = 403;
    throw forbidden;
  }
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("chat_messages")
    .update({ deleted_at: message.deleted_at || now, deleted_by: callerId })
    .eq("company_id", companyId)
    .eq("id", message.id);
  if (updateError) throw updateError;
  return { id: message.id, deleted_at: message.deleted_at || now };
}

async function toggleChecklistItem(supabase, { companyId, callerId, itemId, checked }) {
  const id = cleanText(itemId);
  if (!id) {
    const error = new Error("item_id is required");
    error.status = 400;
    throw error;
  }
  const { data: item, error } = await supabase
    .from("chat_message_checklist_items")
    .select("id, conversation_id, is_checked")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!item?.id) {
    const notFound = new Error("Checklist item not found");
    notFound.status = 404;
    throw notFound;
  }
  await assertConversationMembership(supabase, { companyId, conversationId: item.conversation_id, userId: callerId });
  const nextChecked = checked == null ? !item.is_checked : Boolean(checked);
  const { error: updateError } = await supabase
    .from("chat_message_checklist_items")
    .update({
      is_checked: nextChecked,
      checked_at: nextChecked ? new Date().toISOString() : null,
      checked_by: nextChecked ? callerId : null,
    })
    .eq("company_id", companyId)
    .eq("id", item.id);
  if (updateError) throw updateError;
  return { id: item.id, is_checked: nextChecked };
}

async function togglePin(supabase, { companyId, callerId, conversationId, messageId }) {
  const convId = cleanText(conversationId);
  const msgId = cleanText(messageId);
  if (!convId) {
    const error = new Error("conversation_id is required");
    error.status = 400;
    throw error;
  }
  await assertConversationMembership(supabase, { companyId, conversationId: convId, userId: callerId });
  let pinType = "conversation";
  if (msgId) {
    const { data: message, error } = await supabase
      .from("chat_messages")
      .select("id, message_type")
      .eq("company_id", companyId)
      .eq("conversation_id", convId)
      .eq("id", msgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!message?.id) {
      const notFound = new Error("Message not found");
      notFound.status = 404;
      throw notFound;
    }
    pinType = message.message_type === "checklist" ? "checklist" : "message";
  }

  let query = supabase
    .from("chat_pins")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", callerId)
    .eq("conversation_id", convId)
    .eq("pin_type", pinType)
    .is("unpinned_at", null);
  query = msgId ? query.eq("message_id", msgId) : query.is("message_id", null);
  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    const { error: unpinError } = await supabase
      .from("chat_pins")
      .update({ unpinned_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", existing.id);
    if (unpinError) throw unpinError;
    return { pinned: false };
  }

  const { error: insertError } = await supabase.from("chat_pins").insert({
    company_id: companyId,
    conversation_id: convId,
    message_id: msgId || null,
    user_id: callerId,
    pin_type: pinType,
  });
  if (insertError) throw insertError;
  return { pinned: true };
}

async function leaveConversation(supabase, { companyId, callerId, conversationId }) {
  const convId = cleanText(conversationId);
  const conversation = await getConversation(supabase, { companyId, conversationId: convId });
  if (conversation.type !== "group" || conversation.is_default) {
    const error = new Error("Only group chats can be left");
    error.status = 400;
    throw error;
  }
  const member = await assertConversationMembership(supabase, { companyId, conversationId: convId, userId: callerId });
  const activeMembers = await getConversationMembers(supabase, { companyId, conversationId: convId });
  const remaining = activeMembers.filter((row) => String(row.user_id) !== String(callerId));
  if (!remaining.length) {
    await supabase
      .from("chat_conversations")
      .update({ archived_at: new Date().toISOString(), archived_by: callerId })
      .eq("company_id", companyId)
      .eq("id", convId);
  } else if (cleanText(member.role).toLowerCase() === "owner" && !remaining.some((row) => cleanText(row.role).toLowerCase() === "owner")) {
    await supabase
      .from("chat_conversation_members")
      .update({ role: "owner" })
      .eq("company_id", companyId)
      .eq("id", remaining[0].id);
  }
  const { error } = await supabase
    .from("chat_conversation_members")
    .update({ left_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("conversation_id", convId)
    .eq("user_id", callerId)
    .is("left_at", null);
  if (error) throw error;
  return { left: true };
}

async function removeMember(supabase, { companyId, callerId, callerRole, conversationId, targetUserId }) {
  const convId = cleanText(conversationId);
  const target = cleanText(targetUserId);
  if (!target || target === callerId) {
    const error = new Error("Choose a different member to remove");
    error.status = 400;
    throw error;
  }
  const conversation = await getConversation(supabase, { companyId, conversationId: convId });
  if (conversation.type !== "group" || conversation.is_default) {
    const error = new Error("Members can only be removed from group chats");
    error.status = 400;
    throw error;
  }
  const callerConversationMember = await assertConversationMembership(supabase, { companyId, conversationId: convId, userId: callerId });
  if (!canManageConversation(callerRole, callerConversationMember)) {
    const error = new Error("Only chat owners or managers can remove group members");
    error.status = 403;
    throw error;
  }
  const activeMembers = await getConversationMembers(supabase, { companyId, conversationId: convId });
  const targetMember = activeMembers.find((row) => String(row.user_id) === String(target));
  if (!targetMember) {
    const error = new Error("Member is not active in this group");
    error.status = 404;
    throw error;
  }
  const remaining = activeMembers.filter((row) => String(row.user_id) !== String(target));
  if (!remaining.length) {
    const error = new Error("Cannot remove the last group member");
    error.status = 400;
    throw error;
  }
  if (cleanText(targetMember.role).toLowerCase() === "owner" && !remaining.some((row) => cleanText(row.role).toLowerCase() === "owner")) {
    await supabase
      .from("chat_conversation_members")
      .update({ role: "owner" })
      .eq("company_id", companyId)
      .eq("id", remaining[0].id);
  }
  const { error } = await supabase
    .from("chat_conversation_members")
    .update({ left_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("conversation_id", convId)
    .eq("user_id", target)
    .is("left_at", null);
  if (error) throw error;
  return { removed: true, user_id: target };
}

async function addMembers(supabase, { companyId, callerId, conversationId, memberUserIds }) {
  const convId = cleanText(conversationId);
  const conversation = await getConversation(supabase, { companyId, conversationId: convId });
  if (conversation.type !== "group" || conversation.is_default) {
    const error = new Error("Members can only be added to group chats");
    error.status = 400;
    throw error;
  }
  // Any active member of the group can add more people (removal stays
  // manager-only, handled in removeMember).
  await assertConversationMembership(supabase, { companyId, conversationId: convId, userId: callerId });
  const requested = uniqueStrings(memberUserIds);
  if (!requested.length) {
    const error = new Error("Choose at least one team member to add");
    error.status = 400;
    throw error;
  }
  const activeCompany = await fetchActiveCompanyMembers(supabase, companyId);
  const activeIds = new Set(activeCompany.map((member) => member.user_id));
  const currentMembers = await getConversationMembers(supabase, { companyId, conversationId: convId });
  const currentIds = new Set(currentMembers.map((row) => String(row.user_id)));
  // Only people who are active in the company and not already in the group.
  const toAdd = requested.filter((id) => activeIds.has(id) && !currentIds.has(String(id)));
  if (!toAdd.length) {
    const error = new Error("Selected people are already in the group or not active");
    error.status = 400;
    throw error;
  }
  if (currentIds.size + toAdd.length > MAX_GROUP_MEMBERS) {
    const error = new Error(`Groups can include up to ${MAX_GROUP_MEMBERS} members`);
    error.status = 400;
    throw error;
  }
  // ownerId null → all added as plain members; upsert resets left_at so a
  // previously-removed person can be re-added.
  await upsertMembers(supabase, { companyId, conversationId: convId, userIds: toAdd, ownerId: null });
  return { added: toAdd };
}

async function archiveConversation(supabase, { companyId, callerId, callerRole, conversationId }) {
  const convId = cleanText(conversationId);
  const conversation = await getConversation(supabase, { companyId, conversationId: convId });
  if (conversation.type === "company" || conversation.is_default) {
    const error = new Error("Company-wide chat cannot be archived");
    error.status = 400;
    throw error;
  }
  if (!isAdminRole(callerRole)) {
    const error = new Error("Only managers can archive chats");
    error.status = 403;
    throw error;
  }
  const { error } = await supabase
    .from("chat_conversations")
    .update({ archived_at: new Date().toISOString(), archived_by: callerId })
    .eq("company_id", companyId)
    .eq("id", convId);
  if (error) throw error;
  return { archived: true };
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

    const callerMembership = await getActiveMembership(supabase, companyId, user.id);
    const callerRole = callerMembership.role;

    if (req.method === "GET" && action === "list") {
      const data = await listConversations(supabase, { companyId, callerId: user.id, callerRole });
      res.status(200).json({ ok: true, caller_role: callerRole, ...data });
      return;
    }

    if (req.method === "GET" && action === "messages") {
      const conversationId = cleanText(query.conversation_id || query.conversationId);
      if (!conversationId) {
        res.status(400).json({ error: "Missing conversation_id" });
        return;
      }
      const messagesResult = await listMessages(supabase, {
        companyId,
        conversationId,
        callerId: user.id,
        callerRole,
        limit: query.limit,
      });
      const lists = await listChatLists(supabase, {
        companyId,
        conversationId,
        callerId: user.id,
        callerRole,
      });
      res.status(200).json({ ok: true, ...messagesResult, lists });
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
        messageType: body.message_type || body.messageType,
        attachments: body.attachments,
        checklistItems: body.checklist_items || body.checklistItems,
        metadata: body.metadata,
      });
      res.status(200).json({ ok: true, message: result, notification_ids: result.notification_ids || [] });
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

    if (req.method === "POST" && action === "delete_message") {
      const result = await deleteMessage(supabase, {
        companyId,
        callerId: user.id,
        callerRole,
        messageId: body.message_id || body.messageId,
      });
      res.status(200).json({ ok: true, message: result });
      return;
    }

    if (req.method === "POST" && action === "toggle_checklist_item") {
      const result = await toggleChecklistItem(supabase, {
        companyId,
        callerId: user.id,
        itemId: body.item_id || body.itemId,
        checked: body.checked,
      });
      res.status(200).json({ ok: true, item: result });
      return;
    }

    if (req.method === "POST" && action === "set_list_store") {
      const list = await getChatListForMember(supabase, {
        companyId,
        listId: body.list_id || body.listId,
        callerId: user.id,
      });
      const storeName = cleanText(body.store_name || body.storeName).slice(0, 80) || null;
      const { error: storeError } = await supabase
        .from("chat_lists")
        .update({ store_name: storeName, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq("company_id", companyId)
        .eq("id", list.id);
      if (storeError) throw storeError;
      res.status(200).json({ ok: true, store_name: storeName });
      return;
    }

    if (req.method === "POST" && action === "set_list_title") {
      const list = await getChatListForMember(supabase, {
        companyId,
        listId: body.list_id || body.listId,
        callerId: user.id,
      });
      const title = cleanText(body.title).slice(0, 120);
      if (!title) {
        res.status(400).json({ error: "Title is required" });
        return;
      }
      const update = { title, updated_at: new Date().toISOString(), updated_by: user.id };
      const rawType = cleanText(body.list_type || body.listType).toLowerCase();
      if (["home_depot", "pending_job", "other"].includes(rawType)) {
        update.list_type = rawType;
        if (rawType !== "home_depot") update.store_name = null;
      }
      const { error: titleError } = await supabase
        .from("chat_lists")
        .update(update)
        .eq("company_id", companyId)
        .eq("id", list.id);
      if (titleError) throw titleError;
      res.status(200).json({ ok: true, title, list_type: update.list_type });
      return;
    }

    if (req.method === "POST" && action === "create_list") {
      const result = await createChatList(supabase, {
        companyId,
        conversationId: body.conversation_id || body.conversationId,
        callerId: user.id,
        title: body.title,
        items: body.items,
        listType: body.list_type || body.listType,
        storeName: body.store_name || body.storeName,
      });
      res.status(200).json({ ok: true, list: result });
      return;
    }

    if (req.method === "POST" && action === "add_list_item") {
      const result = await addChatListItem(supabase, {
        companyId,
        callerId: user.id,
        listId: body.list_id || body.listId,
        text: body.text,
        parentItemId: body.parent_item_id || body.parentItemId,
        assignedUserId: body.assigned_user_id || body.assignedUserId,
      });
      res.status(200).json({ ok: true, item: result });
      return;
    }

    if (req.method === "POST" && action === "update_list_item") {
      const result = await updateChatListItem(supabase, {
        companyId,
        callerId: user.id,
        itemId: body.item_id || body.itemId,
        text: body.text,
      });
      res.status(200).json({ ok: true, item: result });
      return;
    }

    if (req.method === "POST" && action === "toggle_list_item") {
      const result = await toggleChatListItem(supabase, {
        companyId,
        callerId: user.id,
        itemId: body.item_id || body.itemId,
        done: body.done,
      });
      res.status(200).json({ ok: true, item: result });
      return;
    }

    if (req.method === "POST" && action === "assign_list_item") {
      const result = await assignChatListItem(supabase, {
        companyId,
        callerId: user.id,
        itemId: body.item_id || body.itemId,
        assignedUserId: body.assigned_user_id || body.assignedUserId,
      });
      res.status(200).json({ ok: true, item: result });
      return;
    }

    if (req.method === "POST" && action === "delete_list_item") {
      const result = await deleteChatListItem(supabase, {
        companyId,
        callerId: user.id,
        itemId: body.item_id || body.itemId,
      });
      res.status(200).json({ ok: true, item: result });
      return;
    }

    if (req.method === "POST" && action === "reparent_list_item") {
      const result = await reparentChatListItem(supabase, {
        companyId,
        callerId: user.id,
        itemId: body.item_id || body.itemId,
        parentItemId: body.parent_item_id || body.parentItemId,
      });
      res.status(200).json({ ok: true, item: result });
      return;
    }

    if (req.method === "POST" && action === "archive_list") {
      const result = await archiveChatList(supabase, {
        companyId,
        callerId: user.id,
        callerRole,
        listId: body.list_id || body.listId,
      });
      res.status(200).json({ ok: true, list: result });
      return;
    }

    if (req.method === "POST" && action === "toggle_pin") {
      const result = await togglePin(supabase, {
        companyId,
        callerId: user.id,
        conversationId: body.conversation_id || body.conversationId,
        messageId: body.message_id || body.messageId,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (req.method === "POST" && action === "mark_read") {
      const conversationId = cleanText(body.conversation_id || body.conversationId);
      if (!conversationId) {
        res.status(400).json({ error: "Missing conversation_id" });
        return;
      }
      await assertConversationMembership(supabase, { companyId, conversationId, userId: user.id });
      const result = await markConversationRead(supabase, { companyId, conversationId, userId: user.id });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (req.method === "POST" && action === "leave_conversation") {
      const result = await leaveConversation(supabase, {
        companyId,
        callerId: user.id,
        conversationId: body.conversation_id || body.conversationId,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (req.method === "POST" && action === "add_member") {
      const result = await addMembers(supabase, {
        companyId,
        callerId: user.id,
        conversationId: body.conversation_id || body.conversationId,
        memberUserIds:
          body.member_user_ids ||
          body.memberUserIds ||
          (body.target_user_id || body.targetUserId ? [body.target_user_id || body.targetUserId] : []),
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (req.method === "POST" && action === "remove_member") {
      const result = await removeMember(supabase, {
        companyId,
        callerId: user.id,
        callerRole,
        conversationId: body.conversation_id || body.conversationId,
        targetUserId: body.target_user_id || body.targetUserId,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    if (req.method === "POST" && action === "archive_conversation") {
      const result = await archiveConversation(supabase, {
        companyId,
        callerId: user.id,
        callerRole,
        conversationId: body.conversation_id || body.conversationId,
      });
      res.status(200).json({ ok: true, ...result });
      return;
    }

    res.status(405).json({ error: "Unsupported chat action" });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.warn("[CHAT_API] failed", error);
    res.status(status).json({ error: error?.message || "Chat request failed" });
  }
}
