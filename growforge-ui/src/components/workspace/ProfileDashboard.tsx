"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  BadgeCheck,
  Brain,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Compass,
  ExternalLink,
  Flame,
  GraduationCap,
  ImagePlus,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Share2,
  Shield,
  Sparkles,
  Target,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useAppState } from "@/lib/appState";
import type { ProfileLocation, SocialPlatform, TargetMarketArea, UserMemory, UserProfileIdentity } from "@/lib/userMemory";
import { CONNECTOR_BRAND_ICONS } from "@/lib/connectorIcons";
import { GMAIL_ICON, SOCIAL_BRAND_ICONS } from "@/lib/socialIcons";
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

function renderCompanyLogo(companyName?: string, logoUrl?: string) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={companyName || "Brand Logo"}
        width={24}
        height={24}
        className="h-5 w-5 object-contain"
      />
    );
  }
  if (!companyName) {
    return <Building2 className="h-5 w-5 text-electric" />;
  }
  const clean = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const [key, icon] of Object.entries(CONNECTOR_BRAND_ICONS)) {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.includes(norm) || norm.includes(clean)) {
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
          <path d={icon.path} />
        </svg>
      );
    }
  }

  for (const [key, icon] of Object.entries(SOCIAL_BRAND_ICONS)) {
    if (!icon) continue;
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.includes(norm) || norm.includes(clean)) {
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
          <path d={icon.path} />
        </svg>
      );
    }
  }

  if (clean.includes("linkedin")) {
    return <span className="font-heading text-xs font-bold text-white">in</span>;
  }

  return <Building2 className="h-5 w-5 text-electric" />;
}

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
    text: "Energetic, direct, ROI-focused. Prioritize rapid customer acquisition, aggressive testing cadences, and measurable unit economics.",
  },
  {
    name: "Technical & Rigorous",
    text: "Analytical, granular, and architectural. Focus on technical feasibility, exact metrics, platform trade-offs, and compliance constraints.",
  },
];

