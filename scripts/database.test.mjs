import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const author = "a".repeat(43),
  recipient = "b".repeat(43);
const hash = (t) => createHash("sha256").update(t).digest("hex");
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select null::uuid $$; grant usage on schema public to anon, authenticated, service_role;`,
  );
  await db.exec(await readFile("supabase/schema.sql", "utf8"));
  await db.query(
    `insert into public.link_members(name,role,token_hash) values ('Já','author',$1),('Oliver','recipient',$2)`,
    [hash(author), hash(recipient)],
  );
  return db;
}
test("Private links protect tables, authorship, unreleased messages and FCM tokens", async () => {
  const db = await setup();
  try {
    const { rows } = await db.query(
      `insert into messages(title,body) values ('one','secret one'),('two','secret two') returning id`,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from messages"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from link_members"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from fcm_tokens"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select pick_daily_message(true)"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select require_link($1)", [recipient]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select read_letter($1)", ["wrong"]),
      /Invalid link/,
    );
    let snapshot = (
      await db.query("select read_letter($1) as data", [recipient])
    ).rows[0].data;
    assert.deepEqual(snapshot.messages, []);
    assert.equal(JSON.stringify(snapshot).includes("token_hash"), false);
    await assert.rejects(
      db.query("select add_letter_comment($1,$2,$3)", [
        recipient,
        rows[0].id,
        "spoiler",
      ]),
      /unavailable/,
    );
    await db.exec("reset role");
    const first = (await db.query("select * from pick_daily_message(true)"))
      .rows[0];
    const again = (await db.query("select * from pick_daily_message(true)"))
      .rows[0];
    assert.equal(first.id, again.id);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from messages where delivery_date is null",
        )
      ).rows[0].n,
      1,
    );
    await db.exec("set role anon");
    await db.query("select add_letter_comment($1,$2,$3)", [
      recipient,
      first.id,
      "A & B ♡",
    ]);
    await assert.rejects(
      db.query("select add_letter_comment($1,$2,$3)", [
        recipient,
        first.id,
        "<script>alert(1)</script>",
      ]),
      /Invalid comment/,
    );
    await assert.rejects(
      db.query("select add_letter_comment($1,$2,$3)", [
        recipient,
        first.id,
        "x".repeat(281),
      ]),
      /Invalid comment/,
    );
    snapshot = (await db.query("select read_letter($1) as data", [recipient]))
      .rows[0].data;
    assert.equal(snapshot.messages.length, 1);
    assert.equal(snapshot.comments[0].user_id, snapshot.member.id);
    await assert.rejects(
      db.query("select save_fcm_token($1,$2)", [author, "x".repeat(30)]),
      /Recipient only/,
    );
    await db.query("select save_fcm_token($1,$2)", [recipient, "x".repeat(30)]);
    for (let i = 0; i < 9; i++)
      await db.query("select add_letter_comment($1,$2,$3)", [
        recipient,
        first.id,
        "hello",
      ]);
    await assert.rejects(
      db.query("select add_letter_comment($1,$2,$3)", [
        recipient,
        first.id,
        "hello",
      ]),
      /Too many comments/,
    );
    await db.exec("reset role");
    await db.query(
      "update link_members set active=false where role='recipient'",
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select read_letter($1)", [recipient]),
      /Invalid link/,
    );
  } finally {
    await db.close();
  }
});

test("Upgrade preserves imported messages and existing comments", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select null::uuid $$; grant usage on schema public to anon, authenticated, service_role;`,
    );
    const schema = await readFile("supabase/schema.sql", "utf8");
    await db.exec(
      schema.split("-- Private-link access and Firebase notifications")[0],
    );
    await db.exec(
      `insert into auth.users values ('00000000-0000-0000-0000-000000000001'); insert into members values ('00000000-0000-0000-0000-000000000001','Legacy','author');`,
    );
    const id = (
      await db.query(
        `insert into messages(title,body,delivery_date) values ('Existing','Keep me',(now() at time zone 'Europe/Prague')::date) returning id`,
      )
    ).rows[0].id;
    await db.query(
      `insert into comments(message_id,user_id,body) values ($1,'00000000-0000-0000-0000-000000000001','Keep comment')`,
      [id],
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261117_private_links_fcm.sql",
        "utf8",
      ),
    );
    assert.equal(
      (await db.query("select body from messages")).rows[0].body,
      "Keep me",
    );
    assert.equal(
      (await db.query("select body from comments")).rows[0].body,
      "Keep comment",
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select * from messages"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from comments"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
