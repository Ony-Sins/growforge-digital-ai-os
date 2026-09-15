import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { signIn } from "@/auth";

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
