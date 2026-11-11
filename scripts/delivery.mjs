export function pragueClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}
// Subscriptions are untrusted input. Never send requests to arbitrary/private hosts.
export function allowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ((url.hostname === "fcm.googleapis.com" &&
        url.pathname.startsWith("/fcm/send/")) ||
        (url.hostname === "updates.push.services.mozilla.com" &&
          url.pathname.startsWith("/wpush/")) ||
        (url.hostname === "web.push.apple.com" && url.pathname.startsWith("/")))
    );
  } catch {
    return false;
  }
}
