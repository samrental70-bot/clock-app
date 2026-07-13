import { createClient } from "@supabase/supabase-js";
import { verifyUserToken } from "../../api-handlers/_verifyUserToken.js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isDuplicateAuthEmailError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    (message.includes("email") && message.includes("exists"))
  );
}

function parseRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

async function requireManager(supabase, req) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    throw Object.assign(new Error("Missing authorization."), { statusCode: 401 });
  }

  const { user: verifiedUser, error: userError } = await verifyUserToken(getSupabaseUrl(), accessToken, {
    fallbackClient: supabase,
  });
  if (userError || !verifiedUser?.id) {
    throw Object.assign(new Error("Invalid or expired session."), { statusCode: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", verifiedUser.id)
    .maybeSingle();

  if (profileError) {
    throw Object.assign(new Error(profileError.message || "Could not verify manager access."), { statusCode: 500 });
  }

  const role = String(profile?.role || "").trim().toLowerCase();
  if (!["manager", "admin", "owner"].includes(role)) {
    throw Object.assign(new Error("Forbidden."), { statusCode: 403 });
  }

  return verifiedUser;
}

function validateCustomerPayload(body, { requirePassword }) {
  const customerName = String(body.customer_name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!customerName) {
    throw Object.assign(new Error("Customer name is required."), { statusCode: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error("A valid email is required."), { statusCode: 400 });
  }

  if (requirePassword && password.length < 6) {
    throw Object.assign(new Error("Password must be at least 6 characters."), { statusCode: 400 });
  }

  return {
    customer_name: customerName,
    email,
    password,
    phone: String(body.phone || "").trim(),
    project_name: String(body.project_name || "").trim(),
    project_address: String(body.project_address || "").trim(),
    notes: String(body.notes || "").trim(),
  };
}

async function createCustomer(supabase, payload) {
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      full_name: payload.customer_name,
      role: "customer",
    },
  });

  if (authError) {
    if (isDuplicateAuthEmailError(authError)) {
      throw Object.assign(new Error("This email already has an account."), { statusCode: 400 });
    }
    throw Object.assign(new Error(authError.message || "Could not create auth user."), { statusCode: 400 });
  }

  const userId = authData?.user?.id;
  if (!userId) {
    throw Object.assign(new Error("Auth user creation failed."), { statusCode: 500 });
  }

  const profilePayload = {
    id: userId,
    email: payload.email,
    role: "customer",
    full_name: payload.customer_name,
  };

  const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    throw Object.assign(new Error(profileError.message || "Could not save customer profile."), { statusCode: 500 });
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      user_id: userId,
      customer_name: payload.customer_name,
      email: payload.email,
      phone: payload.phone,
      project_name: payload.project_name,
      project_address: payload.project_address,
      notes: payload.notes,
    })
    .select("*")
    .single();

  if (customerError) {
    await supabase.from("profiles").delete().eq("id", userId);
    await supabase.auth.admin.deleteUser(userId);
    throw Object.assign(new Error(customerError.message || "Could not save customer record."), { statusCode: 500 });
  }

  return customer;
}

async function updateCustomer(supabase, payload, body) {
  const customerId = String(body.customer_id || "").trim();
  if (!customerId) {
    throw Object.assign(new Error("customer_id is required."), { statusCode: 400 });
  }

  const { data: existingCustomer, error: customerLookupError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();

  if (customerLookupError) {
    throw Object.assign(new Error(customerLookupError.message || "Could not load customer."), { statusCode: 500 });
  }

  if (!existingCustomer) {
    throw Object.assign(new Error("Customer not found."), { statusCode: 404 });
  }

  const authUpdate = {
    email: payload.email,
    user_metadata: {
      full_name: payload.customer_name,
      role: "customer",
    },
  };

  if (payload.password) {
    if (payload.password.length < 6) {
      throw Object.assign(new Error("Password must be at least 6 characters."), { statusCode: 400 });
    }
    authUpdate.password = payload.password;
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(existingCustomer.user_id, authUpdate);
  if (authError) {
    if (isDuplicateAuthEmailError(authError)) {
      throw Object.assign(new Error("This email already has an account."), { statusCode: 400 });
    }
    throw Object.assign(new Error(authError.message || "Could not update auth user."), { statusCode: 400 });
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: existingCustomer.user_id,
      email: payload.email,
      role: "customer",
      full_name: payload.customer_name,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    throw Object.assign(new Error(profileError.message || "Could not update customer profile."), { statusCode: 500 });
  }

  const { data: updatedCustomer, error: customerUpdateError } = await supabase
    .from("customers")
    .update({
      customer_name: payload.customer_name,
      email: payload.email,
      phone: payload.phone,
      project_name: payload.project_name,
      project_address: payload.project_address,
      notes: payload.notes,
    })
    .eq("id", customerId)
    .select("*")
    .single();

  if (customerUpdateError) {
    throw Object.assign(new Error(customerUpdateError.message || "Could not update customer record."), {
      statusCode: 500,
    });
  }

  return updatedCustomer;
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Server is missing Supabase configuration." });
    return;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    await requireManager(supabaseAdmin, req);
    const body = parseRequestBody(req);
    const payload = validateCustomerPayload(body, { requirePassword: req.method === "POST" });

    const customer =
      req.method === "POST"
        ? await createCustomer(supabaseAdmin, payload)
        : await updateCustomer(supabaseAdmin, payload, body);

    res.status(200).json({ success: true, customer });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    res.status(statusCode).json({ error: error.message || "Customer account request failed." });
  }
}
