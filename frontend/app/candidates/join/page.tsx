"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/auth";
import { useProfile } from "@/hooks/useProfile";
import { ProfileForm } from "../components/ProfileForm";
import { ProfileFormData } from "@/types/candidate";

const supabase = createClient();

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const { isLoading, showProfileForm, profileData, updateProfile } = useProfile();
  const [status, setStatus] = useState<"loading" | "auth_required" | "profile_required" | "processing" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const processInvite = async (userId: string): Promise<boolean> => {
    if (!code?.trim()) return false;
    const numericCode = Number(code.trim());
    const primaryCode = Number.isFinite(numericCode) ? numericCode : code.trim();

    let { data: invite, error: inviteError } = await supabase
      .from("interview_invites")
      .select("*, interview:interview_id(*)")
      .eq("invite_code", primaryCode)
      .single();

    if (inviteError || !invite) {
      const secondTry = await supabase
        .from("interview_invites")
        .select("*, interview:interview_id(*)")
        .eq("invite_code", code.trim())
        .single();
      invite = secondTry.data;
      if (secondTry.error || !invite) return false;
    }

    const inv = invite as { status: string; created_at: string; id: string; interview_id: number };
    if (inv.status !== "pending") return false;

    const inviteDate = new Date(inv.created_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (inviteDate < thirtyDaysAgo) return false;

    const { data: existing } = await supabase
      .from("interview_participants")
      .select("id")
      .eq("interview_id", inv.interview_id)
      .eq("user_id", userId)
      .single();

    if (existing) return true;

    const { error: insertErr } = await supabase.from("interview_participants").insert({
      interview_id: inv.interview_id,
      user_id: userId,
      status: "active",
      joined_at: new Date().toISOString(),
    });

    if (insertErr) return false;

    await supabase.from("interview_invites").update({ status: "accepted" }).eq("id", inv.id);
    return true;
  };

  useEffect(() => {
    if (!code?.trim()) {
      setStatus("error");
      setErrorMessage("Invalid invite link. No code provided.");
      return;
    }

    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setStatus("auth_required");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, experience, linkedin")
        .eq("id", session.user.id)
        .single();

      const profileComplete = profile?.full_name && profile?.phone && profile?.experience && profile?.linkedin;

      if (!profileComplete) {
        setStatus("profile_required");
        return;
      }

      setStatus("processing");
      const ok = await processInvite(session.user.id);
      if (ok) {
        setStatus("success");
        setTimeout(() => router.replace("/candidates"), 1500);
      } else {
        setStatus("error");
        setErrorMessage("This invite link is invalid or has expired.");
      }
    };

    run();
  }, [code]);

  const handleProfileSubmit = async (formData: ProfileFormData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      ...formData,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setErrorMessage("Failed to save profile. Please try again.");
      return;
    }

    setStatus("processing");
    const ok = await processInvite(user.id);
    if (ok) {
      setStatus("success");
      setTimeout(() => router.replace("/candidates"), 1500);
    } else {
      setStatus("error");
      setErrorMessage("This invite link is invalid or has expired.");
    }
  };

  if (status === "auth_required") {
    const joinUrl = `/candidates/join?code=${encodeURIComponent(code || "")}`;
    const redirectParam = encodeURIComponent(joinUrl);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Sign in to join your interview</h2>
          <p className="text-gray-400 text-sm mb-6">
            You need to sign in or create an account to access this interview.
          </p>
          <div className="space-y-3">
            <a
              href={`/signup?redirect=${redirectParam}`}
              className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Create account
            </a>
            <a
              href={`/login?redirect=${redirectParam}`}
              className="block w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "profile_required") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md w-full">
          <div className="mb-4 text-center">
            <p className="text-gray-400 text-sm">Complete your profile to join the interview</p>
          </div>
          <ProfileForm
            onSubmit={handleProfileSubmit}
            profileData={profileData || undefined}
            skipReloadAfterSubmit
          />
          {errorMessage && (
            <div className="mt-4 p-3 bg-red-900/50 text-red-200 rounded text-sm">{errorMessage}</div>
          )}
        </div>
      </div>
    );
  }

  if (status === "loading" || status === "processing" || status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">
            {status === "success" ? "Interview added! Redirecting..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Invalid invite link</h2>
          <p className="text-gray-400 text-sm mb-6">{errorMessage}</p>
          <a
            href="/candidates"
            className="inline-block py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <JoinPageContent />
    </Suspense>
  );
}
