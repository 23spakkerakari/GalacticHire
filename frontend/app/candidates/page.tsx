"use client";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/utils/auth";
import { useProfile } from "@/hooks/useProfile";
import type { ProfileFormData } from "@/types/candidate";
import { ProfileForm } from "./components/ProfileForm";
import { useCandidateOnboardingStep } from "@/hooks/useCandidateOnboardingStep";
import InterviewDetailsModal from "./dashboard/components/InterviewDetailsModal";
import Link from "next/link";
import { ensureLatestSampleInterviewParticipant, getLatestSampleInterview } from "./utils/sampleInterview";

// Types
interface Interview {
  id: string;
  title: string;
  scheduled_date?: string;
  company?: string;
}

interface InterviewParticipant {
  id: string;
  interview_id: string;
  user_id: string;
  status: string;
  joined_at: string;
  completed: boolean;
  interview: Interview;
}

interface PendingInterview {
  id: string;
  title: string;
  scheduledDate: string;
  company: string;
  logo: string;
}

type Theme = "dark" | "light";

export default function CandidateDashboard() {
  const [activeTab, setActiveTab] = useState<"pending" | "completed" | "stats">("pending");
  const [completed, setCompleted] = useState<InterviewParticipant[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [pendingInterviews, setPendingInterviews] = useState<PendingInterview[]>([]);
  const [sampleInterviewTile, setSampleInterviewTile] = useState<PendingInterview | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");

  const supabase = createClient();
  const router = useRouter();
  const { isLoading, showProfileForm, profileData, userEmail, updateProfile } = useProfile();
  const { loading, step, redirectIfNeeded } = useCandidateOnboardingStep();

  // Theme management
  useEffect(() => {
    const saved = localStorage.getItem("candidate-dashboard-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("candidate-dashboard-theme", newTheme);
  };

  // Theme classes
  const t = {
    pageBg: theme === "dark" ? "bg-slate-950" : "bg-gray-50",
    navBg: theme === "dark" ? "bg-slate-950/95 border-slate-800/50" : "bg-white/95 border-gray-200",
    cardBg: theme === "dark" ? "bg-slate-900/50 border-slate-800/50" : "bg-white border-gray-200",
    cardHover: theme === "dark" ? "hover:bg-slate-800/50 hover:border-slate-700/50" : "hover:bg-gray-50 hover:border-gray-300",
    textPrimary: theme === "dark" ? "text-white" : "text-gray-900",
    textSecondary: theme === "dark" ? "text-slate-400" : "text-gray-600",
    textMuted: theme === "dark" ? "text-slate-500" : "text-gray-500",
    btnSecondary: theme === "dark" ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700" : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200",
    tabActive: theme === "dark" ? "bg-slate-800 text-white" : "bg-gray-200 text-gray-900",
    tabInactive: theme === "dark" ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-700",
    dropdownBg: theme === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200",
  };

  const buildSampleTile = (interview: any): PendingInterview => ({
    id: interview.id,
    title: interview.title || "Sample Interview",
    scheduledDate: interview.scheduled_date || "Always available",
    company: interview.company || "Practice",
    logo: (interview.company || "S").charAt(0).toUpperCase(),
  });

  // Get current user ID
  const getCurrentUserId = useCallback(async (): Promise<string | null> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      return userData.user?.id || null;
    } catch (error) {
      console.error("Error getting user ID:", error);
      return null;
    }
  }, [supabase.auth]);

  // Fetch completed interviews
  const fetchCompletedInterviews = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const userId = await getCurrentUserId();
      if (!userId) return;

      const { data, error } = await supabase
        .from("interview_participants")
        .select("*, interview:interview_id(*)")
        .eq("user_id", userId)
        .eq("completed", true)
        .order("joined_at", { ascending: false });

      if (error) {
        console.error("Error fetching completed interviews:", error);
        return;
      }

      setCompleted(data || []);
    } catch (error) {
      console.error("Error in fetchCompletedInterviews:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, [supabase, getCurrentUserId]);

  // Fetch pending interviews
  const fetchPendingInterviews = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const userId = await getCurrentUserId();
      if (!userId) return;

      // Ensure sample/test uses the same DB-backed interview pipeline.
      await ensureLatestSampleInterviewParticipant(supabase, userId);
      const sampleInterview = await getLatestSampleInterview(supabase);
      const mappedSample = sampleInterview
        ? {
            id: sampleInterview.id,
            title: sampleInterview.title || "Sample Interview",
            scheduledDate: sampleInterview.scheduled_date || "Always available",
            company: sampleInterview.company || "Practice",
            logo: (sampleInterview.company || "S").charAt(0).toUpperCase(),
          }
        : null;

      const { data, error } = await supabase
        .from("interview_participants")
        .select("interview:interview_id(*), status")
        .eq("user_id", userId)
        .eq("completed", false);

      if (error) {
        console.error("Error fetching pending interviews:", error);
        setSampleInterviewTile(mappedSample);
        setPendingInterviews([]);
        return;
      }

      const mapped = (data || []).map((row: any): PendingInterview => {
        const interview = row.interview;
        return {
          id: interview.id,
          title: interview.title || "Interview",
          scheduledDate: interview.scheduled_date || "TBD",
          company: interview.company || "Unknown",
          logo: (interview.company || "?").charAt(0).toUpperCase(),
        };
      });

      setSampleInterviewTile(mappedSample);
      setPendingInterviews(mapped.filter((item) => item.id !== mappedSample?.id));
    } catch (error) {
      console.error("Error in fetchPendingInterviews:", error);
      const sampleInterview = await getLatestSampleInterview(supabase).catch(() => null);
      setSampleInterviewTile(
        sampleInterview
          ? {
              id: sampleInterview.id,
              title: sampleInterview.title || "Sample Interview",
              scheduledDate: sampleInterview.scheduled_date || "Always available",
              company: sampleInterview.company || "Practice",
              logo: (sampleInterview.company || "S").charAt(0).toUpperCase(),
            }
          : null
      );
      setPendingInterviews([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [supabase, getCurrentUserId]);

  // Load data
  useEffect(() => {
    fetchCompletedInterviews();
    fetchPendingInterviews();
  }, [fetchCompletedInterviews, fetchPendingInterviews]);

  // Handle onboarding redirect
  useEffect(() => {
    redirectIfNeeded("dashboard");
  }, [loading, step, redirectIfNeeded]);

  // Refresh dashboard
  const refreshDashboard = useCallback(() => {
    fetchCompletedInterviews();
    fetchPendingInterviews();
  }, [fetchCompletedInterviews, fetchPendingInterviews]);

  // Logout
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore sign-out errors and continue navigation
    }
    router.push("/login");
  };

  // Loading states
  if (loading || step !== "dashboard") {
    return <LoadingSpinner message="Loading Dashboard..." theme={theme} />;
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading Dashboard..." theme={theme} />;
  }

  const handleProfileSubmit = async (formData: ProfileFormData): Promise<void> => {
    await updateProfile(formData);
  };

  if (showProfileForm) {
    return <ProfileForm onSubmit={handleProfileSubmit} profileData={profileData || undefined} />;
  }

  const completedSampleInterview = completed
    .map((row) => row?.interview)
    .find((interview) => {
      const title = String(interview?.title || "").toLowerCase();
      return title.includes("sample") || title.includes("test");
    });
  const persistentSampleInterview =
    sampleInterviewTile || (completedSampleInterview ? buildSampleTile(completedSampleInterview) : null);
  const pendingCount = pendingInterviews.length + (persistentSampleInterview ? 1 : 0);

  return (
    <Suspense fallback={<LoadingSpinner message="Loading..." theme={theme} />}>
      <div className={`min-h-screen font-sans ${t.pageBg} transition-colors duration-200`}>
        {/* Navigation */}
        <nav className={`sticky top-0 z-40 backdrop-blur-sm border-b ${t.navBg} transition-colors duration-200`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className={`text-base font-semibold ${t.textPrimary}`}>HireVision</span>
              </div>

              {/* Center Tabs */}
              <div className={`hidden md:flex items-center gap-1 p-1 rounded-lg ${theme === "dark" ? "bg-slate-900/50 border border-slate-800/50" : "bg-gray-100 border border-gray-200"}`}>
                {[
                  { id: "pending", label: "Pending" },
                  { id: "completed", label: "Completed" },
                  { id: "stats", label: "Stats" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === tab.id ? t.tabActive : t.tabInactive}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-2">
                {/* Theme Toggle */}
                <button onClick={toggleTheme} className={`p-2 rounded-lg border transition-colors ${t.btnSecondary}`} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                  {theme === "dark" ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>

                {/* Profile dropdown */}
                <div className="relative group">
                  <button className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border transition-colors ${theme === "dark" ? "bg-slate-800/50 border-slate-700/50 hover:bg-slate-800" : "bg-gray-100 border-gray-200 hover:bg-gray-200"}`}>
                    <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                      {profileData?.full_name?.charAt(0) || "C"}
                    </div>
                    <span className={`hidden sm:block text-sm ${t.textPrimary}`}>{profileData?.full_name?.split(" ")[0] || "Candidate"}</span>
                    <svg className={`w-4 h-4 ${t.textSecondary}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className={`absolute right-0 mt-2 w-48 py-1 rounded-lg border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all ${t.dropdownBg}`}>
                    <div className={`px-4 py-2 border-b ${theme === "dark" ? "border-slate-800" : "border-gray-200"}`}>
                      <p className={`text-sm font-medium ${t.textPrimary}`}>{profileData?.full_name || "Candidate"}</p>
                      <p className={`text-xs ${t.textSecondary}`}>{userEmail || ""}</p>
                    </div>
                    <Link href="/" className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${theme === "dark" ? "text-slate-300 hover:text-white hover:bg-slate-800/50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      Home
                    </Link>
                    <Link href="/candidates/profile" className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${theme === "dark" ? "text-slate-300 hover:text-white hover:bg-slate-800/50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      My Profile
                    </Link>
                    <button onClick={handleLogout} className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors ${theme === "dark" ? "hover:bg-slate-800/50" : "hover:bg-gray-100"}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Mobile Tab Bar */}
        <div className={`md:hidden sticky top-16 z-30 backdrop-blur-sm border-b px-4 py-2 ${t.navBg} transition-colors duration-200`}>
          <div className={`flex items-center gap-1 p-1 rounded-lg ${theme === "dark" ? "bg-slate-900/50 border border-slate-800/50" : "bg-gray-100 border border-gray-200"}`}>
            {[
              { id: "pending", label: "Pending" },
              { id: "completed", label: "Completed" },
              { id: "stats", label: "Stats" },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === tab.id ? t.tabActive : t.tabInactive}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Header */}
          <div className="mb-8">
            <h1 className={`text-2xl font-semibold ${t.textPrimary}`}>Welcome back, {profileData?.full_name?.split(" ")[0] || "there"}</h1>
            <p className={`mt-1 text-sm ${t.textSecondary}`}>Manage your interviews and track your progress</p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard value={pendingCount} label="Pending" color="blue" theme={theme} />
            <StatCard value={completed.length} label="Completed" color="emerald" theme={theme} />
            <StatCard value={Math.round((completed.length / (pendingInterviews.length + completed.length + (persistentSampleInterview ? 1 : 0) || 1)) * 100)} label="% Complete" color="indigo" theme={theme} />
          </div>

          {persistentSampleInterview && (
            <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className={`font-medium ${t.textPrimary}`}>Permanent sample interview for testing</p>
                <p className={`text-sm ${t.textSecondary}`}>{persistentSampleInterview.title}</p>
              </div>
              <button
                onClick={() => router.push(`/candidates/interview?interview_id=${persistentSampleInterview.id}`)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                Start Sample Interview
              </button>
            </div>
          )}

          {/* Tab Content */}
          {activeTab === "pending" && (
            <PendingInterviewsSection
              interviews={pendingInterviews}
              sampleInterviewTile={persistentSampleInterview}
              theme={theme}
              t={t}
            />
          )}

          {activeTab === "completed" && <CompletedInterviewsSection completed={completed} onInterviewClick={setOpenIdx} isLoading={isLoadingData} theme={theme} t={t} />}

          {activeTab === "stats" && (
            <StatsSection
              pendingCount={pendingCount}
              completedCount={completed.length}
              theme={theme}
              t={t}
            />
          )}
        </main>

        {/* Modals */}
        {openIdx !== null && completed[openIdx] && <InterviewDetailsModal interview={completed[openIdx]} onClose={() => setOpenIdx(null)} />}

      </div>
    </Suspense>
  );
}

// Sub-components
function LoadingSpinner({ message, theme }: { message: string; theme: Theme }) {
  return (
    <div className={`min-h-screen flex items-center justify-center ${theme === "dark" ? "bg-slate-950" : "bg-gray-50"}`}>
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className={theme === "dark" ? "text-slate-400" : "text-gray-600"}>{message}</p>
      </div>
    </div>
  );
}

function StatCard({ value, label, color, theme }: { value: number; label: string; color: "blue" | "emerald" | "indigo"; theme: Theme }) {
  const colorMap = {
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
    indigo: { bg: "bg-indigo-500/10", text: "text-indigo-500", border: "border-indigo-500/20" },
  };
  const c = colorMap[color];

  return (
    <div className={`rounded-xl ${c.bg} border ${c.border} p-4 transition-colors`}>
      <div className={`text-2xl font-semibold ${c.text}`}>{value}</div>
      <div className={`text-xs mt-1 ${theme === "dark" ? "text-slate-400" : "text-gray-600"}`}>{label}</div>
    </div>
  );
}

function PendingInterviewsSection({
  interviews,
  sampleInterviewTile,
  theme,
  t,
}: {
  interviews: PendingInterview[];
  sampleInterviewTile: PendingInterview | null;
  theme: Theme;
  t: any;
}) {
  const router = useRouter();
  const displayInterviews = sampleInterviewTile ? [sampleInterviewTile, ...interviews] : interviews;

  const handleStartInterview = (interviewId: string) => {
    router.push(`/candidates/interview?interview_id=${interviewId}`);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${t.textPrimary}`}>Pending Interviews</h2>
          <p className={`text-xs ${t.textMuted}`}>{displayInterviews.length} interviews awaiting</p>
        </div>
      </div>

      {displayInterviews.length === 0 ? (
        <div className={`rounded-xl border p-12 text-center ${t.cardBg}`}>
          <div className={`w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center ${theme === "dark" ? "bg-slate-800/50" : "bg-gray-100"}`}>
            <svg className={`w-6 h-6 ${t.textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className={t.textPrimary}>No pending interviews</p>
          <p className={`text-sm mt-1 ${t.textMuted}`}>Add an interview using an invite code</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {displayInterviews.map((interview, index) => {
            const isSampleTile = sampleInterviewTile?.id === interview.id;
            return (
            <motion.div key={interview.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`rounded-xl border p-5 transition-all group ${t.cardBg} ${t.cardHover}`}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">{interview.logo}</div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold ${t.textPrimary} truncate`}>{interview.title}</h3>
                  {isSampleTile && (
                    <span className="inline-flex mt-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Practice interview
                    </span>
                  )}
                  <p className={`text-sm ${t.textSecondary}`}>{interview.company}</p>
                  <div className={`flex items-center gap-1 mt-1 text-xs ${t.textMuted}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {interview.scheduledDate}
                  </div>
                </div>
              </div>
              <button onClick={() => handleStartInterview(interview.id)} className="w-full mt-4 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Interview
              </button>
            </motion.div>
          )})}
        </div>
      )}
    </div>
  );
}

function CompletedInterviewsSection({ completed, onInterviewClick, isLoading, theme, t }: { completed: InterviewParticipant[]; onInterviewClick: (index: number) => void; isLoading: boolean; theme: Theme; t: any }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${t.textPrimary}`}>Completed Interviews</h2>
          <p className={`text-xs ${t.textMuted}`}>{completed.length} interviews finished</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : completed.length === 0 ? (
        <div className={`rounded-xl border p-12 text-center ${t.cardBg}`}>
          <div className={`w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center ${theme === "dark" ? "bg-slate-800/50" : "bg-gray-100"}`}>
            <svg className={`w-6 h-6 ${t.textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className={t.textPrimary}>No completed interviews yet</p>
          <p className={`text-sm mt-1 ${t.textMuted}`}>Finished interviews will appear here</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {completed.map((row, i) => (
            <motion.button key={row.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => onInterviewClick(i)} className={`w-full text-left rounded-xl border p-5 transition-all group ${t.cardBg} ${t.cardHover}`}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold ${t.textPrimary} truncate`}>{row.interview.title || "Interview"}</h3>
                  <p className={`text-sm ${t.textSecondary}`}>{new Date(row.joined_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded-md ${theme === "dark" ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>Completed</span>
                <span className={`text-xs text-blue-500 group-hover:text-blue-400 flex items-center gap-1`}>
                  View details
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsSection({ pendingCount, completedCount, theme, t }: { pendingCount: number; completedCount: number; theme: Theme; t: any }) {
  const total = pendingCount + completedCount;
  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${t.textPrimary}`}>Your Stats</h2>
          <p className={`text-xs ${t.textMuted}`}>Interview performance overview</p>
        </div>
      </div>

      <div className={`rounded-xl border p-6 ${t.cardBg}`}>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div className={`text-3xl font-bold ${t.textPrimary}`}>{total}</div>
            <div className={`text-sm ${t.textSecondary}`}>Total Interviews</div>
          </div>
          <div>
            <div className={`text-3xl font-bold text-emerald-500`}>{completionRate}%</div>
            <div className={`text-sm ${t.textSecondary}`}>Completion Rate</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className={t.textSecondary}>Progress</span>
            <span className={t.textPrimary}>{completedCount} of {total}</span>
          </div>
          <div className={`h-2 rounded-full ${theme === "dark" ? "bg-slate-800" : "bg-gray-200"}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${completionRate}%` }} />
          </div>
        </div>

        {/* Breakdown */}
        <div className={`pt-4 border-t ${theme === "dark" ? "border-slate-800" : "border-gray-200"}`}>
          <div className="flex justify-between py-2">
            <span className={t.textSecondary}>Pending</span>
            <span className={`font-medium text-blue-500`}>{pendingCount}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className={t.textSecondary}>Completed</span>
            <span className={`font-medium text-emerald-500`}>{completedCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
