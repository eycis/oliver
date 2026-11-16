import { db, type Member, type Message, type Comment } from "./data";
const storageKey = "love-private-key";
export function readAccessKey(): string | null {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const incoming = fragment.get("key");
  if (incoming !== null) {
    history.replaceState(null, "", location.pathname + location.search);
    if (!/^[A-Za-z0-9_-]{43}$/.test(incoming)) {
      localStorage.removeItem(storageKey);
      return null;
    }
    localStorage.setItem(storageKey, incoming);
    return incoming;
  }
  return localStorage.getItem(storageKey);
}
export function forgetAccessKey() {
  localStorage.removeItem(storageKey);
}
export async function callLink<T>(
  name: string,
  key: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!db) throw new Error("Missing database configuration");
  const { data, error } = await db.rpc(name, { ...args, p_token: key });
  if (error)
    throw new Error("Přístup se nepodařilo ověřit nebo požadavek dokončit.");
  return data as T;
}
export type Snapshot = {
  member: Member;
  members: Member[];
  messages: Message[];
  comments: Comment[];
};
