import type { MissionWorktree } from "./missionWorktree";
import { workbenchContentOf, type Block } from "./missionWorkbenchContent";
import { workbenchCapabilities, type WorkbenchSectionId } from "./missionWorkbench";

/**
 * W6.1: when the third inspection depth (Focus, the full-reading depth) is worth offering. Pure; no fetch, no layout, no viewport.
 *
 * Focus exists to READ long recorded content, so it is offered only for a Workbench section that really holds some. It is never an empty destination:
 *   - the entity must support inspection and the section must be one of its visible sections;
 *   - a section whose capability is "recorded-empty" or "unavailable" has nothing to read;
 *   - the section must have W5.3 content (a profile without content keeps its placeholder, so no Focus);
 *   - and its content must carry enough reading matter: recorded long-form text (output, brief, findings, review sections, questions, record bodies) of at least
 *     FOCUS_MIN_CHARS characters (about a screen and a half of the Workbench reading column), or a source list of at least FOCUS_MIN_SOURCES rows.
 * Facts, relationship rows, usage rows, step rows, notes and empty / unavailable markers are navigation or measurement, not reading: they never count.
 */
export const FOCUS_MIN_CHARS = 1500;
export const FOCUS_MIN_SOURCES = 12;

export interface FocusAvailability { available: boolean; /** Reading characters found in the section (0 when it has no content). */ chars: number; /** Source rows found. */ sources: number; reason: string }

/** Reading matter of a block tree: recorded text characters and source-list length. */
export function readingMeasure(blocks: Block[]): { chars: number; sources: number } {
  let chars = 0, sources = 0;
  const walk = (list: Block[]) => list.forEach(b => {
    switch (b.kind) {
      case "text": chars += b.text.length; break;
      case "record": chars += b.body?.length ?? 0; break;
      case "findings": b.rows.forEach(r => { chars += r.heading.length + r.text.length; }); break;
      case "review": b.rows.forEach(r => { chars += r.heading.length + r.text.length; }); break;
      case "inquiry": b.rows.forEach(r => { chars += r.text.length; }); break;
      case "sources": sources += b.rows.length; break;
      case "group": walk(b.blocks); break;
      default: break; // facts, relations, usage, steps, empty, unavailable, note: not reading matter
    }
  });
  walk(blocks);
  return { chars, sources };
}

export function focusAvailability(worktree: MissionWorktree, entityId: string | null, section: WorkbenchSectionId): FocusAvailability {
  const none = (reason: string, chars = 0, sources = 0): FocusAvailability => ({ available: false, chars, sources, reason });
  const caps = workbenchCapabilities(worktree, entityId);
  if (!entityId || !caps) return none("This entity cannot be inspected.");
  const cap = caps.sections.find(s => s.id === section);
  if (!cap) return none("Not a section of this entity.");
  if (cap.state === "recorded-empty" || cap.state === "unavailable") return none("Nothing is recorded in this section to read.");
  const content = workbenchContentOf(worktree, entityId, section);
  if (!content) return none("This section has no reading content yet.");
  const { chars, sources } = readingMeasure(content.blocks);
  if (chars >= FOCUS_MIN_CHARS || sources >= FOCUS_MIN_SOURCES) return { available: true, chars, sources, reason: "Long recorded content that benefits from full reading." };
  return none("Short enough to read in the Workbench.", chars, sources);
}

/** The sections of an entity that would open in Focus, in the Workbench's own order. */
export function focusableSections(worktree: MissionWorktree, entityId: string | null): WorkbenchSectionId[] {
  const caps = workbenchCapabilities(worktree, entityId);
  return caps ? caps.sections.map(s => s.id).filter(id => focusAvailability(worktree, entityId, id).available) : [];
}
