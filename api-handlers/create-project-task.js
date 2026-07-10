import { createClient } from "@supabase/supabase-js";
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

function cleanText(value) {
  return String(value ?? "").trim();
}

function setCorsHeaders(req, res) {
  const origin = cleanText(req?.headers?.origin);
  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "https://project-rui1d-development.vercel.app",
    "https://project-rui1d.vercel.app",
  ]);
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function cleanRole(value) {
  const role = cleanText(value).toLowerCase();
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  if (role === "supervisor") return "supervisor";
  return "employee";
}

function isAdminRole(role) {
  return ["owner", "admin", "supervisor"].includes(cleanRole(role));
}

function isArchivedStatus(value) {
  return cleanText(value).toLowerCase() === "archived";
}

function isInactiveMemberStatus(value) {
  const status = cleanText(value).toLowerCase();
  return ["archived", "inactive", "disabled", "removed", "deleted"].includes(status);
}

function isMissingCompanySettingsColumnError(error) {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return (
    msg.includes("column") &&
    (msg.includes("assign_all_projects_to_all_employees") ||
      msg.includes("assign_all_tasks_to_all_projects") ||
      msg.includes("allow_employee_project_task_creation"))
  );
}

function isMissingMemberStatusColumnError(error) {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return msg.includes("column") && (msg.includes("status") || msg.includes("employment_status"));
}

function isDuplicateInsertError(error) {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "23505" || msg.includes("duplicate key");
}

async function getCompanySettings(supabase, companyId) {
  let { data, error } = await supabase
    .from("companies")
    .select("assign_all_projects_to_all_employees, assign_all_tasks_to_all_projects, allow_employee_project_task_creation")
    .eq("id", companyId)
    .maybeSingle();

  if (error && isMissingCompanySettingsColumnError(error)) {
    return {
      assignAllProjects: true,
      assignAllTasks: true,
      allowEmployeeCreates: false,
    };
  }
  if (error) throw error;

  return {
    assignAllProjects: data?.assign_all_projects_to_all_employees !== false,
    assignAllTasks: data?.assign_all_tasks_to_all_projects !== false,
    allowEmployeeCreates: data?.allow_employee_project_task_creation === true,
  };
}

async function fetchActiveCompanyMemberUserIds(supabase, companyId) {
  const { data: members, error: membersError } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId);
  if (membersError) throw membersError;

  const userIds = [...new Set((members || []).map((m) => m.user_id).filter(Boolean))];
  if (!userIds.length) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, employment_status")
    .in("id", userIds);
  if (profilesError) return userIds;

  const statusById = Object.fromEntries((profiles || []).map((p) => [String(p.id), p.employment_status]));
  return userIds.filter((uid) => cleanText(statusById[String(uid)]).toLowerCase() !== "archived");
}

