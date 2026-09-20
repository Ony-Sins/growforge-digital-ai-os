"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Brain,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flame,
  ImagePlus,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Shield,
  Sparkles,
  Target,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import type { ProfileLocation, SocialPlatform, UserMemory, UserProfileIdentity } from "@/lib/userMemory";
import { GMAIL_ICON } from "@/lib/socialIcons";
import { BrandIconTile, GlyphIconTile, SocialIconTile } from "@/components/workspace/SocialIconTile";

// Leaflet touches `window` at import time — only ever load it in the
// browser, never during SSR.
const LocationMapPicker = dynamic(
  () => import("@/components/workspace/LocationMapPicker").then((m) => m.LocationMapPicker),
  { ssr: false },
);

// A plain value copy of userMemory.ts's SOCIAL_PLATFORMS — deliberately not
// imported from there: that module also exports real fs/path-backed server
// code (it's the file-based memory store), and importing even one runtime
// value from it into this "use client" component drags the whole server
// module into the browser bundle. Turbopack panics on the node:fs import
// that comes along for the ride. Types are safe (erased at compile time);
// only the array itself needs to stay duplicated here.
const SOCIAL_PLATFORMS: SocialPlatform[] = [
  "linkedin",
  "instagram",
  "facebook",
  "x",
  "tiktok",
  "youtube",
  "threads",
  "telegram",
  "whatsapp",
  "whatsappBusiness",
];

const DESIGNATION_OPTIONS = [
  "Founder & CEO",
  "Co-Founder",
  "Chief Operating Officer",
  "Chief Marketing Officer",
  "Head of Growth",
  "Marketing Director",
  "Freelance Consultant",
  "Agency Owner",
];

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  whatsappBusiness: "WhatsApp Business",
};

function emptyIdentity(): UserProfileIdentity {
  return { fullName: "", designation: "", companyName: "", about: "", socials: {} };
}

interface ProfileDashboardProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: "owner" | "employee";
  } | null;
}

const STYLE_PRESETS = [
  {
    name: "Executive & Data-Driven",
    text: "High-conviction, data-driven, executive tone. Concrete numbers, clear timelines, zero fluff, and no generic marketing buzzwords.",
  },
  {
    name: "Growth & High-Velocity",
    text: "Energetic, direct, ROI-focused. Prioritize rapid customer acquisition, aggressive testing milestones, and modern growth marketing tactics.",
  },
  {
    name: "Technical & Rigorous",
    text: "Analytical, granular, and architectural. Focus on technical feasibility, exact metrics, platform trade-offs, and compliance.",
  },
];

