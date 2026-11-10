import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SECRET_KEYS_RAW = Deno.env.get("SUPABASE_SECRET_KEYS");
const SECRET_KEY_NAME = Deno.env.get("SUPABASE_SECRET_KEY_NAME");

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SECRET_KEYS_RAW) throw new Error("SUPABASE_SECRET_KEYS is required");
if (!SECRET_KEY_NAME) throw new Error("SUPABASE_SECRET_KEY_NAME is required");

let parsedSecretKeys: Record<string, string>;
try {
  parsedSecretKeys = JSON.parse(SUPABASE_SECRET_KEYS_RAW);
} catch {
  throw new Error("SUPABASE_SECRET_KEYS must be valid JSON");
}

const SUPABASE_SECRET_KEY = parsedSecretKeys[SECRET_KEY_NAME];
if (!SUPABASE_SECRET_KEY) {
  throw new Error(`No secret key found in SUPABASE_SECRET_KEYS for key name: ${SECRET_KEY_NAME}`);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreateUserPayload = {
  email: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice("Bearer ".length);

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authorization comes from server-controlled claims and the active canonical profile.
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("ativo,tipo").eq("id", callerData.user.id).maybeSingle();
  const isAdmin = !profileError && profile?.ativo === true &&
    (callerData.user.app_metadata?.role === "admin" || profile.tipo === "Administrador");

  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: CreateUserPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.email) {
    return new Response(JSON.stringify({ error: "email is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: body.email_confirm ?? true,
    user_metadata: body.user_metadata,
    app_metadata: body.app_metadata,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      user: {
        id: data.user?.id,
        email: data.user?.email,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});