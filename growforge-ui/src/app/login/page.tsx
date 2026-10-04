import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { signIn } from "@/auth";
import { isBetaMode } from "@/lib/beta/access";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "That Google account isn't on the GrowForge team allowlist. Contact an owner to get access.",
  Configuration: "Sign-in is misconfigured — check server auth environment variables.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const params = await searchParams;
  if (isBetaMode()) return <BetaLogin error={params.error} />;
  const errorMessage = params.error ? (ERROR_MESSAGES[params.error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-metal bg-white/80 p-8 text-center shadow-lg backdrop-blur-xl">
        <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-border-metal bg-white p-2.5 shadow-sm">
          <Image src="/logo-mark.png" alt="GrowForge Digital" fill className="object-contain" sizes="64px" priority />
        </span>

        <h1 className="mt-5 font-heading text-lg font-semibold text-navy">GrowForge Digital AI OS</h1>
        <p className="mt-1 text-sm text-secondary">Internal team access only. Sign in with your GrowForge Google account.</p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: params.from || "/" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <ShieldCheck className="h-4 w-4" />
            Sign in with Google
          </button>
        </form>

        {errorMessage && (
          <p className="mt-4 rounded-lg border border-crimson/30 bg-crimson/5 px-3 py-2 text-xs text-crimson">
            {errorMessage}
          </p>
        )}

        <p className="mt-6 text-[11px] text-muted">
          Access is restricted to authorized GrowForge Digital team emails. This system, its workflow canvas, and
          agent backend are private.
        </p>
      </div>
    </div>
  );
}

/**
 * Private-beta sign-in. One action: Continue with Google. Every refusal (uninvited, frozen, deleted,
 * unverified) shows the same message, so the page never reveals which addresses are on the list.
 */
function BetaLogin({ error }: { error?: string }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#03060c] px-4 text-slate-200">
      <div className="w-full max-w-sm rounded-2xl border border-cyan-400/15 bg-[#0b1220]/90 p-8 text-center shadow-[0_0_60px_-20px_rgba(34,211,238,0.35)]">
        <span className="relative mx-auto flex h-14 w-14 items-center justify-center">
          <Image src="/logo-mark.png" alt="GrowForge AI" fill className="object-contain" sizes="56px" priority />
        </span>
        <p className="mt-5 font-mono text-[10px] tracking-[0.35em] text-cyan-300/80">PRIVATE BETA</p>
        <h1 className="mt-2 font-heading text-xl font-semibold text-white">GrowForge AI</h1>
        <p className="mt-1 text-sm text-slate-400">Invited testers only.</p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-7"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-opacity hover:opacity-90"
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
            {error === "AccessDenied"
              ? "This Google account doesn’t have beta access. If you were invited, use the same Google account the invitation was sent to."
              : "Sign-in failed. Please try again."}
          </p>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
          The beta runs on clearly labelled demo data. No real agents, integrations or spending are connected.
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