export function ProfileDashboard({ user }: ProfileDashboardProps) {
  const { setAvatarUrl } = useAppState();
  const [memory, setMemory] = useState<UserMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [identity, setIdentity] = useState<UserProfileIdentity>(emptyIdentity());
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showStatsPopover, setShowStatsPopover] = useState(false);
  const [showAddSocialPopover, setShowAddSocialPopover] = useState(false);
  // Locked (read-only) once real data exists — an always-editable form for
  // already-saved values read as permanently "mid-edit". Starts true (edit
  // mode) only because there's nothing saved yet to lock; loadMemory below
  // flips it once real data comes back.
  const [isEditingIdentity, setIsEditingIdentity] = useState(true);
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialPlatform | "">("");
  const [newSocialUrl, setNewSocialUrl] = useState("");
  const [writingStyle, setWritingStyle] = useState("");
  const [newRule, setNewRule] = useState("");
  const [newRejection, setNewRejection] = useState("");
  const [newObservation, setNewObservation] = useState("");
  const [newPrefKey, setNewPrefKey] = useState("");
  const [newPrefVal, setNewPrefVal] = useState("");

  async function loadMemory() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/memory");
      if (!res.ok) {
        throw new Error("Failed to load user memory profile.");
      }
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        setWritingStyle(data.memory.writingStyle || "");
        const profile: UserProfileIdentity = data.memory.profile || emptyIdentity();
        setIdentity(profile);
        setIsEditingIdentity(!(profile.fullName || profile.designation || profile.companyName || profile.about));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load memory.");
    } finally {
      setLoading(false);
    }
  }

  async function saveIdentity() {
    setIdentitySaving(true);
    setIdentitySaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: identity }),
      });
      if (!res.ok) throw new Error("Failed to save profile.");
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        setIdentity(data.memory.profile || emptyIdentity());
        setIdentitySaved(true);
        setIsEditingIdentity(false);
        setTimeout(() => setIdentitySaved(false), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setIdentitySaving(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    loadMemory();
  }, []);

  async function handleAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setAvatarUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload profile picture.");
      setIdentity((prev) => ({ ...prev, avatarUrl: data.avatarUrl }));
      setMemory(data.memory);
      setAvatarUrl(data.avatarUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload profile picture.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove profile picture.");
      const data = await res.json();
      setIdentity((prev) => ({ ...prev, avatarUrl: undefined }));
      setMemory(data.memory);
      setAvatarUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove profile picture.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleCoverSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setCoverUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/cover", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload cover photo.");
      setIdentity((prev) => ({ ...prev, coverPhotoUrl: data.coverPhotoUrl }));
      setMemory(data.memory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload cover photo.");
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleCoverRemove() {
    setCoverUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/cover", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove cover photo.");
      const data = await res.json();
      setIdentity((prev) => ({ ...prev, coverPhotoUrl: undefined }));
      setMemory(data.memory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove cover photo.");
    } finally {
      setCoverUploading(false);
    }
  }

  function handleLocationConfirm(location: ProfileLocation) {
    setIdentity((prev) => ({ ...prev, location }));
    setShowLocationPicker(false);
  }

  function handleAddSocial(e: React.FormEvent) {
    e.preventDefault();
    if (!newSocialPlatform || !newSocialUrl.trim()) return;
    setIdentity((prev) => ({ ...prev, socials: { ...prev.socials, [newSocialPlatform]: newSocialUrl.trim() } }));
    setNewSocialPlatform("");
    setNewSocialUrl("");
  }

  function handleRemoveSocial(platform: SocialPlatform) {
    setIdentity((prev) => {
      const next = { ...prev.socials };
      delete next[platform];
      return { ...prev, socials: next };
    });
  }

  async function saveMemoryPatch(patch: Partial<UserMemory>) {
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const res = await fetch("/api/profile/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save memory changes.");
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        setWritingStyle(data.memory.writingStyle || "");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRule.trim() || !memory) return;
    const nextRules = [...memory.brandRules, newRule.trim()];
    setNewRule("");
    saveMemoryPatch({ brandRules: nextRules });
  }

  function handleDeleteRule(index: number) {
    if (!memory) return;
    const nextRules = memory.brandRules.filter((_, i) => i !== index);
    saveMemoryPatch({ brandRules: nextRules });
  }

  function handleAddRejection(e: React.FormEvent) {
    e.preventDefault();
    if (!newRejection.trim() || !memory) return;
    const nextRejections = [...memory.explicitRejections, newRejection.trim()];
    setNewRejection("");
    saveMemoryPatch({ explicitRejections: nextRejections });
  }

  function handleDeleteRejection(index: number) {
    if (!memory) return;
    const next = memory.explicitRejections.filter((_, i) => i !== index);
    saveMemoryPatch({ explicitRejections: next });
  }

  function handleAddObservation(e: React.FormEvent) {
    e.preventDefault();
    if (!newObservation.trim() || !memory) return;
    const next = [newObservation.trim(), ...memory.learnedObservations];
    setNewObservation("");
    saveMemoryPatch({ learnedObservations: next });
  }

  function handleDeleteObservation(index: number) {
    if (!memory) return;
    const next = memory.learnedObservations.filter((_, i) => i !== index);
    saveMemoryPatch({ learnedObservations: next });
  }

  function handleAddPref(e: React.FormEvent) {
    e.preventDefault();
    if (!newPrefKey.trim() || !newPrefVal.trim() || !memory) return;
    const nextPrefs = {
      ...memory.preferences,
      [newPrefKey.trim().toLowerCase()]: newPrefVal.trim(),
    };
    setNewPrefKey("");
    setNewPrefVal("");
    saveMemoryPatch({ preferences: nextPrefs });
  }

  function handleDeletePref(key: string) {
    if (!memory) return;
    const nextPrefs = { ...memory.preferences };
    delete nextPrefs[key];
    saveMemoryPatch({ preferences: nextPrefs });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-electric" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Overview Card — Facebook-style obsidian header */}
      <div className="rounded-2xl border border-[#333333] bg-[#0B1220] shadow-xl">
        <div className="group relative h-40 w-full bg-gradient-to-br from-[#0078FF]/20 to-[#FFC432]/15 sm:h-52">
          <div className="absolute inset-0 overflow-hidden rounded-t-2xl">
            {identity.coverPhotoUrl && (
              <Image src={identity.coverPhotoUrl} alt="Cover photo" fill className="object-cover" sizes="100vw" priority />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1220]/70 via-transparent to-transparent" />

            <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#0B1220]/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-[#111c34] disabled:cursor-not-allowed disabled:opacity-60 font-inter"
              >
                {coverUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 text-electric" />}
                <span>{identity.coverPhotoUrl ? "Change cover" : "Add cover photo"}</span>
              </button>
              {identity.coverPhotoUrl && (
                <button
                  type="button"
                  onClick={handleCoverRemove}
                  disabled={coverUploading}
                  className="rounded-xl border border-[#333333] bg-[#0B1220]/80 p-1.5 text-white backdrop-blur-md transition-colors hover:bg-crimson/80 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Remove cover photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleCoverSelected}
              className="sr-only"
            />
          </div>

          {/* Avatar — circular, bottom-center */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 sm:-bottom-12">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              title="Upload profile picture"
              className="group/avatar relative block h-24 w-24 shrink-0 rounded-full shadow-2xl ring-4 ring-[#0B1220] disabled:cursor-not-allowed sm:h-28 sm:w-28"
            >
              {identity.avatarUrl ? (
                <Image
                  src={identity.avatarUrl}
                  alt={identity.fullName || user?.email || "Operator"}
                  width={112}
                  height={112}
                  className="h-24 w-24 rounded-full object-cover sm:h-28 sm:w-28"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#0078FF] to-[#FFC432] text-2xl font-bold text-white sm:h-28 sm:w-28">
                  {user?.email?.slice(0, 2).toUpperCase() || "GF"}
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/avatar:opacity-100">
                {avatarUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </span>
            </button>
            {identity.avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                disabled={avatarUploading}
                aria-label="Remove profile picture"
                className="absolute -right-1 top-0 rounded-full bg-[#111c34] p-1 text-crimson shadow-md ring-1 ring-[#333333] transition-colors hover:bg-crimson/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarSelected}
              className="sr-only"
            />
          </div>
        </div>

        <div className="px-6 pb-6 pt-14 text-center sm:pt-16">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="font-heading text-lg font-bold text-white">
              {identity.fullName || user?.name || user?.email || "Operator Profile"}
            </h1>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
            {user?.email && (
              <a href={`mailto:${user.email}`} title={user.email}>
                <BrandIconTile icon={GMAIL_ICON} size={36} />
              </a>
            )}
            {identity.phone && (
              <a href={`tel:${identity.phone}`} title={identity.phone}>
                <GlyphIconTile icon={Phone} hex="0078FF" title={identity.phone} size={36} />
              </a>
            )}
            {SOCIAL_PLATFORMS.filter((p) => identity.socials[p]).map((platform) => (
              <a
                key={platform}
                href={identity.socials[platform]}
                target="_blank"
                rel="noreferrer"
                title={SOCIAL_LABELS[platform]}
              >
                <SocialIconTile platform={platform} size={36} />
              </a>
            ))}

            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setShowAddSocialPopover((v) => !v)}
                aria-label="Add or manage social links"
                title="Add or manage social links"
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-[#333333] text-[#CCCCCC] transition-colors hover:border-electric hover:text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
              {showAddSocialPopover && (
                <>
                  <button
                    type="button"
                    aria-label="Close social links manager"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setShowAddSocialPopover(false)}
                  />
                  <div className="absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-2xl border border-[#333333] bg-[#0B1220] p-4 text-left shadow-2xl text-white">
                    {Object.keys(identity.socials).length > 0 && (
                      <ul className="mb-3 space-y-1.5">
                        {SOCIAL_PLATFORMS.filter((p) => identity.socials[p]).map((platform) => (
                          <li key={platform} className="flex items-center gap-2 rounded-xl bg-[#111c34] border border-[#333333] px-2.5 py-1.5">
                            <SocialIconTile platform={platform} size={24} />
                            <span className="min-w-0 flex-1 truncate text-xs text-white font-inter">{SOCIAL_LABELS[platform]}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSocial(platform)}
                              aria-label={`Remove ${SOCIAL_LABELS[platform]}`}
                              className="shrink-0 rounded-md p-1 text-[#CCCCCC] hover:bg-crimson/20 hover:text-crimson transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {SOCIAL_PLATFORMS.some((p) => !identity.socials[p]) && (
                      <form onSubmit={handleAddSocial} className="space-y-2.5">
                        <select
                          value={newSocialPlatform}
                          onChange={(e) => setNewSocialPlatform(e.target.value as SocialPlatform | "")}
                          className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-2 text-xs text-white outline-none focus:border-electric"
                        >
                          <option value="" className="bg-[#0B1220] text-[#CCCCCC]">Choose a platform…</option>
                          {SOCIAL_PLATFORMS.filter((p) => !identity.socials[p]).map((p) => (
                            <option key={p} value={p} className="bg-[#0B1220] text-white">
                              {SOCIAL_LABELS[p]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="url"
                          value={newSocialUrl}
                          onChange={(e) => setNewSocialUrl(e.target.value)}
                          placeholder="Paste profile URL"
                          className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric"
                        />
                        <button
                          type="submit"
                          disabled={!newSocialPlatform || !newSocialUrl.trim()}
                          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-4 py-2 text-xs font-bold font-inter text-white shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Plus className="h-3.5 w-3.5" /> <span>Add Link →</span>
                        </button>
                      </form>
                    )}
                    <p className="mt-2 text-[10px] text-[#CCCCCC] font-inter">Changes save with the Personal Details Save button below.</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              className="flex items-center gap-1.5 text-xs text-[#CCCCCC] transition-colors hover:text-electric font-inter"
            >
              <MapPin className="h-3.5 w-3.5 text-electric" />
              <span>{identity.location?.label || "Add location"}</span>
            </button>
          </div>

          {identity.about && (
            <p className="mx-auto mt-3 max-w-md text-sm text-[#CCCCCC] font-inter leading-relaxed">{identity.about}</p>
          )}

          {/* Shadow Memory stat counts */}
          <div className="relative mt-4 inline-block">
            <button
              type="button"
              onClick={() => setShowStatsPopover((v) => !v)}
              className="flex items-center gap-1 text-xs text-[#CCCCCC] transition-colors hover:text-white font-inter"
            >
              <span>View memory stats</span>
              <ChevronRight className={`h-3 w-3 transition-transform ${showStatsPopover ? "rotate-90" : ""}`} />
            </button>
            {showStatsPopover && (
              <>
                <button
                  type="button"
                  aria-label="Close memory stats"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setShowStatsPopover(false)}
                />
                <div className="absolute left-1/2 top-full z-50 mt-2 grid w-72 -translate-x-1/2 grid-cols-2 gap-2.5 rounded-2xl border border-[#333333] bg-[#0B1220] p-4 text-left shadow-2xl text-white">
                  <div className="col-span-2 flex items-center gap-2 border-b border-[#333333] pb-2.5">
                    <span className="rounded-full bg-electric/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-electric border border-electric/30">
                      {user?.role || "Owner"}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-emerald/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald border border-emerald/30">
                      <CheckCircle2 className="h-3 w-3" /> Memory Active
                    </span>
                  </div>
                  <div className="rounded-xl bg-[#111c34] border border-[#333333] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#CCCCCC] font-inter">Brand Rules</p>
                    <p className="mt-1 font-heading text-xl font-bold text-white">{memory?.brandRules.length || 0}</p>
                  </div>
                  <div className="rounded-xl bg-[#111c34] border border-[#333333] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#CCCCCC] font-inter">Strategic Prefs</p>
                    <p className="mt-1 font-heading text-xl font-bold text-white">
                      {Object.keys(memory?.preferences || {}).length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#111c34] border border-[#333333] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#CCCCCC] font-inter">Learned Nuances</p>
                    <p className="mt-1 font-heading text-xl font-bold text-electric">
                      {memory?.learnedObservations.length || 0}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#111c34] border border-[#333333] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[#CCCCCC] font-inter">Hard Rejections</p>
                    <p className="mt-1 font-heading text-xl font-bold text-crimson">
                      {memory?.explicitRejections.length || 0}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {saveSuccess && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald/15 border border-emerald/30 px-3 py-2 text-xs font-medium text-emerald font-inter">
              <CheckCircle2 className="h-4 w-4" />
              <span>Memory profile saved. Active in all future pipeline executions!</span>
            </div>
          )}
          {error && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-crimson/15 border border-crimson/30 px-3 py-2 text-xs font-medium text-crimson font-inter">
              <XCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {showLocationPicker && (
        <LocationMapPicker
          initial={identity.location}
          onConfirm={handleLocationConfirm}
          onClose={() => setShowLocationPicker(false)}
        />
      )}

      {/* Personal Details Card */}
      <div className="bg-[#0B1220] shadow-xl border border-[#333333] rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-electric" />
            <h2 className="font-heading text-sm font-semibold text-white">Personal Details</h2>
          </div>
          {isEditingIdentity ? (
            <button
              type="button"
              onClick={saveIdentity}
              disabled={identitySaving}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2 text-xs font-bold text-white shadow-lg shadow-[#0078FF]/20 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 transition-all font-inter"
            >
              {identitySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : identitySaved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              <span>{identitySaved ? "Saved!" : identitySaving ? "Saving…" : "Save Details →"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingIdentity(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#111c34] px-4 py-2 text-xs font-medium text-[#CCCCCC] transition-colors hover:border-electric hover:text-white font-inter"
            >
              <Pencil className="h-3.5 w-3.5 text-electric" />
              <span>Edit Details</span>
            </button>
          )}
        </div>

        {isEditingIdentity ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">Full Name</label>
              <input
                type="text"
                value={identity.fullName}
                onChange={(e) => setIdentity((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="e.g. Arif Md. Anjum Ony"
                className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 font-inter"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">Designation</label>
              <input
                type="text"
                list="designation-options"
                value={identity.designation}
                onChange={(e) => setIdentity((prev) => ({ ...prev, designation: e.target.value }))}
                placeholder="e.g. Founder & CEO"
                className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 font-inter"
              />
              <datalist id="designation-options">
                {DESIGNATION_OPTIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">Company Name</label>
              <input
                type="text"
                value={identity.companyName}
                onChange={(e) => setIdentity((prev) => ({ ...prev, companyName: e.target.value }))}
                placeholder="e.g. GrowForge Digital"
                className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 font-inter"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">Phone Number</label>
              <input
                type="tel"
                value={identity.phone ?? ""}
                onChange={(e) => setIdentity((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="e.g. +880 1XXX-XXXXXX"
                className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">About &amp; Bio</label>
              <textarea
                value={identity.about}
                onChange={(e) => setIdentity((prev) => ({ ...prev, about: e.target.value }))}
                placeholder="A short bio — what you do, who you serve, what makes your approach different."
                rows={3}
                className="w-full resize-none rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 font-inter leading-relaxed"
              />
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[#333333] bg-[#111c34] p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">Designation</p>
              <p className="mt-1 text-xs font-semibold text-white font-inter">{identity.designation || "—"}</p>
            </div>
            <div className="rounded-xl border border-[#333333] bg-[#111c34] p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">Company Name</p>
              <p className="mt-1 text-xs font-semibold text-white font-inter">{identity.companyName || "—"}</p>
            </div>
            <div className="rounded-xl border border-[#333333] bg-[#111c34] p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">Phone Number</p>
              <p className="mt-1 text-xs font-semibold text-white font-mono">{identity.phone || "—"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Writing Style & Tone Card */}
        <div className="bg-[#0B1220] shadow-xl border border-[#333333] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-electric" />
              <h2 className="font-heading text-sm font-semibold text-white">Writing Style &amp; Tone</h2>
            </div>
            <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
              Dictates how the HQ Orchestrator and department agents phrase recommendations, deliverables, and briefs.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setWritingStyle(preset.text)}
                  className="rounded-lg border border-[#333333] bg-[#111c34] px-2.5 py-1 text-[11px] font-medium text-[#CCCCCC] transition-colors hover:border-electric hover:text-white font-inter"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <textarea
              value={writingStyle}
              onChange={(e) => setWritingStyle(e.target.value)}
              rows={4}
              className="mt-3.5 w-full rounded-xl border border-[#333333] bg-[#111c34] p-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 font-inter leading-relaxed"
              placeholder="Define writing tone, formatting rules, and stylistic nuances..."
            />
          </div>

          <button
            type="button"
            onClick={() => saveMemoryPatch({ writingStyle })}
            disabled={saving || writingStyle === memory?.writingStyle}
            className="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2.5 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all font-inter self-start"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Style Profile →</span>
          </button>
        </div>

        {/* Brand Rules Card */}
        <div className="bg-[#0B1220] shadow-xl border border-[#333333] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5 text-gold" />
              <h2 className="font-heading text-sm font-semibold text-white">Core Brand Tenets &amp; Rules</h2>
            </div>
            <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
              Mandatory guidelines that must be applied across every client proposal and strategy document.
            </p>

            <ul className="mt-3.5 max-h-56 space-y-2 overflow-y-auto pr-1">
              {memory?.brandRules.map((rule, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-2 rounded-xl border border-[#333333] bg-[#111c34] p-3 text-xs text-white font-inter"
                >
                  <span className="flex-1 leading-relaxed">• {rule}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(idx)}
                    className="rounded p-1 text-[#CCCCCC] hover:bg-crimson/20 hover:text-crimson transition-colors"
                    title="Remove rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={handleAddRule} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Add new brand tenet (e.g. Always include 90-day ROI projections)..."
              className="flex-1 rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
            />
            <button
              type="submit"
              disabled={!newRule.trim() || saving}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50 transition-all font-inter"
            >
              <Plus className="h-3.5 w-3.5" /> <span>Add →</span>
            </button>
          </form>
        </div>

        {/* Learned Observations (Shadow Memory) */}
        <div className="bg-[#0B1220] shadow-xl border border-[#333333] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Brain className="h-5 w-5 text-electric" />
              <h2 className="font-heading text-sm font-semibold text-white">
                Learned Nuances (Shadow Memory)
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
              Patterns, operator habits, and revision nuances learned over time from your project feedback.
            </p>

            <ul className="mt-3.5 max-h-56 space-y-2 overflow-y-auto pr-1">
              {memory?.learnedObservations.map((obs, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-2 rounded-xl border border-[#333333] bg-[#111c34] p-3 text-xs text-white font-inter"
                >
                  <span className="flex-1 leading-relaxed">
                    <span className="font-semibold text-electric">⚡ </span>
                    {obs}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteObservation(idx)}
                    className="rounded p-1 text-[#CCCCCC] hover:bg-crimson/20 hover:text-crimson transition-colors"
                    title="Remove observation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={handleAddObservation} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newObservation}
              onChange={(e) => setNewObservation(e.target.value)}
              placeholder="Record observation (e.g. Prefers Meta Ads over LinkedIn for local pitches)..."
              className="flex-1 rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
            />
            <button
              type="submit"
              disabled={!newObservation.trim() || saving}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50 transition-all font-inter"
            >
              <Plus className="h-3.5 w-3.5" /> <span>Add →</span>
            </button>
          </form>
        </div>

        {/* Explicit Rejections Card */}
        <div className="bg-[#0B1220] shadow-xl border border-[#333333] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Flame className="h-5 w-5 text-crimson" />
              <h2 className="font-heading text-sm font-semibold text-white">Explicit Constraints &amp; Rejections</h2>
            </div>
            <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
              Hard constraints and forbidden suggestions that agents must NEVER include in project plans.
            </p>

            <ul className="mt-3.5 max-h-56 space-y-2 overflow-y-auto pr-1">
              {memory?.explicitRejections.map((rej, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-2 rounded-xl border border-crimson/30 bg-crimson/10 p-3 text-xs text-white font-inter"
                >
                  <span className="flex-1 leading-relaxed text-crimson font-medium">⛔ {rej}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteRejection(idx)}
                    className="rounded p-1 text-[#CCCCCC] hover:bg-crimson/20 hover:text-crimson transition-colors"
                    title="Remove rejection"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={handleAddRejection} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newRejection}
              onChange={(e) => setNewRejection(e.target.value)}
              placeholder="Add forbidden rule (e.g. Never propose WordPress for enterprise builds)..."
              className="flex-1 rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-crimson font-inter"
            />
            <button
              type="submit"
              disabled={!newRejection.trim() || saving}
              className="flex items-center gap-1.5 rounded-full bg-crimson px-4 py-2 text-xs font-bold text-white hover:bg-crimson/90 disabled:opacity-50 transition-all font-inter"
            >
              <Plus className="h-3.5 w-3.5" /> <span>Add →</span>
            </button>
          </form>
        </div>
      </div>

      {/* Strategic Preferences Card */}
      <div className="bg-[#0B1220] shadow-xl border border-[#333333] rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <Target className="h-5 w-5 text-electric" />
          <h2 className="font-heading text-sm font-semibold text-white">Strategic Operator Preferences</h2>
        </div>
        <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
          Default baseline parameters injected into research questions and financial models.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(memory?.preferences || {}).map(([key, val]) => (
            <div key={key} className="flex flex-col justify-between rounded-xl border border-[#333333] bg-[#111c34] p-3.5">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#CCCCCC] font-inter">
                  {key.replace(/_/g, " ")}
                </span>
                <p className="mt-1 text-xs font-medium text-white font-inter">{val}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDeletePref(key)}
                className="mt-2 self-end text-[11px] text-[#CCCCCC] hover:text-crimson transition-colors font-inter"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddPref} className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_2fr_auto]">
          <input
            type="text"
            value={newPrefKey}
            onChange={(e) => setNewPrefKey(e.target.value)}
            placeholder="Key (e.g. ad_platform)"
            className="rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
          />
          <input
            type="text"
            value={newPrefVal}
            onChange={(e) => setNewPrefVal(e.target.value)}
            placeholder="Value (e.g. Meta Ads & Google Ads combined)"
            className="rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
          />
          <button
            type="submit"
            disabled={!newPrefKey.trim() || !newPrefVal.trim() || saving}
            className="flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2 text-xs font-bold text-white hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all font-inter"
          >
            <Plus className="h-3.5 w-3.5" /> <span>Add Preference →</span>
          </button>
        </form>
      </div>
    </div>
  );
}
