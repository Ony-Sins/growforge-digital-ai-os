import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface MediaArtifact {
  id: string;
  type: "image" | "video";
  fileName: string;
  filePath: string;
  mediaType: "image" | "video";
  mimeType: string;
  dimensions?: { width: number; height: number };
  fileSizeBytes: number;
  createdAt: string;
  prompt: string;
  provider: string;
  workflow?: string;
  status: "completed" | "failed" | "generating";
  error?: string;
  conversationId?: string;
  url: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const MEDIA_DIR = path.join(DATA_DIR, "media_storage");
const REGISTRY_FILE = path.join(DATA_DIR, "media_registry.json");

function ensureMediaDirs(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  } catch {
    // best-effort
  }
}

export function getMediaRegistry(): Record<string, MediaArtifact> {
  ensureMediaDirs();
  try {
    if (!fs.existsSync(REGISTRY_FILE)) return {};
    const raw = fs.readFileSync(REGISTRY_FILE, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMediaRegistry(registry: Record<string, MediaArtifact>): void {
  ensureMediaDirs();
  const tmp = `${REGISTRY_FILE}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), "utf8");
  fs.renameSync(tmp, REGISTRY_FILE);
}

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};

export function saveMediaArtifact(
  buffer: Buffer,
  ext: string,
  meta: {
    mediaType?: "image" | "video";
    prompt: string;
    provider: string;
    workflow?: string;
    dimensions?: { width: number; height: number };
    conversationId?: string;
    status?: "completed" | "failed" | "generating";
    error?: string;
  }
): MediaArtifact {
  ensureMediaDirs();
  const cleanExt = ext.replace(/^\.+/, "").toLowerCase() || (meta.mediaType === "video" ? "mp4" : "png");
  const id = `media-${crypto.randomUUID()}`;
  const fileName = `${id}.${cleanExt}`;
  const filePath = path.join(MEDIA_DIR, fileName);

  fs.writeFileSync(filePath, buffer);

  const mimeType = MIME_MAP[cleanExt] || (meta.mediaType === "video" ? "video/mp4" : "image/png");
  const mediaType = meta.mediaType || (cleanExt === "mp4" || cleanExt === "webm" ? "video" : "image");
  const artifact: MediaArtifact = {
    id,
    type: mediaType,
    fileName,
    filePath,
    mediaType,
    mimeType,
    dimensions: meta.dimensions || { width: 1024, height: 1024 },
    fileSizeBytes: buffer.length,
    createdAt: new Date().toISOString(),
    prompt: meta.prompt,
    provider: meta.provider,
    workflow: meta.workflow || "comfyui-sd-standard",
    status: meta.status || "completed",
    error: meta.error,
    conversationId: meta.conversationId,
    url: `/api/media/${id}`,
  };

  const registry = getMediaRegistry();
  registry[id] = artifact;
  saveMediaRegistry(registry);

  return artifact;
}

export function registerFailedArtifact(meta: {
  mediaType?: "image" | "video";
  prompt: string;
  provider: string;
  workflow?: string;
  error: string;
  conversationId?: string;
}): MediaArtifact {
  ensureMediaDirs();
  const id = `media-failed-${crypto.randomUUID()}`;
  const mediaType = meta.mediaType || "image";
  const artifact: MediaArtifact = {
    id,
    type: mediaType,
    fileName: "",
    filePath: "",
    mediaType,
    mimeType: "text/plain",
    fileSizeBytes: 0,
    createdAt: new Date().toISOString(),
    prompt: meta.prompt,
    provider: meta.provider,
    workflow: meta.workflow || "comfyui-sd-standard",
    status: "failed",
    error: meta.error,
    conversationId: meta.conversationId,
    url: "",
  };

  const registry = getMediaRegistry();
  registry[id] = artifact;
  saveMediaRegistry(registry);

  return artifact;
}

export function getMediaArtifact(id: string): MediaArtifact | null {
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const registry = getMediaRegistry();
  return registry[id] || null;
}

export function listMediaArtifacts(): MediaArtifact[] {
  const registry = getMediaRegistry();
  return Object.values(registry).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getMediaFilePath(id: string): { filePath: string; mimeType: string; artifact: MediaArtifact } | null {
  if (!id || typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  const artifact = getMediaArtifact(id);
  if (!artifact || artifact.status !== "completed" || !artifact.filePath) return null;

  // Prevent directory traversal: verify the file is strictly contained inside MEDIA_DIR (preventing sibling-prefix / relative attacks)
  const resolvedPath = path.resolve(artifact.filePath);
  const resolvedMediaDir = path.resolve(MEDIA_DIR);
  const relative = path.relative(resolvedMediaDir, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    return null;
  }

  if (!resolvedPath.startsWith(resolvedMediaDir + path.sep)) {
    return null;
  }

  if (!fs.existsSync(resolvedPath)) return null;

  return { filePath: resolvedPath, mimeType: artifact.mimeType, artifact };
}
