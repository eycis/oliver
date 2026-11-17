import { createClient } from "@supabase/supabase-js";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { pragueClock, inDeliveryWindow, deliverMessages } from "./delivery.mjs";
let stage = "checking required secrets";
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
  stage = "parsing FIREBASE_SERVICE_ACCOUNT_JSON (must be valid JSON)";
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  stage = "matching FIREBASE_PROJECT_ID with service account project_id";
  const projectId = process.env.FIREBASE_PROJECT_ID || account.project_id;
  if (projectId !== account.project_id)
    throw new Error("Firebase project does not match service account.");
  stage = "initializing Firebase service account credentials";
  initializeApp({ credential: cert(account), projectId });
  stage = "initializing Supabase URL and server key";
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
  stage = "calling Supabase pick_daily_message";
  const messages = checked(
    await db.rpc("pick_daily_message", { p_force: force }),
  );
  if (!messages.length) {
    console.log("No unused messages remain.");
    return;
  }
  stage = "loading registered devices from Supabase";
  const tokens = checked(
    await db
      .from("fcm_tokens")
      .select("id,token"),
  );
  stage = "sending Firebase notifications";
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
    `Daily job failed while ${stage}. No credentials are included in this log.`,
  );
  process.exitCode = 1;
});
