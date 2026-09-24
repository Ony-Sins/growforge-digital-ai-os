import { redirect } from "next/navigation";

/** The spatial canvas is now the dashboard at `/`. Kept so old links land there. */
export default async function CanvasRedirect({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  const { tier } = await searchParams;
  redirect(tier ? `/?tier=${encodeURIComponent(tier)}` : "/");
}