async function fetchCompanyDefaultCostCentreNames(supabase, companyId) {
  const { data, error } = await supabase
    .from("cost_centres")
    .select("name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name", { ascending: true });
  if (error) throw error;

  const seen = new Set();
  const names = [];
  for (const row of data || []) {
    const name = cleanText(row?.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

async function reactivateOrInsertProjectAssignments(supabase, { companyId, projectIds, userIds, assignedBy }) {
  const pids = [...new Set((projectIds || []).filter(Boolean).map(String))];
  const uids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!pids.length || !uids.length) return 0;

  const { data: existing, error: existingError } = await supabase
    .from("project_assignments")
    .select("id, project_id, user_id, status")
    .eq("company_id", companyId)
    .in("project_id", pids)
    .in("user_id", uids);
  if (existingError) throw existingError;

  const byKey = new Map((existing || []).map((row) => [`${String(row.project_id)}::${String(row.user_id)}`, row]));
  const archivedIds = [];
  const insertRows = [];
  for (const projectId of pids) {
    for (const userId of uids) {
      const existingRow = byKey.get(`${projectId}::${userId}`);
      if (existingRow?.id) {
        if (cleanText(existingRow.status).toLowerCase() !== "active") archivedIds.push(existingRow.id);
        continue;
      }
      insertRows.push({
        company_id: companyId,
        project_id: projectId,
        user_id: userId,
        assigned_by: assignedBy,
        status: "active",
      });
    }
  }

  if (archivedIds.length) {
    const { error } = await supabase
      .from("project_assignments")
      .update({ status: "active", assigned_by: assignedBy })
      .eq("company_id", companyId)
      .in("id", archivedIds);
    if (error) throw error;
  }
  if (insertRows.length) {
    const { error } = await supabase.from("project_assignments").insert(insertRows);
    if (error && !isDuplicateInsertError(error)) throw error;
  }
  return archivedIds.length + insertRows.length;
}

async function reactivateOrInsertCostCentreAssignments(supabase, { companyId, costCentreRows, userIds, assignedBy }) {
  const centres = (costCentreRows || []).filter((row) => row?.id && row?.project_id);
  const uids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!centres.length || !uids.length) return 0;

  const projectIds = [...new Set(centres.map((row) => String(row.project_id)))];
  const { data: existing, error: existingError } = await supabase
    .from("project_cost_centre_assignments")
    .select("id, project_id, cost_centre_id, user_id, status")
    .eq("company_id", companyId)
    .in("project_id", projectIds)
    .in("user_id", uids);
  if (existingError) throw existingError;

  const byKey = new Map(
    (existing || []).map((row) => [
      `${String(row.project_id)}::${String(row.cost_centre_id)}::${String(row.user_id)}`,
      row,
    ])
  );
  const archivedIds = [];
  const insertRows = [];
  for (const cc of centres) {
    for (const userId of uids) {
      const key = `${String(cc.project_id)}::${String(cc.id)}::${userId}`;
      const existingRow = byKey.get(key);
      if (existingRow?.id) {
        if (cleanText(existingRow.status).toLowerCase() !== "active") archivedIds.push(existingRow.id);
        continue;
      }
      insertRows.push({
        company_id: companyId,
        project_id: cc.project_id,
        cost_centre_id: cc.id,
        user_id: userId,
        assigned_by: assignedBy,
        status: "active",
      });
    }
  }

  if (archivedIds.length) {
    const { error } = await supabase
      .from("project_cost_centre_assignments")
      .update({ status: "active", assigned_by: assignedBy })
      .eq("company_id", companyId)
      .in("id", archivedIds);
    if (error) throw error;
  }
  if (insertRows.length) {
    const { error } = await supabase.from("project_cost_centre_assignments").insert(insertRows);
    if (error && !isDuplicateInsertError(error)) throw error;
  }
  return archivedIds.length + insertRows.length;
}

async function insertSupervisorNotifications(supabase, params) {
  const { companyId, actorUserId, actorRole, type, title, message, projectId, projectName, costCentre } = params;
  const role = cleanRole(actorRole);
  if (!companyId || !actorUserId || role === "owner") return [];

  const { data: members, error } = await supabase
    .from("company_members")
    .select("user_id, role")
    .eq("company_id", companyId);
  if (error) {
    console.warn("[CREATE_PROJECT_TASK] notification recipient lookup failed", error);
    return [];
  }

  const recipients = (members || [])
    .filter((member) => {
      const uid = cleanText(member?.user_id);
      const r = cleanRole(member?.role);
      if (!uid || uid === String(actorUserId)) return false;
      if (role === "employee") return r === "owner" || r === "supervisor" || r === "admin";
      if (role === "supervisor" || role === "admin") return r === "owner";
      return false;
    })
    .map((member) => String(member.user_id));

  if (!recipients.length) return [];
  const rows = [...new Set(recipients)].map((recipientUserId) => ({
    company_id: companyId,
    recipient_user_id: recipientUserId,
    actor_user_id: actorUserId,
    type,
    title,
    message,
    read_at: null,
    is_read: false,
    project_id: projectId != null ? String(projectId) : null,
    project_name: projectName || null,
    cost_centre: costCentre || null,
    related_timesheet_id: null,
    related_folder: projectName || null,
    item_count: null,
  }));

  let { data, error: insertError } = await supabase.from("notifications").insert(rows).select("id");
  if (insertError && String(insertError.message || "").toLowerCase().includes("is_read")) {
    const retryRows = rows.map((row) => {
      const retryRow = { ...row };
      delete retryRow.is_read;
      return retryRow;
    });
    ({ data, error: insertError } = await supabase.from("notifications").insert(retryRows).select("id"));
  }
  if (insertError) {
    console.warn("[CREATE_PROJECT_TASK] notification insert failed", insertError);
    return [];
  }
  return (data || []).map((row) => row.id).filter(Boolean);
}

async function findActiveProjectByName(supabase, companyId, name) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name", { ascending: true });
  if (error) throw error;
  const key = name.toLowerCase();
  return (data || []).find((project) => cleanText(project?.name).toLowerCase() === key) || null;
}

