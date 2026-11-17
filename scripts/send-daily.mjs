import { createClient } from "@supabase/supabase-js";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { pragueClock, inDeliveryWindow, deliverMessages } from "./delivery.mjs";
async function main() {
  const force = process.env.FORCE_SEND === "1";
  if (!force && !inDeliveryWindow(pragueClock())) {
    console.log("Outside 10:17–11:29 Europe/Prague.");
    return;
  }
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
  ]) {
    if (!process.env[name]) throw new Error(`Missing ${name}`);
  }
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = process.env.FIREBASE_PROJECT_ID || account.project_id;
  if (projectId !== account.project_id)
    throw new Error("Firebase project does not match service account.");
  initializeApp({ credential: cert(account), projectId });
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const checked = (result) => {
    if (result.error)
      throw new Error(
        "Database operation failed; check schema and server key.",
      );
    return result.data;
  };
  const members = checked(
    await db.from("link_members").select("id").eq("active", true),
  );
  if (!members.length) {
    console.log("No active links configured.");
    return;
  }
  const messages = checked(
    await db.rpc("pick_daily_message", { p_force: force }),
  );
  if (!messages.length) {
    console.log("No unused messages remain.");
    return;
  }
  const tokens = checked(
    await db
      .from("fcm_tokens")
      .select("id,token")
      .in(
        "member_id",
        members.map((member) => member.id),
      ),
  );
  const { sent, failed } = await deliverMessages({
    db,
    messaging: getMessaging(),
    messages,
    tokens,
    force,
  });
  console.log(`sent=${sent}, failed=${failed}, devices=${tokens.length}`);
  if (failed) process.exitCode = 1;
}
main().catch(() => {
  // Do not print credentials, private tokens or provider response bodies.
  console.error(
    "Daily job failed. Check required secrets, Firebase project and Supabase migration.",
  );
  process.exitCode = 1;
});
