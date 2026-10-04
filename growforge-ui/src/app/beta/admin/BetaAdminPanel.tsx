"use client";

import { useCallback, useEffect, useState } from "react";

interface TesterRow {
  email: string;
  status: "invited" | "active" | "frozen";
  name: string | null;
  invitedAt: string;
  activatedAt: string | null;
  lastSignInAt: string | null;
  frozenAt: string | null;
  sessionVersion: number;
  conversationCount: number;
  feedbackCount: number;
}

const STATUS_STYLE: Record<TesterRow["status"], string> = {
  invited: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  frozen: "border-amber-400/30 bg-amber-400/10 text-amber-300",
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function BetaAdminPanel({ ownerEmail }: { ownerEmail: string }) {
  const [testers, setTesters] = useState<TesterRow[]>([]);
  const [backend, setBackend] = useState("");
  const [query, setQuery] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ email: string; typed: string } | null>(null);

  const load = useCallback(async (q: string) => {
    const res = await fetch(`/api/beta/admin/testers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!res.ok) {
      setNotice({ kind: "err", text: `Could not load testers (${res.status}).` });
      return;
    }
    const data = await res.json();
    setTesters(data.testers);
    setBackend(data.backend);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(query), 200);
    return () => clearTimeout(t);
  }, [query, load]);

  const act = async (action: string, email: string, confirm?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/beta/admin/testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, confirm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      const verb: Record<string, string> = {
        invite: "Invited / re-approved",
        freeze: "Frozen (all sessions ended)",
        unfreeze: "Unfrozen",
        revokeSessions: "Signed out everywhere",
        revoke: "Invitation revoked and blocked",
        delete: "Permanently deleted",
      };
      setNotice({ kind: "ok", text: `${verb[action]}: ${email}${data.removed?.length ? ` — removed ${data.removed.join(", ")}` : ""}` });
      await load(query);
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05080f] px-6 py-10 text-slate-200">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[11px] tracking-[0.3em] text-cyan-300/80">PRIVATE BETA · OWNER</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Tester access</h1>
        <p className="mt-1 text-sm text-slate-400">
          Signed in as {ownerEmail}. Invite-only: only addresses listed here can sign in. Storage: <span className="font-mono text-slate-300">{backend || "…"}</span>
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (invite.trim()) void act("invite", invite.trim()).then(() => setInvite(""));
            }}
          >
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              type="email"
              placeholder="tester@example.com"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
            />
            <button disabled={busy} className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
              Invite / approve
            </button>
          </form>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search testers"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-400/60 sm:w-64"
          />
        </div>

        {notice && (
          <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${notice.kind === "ok" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>
            {notice.text}
          </p>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Tester</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {testers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No testers yet.</td>
                </tr>
              )}
              {testers.map((t) => (
                <tr key={t.email} className="border-t border-white/5" data-tester={t.email}>
                  <td className="px-4 py-3">
                    <div className="text-slate-100">{t.email}</div>
                    <div className="text-xs text-slate-500">{t.name ?? "not signed in yet"} · invited {fmt(t.invitedAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[t.status]}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmt(t.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{t.conversationCount} msgs · {t.feedbackCount} feedback</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {t.status === "frozen" ? (
                        <Btn disabled={busy} onClick={() => act("unfreeze", t.email)}>Unfreeze</Btn>
                      ) : (
                        <Btn disabled={busy} onClick={() => act("freeze", t.email)}>Freeze</Btn>
                      )}
                      <Btn disabled={busy} onClick={() => act("revokeSessions", t.email)}>Sign out</Btn>
                      <Btn danger disabled={busy} onClick={() => setConfirmDelete({ email: t.email, typed: "" })}>
                        {t.status === "invited" ? "Revoke" : "Delete"}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-slate-400">
          <p className="font-semibold text-slate-300">What deletion covers</p>
          <p className="mt-1">
            Deleting a tester permanently removes their platform account, invalidates every session, and erases their demo conversations and feedback.
            Testers cannot upload files, so there are no uploads to remove. The address is then blocked from registering again until you re-invite it.
          </p>
          <p className="mt-2 font-semibold text-slate-300">Retained outside this panel</p>
          <p className="mt-1">
            Vercel request/runtime logs (URLs, status codes, timestamps — no chat content) are kept for the retention period of your Vercel plan.
            Your storage provider may keep backups/snapshots for its own retention window. A one-way hash of the deleted email is kept on the
            re-registration blocklist. The tester&apos;s Google account itself is never affected.
          </p>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-rose-400/30 bg-[#0b1220] p-6">
            <h2 className="text-lg font-semibold text-white">Permanently delete {confirmDelete.email}?</h2>
            <p className="mt-2 text-sm text-slate-400">
              This removes the account, all sessions, demo conversations and feedback, and blocks the address from signing up again. It cannot be undone.
              Type the email address to confirm.
            </p>
            <input
              autoFocus
              value={confirmDelete.typed}
              onChange={(e) => setConfirmDelete({ ...confirmDelete, typed: e.target.value })}
              className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-rose-400/60"
              placeholder={confirmDelete.email}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Btn onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn
                danger
                disabled={busy || confirmDelete.typed.trim().toLowerCase() !== confirmDelete.email}
                onClick={() => {
                  const { email, typed } = confirmDelete;
                  setConfirmDelete(null);
                  void act("delete", email, typed);
                }}
              >
                Delete permanently
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
        danger ? "border-rose-400/40 text-rose-300 hover:bg-rose-400/10" : "border-white/15 text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
