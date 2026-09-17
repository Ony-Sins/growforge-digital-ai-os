import { redirect } from "next/navigation";

/** Memory Profile used to be its own page here, with its own separate
 *  AppStateProvider — which meant the sidebar's nav clicks silently did
 *  nothing while you were on this page (clicking "AI Brain" just updated
 *  local state nothing on this page was listening to). It's now a section
 *  inside the main dashboard (see Workspace.tsx), right next to AI Brain.
 *  This route stays only so old bookmarks/links still land somewhere real. */
export default function ProfilePage() {
  redirect("/");
}
