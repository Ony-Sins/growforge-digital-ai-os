"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck, Trash2, X } from "lucide-react";

export type DeletableNodeType = "mcp_server" | "byo_mcp" | "capability_key" | "ai_model" | "connector" | "tendril";

interface NodeDeleteConfirmModalProps {
  isOpen: boolean;
  nodeName: string;
  nodeType: DeletableNodeType;
  onClose: () => void;
  onConfirm: (keepCredentialsOnFile: boolean) => Promise<void> | void;
}

export function NodeDeleteConfirmModal({
  isOpen,
  nodeName,
  nodeType,
  onClose,
  onConfirm,
}: NodeDeleteConfirmModalProps) {
  const [submittingKeep, setSubmittingKeep] = useState(false);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const isBusy = submittingKeep || submittingDelete;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBusy) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isBusy, onClose]);

  if (!isOpen) return null;

  const nodeTypeLabel =
    nodeType === "capability_key"
      ? "capability key"
      : nodeType === "ai_model"
        ? "AI model"
        : "MCP server";

  async function handleKeepOnFile() {
    if (isBusy) return;
    setSubmittingKeep(true);
    try {
      await onConfirm(true);
    } finally {
      setSubmittingKeep(false);
    }
  }

  async function handleRemoveCompletely() {
    if (isBusy) return;
    setSubmittingDelete(true);
    try {
      await onConfirm(false);
    } finally {
      setSubmittingDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        className="relative w-full max-w-lg rounded-2xl border border-border-metal bg-[#0B1220] shadow-[0_0_60px_rgba(0,0,0,0.8)] p-6 space-y-5 animate-in zoom-in-95 duration-150 text-white"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-[#333333]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="delete-modal-title" className="font-heading text-base font-semibold text-white">
                Remove {nodeName}?
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Confirm disconnection and choose credential retention preference.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Warning text stating plainly what breaks */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
          Remove <strong>{nodeName}</strong>? You&apos;ll need to manually reconnect {nodeTypeLabel} again to use it.
        </div>

        {/* Action Choice Cards */}
        <div className="space-y-3">
          {/* Choice 1: Keep credentials on file */}
          <div className="group relative rounded-xl border border-electric/30 bg-electric/5 p-4 transition-all hover:border-electric hover:bg-electric/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-electric/20 text-electric">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white">Keep credentials on file</h4>
                  <p className="text-xs text-secondary leading-relaxed">
                    Disconnect this node from the AI Brain, but keep stored credentials encrypted in your server vault. You can reactivate it later from Settings without re-entering any keys.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleKeepOnFile}
                disabled={isBusy}
                className="flex items-center gap-2 rounded-lg border border-electric/40 bg-electric/20 px-3.5 py-1.5 text-xs font-semibold text-electric hover:bg-electric/30 hover:border-electric transition-colors disabled:opacity-50"
              >
                {submittingKeep ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Disconnecting...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" /> Disconnect & Keep on file
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Choice 2: Remove completely */}
          <div className="group relative rounded-xl border border-crimson/30 bg-crimson/5 p-4 transition-all hover:border-crimson hover:bg-crimson/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-crimson/20 text-crimson">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white">Remove completely</h4>
                  <p className="text-xs text-secondary leading-relaxed">
                    Permanently delete the connector and destroy its credentials from the encrypted vault. Reconnecting in the future will require entering credentials from scratch.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleRemoveCompletely}
                disabled={isBusy}
                className="flex items-center gap-2 rounded-lg border border-crimson/40 bg-crimson/20 px-3.5 py-1.5 text-xs font-semibold text-crimson hover:bg-crimson/30 hover:border-crimson transition-colors disabled:opacity-50"
              >
                {submittingDelete ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" /> Delete credentials & Remove
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Cancel */}
        <div className="flex justify-end pt-2 border-t border-[#333333]">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-secondary hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
