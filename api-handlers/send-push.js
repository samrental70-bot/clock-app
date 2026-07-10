/**
 * Vercel serverless: send Web Push for notification rows (service role only).
 * Env: SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
 */
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function firstMessageValue(message, prefix) {
  const lines = String(message || "").split(/\r?\n/);
  const row = lines.find((line) => String(line || "").toLowerCase().startsWith(prefix.toLowerCase()));
  if (!row) return "";
  return String(row).slice(prefix.length).trim();
}

function buildPushPayload(notification) {
  const type = notification.type || "";
  if (type === "schedule_assigned") {
    const taskTitle = firstMessageValue(notification.message, "Task:") || notification.title || "Scheduled task";
    const when = firstMessageValue(notification.message, "When:");
    const body = [taskTitle, when].filter(Boolean).join(" - ");
    return {
      title: "New task assigned",
      body: body || "Open the app to view your assignment.",
      id: notification.id,
      notificationId: notification.id,
      type,
      url: `/?tab=schedule&notificationId=${encodeURIComponent(notification.id)}`,
      tag: `schedule-assigned-${notification.id}`,
    };
  }
  if (type === "chat_message") {
    const relatedFolder = String(notification.related_folder || "");
    const conversationId = relatedFolder.startsWith("chat:") ? relatedFolder.slice(5) : "";
    const conversationName = String(notification.project_name || "").trim();
    const bodyPrefix =
      conversationName && conversationName.toLowerCase() !== "all employees"
        ? `${conversationName}: `
        : "";
    return {
      title: notification.title || "New message",
      body: `${bodyPrefix}${notification.message || "Open the app to read your message."}`.trim(),
      id: notification.id,
      notificationId: notification.id,
      type,
      url: conversationId
        ? `/?tab=chat&conversationId=${encodeURIComponent(conversationId)}&notificationId=${encodeURIComponent(notification.id)}`
        : "/?tab=chat",
      tag: `chat-message-${notification.id}`,
    };
  }
  return {
    title: notification.title || "Clock App",
    body: notification.message || "",
    id: notification.id,
    notificationId: notification.id,
    type,
    url: "/",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@example.com";
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const url = getSupabaseUrl();

  if (!serviceKey || !url || !pub || !priv) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const notificationIds = Array.isArray(body.notification_ids) ? body.notification_ids : [];
  if (notificationIds.length === 0) {
    res.status(200).json({ ok: true, sent: 0, deactivated: 0, errors: 0, detail: "no ids" });
    return;
  }

  webpush.setVapidDetails(subject, pub, priv);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: notifications, error: nErr } = await supabase
    .from("notifications")
    .select("id, recipient_user_id, title, message, type, project_name, related_folder")
    .in("id", notificationIds);

  if (nErr) {
    res.status(500).json({ error: nErr.message });
    return;
  }

  const rows = notifications || [];
  let sent = 0;
  let errors = 0;
  let deactivated = 0;

  for (const n of rows) {
    const isScheduleAssigned = n.type === "schedule_assigned";
    if (isScheduleAssigned) {
      console.log("[SEND_PUSH] loaded schedule_assigned notification", n.id);
    }
    const recipientId = n.recipient_user_id;
    if (!recipientId) continue;

    const { data: subs, error: sErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", recipientId)
      .eq("is_active", true);

    if (isScheduleAssigned) {
      if (sErr) console.log("[SEND_PUSH] subscriptions found", 0, sErr);
      else console.log("[SEND_PUSH] subscriptions found", Array.isArray(subs) ? subs.length : 0);
    }

    if (sErr || !subs?.length) continue;

    const payload = JSON.stringify(buildPushPayload(n));

    for (const sub of subs) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSub, payload);
        if (isScheduleAssigned) console.log("[SEND_PUSH] webpush success", n.id, sub.id);
        sent += 1;
      } catch (err) {
        if (isScheduleAssigned) console.log("[SEND_PUSH] webpush fail", n.id, sub.id, err?.message || err);
        errors += 1;
        const sc = Number(err?.statusCode);
        if (sc === 404 || sc === 410) {
          const { error: uErr } = await supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("id", sub.id);
          if (!uErr) deactivated += 1;
        }
      }
    }
  }

  res.status(200).json({
    ok: true,
    sent,
    errors,
    deactivated,
    notifications: rows.length,
  });
}
