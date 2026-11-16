export function pragueClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}
export function inDeliveryWindow({ hour, minute }) {
  const time = hour * 60 + minute;
  return time >= 10 * 60 + 17 && time <= 11 * 60 + 29;
}
export async function deliverMessages({
  db,
  messaging,
  messages,
  tokens,
  force = false,
}) {
  const checked = (result) => {
    if (result.error) throw result.error;
    return result.data;
  };
  let sent = 0,
    failed = 0;
  for (const message of messages)
    for (const device of tokens) {
      const previous = checked(
        await db
          .from("fcm_deliveries")
          .select("message_id")
          .eq("message_id", message.id)
          .eq("token_id", device.id)
          .maybeSingle(),
      );
      if (previous && !force) continue;
      try {
        await messaging.send({
          token: device.token,
          data: { tag: `love-${message.id}` },
          webpush: { headers: { TTL: "86400", Urgency: "normal" } },
        });
        checked(
          await db
            .from("fcm_deliveries")
            .upsert({
              message_id: message.id,
              token_id: device.id,
              sent_at: new Date().toISOString(),
            }),
        );
        sent++;
      } catch (error) {
        if (
          [
            "messaging/registration-token-not-registered",
            "messaging/invalid-registration-token",
          ].includes(error.code)
        ) {
          checked(await db.from("fcm_tokens").delete().eq("id", device.id));
        } else {
          console.error(
            "Delivery failed for device",
            device.id,
            "code",
            error.code ?? "unknown",
          );
          failed++;
        }
      }
    }
  return { sent, failed };
}
