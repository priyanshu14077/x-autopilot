"use client";

import { useCallback, useEffect, useState } from "react";
import { PLATFORM_IDS, measure, type FieldDef, type PlatformId } from "@/lib/platforms/meta";

type PlatformInfo = {
  id: PlatformId;
  label: string;
  limit: number;
  fields: FieldDef[] | null;
  help: string;
  oauth: boolean;
  connected: boolean;
  account: string | null;
};

type Draft = { topic: string; text: string };

const X_ERRORS: Record<string, string> = {
  access_denied: "You cancelled the X authorization.",
  invalid_state: "The sign-in attempt expired or was invalid. Try connecting again.",
  insufficient_scopes: "X did not grant all the required permissions. Reconnect and approve them all.",
  authorization_failed: "X authorization failed. Try again.",
  exchange_failed: "Could not complete the connection with X. Try again.",
};

const field =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const button =
  "rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300`;
const secondary = `${button} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;
const card = "space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6";

const emptyDrafts = () =>
  Object.fromEntries(PLATFORM_IDS.map((id) => [id, { topic: "", text: "" }])) as Record<PlatformId, Draft>;

export default function Home() {
  const [platforms, setPlatforms] = useState<PlatformInfo[] | null>(null);
  const [csrf, setCsrf] = useState("");
  const [active, setActive] = useState<PlatformId>("telegram");
  const [drafts, setDrafts] = useState(emptyDrafts);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"generate" | "publish" | "connect" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; url?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/platforms", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPlatforms(data.platforms);
      setCsrf(data.csrfToken);
    } catch (e) {
      setError((e as Error).message || "Could not load platforms.");
      setPlatforms([]);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the OAuth redirect result */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xError = params.get("x_error");
    if (xError) {
      setError(X_ERRORS[xError] ?? "X connection failed.");
      setActive("x");
    } else if (params.get("x") === "connected") {
      setSuccess({ message: "X account connected." });
      setActive("x");
    }
    if (xError || params.has("x")) window.history.replaceState(null, "", "/");
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function api(method: "POST" | "DELETE", url: string, body: unknown = {}) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed.");
    return data;
  }

  async function run(kind: NonNullable<typeof busy>, task: () => Promise<void>) {
    setError(null);
    setSuccess(null);
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const info = platforms?.find((p) => p.id === active);
  const draft = drafts[active];
  const setDraft = (patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [active]: { ...d[active], ...patch } }));
  const length = measure(active, draft.text);
  const overLimit = info ? length > info.limit : false;
  const canPublish = !!info?.connected && draft.text.trim().length > 0 && !overLimit && busy === null;

  const generate = () =>
    run("generate", async () => {
      setConfirming(false);
      const data = await api("POST", "/api/v1/generate", { platform: active, topic: draft.topic });
      setDraft({ text: data.text });
    });

  const publish = () =>
    run("publish", async () => {
      try {
        const data = await api("POST", "/api/v1/publish", { platform: active, text: draft.text, confirm: true });
        setSuccess({ message: `Published to ${info?.label}.`, url: data.url });
        setDraft({ text: "" });
      } finally {
        setConfirming(false);
      }
    });

  const connect = () =>
    run("connect", async () => {
      await api("POST", `/api/v1/platforms/${active}/connection`, creds);
      setCreds({});
      await load();
      setSuccess({ message: `${info?.label} connected.` });
    });

  const disconnect = () =>
    run("connect", async () => {
      await api("DELETE", `/api/v1/platforms/${active}/connection`);
      await load();
      setSuccess({ message: `Disconnected from ${info?.label}.` });
    });

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black sm:py-16">
      <main className="w-full max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">X Autopilot</h1>
          <p className="text-sm text-zinc-500">One draft per platform. Publish one platform at a time.</p>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Platforms">
          {(platforms ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setActive(p.id);
                setConfirming(false);
                setError(null);
                setSuccess(null);
              }}
              aria-current={p.id === active}
              className={`${secondary} flex items-center gap-2 ${p.id === active ? "!border-zinc-900 dark:!border-zinc-100" : ""}`}
            >
              <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-green-500" : "bg-zinc-400"}`} />
              {p.label}
            </button>
          ))}
          {platforms === null && <span className="text-sm text-zinc-500">Loading platforms…</span>}
        </nav>

        {info && (
          <>
            <section className={card}>
              {info.connected ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>
                    {info.label} connected as <strong>{info.account}</strong>
                  </span>
                  <button className={secondary} onClick={disconnect} disabled={busy !== null}>
                    Disconnect
                  </button>
                </div>
              ) : info.oauth ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-500">{info.help}</span>
                  {/* Full navigation: this starts the OAuth redirect flow. */}
                  <a className={primary} href="/api/auth/x/login">
                    Connect X
                  </a>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    connect();
                  }}
                >
                  <p className="text-sm text-zinc-500">{info.help}</p>
                  {info.fields?.map((f) => (
                    <label key={f.name} className="block space-y-1 text-sm">
                      <span className="font-medium">{f.label}</span>
                      <input
                        className={field}
                        type={f.secret ? "password" : "text"}
                        autoComplete="off"
                        placeholder={f.placeholder}
                        value={creds[f.name] ?? ""}
                        onChange={(e) => setCreds((c) => ({ ...c, [f.name]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <button className={primary} disabled={busy !== null}>
                    {busy === "connect" ? "Connecting…" : `Connect ${info.label}`}
                  </button>
                </form>
              )}
            </section>

            <section className={card}>
              <label htmlFor="topic" className="text-sm font-medium">
                Topic
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="topic"
                  className={field}
                  value={draft.topic}
                  maxLength={300}
                  placeholder={`What should the ${info.label} post be about?`}
                  onChange={(e) => setDraft({ topic: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && draft.topic.trim() && busy === null && generate()}
                />
                <button className={primary} onClick={generate} disabled={!draft.topic.trim() || busy !== null}>
                  {busy === "generate" ? "Generating…" : "Generate"}
                </button>
              </div>
            </section>

            <section className={card}>
              <label htmlFor="post" className="text-sm font-medium">
                {info.label} post
              </label>
              <textarea
                id="post"
                className={`${field} min-h-32 resize-y`}
                value={draft.text}
                placeholder="Generated post appears here. You can edit it."
                onChange={(e) => {
                  setDraft({ text: e.target.value });
                  setConfirming(false);
                }}
              />
              <div className="flex items-center justify-between text-sm">
                <span className={overLimit ? "font-medium text-red-600" : "text-zinc-500"}>
                  {length} / {info.limit}
                </span>
                {!confirming && (
                  <button className={primary} disabled={!canPublish} onClick={() => setConfirming(true)}>
                    Publish
                  </button>
                )}
              </div>
              {!info.connected && (
                <p className="text-xs text-zinc-500">Connect {info.label} to enable publishing.</p>
              )}

              {confirming && info.connected && (
                <div
                  role="alertdialog"
                  aria-label="Confirm publish"
                  className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30"
                >
                  <p>
                    Publish this exact text to <strong>{info.label}</strong> ({info.account}) now? This is public.
                  </p>
                  <blockquote className="whitespace-pre-wrap border-l-2 border-amber-400 pl-3">{draft.text}</blockquote>
                  <div className="flex gap-2">
                    <button className={primary} onClick={publish} disabled={busy !== null}>
                      {busy === "publish" ? "Publishing…" : "Yes, publish"}
                    </button>
                    <button className={secondary} onClick={() => setConfirming(false)} disabled={busy === "publish"}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <div aria-live="polite" className="space-y-2">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
              {success.message}{" "}
              {success.url && (
                <a className="underline" href={success.url} target="_blank" rel="noopener noreferrer">
                  View post
                </a>
              )}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
