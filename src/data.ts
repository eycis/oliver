import { createClient } from "@supabase/supabase-js";
import DOMPurify from "dompurify";
export const db =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      )
    : null;
export const clean = (value: string) =>
  DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    RETURN_DOM_FRAGMENT: true,
  }).textContent?.trim() ?? "";
export type Message = {
  id: string;
  body: string;
  title: string;
  delivery_date: string | null;
  category: string;
};
export type Comment = {
  id: string;
  message_id: string;
  user_id: string | null;
  body: string;
  created_at: string;
};
export type Member = { id: string; name: string; role: "author" | "recipient" };
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("cs", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T12:00:00"));
const day = (offset: number) => {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
export const sample: Message[] = [
  {
    id: "demo-1",
    title: "Moje nejoblíbenější místo",
    body: "Víš, kde jsem nejradši?\n\nVedle tebe. Ať už jsme kdekoliv.\nDěkuju, že i z úplně obyčejného dne\numíš udělat něco krásného.\n\nMám tě moc ráda. ♡",
    delivery_date: day(0),
    category: "Jen tak z lásky",
  },
  {
    id: "demo-2",
    title: "Malá připomínka",
    body: "Jsem na tebe pyšná. I ve dnech, kdy máš pocit, že se ti nic nedaří. Jsi můj oblíbený člověk. ♡",
    delivery_date: day(-1),
    category: "Pro úsměv",
  },
  {
    id: "demo-3",
    title: "S tebou chutná líp",
    body: "Ranní kafe, pozdní snídaně i život. S tebou je všechno tak nějak lepší.",
    delivery_date: day(-2),
    category: "Naše maličkosti",
  },
  {
    id: "demo-4",
    title: "Jedno objetí na dálku",
    body: "Až tohle budeš číst, představ si, že tě právě objímám. A ještě chvíli nepouštím.",
    delivery_date: day(1),
    category: "Jen tak z lásky",
  },
];
