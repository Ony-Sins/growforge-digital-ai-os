"use client";

import { useState } from "react";
import { KeyRound, Lock, X } from "lucide-react";
import { useAppState } from "@/lib/appState";
import { agents } from "@/lib/agents";
import { verifyAgentPin, verifyOwnerPin } from "@/lib/security";

export function PinPromptModal() {
  const { pinPromptTarget, dismissPinPrompt, unlockAgent, setRole } = useAppState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!pinPromptTarget) return null;

  const isOwnerPrompt = pinPromptTarget.kind === "owner";
  const targetAgent = pinPromptTarget.kind === "agent" ? agents.find((a) => a.id === pinPromptTarget.agentId) : null;

  function handleClose() {
    setPin("");
    setError(null);
    dismissPinPrompt();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pinPromptTarget?.kind === "owner") {
      if (verifyOwnerPin(pin)) {
        setRole("owner");
        handleClose();
      } else {
        setError("Incorrect owner PIN.");
      }
      return;
    }
    if (pinPromptTarget?.kind === "agent") {
      if (verifyAgentPin(pinPromptTarget.agentId, pin)) {
        unlockAgent(pinPromptTarget.agentId);
        handleClose();
      } else {
        setError("Incorrect security key.");
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleClose}
        className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
      />
      <form
        onSubmit={handleSubmit}
        className="glass-card-strong relative w-full max-w-sm rounded-2xl border border-border-metal-strong p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-navy"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-electric/15 to-gold/15 text-electric ring-1 ring-border-metal">
          {isOwnerPrompt ? <KeyRound className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        </span>

        <h2 className="mt-3 font-heading text-base font-semibold text-navy">
          {isOwnerPrompt ? "Owner access" : `${targetAgent?.name ?? "This agent"} is locked`}
        </h2>
        <p className="mt-1 text-sm text-secondary">
          {isOwnerPrompt
            ? "Enter the owner PIN to unlock full, unrestricted access to every agent."
            : `Enter the security key for the ${targetAgent?.division ?? ""} department to access this agent for the rest of your session.`}
        </p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          name="security-pin"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError(null);
          }}
          placeholder="Enter PIN"
          className="mt-4 w-full rounded-lg border border-border-metal bg-white/80 px-3.5 py-2.5 text-sm text-navy outline-none focus:border-electric/50"
        />
        {error && <p className="mt-2 text-xs text-crimson">{error}</p>}

        <button
          type="submit"
          disabled={!pin.trim()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-electric to-gold px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
