import { redirect } from "next/navigation";

/** This page was never actually reachable — nothing in the app linked to
 *  it, and it had no Sidebar/Header chrome of its own, so a direct visit
 *  was a dead end no matter what. It duplicated most of IntegrationsHub.tsx
 *  (the real, nav-reachable Settings section on the main dashboard), except
 *  for one genuinely unique, working piece: the n8n host/API-key config
 *  card with a live health check. That's been ported over to
 *  IntegrationsHub.tsx (2026-09-17 Settings consolidation) so it's no
 *  longer stranded behind an unlinked URL. This route stays only so an old
 *  bookmark lands somewhere real. */
export default function SettingsPage() {
  redirect("/workspace?panel=settings");
}