export function ProfileDashboard({ user }: ProfileDashboardProps) {
  const { setAvatarUrl, setProfileName, setLogoUrl, setCompanyName, setActiveView } = useAppState();
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
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showMarketPicker, setShowMarketPicker] = useState(false);
  const [showStatsPopover, setShowStatsPopover] = useState(false);
  const [showAddSocialPopover, setShowAddSocialPopover] = useState(false);
  const [showContactPopover, setShowContactPopover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialPlatform | "">("");
  const [newSocialUrl, setNewSocialUrl] = useState("");
  const [writingStyle, setWritingStyle] = useState("");
  const [newRule, setNewRule] = useState("");
  const [newRejection, setNewRejection] = useState("");
  const [newObservation, setNewObservation] = useState("");
  const [newPrefKey, setNewPrefKey] = useState("");
  const [newPrefVal, setNewPrefVal] = useState("");

  function handleShareProfile() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

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
        if (profile.fullName) setProfileName(profile.fullName);
        if (profile.companyName) setCompanyName(profile.companyName);
        if (profile.logoUrl) setLogoUrl(profile.logoUrl);
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
        const profile: UserProfileIdentity = data.memory.profile || emptyIdentity();
        setIdentity(profile);
        setProfileName(profile.fullName || null);
        setCompanyName(profile.companyName || null);
        setLogoUrl(profile.logoUrl || null);
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
    void loadMemory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only once on mount
  }, []);

  async function handleAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
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

  async function handleLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLogoUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/logo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload brand logo.");
      setIdentity((prev) => ({ ...prev, logoUrl: data.logoUrl }));
      setMemory(data.memory);
      setLogoUrl(data.logoUrl || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload brand logo.");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleLogoRemove() {
    setLogoUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/logo", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove brand logo.");
      const data = await res.json();
      setIdentity((prev) => ({ ...prev, logoUrl: undefined }));
      setMemory(data.memory);
      setLogoUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove brand logo.");
    } finally {
      setLogoUploading(false);
    }
  }

  function handleLocationConfirm(location: ProfileLocation) {
    setIdentity((prev) => ({ ...prev, location }));
    setShowLocationPicker(false);
  }

  function handleMarketAreaConfirm(targetMarketArea: TargetMarketArea) {
    setIdentity((prev) => ({ ...prev, targetMarketArea }));
    setShowMarketPicker(false);
  }

  function handleRemoveMarketArea() {
    setIdentity((prev) => ({ ...prev, targetMarketArea: undefined }));
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
      {/* Alert Banners */}
      {saveSuccess && (
        <div className="flex items-center justify-start gap-2 rounded-xl bg-emerald/15 border border-emerald/30 px-4 py-2.5 text-xs font-medium text-emerald font-inter shadow-md">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Profile &amp; Memory updated successfully. Active in orchestrator executions!</span>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-start gap-2 rounded-xl bg-crimson/15 border border-crimson/30 px-4 py-2.5 text-xs font-medium text-crimson font-inter shadow-md">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Left-Rail Identity + Card Grid Synthesis */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* ================= LEFT RAIL: IDENTITY ================= */}
        <aside className="w-full lg:w-80 lg:shrink-0 space-y-5">
          {/* Identity Glass Card */}
          <div className="rounded-2xl border border-[#333333] bg-[#0B1220] shadow-xl overflow-hidden relative">
            {/* Optional Cover Photo / Accent Bar Header */}
            <div className="relative h-28 w-full bg-gradient-to-br from-[#0078FF]/25 to-[#FFC432]/20 border-b border-[#333333]">
              {identity.coverPhotoUrl && (
                <Image src={identity.coverPhotoUrl} alt="Cover photo" fill className="object-cover" sizes="(max-width: 768px) 100vw, 320px" priority />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1220] via-transparent to-transparent" />
              
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 z-20">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="flex items-center gap-1 rounded-lg border border-[#333333] bg-[#0B1220]/85 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-md transition-colors hover:bg-[#111c34] font-inter"
                  title={identity.coverPhotoUrl ? "Change cover photo" : "Add cover photo"}
                >
                  {coverUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3 text-electric" />}
                  <span>{identity.coverPhotoUrl ? "Cover" : "+ Cover"}</span>
                </button>
                {identity.coverPhotoUrl && (
                  <button
                    type="button"
                    onClick={handleCoverRemove}
                    disabled={coverUploading}
                    className="rounded-lg border border-[#333333] bg-[#0B1220]/85 p-1 text-white backdrop-blur-md transition-colors hover:bg-crimson/80"
                    aria-label="Remove cover photo"
                  >
                    <Trash2 className="h-3 w-3" />
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

            {/* Operator Avatar & Profile Meta */}
            <div className="px-5 pb-5 pt-0 text-center relative">
              {/* Avatar overlapping header */}
              <div className="group/avatar -mt-12 mb-3 inline-block relative">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  title="Upload profile picture"
                  className="relative block h-24 w-24 rounded-full shadow-2xl ring-4 ring-[#0B1220] transition-all hover:ring-electric"
                >
                  {identity.avatarUrl ? (
                    <Image
                      src={identity.avatarUrl}
                      alt={identity.fullName || user?.email || "Operator"}
                      width={96}
                      height={96}
                      className="h-24 w-24 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#0078FF] to-[#FFC432] text-2xl font-bold text-white font-heading">
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
                    className="absolute -right-1 top-0 rounded-full bg-[#111c34] p-1 text-crimson shadow-md ring-1 border border-[#333333] transition-opacity hover:bg-crimson/20 opacity-0 group-hover/avatar:opacity-100 focus-visible:opacity-100"
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

              {/* Name + Verified Badge */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <h1 className="font-heading text-lg font-bold text-white tracking-tight">
                  {identity.fullName || user?.name || user?.email || "Operator Profile"}
                </h1>
                <span className="inline-flex items-center text-electric" title="Verified Operator">
                  <BadgeCheck className="h-4 w-4 fill-electric/20 text-electric" />
                </span>
              </div>

              {/* Role pill */}
              <div className="mt-1">
                <span className="inline-block rounded-full bg-electric/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-electric border border-electric/30 font-inter">
                  {user?.role === "owner" ? "Root Owner" : user?.role || "Operator"}
                </span>
              </div>

              {/* Headline / Designation & Company */}
              <p className="mt-2 text-xs font-medium text-[#CCCCCC] font-inter leading-relaxed">
                {identity.designation && identity.companyName
                  ? `${identity.designation} @ ${identity.companyName}`
                  : identity.designation || identity.companyName || "Systems Architect & B2B Automation"}
              </p>

              {/* Active Terminal Status Line */}
              <div className="mt-3.5 w-full rounded-xl bg-[#111c34] border border-[#333333] p-2.5 flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald"></span>
                  </span>
                  <span className="text-emerald font-semibold uppercase tracking-wider text-[10px]">Active Terminal</span>
                </div>
                <span className="text-[10px] text-[#94a3b8] font-inter">Root Operator</span>
              </div>

              {/* Location & Contact Info Row */}
              <div className="mt-3 flex w-full flex-wrap items-center justify-center gap-2 text-xs text-[#94a3b8] font-inter border-t border-[#333333]/60 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLocationPicker(true)}
                  className="flex items-center gap-1.5 text-[#CCCCCC] transition-colors hover:text-electric"
                  title="Click to select location"
                >
                  <MapPin className="h-3.5 w-3.5 text-electric shrink-0" />
                  <span className="truncate max-w-[130px]">{identity.location?.label || "Add location"}</span>
                </button>
                <span className="text-[#333333]">•</span>
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setShowContactPopover((v) => !v)}
                    className="font-semibold text-electric transition-colors hover:underline hover:text-electric-soft"
                  >
                    Contact info
                  </button>

                  {/* Contact Info Popover */}
                  {showContactPopover && (
                    <>
                      <button
                        type="button"
                        aria-label="Close contact info"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setShowContactPopover(false)}
                      />
                      <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-2 w-72 rounded-2xl border border-[#333333] bg-[#0B1220] p-4 text-left shadow-2xl text-white">
                        <div className="flex items-center justify-between border-b border-[#333333] pb-2 mb-3">
                          <h3 className="font-heading text-xs font-semibold text-white">Contact &amp; Social Info</h3>
                          <button
                            type="button"
                            onClick={() => setShowContactPopover(false)}
                            className="rounded p-1 text-[#CCCCCC] hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="space-y-3 text-xs font-inter">
                          {user?.email && (
                            <div className="flex items-start gap-2.5">
                              <Mail className="h-4 w-4 text-electric shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Email</p>
                                <a href={`mailto:${user.email}`} className="truncate block text-white hover:text-electric transition-colors">
                                  {user.email}
                                </a>
                              </div>
                            </div>
                          )}

                          {identity.phone && (
                            <div className="flex items-start gap-2.5">
                              <Phone className="h-4 w-4 text-electric shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Phone</p>
                                <a href={`tel:${identity.phone}`} className="text-white hover:text-electric transition-colors">
                                  {identity.phone}
                                </a>
                              </div>
                            </div>
                          )}

                          {identity.location?.label && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="h-4 w-4 text-electric shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Location</p>
                                <p className="text-white">{identity.location.label}</p>
                              </div>
                            </div>
                          )}

                          {Object.keys(identity.socials).length > 0 && (
                            <div>
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Social Profiles</p>
                              <div className="space-y-1.5">
                                {SOCIAL_PLATFORMS.filter((p) => identity.socials[p]).map((platform) => (
                                  <a
                                    key={platform}
                                    href={identity.socials[platform]}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-between gap-2 rounded-xl bg-[#111c34] border border-[#333333] px-2.5 py-1.5 text-white hover:border-electric transition-colors"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <SocialIconTile platform={platform} size={20} />
                                      <span className="truncate text-xs">{SOCIAL_LABELS[platform]}</span>
                                    </div>
                                    <ExternalLink className="h-3 w-3 text-[#CCCCCC] shrink-0" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="pt-2 border-t border-[#333333]/60 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                setShowContactPopover(false);
                                setShowAddSocialPopover(true);
                              }}
                              className="text-[11px] text-electric hover:underline font-medium"
                            >
                              Manage Social Links →
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowContactPopover(false);
                                setIsEditingIdentity(true);
                              }}
                              className="text-[11px] text-[#CCCCCC] hover:text-white"
                            >
                              Edit Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons: Edit / Save, Share, Stats, Socials */}
              <div className="mt-4 flex flex-col gap-2">
                {isEditingIdentity ? (
                  <button
                    type="button"
                    onClick={saveIdentity}
                    disabled={identitySaving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0078FF] to-[#FFC432] py-2 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95 disabled:opacity-60 transition-all font-inter"
                  >
                    {identitySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : identitySaved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                    <span>{identitySaved ? "Saved!" : identitySaving ? "Saving…" : "Save Details →"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingIdentity(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#333333] bg-[#111c34] py-2 text-xs font-semibold text-white transition-colors hover:border-electric hover:bg-[#162444] font-inter"
                  >
                    <Pencil className="h-3.5 w-3.5 text-electric" />
                    <span>Edit Profile Details</span>
                  </button>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleShareProfile}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#333333] bg-[#111c34] py-1.5 text-xs font-medium text-white transition-all hover:border-electric hover:bg-[#162444] font-inter"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald" /> : <Share2 className="h-3.5 w-3.5 text-electric" />}
                    <span>{copied ? "Copied" : "Share"}</span>
                  </button>

                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => setShowStatsPopover((v) => !v)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#333333] bg-[#111c34] py-1.5 text-xs font-medium text-[#CCCCCC] transition-all hover:border-electric hover:text-white font-inter"
                    >
                      <Brain className="h-3.5 w-3.5 text-gold" />
                      <span>Stats</span>
                    </button>

                    {showStatsPopover && (
                      <>
                        <button
                          type="button"
                          aria-label="Close memory stats"
                          className="fixed inset-0 z-40 cursor-default"
                          onClick={() => setShowStatsPopover(false)}
                        />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-2 grid w-64 grid-cols-2 gap-2 rounded-2xl border border-[#333333] bg-[#0B1220] p-3.5 text-left shadow-2xl text-white">
                          <div className="col-span-2 flex items-center justify-between border-b border-[#333333] pb-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-electric">Memory Stats</span>
                            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          </div>
                          <div className="rounded-lg bg-[#111c34] border border-[#333333] p-2">
                            <p className="text-[9px] font-medium uppercase text-[#94a3b8]">Brand Rules</p>
                            <p className="mt-0.5 font-heading text-lg font-bold text-white">{memory?.brandRules.length || 0}</p>
                          </div>
                          <div className="rounded-lg bg-[#111c34] border border-[#333333] p-2">
                            <p className="text-[9px] font-medium uppercase text-[#94a3b8]">Strategic Prefs</p>
                            <p className="mt-0.5 font-heading text-lg font-bold text-white">
                              {Object.keys(memory?.preferences || {}).length}
                            </p>
                          </div>
                          <div className="rounded-lg bg-[#111c34] border border-[#333333] p-2">
                            <p className="text-[9px] font-medium uppercase text-[#94a3b8]">Nuances</p>
                            <p className="mt-0.5 font-heading text-lg font-bold text-electric">
                              {memory?.learnedObservations.length || 0}
                            </p>
                          </div>
                          <div className="rounded-lg bg-[#111c34] border border-[#333333] p-2">
                            <p className="text-[9px] font-medium uppercase text-[#94a3b8]">Rejections</p>
                            <p className="mt-0.5 font-heading text-lg font-bold text-crimson">
                              {memory?.explicitRejections.length || 0}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Social Icons Row + Add button */}
              <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-[#333333]/60 pt-3">
                {user?.email && (
                  <a href={`mailto:${user.email}`} title={user.email}>
                    <BrandIconTile icon={GMAIL_ICON} size={26} />
                  </a>
                )}
                {identity.phone && (
                  <a href={`tel:${identity.phone}`} title={identity.phone}>
                    <GlyphIconTile icon={Phone} hex="0078FF" title={identity.phone} size={26} />
                  </a>
                )}
                {SOCIAL_PLATFORMS.filter((p) => identity.socials[p]).slice(0, 3).map((platform) => (
                  <a
                    key={platform}
                    href={identity.socials[platform]}
                    target="_blank"
                    rel="noreferrer"
                    title={SOCIAL_LABELS[platform]}
                  >
                    <SocialIconTile platform={platform} size={26} />
                  </a>
                ))}
                
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setShowAddSocialPopover((v) => !v)}
                    aria-label="Add or manage social links"
                    title="Add or manage social links"
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[#333333] bg-[#111c34] text-[#CCCCCC] transition-colors hover:border-electric hover:text-white"
                  >
                    <Plus className="h-3 w-3" />
                  </button>

                  {showAddSocialPopover && (
                    <>
                      <button
                        type="button"
                        aria-label="Close social links manager"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setShowAddSocialPopover(false)}
                      />
                      <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-2 w-72 rounded-2xl border border-[#333333] bg-[#0B1220] p-4 text-left shadow-2xl text-white">
                        {Object.keys(identity.socials).length > 0 && (
                          <ul className="mb-3 space-y-1.5">
                            {SOCIAL_PLATFORMS.filter((p) => identity.socials[p]).map((platform) => (
                              <li key={platform} className="flex items-center gap-2 rounded-xl bg-[#111c34] border border-[#333333] px-2.5 py-1.5">
                                <SocialIconTile platform={platform} size={20} />
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
                              className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-1.5 text-xs text-white outline-none focus:border-electric"
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
                              className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric"
                            />
                            <button
                              type="submit"
                              disabled={!newSocialPlatform || !newSocialUrl.trim()}
                              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-4 py-1.5 text-xs font-bold font-inter text-white shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Plus className="h-3 w-3" /> <span>Add Link</span>
                            </button>
                          </form>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Editable form fields when in edit mode */}
              {isEditingIdentity && (
                <div className="mt-4 pt-3 border-t border-[#333333] text-left space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">Full Name</label>
                    <input
                      type="text"
                      value={identity.fullName}
                      onChange={(e) => setIdentity((prev) => ({ ...prev, fullName: e.target.value }))}
                      placeholder="e.g. Arif Md. Anjum Ony"
                      className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">Designation</label>
                    <input
                      type="text"
                      list="designation-options"
                      value={identity.designation}
                      onChange={(e) => setIdentity((prev) => ({ ...prev, designation: e.target.value }))}
                      placeholder="e.g. Founder & CEO"
                      className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
                    />
                    <datalist id="designation-options">
                      {DESIGNATION_OPTIONS.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">Company Name</label>
                    <input
                      type="text"
                      value={identity.companyName}
                      onChange={(e) => setIdentity((prev) => ({ ...prev, companyName: e.target.value }))}
                      placeholder="e.g. GrowForge Digital"
                      className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">Brand Logo</label>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#333333] bg-[#111c34] text-white overflow-hidden">
                        {renderCompanyLogo(identity.companyName, identity.logoUrl)}
                      </div>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="rounded-xl border border-[#333333] bg-[#111c34] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-electric hover:text-electric"
                      >
                        {logoUploading ? "Uploading..." : identity.logoUrl ? "Change Logo" : "Upload Logo"}
                      </button>
                      {identity.logoUrl && (
                        <button
                          type="button"
                          onClick={handleLogoRemove}
                          disabled={logoUploading}
                          className="rounded-xl border border-[#333333] bg-[#111c34] p-1.5 text-slate-400 transition-colors hover:bg-crimson/20 hover:text-crimson"
                          title="Remove brand logo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">Phone Number</label>
                    <input
                      type="tel"
                      value={identity.phone ?? ""}
                      onChange={(e) => setIdentity((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="+880 1XXX-XXXXXX"
                      className="w-full rounded-xl border border-[#333333] bg-[#111c34] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-mono"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">About &amp; Bio</label>
                    <textarea
                      value={identity.about}
                      onChange={(e) => setIdentity((prev) => ({ ...prev, about: e.target.value }))}
                      placeholder="Short bio or operator focus..."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-[#333333] bg-[#111c34] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* Bio summary when not editing */}
              {!isEditingIdentity && identity.about && (
                <div className="mt-3 pt-3 border-t border-[#333333]/60 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter mb-1">About</p>
                  <p className="text-xs text-[#CCCCCC] font-inter leading-relaxed whitespace-pre-line">{identity.about}</p>
                </div>
              )}
            </div>
          </div>

          {/* Organization & Security Summary Card */}
          <div className="rounded-2xl border border-[#333333] bg-[#0B1220] p-4 shadow-xl space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter px-1">Organization &amp; Credentials</p>
            
            {/* Company Card */}
            <div className="group/logo relative flex items-center gap-3 rounded-xl border border-[#333333] bg-[#111c34]/60 p-2.5 transition-colors hover:border-[#444444]">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                title="Upload brand logo"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#333333] bg-[#0B1220] text-white shadow-sm overflow-hidden transition-all hover:border-electric"
              >
                {renderCompanyLogo(identity.companyName, identity.logoUrl)}
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity group-hover/logo:opacity-100">
                  {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                </span>
              </button>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-xs font-semibold text-white font-inter">
                  {identity.companyName || "No organization set"}
                </p>
                <p className="text-[10px] text-[#94a3b8] font-inter">Current Organization</p>
              </div>
              {!identity.logoUrl && (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="shrink-0 rounded-lg border border-[#333333] bg-[#0B1220]/80 px-2 py-1 text-[10px] font-medium text-[#94a3b8] transition-colors hover:border-electric hover:text-electric"
                >
                  {logoUploading ? "Uploading..." : "Add logo"}
                </button>
              )}
              {identity.logoUrl && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  disabled={logoUploading}
                  aria-label="Remove brand logo"
                  className="rounded-lg border border-[#333333] bg-[#0B1220]/80 p-1 text-[#94a3b8] transition-colors hover:bg-crimson/20 hover:text-crimson opacity-0 group-hover/logo:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleLogoSelected}
                className="sr-only"
              />
            </div>

            {/* Academic Background / Education placeholder */}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#333333] bg-[#111c34]/30 p-2.5 transition-colors hover:border-electric/50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#333333] bg-[#0B1220] text-[#94a3b8] shadow-sm">
                <GraduationCap className="h-4 w-4 text-[#94a3b8]" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <button
                  type="button"
                  onClick={() => setIsEditingIdentity(true)}
                  className="truncate text-xs font-medium text-electric hover:underline font-inter text-left block"
                >
                  Academic Credentials
                </button>
                <p className="text-[10px] text-[#94a3b8] font-inter">Verified Credentials</p>
              </div>
            </div>

            {/* Security Summary */}
            <div className="rounded-xl border border-[#333333] bg-[#111c34]/40 p-2.5 space-y-2 text-xs font-inter">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94a3b8] flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-electric" /> Security Level:</span>
                <span className="font-semibold text-white font-mono">{user?.role === "owner" ? "ROOT ACCESS" : "OPERATOR"}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#94a3b8] flex items-center gap-1.5"><Brain className="h-3.5 w-3.5 text-gold" /> Memory Sync:</span>
                <span className="text-emerald font-medium">Active Pipeline</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ================= MAIN AREA: RESPONSIVE CARD GRID ================= */}
        <main className="flex-1 w-full min-w-0 space-y-6">

          {/* 1. AI CONTEXT CARD (Highest Visual Weight — Point of the Page) */}
          <div className="rounded-2xl border border-[#333333] bg-[#0B1220] shadow-xl p-6 relative overflow-hidden">
            {/* Header with prominence badge */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#333333] pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-electric/40 bg-electric/15 text-electric shadow-lg shadow-electric/20">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-base font-bold text-white tracking-tight">
                      AI Context &amp; Knowledge Base
                    </h2>
                    <span className="rounded-full bg-electric/15 px-2.5 py-0.5 text-[10px] font-semibold text-electric border border-electric/30 font-inter">
                      Core Memory
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#CCCCCC] font-inter">
                    The foundational context, operating voice, brand rules, and constraints governing every agent proposal.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="rounded-md bg-[#111c34] border border-[#333333] px-2.5 py-1 text-[11px] font-mono text-emerald">
                  ● Active in Agent Orchestrator
                </span>
              </div>
            </div>

            {/* AI Context Inner Grid */}
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              
              {/* Box A: Writing Style & Tone */}
              <div className="rounded-xl border border-[#333333] bg-[#111c34]/70 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-electric" />
                    <h3 className="font-heading text-xs font-semibold text-white uppercase tracking-wider">
                      Writing Style &amp; Tone
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
                    Controls writing cadence, vocabulary, and structural formatting for all generated deliverables and briefs.
                  </p>
                  
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {STYLE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setWritingStyle(preset.text)}
                        className="rounded-lg border border-[#333333] bg-[#0B1220] px-2.5 py-1 text-[11px] font-medium text-[#CCCCCC] transition-colors hover:border-electric hover:text-white font-inter"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={writingStyle}
                    onChange={(e) => setWritingStyle(e.target.value)}
                    rows={4}
                    className="mt-3 w-full rounded-xl border border-[#333333] bg-[#0B1220] p-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter leading-relaxed"
                    placeholder="Specify tone rules, sentence length, vocabulary constraints, and preferred formatting patterns..."
                  />
                </div>

                <button
                  type="button"
                  onClick={() => saveMemoryPatch({ writingStyle })}
                  disabled={saving || writingStyle === memory?.writingStyle}
                  className="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-4 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all font-inter self-start"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span>Save Style Profile →</span>
                </button>
              </div>

              {/* Box B: Core Brand Tenets & Rules */}
              <div className="rounded-xl border border-[#333333] bg-[#111c34]/70 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gold" />
                    <h3 className="font-heading text-xs font-semibold text-white uppercase tracking-wider">
                      Core Brand Tenets &amp; Rules
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
                    Non-negotiable guidelines enforced across every pitch, proposal, and client brief.
                  </p>

                  <ul className="mt-3.5 max-h-48 space-y-2 overflow-y-auto pr-1">
                    {memory?.brandRules.map((rule, idx) => (
                      <li
                        key={idx}
                        className="flex items-start justify-between gap-2 rounded-xl border border-[#333333] bg-[#0B1220] p-2.5 text-xs text-white font-inter"
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
                    placeholder="Add brand rule (e.g. Never present projections without milestone dates)..."
                    className="flex-1 rounded-xl border border-[#333333] bg-[#0B1220] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
                  />
                  <button
                    type="submit"
                    disabled={!newRule.trim() || saving}
                    className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-3.5 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50 transition-all font-inter"
                  >
                    <Plus className="h-3.5 w-3.5" /> <span>Add</span>
                  </button>
                </form>
              </div>

              {/* Box C: Learned Nuances (Shadow Memory) */}
              <div className="rounded-xl border border-[#333333] bg-[#111c34]/70 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-electric" />
                    <h3 className="font-heading text-xs font-semibold text-white uppercase tracking-wider">
                      Learned Nuances (Shadow Memory)
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
                    Observed workflow preferences and revision patterns recorded from your previous feedback.
                  </p>

                  <ul className="mt-3.5 max-h-48 space-y-2 overflow-y-auto pr-1">
                    {memory?.learnedObservations.map((obs, idx) => (
                      <li
                        key={idx}
                        className="flex items-start justify-between gap-2 rounded-xl border border-[#333333] bg-[#0B1220] p-2.5 text-xs text-white font-inter"
                      >
                        <span className="flex-1 leading-relaxed flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-electric shrink-0" />
                          <span>{obs}</span>
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
                    placeholder="Record observation (e.g. Dislikes slide decks; prefers one-page executive briefs)..."
                    className="flex-1 rounded-xl border border-[#333333] bg-[#0B1220] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
                  />
                  <button
                    type="submit"
                    disabled={!newObservation.trim() || saving}
                    className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-3.5 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50 transition-all font-inter"
                  >
                    <Plus className="h-3.5 w-3.5" /> <span>Add</span>
                  </button>
                </form>
              </div>

              {/* Box D: Explicit Constraints & Hard Rejections */}
              <div className="rounded-xl border border-[#333333] bg-[#111c34]/70 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-crimson" />
                    <h3 className="font-heading text-xs font-semibold text-white uppercase tracking-wider">
                      Explicit Constraints &amp; Rejections
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
                    Prohibited tactics, forbidden technologies, and off-limit recommendations that agents must reject.
                  </p>

                  <ul className="mt-3.5 max-h-48 space-y-2 overflow-y-auto pr-1">
                    {memory?.explicitRejections.map((rej, idx) => (
                      <li
                        key={idx}
                        className="flex items-start justify-between gap-2 rounded-xl border border-crimson/30 bg-crimson/10 p-2.5 text-xs text-white font-inter"
                      >
                        <span className="flex-1 leading-relaxed text-crimson font-medium flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5 text-crimson shrink-0" />
                          <span>{rej}</span>
                        </span>
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
                    placeholder="Add hard rejection (e.g. Never suggest hourly billing or off-the-shelf templates)..."
                    className="flex-1 rounded-xl border border-[#333333] bg-[#0B1220] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-crimson font-inter"
                  />
                  <button
                    type="submit"
                    disabled={!newRejection.trim() || saving}
                    className="flex items-center gap-1.5 rounded-full bg-crimson px-3.5 py-2 text-xs font-bold text-white hover:bg-crimson/90 disabled:opacity-50 transition-all font-inter"
                  >
                    <Plus className="h-3.5 w-3.5" /> <span>Add</span>
                  </button>
                </form>
              </div>

            </div>

            {/* Strategic Operator Preferences (Full width inside AI Context) */}
            <div className="mt-6 pt-5 border-t border-[#333333]">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-electric" />
                <h3 className="font-heading text-xs font-semibold text-white uppercase tracking-wider">
                  Strategic Operator Preferences
                </h3>
              </div>
              <p className="mt-1 text-xs text-[#CCCCCC] font-inter">
                Default parameters and strategic assumptions injected into financial calculations and research queries.
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(memory?.preferences || {}).map(([key, val]) => (
                  <div key={key} className="flex flex-col justify-between rounded-xl border border-[#333333] bg-[#111c34] p-3">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">
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

              <form onSubmit={handleAddPref} className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_2fr_auto]">
                <input
                  type="text"
                  value={newPrefKey}
                  onChange={(e) => setNewPrefKey(e.target.value)}
                  placeholder="Key (e.g. target_cac_limit)"
                  className="rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
                />
                <input
                  type="text"
                  value={newPrefVal}
                  onChange={(e) => setNewPrefVal(e.target.value)}
                  placeholder="Value (e.g. Under $120 blended across Google and Meta)"
                  className="rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-electric font-inter"
                />
                <button
                  type="submit"
                  disabled={!newPrefKey.trim() || !newPrefVal.trim() || saving}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2 text-xs font-bold text-white hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all font-inter"
                >
                  <Plus className="h-3.5 w-3.5" /> <span>Add Preference</span>
                </button>
              </form>
            </div>
          </div>

          {/* 2. TARGET MARKET AREA CARD (Market Radar Widget) */}
          <div className="rounded-2xl border border-[#333333] bg-[#0B1220] shadow-xl p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-electric/30 bg-electric/10 text-electric">
                  <Compass className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-sm font-semibold text-white">
                      Target Market Geography &amp; Context
                    </h2>
                    <span className="rounded-full bg-electric/15 px-2 py-0.5 text-[10px] font-semibold text-electric border border-electric/30">
                      Market Radar
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#CCCCCC] font-inter">
                    Geographic target area, physical perimeter, and real OpenStreetMap spatial intelligence.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {identity.targetMarketArea ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowMarketPicker(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-[#333333] bg-[#111c34] px-3.5 py-2 text-xs font-medium text-[#CCCCCC] transition-colors hover:border-electric hover:text-white font-inter"
                    >
                      <Pencil className="h-3.5 w-3.5 text-electric" />
                      <span>Adjust Area</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveMarketArea}
                      className="rounded-xl border border-[#333333] bg-[#111c34] p-2 text-[#94a3b8] hover:bg-crimson/20 hover:text-crimson transition-colors"
                      title="Remove target market area"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowMarketPicker(true)}
                    className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-4 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95 transition-all font-inter"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Define Market Area →</span>
                  </button>
                )}
              </div>
            </div>

            {identity.targetMarketArea ? (
              <div className="mt-5 space-y-4">
                {/* Top overview badge bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#333333] bg-[#111c34] p-3.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPin className="h-4 w-4 text-electric shrink-0" />
                    <span className="font-heading text-xs font-semibold text-white truncate">
                      {identity.targetMarketArea.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-md bg-electric/15 px-2.5 py-1 text-[11px] font-semibold text-electric border border-electric/30 font-inter">
                      {identity.targetMarketArea.radiusKm} km radius
                    </span>
                    <span className="text-xs text-[#94a3b8] font-mono">
                      {identity.targetMarketArea.lat.toFixed(4)}, {identity.targetMarketArea.lng.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Context Data Grid */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {/* Box 1: Geographic Administrative Boundaries (OSM / Nominatim) */}
                  <div className="rounded-xl border border-[#333333] bg-[#111c34]/70 p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#333333] pb-2 mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">
                          Geographic Region
                        </p>
                        <span className="text-[10px] text-emerald bg-emerald/10 border border-emerald/20 px-1.5 py-0.5 rounded font-medium">
                          OSM Nominatim
                        </span>
                      </div>
                      <dl className="space-y-2 text-xs font-inter">
                        <div className="flex justify-between">
                          <dt className="text-[#94a3b8]">City / Metro:</dt>
                          <dd className="font-medium text-white">{identity.targetMarketArea.city || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[#94a3b8]">State / Region:</dt>
                          <dd className="font-medium text-white">{identity.targetMarketArea.state || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[#94a3b8]">Country:</dt>
                          <dd className="font-medium text-white">{identity.targetMarketArea.country || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[#94a3b8]">Postal Code:</dt>
                          <dd className="font-medium text-white">{identity.targetMarketArea.postcode || "—"}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[#94a3b8]">Boundary Type:</dt>
                          <dd className="font-medium text-electric capitalize">{identity.targetMarketArea.placeType || "Administrative"}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  {/* Box 2: Commercial & Infrastructure Density (OpenStreetMap Overpass) */}
                  <div className="rounded-xl border border-[#333333] bg-[#111c34]/70 p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#333333] pb-2 mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">
                          Commercial &amp; POI Footprint
                        </p>
                        <span className="text-[10px] text-electric bg-electric/10 border border-electric/20 px-1.5 py-0.5 rounded font-medium">
                          OSM Overpass
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-2xl font-bold font-heading text-white">
                            {identity.targetMarketArea.osmPoiCount !== undefined
                              ? identity.targetMarketArea.osmPoiCount.toLocaleString()
                              : "Active Coverage"}
                          </p>
                          <p className="text-[11px] text-[#94a3b8] font-inter">
                            Verified commercial, retail, and operational facilities within radius
                          </p>
                        </div>
                        <div className="rounded-lg bg-[#0B1220] p-2.5 border border-[#333333] text-[11px] text-[#CCCCCC] font-inter">
                          <p>
                            Coverage footprint: <span className="text-white font-semibold">~{(Math.PI * Math.pow(identity.targetMarketArea.radiusKm, 2)).toFixed(0)} km²</span>
                          </p>
                          <p className="text-[10px] text-[#94a3b8] mt-0.5">
                            Direct OpenStreetMap spatial query with real verified nodes.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Box 3: Census / Demographic Provider (Integration Placeholder) */}
                  <div className="rounded-xl border border-dashed border-[#333333] bg-[#111c34]/40 p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#333333] pb-2 mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8] font-inter">
                          Demographic &amp; Census Data
                        </p>
                        <span className="text-[10px] text-[#FFC432] bg-[#FFC432]/10 border border-[#FFC432]/20 px-1.5 py-0.5 rounded font-medium">
                          Provider Pending
                        </span>
                      </div>
                      <div className="space-y-2 text-xs font-inter text-[#94a3b8]">
                        <div className="rounded-lg bg-[#0B1220]/70 p-2 border border-[#333333]/50">
                          <div className="flex justify-between text-[11px]">
                            <span>Age Brackets &amp; Pyramids:</span>
                            <span className="text-[#94a3b8] font-mono">[Census API Required]</span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-[#0B1220]/70 p-2 border border-[#333333]/50">
                          <div className="flex justify-between text-[11px]">
                            <span>Median Household Income:</span>
                            <span className="text-[#94a3b8] font-mono">[Census API Required]</span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-[#0B1220]/70 p-2 border border-[#333333]/50">
                          <div className="flex justify-between text-[11px]">
                            <span>Purchasing Power Index:</span>
                            <span className="text-[#94a3b8] font-mono">[Census API Required]</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#94a3b8] font-inter mt-3 pt-2 border-t border-[#333333]/50">
                      Connect an official Census Bureau or regional stats API key to populate verified demographic charts.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-[#333333] bg-[#111c34]/30 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-electric/10 text-electric border border-electric/20 mb-3">
                  <Compass className="h-6 w-6" />
                </div>
                <h3 className="font-heading text-sm font-semibold text-white">No Target Market Area Defined</h3>
                <p className="mt-1 max-w-md text-xs text-[#CCCCCC] font-inter">
                  Set a geographic center and radius to anchor market research, local competitor scans, and geo-targeted campaigns.
                </p>
                <button
                  type="button"
                  onClick={() => setShowMarketPicker(true)}
                  className="mt-4 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#0078FF] to-[#FFC432] px-5 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95 transition-all font-inter"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Define Target Market Area →</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. AI BRAIN PREVIEW CARD (Summary tile linking to fullview router) */}
          <div className="rounded-2xl border border-[#333333] bg-[#0B1220] p-5 shadow-xl transition-all hover:border-electric/50 group">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-electric/30 bg-electric/10 text-electric group-hover:scale-105 group-hover:bg-electric/20 transition-all">
                  <Brain className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-sm font-semibold text-white">
                      Neural Brain &amp; Department Topology
                    </h3>
                    <span className="rounded-full bg-electric/15 px-2 py-0.5 text-[10px] font-semibold text-electric border border-electric/30 font-inter">
                      8 Departments Active
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#CCCCCC] font-inter">
                    Interactive visual network of the 8 specialist departments, execution weights, and inter-agent pipelines.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("brain")}
                className="flex items-center gap-1.5 rounded-full border border-electric/40 bg-electric/10 px-4 py-2 text-xs font-semibold text-electric transition-all hover:bg-electric hover:text-white active:scale-95 font-inter shrink-0"
              >
                <span>Launch Brain Canvas</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

        </main>
      </div>

      {/* Map Modals */}
      {showLocationPicker && (
        <LocationMapPicker
          mode="location"
          initial={identity.location}
          onConfirm={handleLocationConfirm}
          onClose={() => setShowLocationPicker(false)}
        />
      )}

      {showMarketPicker && (
        <LocationMapPicker
          mode="marketArea"
          initialMarketArea={identity.targetMarketArea}
          onConfirmMarketArea={handleMarketAreaConfirm}
          onClose={() => setShowMarketPicker(false)}
        />
      )}
    </div>
  );
}
