import test from "node:test";
import assert from "node:assert/strict";
import { pragueClock, inDeliveryWindow, deliverMessages } from "./delivery.mjs";
test("Prague window follows summer/winter and includes exact boundaries", () => {
  assert.deepEqual(pragueClock(new Date("2026-07-01T08:17:00Z")), {
    date: "2026-07-01",
    hour: 10,
    minute: 17,
  });
  assert.deepEqual(pragueClock(new Date("2026-12-01T09:17:00Z")), {
    date: "2026-12-01",
    hour: 10,
    minute: 17,
  });
  for (const [hour, minute, expected] of [
    [10, 16, false],
    [10, 17, true],
    [11, 29, true],
    [11, 30, false],
    [0, 0, false],
  ])
    assert.equal(inDeliveryWindow({ hour, minute }), expected);
});
function fakeDatabase() {
  const deliveries = new Set(),
    removed = [];
  return {
    deliveries,
    removed,
    from(table) {
      const filters = {};
      return {
        select() {
          return this;
        },
        eq(k, v) {
          filters[k] = v;
          return this;
        },
        maybeSingle() {
          return { data: deliveries.has(filters.token_id) ? {} : null };
        },
        upsert(row) {
          deliveries.add(row.token_id);
          return { data: null };
        },
        delete() {
          return {
            eq: (_k, id) => {
              removed.push(id);
              return { data: null };
            },
          };
        },
      };
    },
  };
}
test("FCM retries only failed devices, removes expired tokens, force resends same message", async () => {
  const db = fakeDatabase(),
    calls = [];
  let fail = true;
  const messaging = {
    async send(payload) {
      calls.push(payload);
      if (payload.token === "expired")
        throw { code: "messaging/registration-token-not-registered" };
      if (payload.token === "retry" && fail)
        throw { code: "messaging/internal-error" };
    },
  };
  const args = {
    db,
    messaging,
    messages: [{ id: "m1" }],
    tokens: [
      { id: "a", token: "ok" },
      { id: "b", token: "retry" },
      { id: "c", token: "expired" },
    ],
  };
  assert.deepEqual(await deliverMessages(args), { sent: 1, failed: 1 });
  assert.deepEqual(db.removed, ["c"]);
  fail = false;
  assert.deepEqual(
    await deliverMessages({ ...args, tokens: args.tokens.slice(0, 2) }),
    { sent: 1, failed: 0 },
  );
  assert.equal(calls.filter((p) => p.token === "ok").length, 1);
  assert.deepEqual(
    await deliverMessages({ ...args, tokens: [args.tokens[0]], force: true }),
    { sent: 1, failed: 0 },
  );
  assert.equal(calls.at(-1).data.tag, "love-m1");
  assert.equal("notification" in calls[0], false);
});
