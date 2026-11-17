import { db, type Message, type Comment } from "./data";
export async function callPublic<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!db) throw new Error("Missing database configuration");
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error("Požadavek se nepodařilo dokončit.");
  return data as T;
}
export type Snapshot = { messages: Message[]; comments: Comment[] };
