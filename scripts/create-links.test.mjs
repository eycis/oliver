import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
test("Private-link generator writes separate random keys and only hashes to SQL; refuses overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oliver-links-test-"));
  const script = resolve("scripts/create-links.mjs");
  try {
    const output = execFileSync(
      process.execPath,
      [script, "https://example.test/oliver/"],
      { cwd: dir, encoding: "utf8" },
    );
    const links = await readFile(join(dir, ".private/links.txt"), "utf8");
    const sql = await readFile(join(dir, ".private/setup-links.sql"), "utf8");
    const tokens = [...links.matchAll(/#key=([A-Za-z0-9_-]{43})/g)].map(
      (m) => m[1],
    );
    assert.equal(tokens.length, 2);
    assert.notEqual(tokens[0], tokens[1]);
    for (const token of tokens) {
      assert.ok(sql.includes(createHash("sha256").update(token).digest("hex")));
      assert.ok(!sql.includes(token));
      assert.ok(!output.includes(token));
    }
    assert.throws(() =>
      execFileSync(process.execPath, [script, "https://example.test/"], {
        cwd: dir,
        stdio: "pipe",
      }),
    );
    assert.equal(
      await readFile(join(dir, ".private/links.txt"), "utf8"),
      links,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