async function callerHasActiveProjectAssignment(supabase, { companyId, projectId, callerId }) {
  const { data, error } = await supabase
    .from("project_assignments")
    .select("id")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("user_id", callerId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function createProject(supabase, { companyId, callerId, callerRole, settings, name, specialProject = null }) {
  const existing = await findActiveProjectByName(supabase, companyId, name);
  if (existing?.id) {
    if (!isAdminRole(callerRole) && !settings.assignAllProjects) {
      const assigned = await callerHasActiveProjectAssignment(supabase, {
        companyId,
        projectId: existing.id,
        callerId,
      });
      if (!assigned) {
        throw new Error("Project already exists. Ask a supervisor for access.");
      }
    }
    return { project: existing, createdCostCentres: [], existed: true, assignments: { projects: 0, costCentres: 0 } };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      company_id: companyId,
      name,
      status: "active",
      created_by: callerId,
      special_project_active: Boolean(specialProject?.active),
      special_hourly_rate: Number(specialProject?.specialHourlyRate ?? specialProject?.special_hourly_rate ?? 0) || 0,
      special_project_notes: String(specialProject?.notes ?? specialProject?.special_project_notes ?? "").trim(),
    })
    .select("id, name, status, special_project_active, special_hourly_rate, special_project_notes")
    .single();
  if (projectError) throw projectError;

  const defaultTaskNames = await fetchCompanyDefaultCostCentreNames(supabase, companyId);
  let createdCostCentres = [];
  if (defaultTaskNames.length) {
    const rows = defaultTaskNames.map((taskName, index) => ({
      company_id: companyId,
      project_id: project.id,
      name: taskName,
      status: "active",
      display_order: index,
      created_by: callerId,
    }));
    const { data, error } = await supabase.from("cost_centres").insert(rows).select("id, name, project_id");
    if (error) throw error;
    createdCostCentres = data || [];
  }

  const activeMemberIds = settings.assignAllProjects
    ? await fetchActiveCompanyMemberUserIds(supabase, companyId)
    : [callerId];
  const projectAssignments = await reactivateOrInsertProjectAssignments(supabase, {
    companyId,
    projectIds: [project.id],
    userIds: activeMemberIds,
    assignedBy: callerId,
  });
  const taskAssignments =
    settings.assignAllTasks || !settings.assignAllProjects
      ? await reactivateOrInsertCostCentreAssignments(supabase, {
          companyId,
          costCentreRows: createdCostCentres,
          userIds: settings.assignAllTasks ? activeMemberIds : [callerId],
          assignedBy: callerId,
        })
      : 0;

  return {
    project,
    createdCostCentres,
    existed: false,
    assignments: { projects: projectAssignments, costCentres: taskAssignments },
  };
}

async function createTask(supabase, { companyId, callerId, callerRole, settings, projectId, name, manualContract = null }) {
  let targetProjectIds;
  if (settings.assignAllTasks) {
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("status", "active");
    if (error) throw error;
    targetProjectIds = (projects || []).map((project) => project.id).filter(Boolean);
  } else {
    if (!projectId) throw new Error("Choose a project before adding a task.");
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("id", projectId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (!project?.id) throw new Error("Project not found.");
    if (!isAdminRole(callerRole) && !settings.assignAllProjects) {
      const assigned = await callerHasActiveProjectAssignment(supabase, {
        companyId,
        projectId: project.id,
        callerId,
      });
      if (!assigned) throw new Error("You are not assigned to this project.");
    }
    targetProjectIds = [project.id];
  }

  if (!targetProjectIds.length) throw new Error("Add an active project before adding a task.");

  const { data: existingRows, error: existingError } = await supabase
    .from("cost_centres")
    .select("id, project_id, name, status")
    .eq("company_id", companyId)
    .in("project_id", targetProjectIds);
  if (existingError) throw existingError;

  const wanted = name.toLowerCase();
  const existingActive = new Set(
    (existingRows || [])
      .filter((row) => cleanText(row?.status).toLowerCase() !== "archived")
      .map((row) => `${String(row.project_id)}::${cleanText(row.name).toLowerCase()}`)
  );
  const rows = targetProjectIds
    .filter((pid) => !existingActive.has(`${String(pid)}::${wanted}`))
    .map((pid, index) => ({
      company_id: companyId,
      project_id: pid,
      name,
      status: "active",
      display_order: 1000 + index,
      created_by: callerId,
      manual_contract_active:
        Boolean(manualContract?.active ?? manualContract?.manual_contract_active ?? false) ||
        Number(manualContract?.fixedAmount ?? manualContract?.fixed_amount ?? 0) > 0,
      manual_contract_fixed_amount: Number(manualContract?.fixedAmount ?? manualContract?.fixed_amount ?? 0) || 0,
      manual_contract_notes: String(manualContract?.notes ?? manualContract?.manual_contract_notes ?? "").trim(),
      manual_contract_start_date: String(manualContract?.startDate ?? manualContract?.manual_contract_start_date ?? "").trim() || null,
      manual_contract_end_date: String(manualContract?.endDate ?? manualContract?.manual_contract_end_date ?? "").trim() || null,
    }));

  let insertedTasks = [];
  if (rows.length) {
    const { data, error } = await supabase.from("cost_centres").insert(rows).select("id, name, project_id");
    if (error) throw error;
    insertedTasks = data || [];
  }

  const activeMemberIds = settings.assignAllTasks
    ? await fetchActiveCompanyMemberUserIds(supabase, companyId)
    : [callerId];
  const taskAssignments = await reactivateOrInsertCostCentreAssignments(supabase, {
    companyId,
    costCentreRows: insertedTasks,
    userIds: activeMemberIds,
    assignedBy: callerId,
  });

  return {
    insertedTasks,
    existed: insertedTasks.length === 0,
    assignments: { costCentres: taskAssignments },
  };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

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

  const body = parseBody(req);
  const companyId = cleanText(body.company_id || body.companyId);
  const itemType = cleanText(body.item_type || body.itemType || body.type).toLowerCase();
  const name = cleanText(body.name || body.project_name || body.task_name).slice(0, 140);
  const projectId = cleanText(body.project_id || body.projectId);

  if (!companyId || !itemType || !name) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (!["project", "task"].includes(itemType)) {
    res.status(400).json({ error: "item_type must be project or task" });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { user: caller, error: userError } = await verifyUserToken(url, token, { fallbackClient: supabase });
  if (userError || !caller?.id) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  try {
    let { data: member, error: memberError } = await supabase
      .from("company_members")
      .select("role, status, employment_status")
      .eq("company_id", companyId)
      .eq("user_id", caller.id)
      .maybeSingle();
    if (memberError && isMissingMemberStatusColumnError(memberError)) {
      ({ data: member, error: memberError } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", caller.id)
        .maybeSingle());
    }
    if (memberError) throw memberError;
    if (!member) {
      res.status(403).json({ error: "Caller is not in this company" });
      return;
    }
    if (isInactiveMemberStatus(member.status) || isInactiveMemberStatus(member.employment_status)) {
      res.status(403).json({ error: "Inactive members cannot create projects or tasks." });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("employment_status")
      .eq("id", caller.id)
      .maybeSingle();
    if (profileError && !String(profileError.message || "").toLowerCase().includes("employment_status")) {
      throw profileError;
    }
    if (isArchivedStatus(profile?.employment_status)) {
      res.status(403).json({ error: "Archived users cannot create projects or tasks." });
      return;
    }

    const callerRole = cleanRole(member.role);
    const settings = await getCompanySettings(supabase, companyId);
    const allowed = isAdminRole(callerRole) || callerRole === "employee";
    if (!allowed) {
      res.status(403).json({
        error: "Project/task creation is not allowed for this role.",
      });
      return;
    }

    let result;
    if (itemType === "project") {
      result = await createProject(supabase, {
        companyId,
        callerId: caller.id,
        callerRole,
        settings,
        name,
        specialProject: body.special_project || body.specialProject || null,
      });
      if (!result.existed) {
        await insertSupervisorNotifications(supabase, {
          companyId,
          actorUserId: caller.id,
          actorRole: callerRole,
          type: "project_created",
          title: "New project created",
          message: `New project created: ${name}`,
          projectId: result.project?.id,
          projectName: name,
          costCentre: "",
        });
      }
      res.status(200).json({
        ok: true,
        item_type: "project",
        project: result.project,
        cost_centres: result.createdCostCentres || [],
        existed: result.existed,
        assignments: result.assignments,
      });
      return;
    }

    result = await createTask(supabase, {
      companyId,
      callerId: caller.id,
      callerRole,
      settings,
      projectId,
      name,
      manualContract: body.manual_contract || body.manualContract || null,
    });
    if (!result.existed) {
      await insertSupervisorNotifications(supabase, {
        companyId,
        actorUserId: caller.id,
        actorRole: callerRole,
        type: "task_created",
        title: "New task created",
        message: `New task created: ${name}`,
        projectId: settings.assignAllTasks ? null : projectId,
        projectName: settings.assignAllTasks ? "All active projects" : cleanText(body.project_name || body.projectName),
        costCentre: name,
      });
    }
    res.status(200).json({
      ok: true,
      item_type: "task",
      tasks: result.insertedTasks || [],
      existed: result.existed,
      assignments: result.assignments,
    });
  } catch (error) {
    console.warn("[CREATE_PROJECT_TASK] failed", error);
    res.status(500).json({ error: error?.message || "Project/task creation failed" });
  }
}
