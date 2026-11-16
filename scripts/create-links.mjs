import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
const url = new URL(process.argv[2] || "http://localhost:5173/");
if (
  url.protocol !== "https:" &&
  !(url.protocol === "http:" && url.hostname === "localhost")
)
  throw new Error("Use HTTPS (or localhost for development).");
if (url.hash || url.search || url.username || url.password)
  throw new Error("Use the plain application URL, without query or fragment.");
try {
  await access(".private");
  throw new Error(
    ".private already exists. Keep your existing links; do not overwrite them.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(".private", { mode: 0o700 });
const people = [
  ["author", "Já"],
  ["recipient", "Oliver"],
].map(([role, name]) => {
  const token = randomBytes(32).toString("base64url");
  return {
    role,
    name,
    token,
    hash: createHash("sha256").update(token).digest("hex"),
  };
});
const sql =
  "insert into public.link_members (name, role, token_hash) values\n" +
  people.map((p) => `('${p.name}', '${p.role}', '${p.hash}')`).join(",\n") +
  ";\n";
await writeFile(".private/setup-links.sql", sql, { mode: 0o600, flag: "wx" });
await writeFile(
  ".private/links.txt",
  people.map((p) => `${p.role}: ${url.href}#key=${p.token}`).join("\n") + "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created .private/setup-links.sql for Supabase and .private/links.txt for your devices. Tokens were not printed.",
);
