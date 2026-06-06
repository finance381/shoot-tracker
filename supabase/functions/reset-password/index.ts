import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");

    // Client with caller's JWT to verify admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) throw new Error("Invalid session");

    const { data: callerMember } = await anonClient
      .from("team_members")
      .select("is_admin")
      .eq("auth_id", caller.id)
      .single();

    if (!callerMember?.is_admin) throw new Error("Admin only");

    const { member_id, new_password } = await req.json();
    if (!member_id || !new_password) throw new Error("member_id and new_password required");
    if (new_password.length < 6) throw new Error("Password must be at least 6 characters");

    // Admin client to update password
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the member's auth_id
    const { data: member } = await adminClient
      .from("team_members")
      .select("auth_id, name")
      .eq("id", member_id)
      .single();

    if (!member) throw new Error("Member not found");
    if (!member.auth_id) throw new Error("Member hasn't set up their account yet");

    const { error } = await adminClient.auth.admin.updateUserById(member.auth_id, {
      password: new_password,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, name: member.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});