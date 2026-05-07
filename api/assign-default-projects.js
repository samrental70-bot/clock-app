/**
 * Vercel serverless: assign a company member to every active project and active cost centre.
 * Used after self-join so new employees can use Clock immediately.
 */
import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function cleanRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  if (role === "owner" || role === "admin") return "owner";
  if (role === "supervisor") return "supervisor";
  return "employee";
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
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "Missing authorization" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const companyId = body.company_id;
  const targetUserId = body.target_user_id;
  if (!companyId || !targetUserId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const callerId = userData.user.id;
  const { data: callerMember, error: callerErr } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (callerErr) {
    res.status(500).json({ error: callerErr.message });
    return;
  }
  if (!callerMember) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const callerRole = cleanRole(callerMember.role);
  const isSelf = String(callerId) === String(targetUserId);
  if (!isSelf && callerRole !== "owner" && callerRole !== "supervisor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: targetMember, error: targetErr } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetErr) {
    res.status(500).json({ error: targetErr.message });
    return;
  }
  if (!targetMember) {
    res.status(400).json({ error: "User is not a member of this company" });
    return;
  }

  const { data: projects, error: projectsErr } = await supabase
    .from("projects")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active");
  if (projectsErr) {
    res.status(500).json({ error: projectsErr.message });
    return;
  }

  const projectIds = [...new Set((projects || []).map((p) => p.id).filter(Boolean))];
  if (projectIds.length === 0) {
    res.status(200).json({ success: true, projects: 0, cost_centres: 0 });
    return;
  }

  const { data: existingProjectAssignments, error: existingPaErr } = await supabase
    .from("project_assignments")
    .select("id, project_id, status")
    .eq("company_id", companyId)
    .eq("user_id", targetUserId)
    .in("project_id", projectIds);
  if (existingPaErr) {
    res.status(500).json({ error: existingPaErr.message });
    return;
  }

  const paByProject = new Map((existingProjectAssignments || []).map((r) => [String(r.project_id), r]));
  const archivedPaIds = [];
  const paInsertRows = [];
  for (const projectId of projectIds) {
    const existing = paByProject.get(String(projectId));
    if (existing?.id) {
      if (String(existing.status || "").toLowerCase() !== "active") archivedPaIds.push(existing.id);
      continue;
    }
    paInsertRows.push({
      company_id: companyId,
      project_id: projectId,
      user_id: targetUserId,
      assigned_by: callerId,
      status: "active",
    });
  }

  if (archivedPaIds.length > 0) {
    const { error: reactivateErr } = await supabase
      .from("project_assignments")
      .update({ status: "active", assigned_by: callerId })
      .eq("company_id", companyId)
      .in("id", archivedPaIds);
    if (reactivateErr) {
      res.status(500).json({ error: reactivateErr.message });
      return;
    }
  }

  if (paInsertRows.length > 0) {
    const { error: paInsertErr } = await supabase.from("project_assignments").insert(paInsertRows);
    if (paInsertErr) {
      res.status(500).json({ error: paInsertErr.message });
      return;
    }
  }

  const { data: centres, error: centresErr } = await supabase
    .from("cost_centres")
    .select("id, project_id")
    .eq("company_id", companyId)
    .in("project_id", projectIds)
    .eq("status", "active");
  if (centresErr) {
    res.status(500).json({ error: centresErr.message });
    return;
  }

  const centreRows = (centres || []).filter((c) => c?.id && c?.project_id);
  if (centreRows.length === 0) {
    res.status(200).json({
      success: true,
      projects: paInsertRows.length + archivedPaIds.length,
      cost_centres: 0,
    });
    return;
  }

  const { data: existingCostAssignments, error: existingPccaErr } = await supabase
    .from("project_cost_centre_assignments")
    .select("id, project_id, cost_centre_id, status")
    .eq("company_id", companyId)
    .eq("user_id", targetUserId)
    .in("project_id", projectIds);
  if (existingPccaErr) {
    res.status(500).json({ error: existingPccaErr.message });
    return;
  }

  const pccaByKey = new Map(
    (existingCostAssignments || []).map((r) => [`${String(r.project_id)}::${String(r.cost_centre_id)}`, r])
  );
  const archivedPccaIds = [];
  const pccaInsertRows = [];
  for (const centre of centreRows) {
    const key = `${String(centre.project_id)}::${String(centre.id)}`;
    const existing = pccaByKey.get(key);
    if (existing?.id) {
      if (String(existing.status || "").toLowerCase() !== "active") archivedPccaIds.push(existing.id);
      continue;
    }
    pccaInsertRows.push({
      company_id: companyId,
      project_id: centre.project_id,
      cost_centre_id: centre.id,
      user_id: targetUserId,
      assigned_by: callerId,
      status: "active",
    });
  }

  if (archivedPccaIds.length > 0) {
    const { error: reactivatePccaErr } = await supabase
      .from("project_cost_centre_assignments")
      .update({ status: "active", assigned_by: callerId })
      .eq("company_id", companyId)
      .in("id", archivedPccaIds);
    if (reactivatePccaErr) {
      res.status(500).json({ error: reactivatePccaErr.message });
      return;
    }
  }

  if (pccaInsertRows.length > 0) {
    const { error: pccaInsertErr } = await supabase
      .from("project_cost_centre_assignments")
      .insert(pccaInsertRows);
    if (pccaInsertErr) {
      res.status(500).json({ error: pccaInsertErr.message });
      return;
    }
  }

  res.status(200).json({
    success: true,
    projects: paInsertRows.length + archivedPaIds.length,
    cost_centres: pccaInsertRows.length + archivedPccaIds.length,
  });
}
