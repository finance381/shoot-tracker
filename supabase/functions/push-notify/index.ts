import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails("mailto:admin@shoottracker.app", vapidPublic, vapidPrivate);

const supabase = createClient(supabaseUrl, serviceKey);

async function sendToSub(sub: any, payload: any) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { status: "sent" };
  } catch (err: any) {
    // Remove expired/invalid subscriptions
    if (err.statusCode === 410 || err.statusCode === 404) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    return { status: "failed", error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { type } = body;
    if (type === "test") {
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("member_id", body.member_id);

      if (!subs?.length) return new Response(JSON.stringify({ error: "No subscriptions" }));

      const results = await Promise.allSettled(
        subs.map((sub: any) => sendToSub(sub, {
          title: body.title || "Test",
          body: body.body || "Test push",
          tag: "test-" + Date.now()
        }))
      );
      return new Response(JSON.stringify({ sent: results.length, results }));
    }

    if (type === "daily_summary") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().slice(0, 10);

      const { data: shoots } = await supabase
        .from("shoots")
        .select("*")
        .eq("date", dateStr)
        .in("status", ["Planned"]);

      if (!shoots?.length) return new Response(JSON.stringify({ msg: "No shoots tomorrow" }));

      const body = shoots
        .map((s: any) => `• ${s.type}${s.client ? " — " + s.client : ""}${s.time ? " at " + s.time : ""}`)
        .join("\n");

      const { data: subs } = await supabase.from("push_subscriptions").select("*");

      const results = await Promise.allSettled(
        (subs || []).map((sub: any) =>
          sendToSub(sub, {
            title: `📸 ${shoots.length} shoot${shoots.length > 1 ? "s" : ""} tomorrow`,
            body,
            tag: "daily-" + dateStr,
          })
        )
      );

      return new Response(JSON.stringify({ sent: results.length }));
    }

    if (type === "hour_before") {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);

      const { data: shoots } = await supabase
        .from("shoots")
        .select("*")
        .eq("date", today)
        .eq("status", "Planned")
        .not("time", "is", null);

      if (!shoots?.length) return new Response(JSON.stringify({ msg: "No shoots today" }));

      const results = [];

      for (const shoot of shoots) {
        const shootTime = new Date(`${shoot.date}T${shoot.time}+05:30`);
        const diffMin = (shootTime.getTime() - now.getTime()) / 60000;

        // Window: 45–75 min from now (handles 15-min cron interval)
        if (diffMin > 15 && diffMin <= 45) {
          let subs;
          if (shoot.assignee_id) {
            // Try to notify the assigned person
            const { data } = await supabase
              .from("push_subscriptions")
              .select("*")
              .eq("member_id", shoot.assignee_id);
            subs = data;

            // Fallback: if assignee has no subscription, notify everyone
            if (!subs || subs.length === 0) {
              const { data: allSubs } = await supabase.from("push_subscriptions").select("*");
              subs = allSubs;
            }
          } else {
            // No assignee — notify everyone
            const { data } = await supabase.from("push_subscriptions").select("*");
            subs = data;
          }

          const loc = shoot.location_type === "outdoor"
            ? shoot.outdoor_venue || "Outdoor"
            : shoot.location || "";

          for (const sub of subs || []) {
            const r = await sendToSub(sub, {
              title: "📸 Shoot in 30 minutes",
              body: `${shoot.type}${shoot.client ? " — " + shoot.client : ""}${shoot.time ? " at " + shoot.time : ""}${loc ? " · " + loc : ""}`,
              tag: "hour-" + shoot.id,
            });
            results.push({ shoot: shoot.id, ...r });
          }
        }
      }

      return new Response(JSON.stringify({ results }));
    }
    if (type === "new_request") {
      // Fetch the latest request
      const { data: reqData } = await supabase
        .from("shoot_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!reqData) return new Response(JSON.stringify({ msg: "No request found" }));

      const body = `${reqData.requested_by || "Someone"} requested a shoot on ${reqData.date || "TBD"}${reqData.function_name ? " — " + reqData.function_name : ""}${reqData.location ? " · " + reqData.location : ""}`;

      // Send to Shivika + Pratik only
      const notifyMembers = [
        "cc8fa698-8cb1-4994-b742-74df10a01ba7",
        "e1ef0fca-930c-43f2-89d7-b817fd9fc79e"
      ];

      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("member_id", notifyMembers);

      const results = await Promise.allSettled(
        (subs || []).map((sub: any) =>
          sendToSub(sub, {
            title: "📋 New Shoot Request",
            body,
            tag: "request-" + reqData.id,
          })
        )
      );

      return new Response(JSON.stringify({ sent: results.length }));
    }
    if (type === "request_status_changed") {
      const name = body.requester_name || "Someone";
      const status = body.new_status || "updated";
      const func = body.function_name || "";
      const dateStr = body.date || "";
      const reason = body.reject_reason || "";

      let title, notifBody;
      if (status === "accepted") {
        title = "✅ Request Approved!";
        // Fetch assignee name
        let assigneeName = "";
        if (body.shoot_id) {
          const { data: shoot } = await supabase
            .from("shoots")
            .select("assignee_id, external_assignee, team_members(name)")
            .eq("id", body.shoot_id)
            .maybeSingle();
          if (shoot?.external_assignee) assigneeName = shoot.external_assignee;
          else if (shoot?.team_members?.name) assigneeName = shoot.team_members.name;
        }
        notifBody = `Your shoot request${func ? " for " + func : ""}${dateStr ? " on " + dateStr : ""} has been approved.${assigneeName ? " Assigned to " + assigneeName + "." : ""}`;
      } else {
        title = "❌ Request Declined";
        notifBody = `Your shoot request${func ? " for " + func : ""}${dateStr ? " on " + dateStr : ""} was declined.${reason ? " Reason: " + reason : ""}`;
      }

      const reqId = body.requester_id;
      const { data: subs } = reqId
        ? await supabase.from("requester_push_subs").select("*").eq("requester_id", reqId)
        : await supabase.from("requester_push_subs").select("*").ilike("requester_name", `%${name}%`);

      if (!subs?.length) {
        return new Response(JSON.stringify({ msg: "No requester subscriptions found" }));
      }

      const results = await Promise.allSettled(
        subs.map((sub: any) =>
          sendToSub(sub, {
            title,
            body: notifBody,
            tag: "req-status-" + (body.request_id || Date.now()),
          })
        )
      );

      return new Response(JSON.stringify({ sent: results.length }));
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), { status: 400 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
