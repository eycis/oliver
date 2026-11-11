import test from "node:test";
import assert from "node:assert/strict";
import { pragueClock, allowedPushEndpoint } from "./delivery.mjs";
test("Prague schedule follows summer and winter time", () => {
  assert.deepEqual(pragueClock(new Date("2026-07-01T07:00:00Z")), {
    date: "2026-07-01",
    hour: 9,
  });
  assert.deepEqual(pragueClock(new Date("2026-12-01T08:00:00Z")), {
    date: "2026-12-01",
    hour: 9,
  });
  assert.deepEqual(pragueClock(new Date("2026-12-31T23:05:00Z")), {
    date: "2027-01-01",
    hour: 0,
  });
});
test("push endpoints cannot target private networks or attacker domains", () => {
  for (const value of [
    "http://fcm.googleapis.com/fcm/send/a",
    "https://127.0.0.1/a",
    "https://fcm.googleapis.com.evil.test/fcm/send/a",
    "https://fcm.googleapis.com@evil.test/a",
    "https://fcm.googleapis.com:444/fcm/send/a",
    "https://fcm.googleapis.com/other",
    "garbage",
  ])
    assert.equal(allowedPushEndpoint(value), false, value);
  assert.equal(
    allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/token"),
    true,
  );
  assert.equal(
    allowedPushEndpoint(
      "https://updates.push.services.mozilla.com/wpush/v2/token",
    ),
    true,
  );
});
