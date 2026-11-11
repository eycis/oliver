import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { pragueClock, allowedPushEndpoint } from "./delivery.mjs";
for (const key of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
]) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}
const clock = pragueClock();
if (clock.hour < 9) {
  console.log("Before the daily delivery window.");
  process.exit(0);
}
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);
function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
// Only today's message: a newly subscribed phone does not receive the entire archive.
const messages = checked(
  await db.from("messages").select("id").eq("delivery_date", clock.date),
);
const recipient = checked(
  await db.from("members").select("id").eq("role", "recipient").maybeSingle(),
);
if (!recipient || !messages.length) {
  console.log("No message or recipient for today.");
  process.exit(0);
}
const subscriptions = checked(
  await db.from("push_subscriptions").select("*").eq("user_id", recipient.id),
);
let failures = 0;
for (const message of messages)
  for (const sub of subscriptions) {
    const previous = checked(
      await db
        .from("push_deliveries")
        .select("message_id")
        .eq("message_id", message.id)
        .eq("subscription_id", sub.id)
        .maybeSingle(),
    );
    if (previous) continue;
    if (!allowedPushEndpoint(sub.endpoint)) {
      console.error("Unsupported push provider; skipping subscription", sub.id);
      failures++;
      continue;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ tag: `love-${message.id}` }),
        { TTL: 86400, timeout: 15000 },
      );
      checked(
        await db
          .from("push_deliveries")
          .insert({ message_id: message.id, subscription_id: sub.id }),
      );
      console.log("Delivery accepted:", message.id, sub.id);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        checked(await db.from("push_subscriptions").delete().eq("id", sub.id));
      } else {
        // Do not log the provider response or subscription endpoint: these are private.
        console.error(
          "Delivery failed:",
          sub.id,
          "status:",
          error.statusCode ?? "unknown",
        );
        failures++;
      }
    }
  }
if (failures) process.exitCode = 1;
