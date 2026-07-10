/**
 * Vercel serverless: update project name/status and task rows with service role.
 * Keeps project archive changes reliable when browser RLS hides/blocks employee data.
 */
import { createClient } from "@supabase/supabase-js";
import { verifyUserToken } from "./_verifyUserToken.js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function cleanRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "owner" || role === "admin") return "owner";
  if (role === "supervisor") return "supervisor";
  return "employee";
}

function cleanStatus(value) {
  return String(value || "").trim().toLowerCase() === "archived" ? "archived" : "active";
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
  const projectId = body.project_id;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const projectStatus = cleanStatus(body.status);
  const initialCostCentreIds = Array.isArray(body.initial_cost_centre_ids)
    ? body.initial_cost_centre_ids.filter((id) => id != null)
    : [];
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (!companyId || !projectId || !name) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { user: verifiedUser, error: userErr } = await verifyUserToken(url, token, { fallbackClient: supabase });
  if (userErr || !verifiedUser?.id) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const callerId = verifiedUser.id;
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

  const callerRole = cleanRole(callerMember?.role);
  if (callerRole !== "owner" && callerRole !== "supervisor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: existingProject, error: existingProjectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", projectId)
    .maybeSingle();
  if (existingProjectErr) {
    res.status(500).json({ error: existingProjectErr.message });
    return;
  }
  if (!existingProject?.id) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const { data: updatedProject, error: projectErr } = await supabase
    .from("projects")
    .update({
      name,
      status: projectStatus,
      ...(Object.prototype.hasOwnProperty.call(body, "special_project_active")
        ? { special_project_active: Boolean(body.special_project_active) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "special_hourly_rate")
        ? { special_hourly_rate: Number(body.special_hourly_rate ?? 0) || 0 }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "special_project_notes")
        ? { special_project_notes: String(body.special_project_notes || "").trim() }
        : {}),
    })
    .eq("company_id", companyId)
    .eq("id", projectId)
    .select("id, name, status, special_project_active, special_hourly_rate, special_project_notes")
    .maybeSingle();
  if (projectErr) {
    res.status(500).json({ error: projectErr.message });
    return;
  }
  if (!updatedProject?.id) {
    res.status(404).json({ error: "Project was not updated." });
    return;
  }

  const currentDbIds = new Set(
    lines
      .map((line) => line?.dbId)
      .filter((id) => id != null)
      .map((id) => String(id))
  );

  const removedIds = initialCostCentreIds.filter((id) => !currentDbIds.has(String(id)));
  if (removedIds.length > 0) {
    const { error: archiveRemovedErr } = await supabase
      .from("cost_centres")
      .update({ status: "archived" })
      .eq("company_id", companyId)
      .eq("project_id", projectId)
      .in("id", removedIds);
    if (archiveRemovedErr) {
      res.status(500).json({ error: archiveRemovedErr.message });
      return;
    }
  }

  const { data: maxOrdRows, error: maxErr } = await supabase
    .from("cost_centres")
    .select("display_order")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (maxErr) {
    res.status(500).json({ error: maxErr.message });
    return;
  }
  let nextOrder =
    maxOrdRows?.[0]?.display_order != null && Number.isFinite(Number(maxOrdRows[0].display_order))
      ? Number(maxOrdRows[0].display_order) + 1
      : 0;

  for (const line of lines) {
    const taskName = typeof line?.name === "string" ? line.name.trim() : "";
    const taskStatus = projectStatus === "archived" ? "archived" : cleanStatus(line?.status);
    const dbId = line?.dbId ?? null;

    if (dbId != null) {
      if (!taskName) {
        res.status(400).json({ error: "Task name cannot be empty." });
        return;
      }
      const taskUpdatePayload = {
        name: taskName,
        status: taskStatus,
      };
      if (Object.prototype.hasOwnProperty.call(line, "manualContractActive")) {
        taskUpdatePayload.manual_contract_active = Boolean(line.manualContractActive);
      }
      if (Object.prototype.hasOwnProperty.call(line, "manualContractFixedAmount")) {
        taskUpdatePayload.manual_contract_fixed_amount = Number(line.manualContractFixedAmount ?? 0) || 0;
      }
      if (Object.prototype.hasOwnProperty.call(line, "manualContractNotes")) {
        taskUpdatePayload.manual_contract_notes = String(line.manualContractNotes || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(line, "manualContractStartDate")) {
        taskUpdatePayload.manual_contract_start_date = String(line.manualContractStartDate || "").trim() || null;
      }
      if (Object.prototype.hasOwnProperty.call(line, "manualContractEndDate")) {
        taskUpdatePayload.manual_contract_end_date = String(line.manualContractEndDate || "").trim() || null;
      }
      const { error: taskUpdateErr } = await supabase
        .from("cost_centres")
        .update(taskUpdatePayload)
        .eq("company_id", companyId)
        .eq("project_id", projectId)
        .eq("id", dbId);
      if (taskUpdateErr) {
        res.status(500).json({ error: taskUpdateErr.message });
        return;
      }
    } else if (line?.isNew && taskName) {
      const { error: taskInsertErr } = await supabase.from("cost_centres").insert({
        company_id: companyId,
        project_id: projectId,
        name: taskName,
        status: taskStatus,
        display_order: nextOrder,
        created_by: callerId,
        manual_contract_active: Boolean(line?.manualContractActive),
        manual_contract_fixed_amount: Number(line?.manualContractFixedAmount ?? 0) || 0,
        manual_contract_notes: String(line?.manualContractNotes || "").trim(),
        manual_contract_start_date: String(line?.manualContractStartDate || "").trim() || null,
        manual_contract_end_date: String(line?.manualContractEndDate || "").trim() || null,
      });
      if (taskInsertErr) {
        res.status(500).json({ error: taskInsertErr.message });
        return;
      }
      nextOrder += 1;
    }
  }

  if (projectStatus === "archived") {
    const { error: archiveTasksErr } = await supabase
      .from("cost_centres")
      .update({ status: "archived" })
      .eq("company_id", companyId)
      .eq("project_id", projectId);
    if (archiveTasksErr) {
      res.status(500).json({ error: archiveTasksErr.message });
      return;
    }

    const { error: archiveProjectAssignmentsErr } = await supabase
      .from("project_assignments")
      .update({ status: "archived" })
      .eq("company_id", companyId)
      .eq("project_id", projectId);
    if (archiveProjectAssignmentsErr) {
      res.status(500).json({ error: archiveProjectAssignmentsErr.message });
      return;
    }

    const { error: archiveTaskAssignmentsErr } = await supabase
      .from("project_cost_centre_assignments")
      .update({ status: "archived" })
      .eq("company_id", companyId)
      .eq("project_id", projectId);
    if (archiveTaskAssignmentsErr) {
      res.status(500).json({ error: archiveTaskAssignmentsErr.message });
      return;
    }
  }

  res.status(200).json({
    success: true,
    project: updatedProject,
  });
}
