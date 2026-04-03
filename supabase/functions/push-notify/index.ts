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
    const { type } = await req.json();

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
        const shootTime = new Date(`${shoot.date}T${shoot.time}`);
        const diffMin = (shootTime.getTime() - now.getTime()) / 60000;

        // Window: 45–75 min from now (handles 15-min cron interval)
        if (diffMin > 45 && diffMin <= 75) {
          let subs;
          if (shoot.assignee_id) {
            // Notify the assigned person
            const { data } = await supabase
              .from("push_subscriptions")
              .select("*")
              .eq("member_id", shoot.assignee_id);
            subs = data;
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
              title: "📸 Shoot in 1 hour",
              body: `${shoot.type}${shoot.client ? " — " + shoot.client : ""}${shoot.time ? " at " + shoot.time : ""}${loc ? " · " + loc : ""}`,
              tag: "hour-" + shoot.id,
            });
            results.push({ shoot: shoot.id, ...r });
          }
        }
      }

      return new Response(JSON.stringify({ results }));
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), { status: 400 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});