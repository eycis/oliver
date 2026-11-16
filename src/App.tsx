import {
  readAccessKey,
  forgetAccessKey,
  callLink,
  type Snapshot,
} from "./access";
import { useEffect, useRef, useState } from "react";
import { Bell, Check, LogOut, Mail, X } from "lucide-react";
import {
  db,
  clean,
  today,
  dateLabel,
  sample,
  type Message,
  type Comment,
  type Member,
} from "./data";
function PixelHeart({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "pixel-heart small" : "pixel-heart"}
      viewBox="0 0 16 14"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M2 0h4v1h1v1h2V1h1V0h4v1h1v1h1v5h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4v-1H3V9H2V8H1V7H0V2h1V1h1z"
      />
      <path fill="#ffe9f0" d="M3 2h3v2H3z" />
    </svg>
  );
}
function PixelSparkle({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pixel-sparkle ${className}`}
      viewBox="0 0 11 11"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        fill="currentColor"
        d="M5 0h1v3h1v1h1v1h3v1H8v1H7v1H6v3H5V8H4V7H3V6H0V5h3V4h1V3h1z"
      />
      <path fill="#fffdfd" d="M5 4h1v1h1v1H6v1H5V6H4V5h1z" />
    </svg>
  );
}
function PixelFlower() {
  return (
    <svg
      className="pixel-flower"
      viewBox="0 0 13 17"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        fill="#b6bd95"
        d="M6 9h1v8H6zM3 11h2v1h1v2H4v-1H3zM8 10h3v2H9v1H7v-2h1z"
      />
      <path
        fill="#eab1c8"
        d="M5 0h3v1h1v3h3v1h1v3h-1v1H9v3H8v1H5v-1H4V9H1V8H0V5h1V4h3V1h1z"
      />
      <path fill="#fff3d4" d="M5 4h3v1h1v3H8v1H5V8H4V5h1z" />
    </svg>
  );
}
function PixelIcon({ kind }: { kind: "menu" | "send" }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 16 16"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        fill="currentColor"
        d={
          kind === "menu"
            ? "M2 3h12v2H2zM2 7h12v2H2zM2 11h12v2H2z"
            : "M2 7h8V3h2v2h2v2h2v2h-2v2h-2v2h-2V9H2z"
        }
      />
    </svg>
  );
}
export default function App() {
  const dialogRef = useRef<HTMLElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [accessKey, setAccessKey] = useState<string | null>(() =>
    readAccessKey(),
  );
  const accessKeyRef = useRef(accessKey);
  accessKeyRef.current = accessKey;
  const userId = member?.id ?? null;
  const [modal, setModal] = useState<"settings" | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(db));
  const [comment, setComment] = useState("");
  const demo = !db;
  useEffect(() => {
    const acceptLink = () => {
      if (!new URLSearchParams(location.hash.slice(1)).has("key")) return;
      const nextKey = readAccessKey();
      if (nextKey === accessKeyRef.current) return;
      accessKeyRef.current = nextKey;
      setAccessKey(nextKey);
      if (db) {
        setMember(null);
        setMessages([]);
        setComments([]);
        setLoading(Boolean(nextKey));
      }
    };
    window.addEventListener("hashchange", acceptLink);
    return () => window.removeEventListener("hashchange", acceptLink);
  }, []);
  async function refresh() {
    if (!db || !accessKey) return;
    const snapshot = await callLink<Snapshot>("read_letter", accessKey);
    if (accessKeyRef.current !== accessKey) return;
    setMessages(snapshot.messages);
    setComments(snapshot.comments);
    setMembers(snapshot.members);
    setMember(snapshot.member);
  }
  useEffect(() => {
    if (!db) {
      try {
        const saved = localStorage.getItem("love-demo");
        if (saved) {
          const data = JSON.parse(saved);
          setMessages(data.messages);
          setComments(data.comments);
        } else setMessages(sample);
      } catch {
        setMessages(sample);
      }
      return;
    }
  }, []);
  useEffect(() => {
    if (demo && messages.length)
      localStorage.setItem("love-demo", JSON.stringify({ messages, comments }));
  }, [messages, comments, demo]);
  useEffect(() => {
    if (!db || !accessKey) {
      setLoading(false);
      return;
    }
    const load = () =>
      refresh()
        .catch(() => {
          setMember(null);
          setMessages([]);
          setComments([]);
          setNotice(
            "Odkaz se nepodařilo ověřit. Zkontroluj připojení nebo otevři soukromý odkaz znovu.",
          );
        })
        .finally(() => {
          if (accessKeyRef.current === accessKey) setLoading(false);
        });
    void load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [accessKey]);
  useEffect(() => {
    if (!accessKey || member?.role !== "recipient") return;
    let cancelled = false;
    let stop = () => {};
    void import("./notifications")
      .then((n) => n.startNotifications(accessKey))
      .then((cleanup) => {
        if (cancelled) cleanup();
        else stop = cleanup;
      })
      .catch(() =>
        setNotice("Upozornění se nepodařilo obnovit. Zkus je zapnout v menu."),
      );
    return () => {
      cancelled = true;
      stop();
    };
  }, [accessKey, member?.role]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, textarea, select, [tabindex="0"]',
        ) ?? [],
      );
    const firstInput = dialog?.querySelector<HTMLElement>("input, textarea");
    (firstInput ?? focusable()[0])?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modal]);
  const delivered = messages
    .filter(
      (m): m is Message & { delivery_date: string } =>
        m.delivery_date !== null && m.delivery_date <= today(),
    )
    .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));
  const current = delivered[0];
  const currentComments = comments.filter((c) => c.message_id === current?.id);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.error("Požadavek se nezdařil.");
      setNotice("To se nepovedlo. Zkontroluj připojení a zkus to znovu.");
    } finally {
      setBusy(false);
    }
  }
  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const text = clean(comment);
    if (!text || !current || text.length > 280) return;
    await run(async () => {
      const payload = {
        message_id: current.id,
        user_id: userId ?? "demo-author",
        body: text,
      };
      if (db) {
        await callLink("add_letter_comment", accessKey!, {
          p_message_id: current.id,
          p_body: text,
        });
        await refresh();
      } else
        setComments([
          ...comments,
          {
            ...payload,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
          },
        ]);
      setComment("");
    });
  }
  async function enablePush() {
    if (demo) {
      setNotice("Upozornění budou dostupná po připojení společné schránky.");
      return;
    }
    if (!accessKey || member?.role !== "recipient") return;
    await run(async () => {
      const { enableNotifications } = await import("./notifications");
      await enableNotifications(accessKey);
      setNotice("Hotovo! Nové vzkazy se připomenou i na telefonu.");
    });
  }
  return (
    <div className="app">
      <header className="header">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Dnešní vzkaz"
        >
          <PixelHeart small />
        </a>
        <button
          className="icon-button"
          aria-label="Menu"
          onClick={() => setModal("settings")}
        >
          <PixelIcon kind="menu" />
        </button>
      </header>
      <main>
        {loading ? (
          <div className="empty">Otevírám schránku…</div>
        ) : !demo && !member ? (
          <section className="login panel">
            <PixelHeart />
            <p>
              Otevři svůj soukromý odkaz. Na tomhle telefonu si ho zapamatuju.
            </p>
          </section>
        ) : (
          <>
            <div className="layout">
              <section className="main-column">
                {current ? (
                  <>
                    <div className="section-label">
                      <time dateTime={current.delivery_date}>
                        {dateLabel(current.delivery_date)}
                      </time>
                    </div>
                    <article className="letter" aria-labelledby="letter-title">
                      <span
                        className="pixel-corner top-left"
                        aria-hidden="true"
                      />
                      <span
                        className="pixel-corner top-right"
                        aria-hidden="true"
                      />
                      <span
                        className="pixel-corner bottom-left"
                        aria-hidden="true"
                      />
                      <span
                        className="pixel-corner bottom-right"
                        aria-hidden="true"
                      />
                      <div className="letter-content">
                        <div className="heart-scene" aria-hidden="true">
                          <PixelSparkle className="sparkle-left" />
                          <PixelHeart />
                          <PixelSparkle className="sparkle-right" />
                          <span className="pixel-mote mote-left" />
                          <span className="pixel-mote mote-right" />
                        </div>
                        <h1 id="letter-title" className="sr-only">
                          {current.title}
                        </h1>
                        <p>{current.body}</p>
                        <div className="pixel-garden" aria-hidden="true">
                          <PixelFlower />
                          <span className="pixel-trail" />
                          <PixelHeart small />
                          <PixelHeart small />
                          <PixelHeart small />
                          <span className="pixel-trail" />
                          <PixelFlower />
                        </div>
                      </div>
                    </article>
                    <section className="comments" aria-label="Komentáře">
                      {currentComments.length > 0 &&
                        currentComments.map((c) => (
                          <div className="comment" key={c.id}>
                            <span className="avatar">
                              <PixelHeart small />
                            </span>
                            <div>
                              <strong>
                                {members.find((m) => m.id === c.user_id)
                                  ?.name ?? "Já"}{" "}
                              </strong>
                              <p>{c.body}</p>
                            </div>
                          </div>
                        ))}
                      <form className="comment-form" onSubmit={addComment}>
                        <input
                          aria-label="Komentář"
                          placeholder="napiš mi taky něco :)"
                          value={comment}
                          maxLength={280}
                          onChange={(e) => setComment(e.target.value)}
                          required
                        />
                        <button
                          aria-label="Odeslat komentář"
                          disabled={busy || !comment.trim()}
                        >
                          <PixelIcon kind="send" />
                        </button>
                      </form>
                      {comment.length > 240 && (
                        <span className="private-note">
                          {comment.length} / 280
                        </span>
                      )}
                    </section>
                  </>
                ) : (
                  <div className="empty panel">
                    <Mail />
                    <h2>První radost je teprve na cestě</h2>
                    <p>Až přijde jeho den, najdeš ho právě tady.</p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Zavřít zprávu"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="modal panel"
          >
            <button
              className="modal-close icon-button"
              aria-label="Zavřít"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            <PixelHeart small />
            <h3>můžeš si mě přidat na plochu ;)</h3>
            <p>
              Na Androidu otevři web v Chrome. V nabídce ⋮ vyber „Přidat na
              plochu“ nebo „Nainstalovat aplikaci“.
            </p>
            {(demo || member?.role === "recipient") && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void enablePush()}
              >
                <Bell size={17} /> posílej mi upozornění
              </button>
            )}
            {demo && (
              <p className="setting-note">
                Ukázkový režim: pro sdílení a oznámení připoj Supabase podle
                README projektu.
              </p>
            )}
            {userId && (
              <button
                className="text-button"
                onClick={() =>
                  void run(async () => {
                    const { disableNotifications } =
                      await import("./notifications");
                    await disableNotifications(accessKey!);
                    forgetAccessKey();
                    setAccessKey(null);
                    setMessages([]);
                    setComments([]);
                    setMember(null);
                    setModal(null);
                  })
                }
              >
                <LogOut size={16} /> Zapomenout přístup
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
