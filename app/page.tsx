"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_TWEET_WEIGHT, tweetWeight } from "@/lib/tweet";

type Status =
  | { connected: false }
  | { connected: true; user: { username: string; name: string }; csrfToken: string };

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

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [topic, setTopic] = useState("");
  const [tweet, setTweet] = useState("");
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; url?: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/x/status", { cache: "no-store" });
      setStatus(res.ok ? await res.json() : { connected: false });
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the OAuth redirect result */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xError = params.get("x_error");
    if (xError) setError(X_ERRORS[xError] ?? "X connection failed.");
    else if (params.get("x") === "connected") setSuccess({ message: "X account connected." });
    if (xError || params.has("x")) window.history.replaceState(null, "", "/");
    loadStatus();
  }, [loadStatus]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const weight = tweetWeight(tweet);
  const overLimit = weight > MAX_TWEET_WEIGHT;
  const canPublish =
    status?.connected === true && tweet.trim().length > 0 && !overLimit && !generating && !publishing;

  async function post(url: string, body: unknown, csrf?: string) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed.");
    return data;
  }

  async function generate() {
    setError(null);
    setSuccess(null);
    setConfirming(false);
    setGenerating(true);
    try {
      const data = await post("/api/tweets/generate", { topic });
      setTweet(data.tweet);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    if (status?.connected !== true) return;
    setError(null);
    setSuccess(null);
    setPublishing(true);
    try {
      const data = await post("/api/tweets/publish", { text: tweet, confirm: true }, status.csrfToken);
      setSuccess({ message: "Published.", url: data.url });
      setTweet("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
      setConfirming(false);
    }
  }

  async function disconnect() {
    if (status?.connected !== true) return;
    setError(null);
    try {
      await post("/api/auth/x/logout", {}, status.csrfToken);
      setSuccess({ message: "Disconnected from X." });
    } catch (e) {
      setError((e as Error).message);
    }
    loadStatus();
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black sm:py-16">
      <main className="w-full max-w-2xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">X Autopilot</h1>
          <div className="flex items-center gap-3 text-sm">
            {status === null ? (
              <span className="text-zinc-500">Checking X connection…</span>
            ) : status.connected ? (
              <>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Connected as @{status.user.username}
                </span>
                <button className={secondary} onClick={disconnect}>
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-2 text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" />
                  Not connected
                </span>
                {/* Full navigation: this starts the OAuth redirect flow. */}
                <a className={primary} href="/api/auth/x/login">
                  Connect X
                </a>
              </>
            )}
          </div>
        </header>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
          <label htmlFor="topic" className="text-sm font-medium">
            Topic
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="topic"
              className={field}
              value={topic}
              maxLength={300}
              placeholder="What should the post be about?"
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && topic.trim() && !generating && generate()}
            />
            <button className={primary} onClick={generate} disabled={!topic.trim() || generating}>
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
          <label htmlFor="tweet" className="text-sm font-medium">
            Post
          </label>
          <textarea
            id="tweet"
            className={`${field} min-h-32 resize-y`}
            value={tweet}
            placeholder="Generated post appears here. You can edit it."
            onChange={(e) => {
              setTweet(e.target.value);
              setConfirming(false);
            }}
          />
          <div className="flex items-center justify-between text-sm">
            <span className={overLimit ? "font-medium text-red-600" : "text-zinc-500"}>
              {weight} / {MAX_TWEET_WEIGHT}
            </span>
            {!confirming && (
              <button className={primary} disabled={!canPublish} onClick={() => setConfirming(true)}>
                Publish
              </button>
            )}
          </div>
          {status?.connected === false && (
            <p className="text-xs text-zinc-500">Connect your X account to enable publishing.</p>
          )}

          {confirming && status?.connected && (
            <div role="alertdialog" aria-label="Confirm publish" className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p>
                Publish this exact text to <strong>@{status.user.username}</strong> now? This is public.
              </p>
              <blockquote className="whitespace-pre-wrap border-l-2 border-amber-400 pl-3">{tweet}</blockquote>
              <div className="flex gap-2">
                <button className={primary} onClick={publish} disabled={publishing}>
                  {publishing ? "Publishing…" : "Yes, publish"}
                </button>
                <button className={secondary} onClick={() => setConfirming(false)} disabled={publishing}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        <div aria-live="polite" className="space-y-2">
          {error && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
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
