import { redirect } from "next/navigation";

/** Projects, Vault Library, Roster, Settings, approvals — the working
 *  surfaces. The dashboard itself is the spatial canvas at `/`. */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; panel?: string; tab?: string }>;
}) {
  const { panel, tab } = await searchParams;
  const params = new URLSearchParams();
  if (panel) params.set("panel", panel);
  if (tab) params.set("tab", tab);
  if (!panel) params.set("tier", "core");
  redirect(`/?${params.toString()}`);
}
