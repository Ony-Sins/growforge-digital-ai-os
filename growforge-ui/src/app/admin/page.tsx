import { redirect } from "next/navigation";

/** Admin Console used to be its own page here, with its own separate
 *  AppStateProvider — the same architectural mistake /profile had: sidebar
 *  nav clicks here updated local state nothing on this page was listening
 *  to, so it looked clicked but nothing happened. Its content is now fully
 *  covered on the main dashboard: Terminal/Execution Logs/Diagnostics live
 *  in the Admin Drawer overlay (open it from the header's "Admin Drawer"
 *  button, or via the sidebar's Terminal/Execution Logs items), and AI
 *  Providers & Connectors live inline on the dashboard itself. This route
 *  stays only so old bookmarks/links still land somewhere real. */
export default function AdminPage() {
  redirect("/workspace");
}
