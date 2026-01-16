"use client";
import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Video, FilterOptions } from "../types";
import {
  skillsData,
  experienceData,
  scoresTrend,
  aggregateMetrics,
} from "../constants";
import FilterPanel from "./FilterPanel";
import { useJobDescription } from "../hooks/useJobDescription";
import Link from "next/link";
import { createClient } from "@/utils/auth";
import { useRouter } from "next/navigation";
import InterviewQuestions from "./InterviewQuestions";

// Professional color palette
const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#ec4899"];

interface DashboardProps {
  videos: Video[];
  topApplicants: string[];
  onVideoSelect: (video: Video) => void;
  onBackClick: () => void;
  onOpenInvite: () => void;
  onNewInterview: () => void;
  recruiterName?: string;
  recruiterEmail?: string;
  recruiterId?: string;
}

// Helper functions
const matchesSearchQuery = (video: Video, query: string): boolean => {
  const lowerCaseQuery = query.toLowerCase();
  if (video.title.toLowerCase().includes(lowerCaseQuery)) return true;
  if (video.candidate_details) {
    const candidate = video.candidate_details;
    if (
      candidate.full_name.toLowerCase().includes(lowerCaseQuery) ||
      candidate.email.toLowerCase().includes(lowerCaseQuery) ||
      (candidate.experience?.toLowerCase().includes(lowerCaseQuery))
    ) return true;
  }
  return false;
};

const matchesExperienceLevel = (video: Video, levels: string[]): boolean => {
  if (!video.candidate_details?.experience) return false;
  const expYears = parseInt(video.candidate_details.experience);
  return levels.some((level) => {
    if (level === "0-2") return expYears >= 0 && expYears <= 2;
    if (level === "3-5") return expYears >= 3 && expYears <= 5;
    if (level === "5+") return expYears > 5;
    return false;
  });
};

const matchesRatingMin = (video: Video, minRating: number): boolean => {
  const mockRating = (parseInt(video.id, 36) % 20) / 4 + 3;
  return mockRating >= minRating;
};

const matchesDateRange = (video: Video, dateRange: { start: Date | null; end: Date | null }): boolean => {
  if (!video.created_at) return true;
  const videoDate = new Date(video.created_at);
  if (dateRange.start && videoDate < dateRange.start) return false;
  if (dateRange.end) {
    const endPlusOneDay = new Date(dateRange.end);
    endPlusOneDay.setDate(endPlusOneDay.getDate() + 1);
    if (videoDate > endPlusOneDay) return false;
  }
  return true;
};

const Dashboard: React.FC<DashboardProps> = ({
  videos,
  topApplicants,
  onVideoSelect,
  onBackClick,
  onOpenInvite,
  onNewInterview,
  recruiterName,
  recruiterEmail,
  recruiterId,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "candidates" | "questions">("overview");
  
  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {}
    router.push("/recruiters/login");
  };

  const [filters, setFilters] = useState<FilterOptions>({
    experienceLevel: ["all"],
    searchQuery: "",
    ratingMin: 0,
    dateRange: { start: null, end: null },
  });

  const { jobDescription, isLoading, isSaving, error, updateJobDescription, loadJobDescription } = useJobDescription();
  const [isEditingJobDesc, setIsEditingJobDesc] = useState(false);
  const [editedJobDesc, setEditedJobDesc] = useState(jobDescription);

  const hasLoadedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (recruiterId && hasLoadedRef.current !== recruiterId) {
      hasLoadedRef.current = recruiterId;
      loadJobDescription(recruiterId);
    }
  }, [recruiterId, loadJobDescription]);

  React.useEffect(() => {
    setEditedJobDesc(jobDescription);
  }, [jobDescription]);

  const handleFilterChange = (filterType: keyof FilterOptions, value: any) => {
    setFilters((prev) => ({ ...prev, [filterType]: value }));
  };

  const handleSaveJobDesc = async () => {
    if (recruiterId) {
      await updateJobDescription(recruiterId, editedJobDesc);
      setIsEditingJobDesc(false);
    }
  };

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      if (filters.searchQuery && !matchesSearchQuery(video, filters.searchQuery)) return false;
      if (!filters.experienceLevel.includes("all") && !matchesExperienceLevel(video, filters.experienceLevel)) return false;
      if (filters.ratingMin > 0 && !matchesRatingMin(video, filters.ratingMin)) return false;
      if (!matchesDateRange(video, filters.dateRange)) return false;
      return true;
    });
  }, [videos, filters]);

  const dynamicMetrics = {
    ...aggregateMetrics,
    totalApplicants: videos.length,
    applicantsInProgress: Math.floor(videos.length * 0.6),
  };

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    setIsChatLoading(true);
    setChatReply(null);
    try {
      const baseUrl = "http://localhost:8000";
      const res = await fetch(`${baseUrl}/recruiter-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: chatInput, recruiter_id: recruiterId || null })
      });
      const data = await res.json();
      setChatReply(res.ok ? (data.reply || "") : (data.detail || "Something went wrong."));
    } catch {
      setChatReply("Network error. Try again.");
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-base font-semibold text-white">HireVision</span>
            </div>

            {/* Center Tabs */}
            <div className="hidden md:flex items-center gap-1 p-1 rounded-lg bg-slate-900/50 border border-slate-800/50">
              {[
                { id: "overview", label: "Overview" },
                { id: "candidates", label: "Candidates" },
                { id: "questions", label: "Questions" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    activeTab === tab.id
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={onNewInterview}
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Interview
              </button>
              
              <button
                onClick={onOpenInvite}
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                Invite
              </button>

              {/* Profile dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 transition-colors">
                  <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                    {recruiterName?.charAt(0) || "R"}
                  </div>
                  <span className="hidden sm:block text-sm text-slate-200">{recruiterName?.split(" ")[0] || "Recruiter"}</span>
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className="absolute right-0 mt-2 w-48 py-1 bg-slate-900 rounded-lg border border-slate-800 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="text-sm text-white font-medium">{recruiterName}</p>
                    <p className="text-xs text-slate-400">{recruiterEmail}</p>
                  </div>
                  <Link href="/recruiter-dashboard" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    Home
                  </Link>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-slate-800/50 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Tab Bar */}
      <div className="md:hidden sticky top-16 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50 px-4 py-2">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/50 border border-slate-800/50">
          {[
            { id: "overview", label: "Overview" },
            { id: "candidates", label: "Candidates" },
            { id: "questions", label: "Questions" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === tab.id
                  ? "bg-slate-800 text-white"
                  : "text-slate-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Welcome Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">
                  Welcome back, {recruiterName?.split(" ")[0] || "there"}
                </h1>
                <p className="mt-1 text-slate-400 text-sm">Here's your hiring pipeline overview</p>
              </div>
              <div className="flex gap-2 sm:hidden">
                <button onClick={onNewInterview} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  New
                </button>
                <button onClick={onOpenInvite} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm font-medium border border-slate-700">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" /></svg>
                  Invite
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard value={dynamicMetrics.totalApplicants} label="Total Applicants" color="blue" />
              <MetricCard value={dynamicMetrics.averageTechnicalScore} label="Avg Technical" color="emerald" />
              <MetricCard value={dynamicMetrics.averageCommunicationScore} label="Avg Communication" color="indigo" />
              <MetricCard value={dynamicMetrics.applicantsInProgress} label="In Progress" color="amber" />
            </div>

            {/* Two Column Layout */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Job Description Card */}
                <div className="rounded-xl bg-slate-900/50 border border-slate-800/50 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Job Description
                    </h3>
                    {!isEditingJobDesc && (
                      <button onClick={() => setIsEditingJobDesc(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        Edit
                      </button>
                    )}
                  </div>
                  
                  {isEditingJobDesc ? (
                    <div className="space-y-3">
                      <textarea
                        value={editedJobDesc}
                        onChange={(e) => setEditedJobDesc(e.target.value)}
                        className="w-full h-32 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-200 text-sm resize-none focus:outline-none focus:border-blue-500/50 placeholder-slate-500"
                        placeholder="Enter job description..."
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSaveJobDesc} disabled={isSaving} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors">
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => { setIsEditingJobDesc(false); setEditedJobDesc(jobDescription); }} className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 leading-relaxed line-clamp-5">
                      {jobDescription || "No job description set. Click Edit to add one."}
                    </p>
                  )}
                </div>

                {/* Quick Stats */}
                <div className="rounded-xl bg-slate-900/50 border border-slate-800/50 p-5">
                  <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Quick Stats
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: "Positions Open", value: "3" },
                      { label: "Interviews This Week", value: "12" },
                      { label: "Avg. Time to Hire", value: "18 days" },
                      { label: "Offer Rate", value: "86%" },
                    ].map((stat, i) => (
                      <div key={stat.label} className={`flex items-center justify-between py-2 ${i < 3 ? 'border-b border-slate-800/50' : ''}`}>
                        <span className="text-sm text-slate-400">{stat.label}</span>
                        <span className="text-sm font-medium text-white">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="lg:col-span-2 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <ChartCard title="Skills Distribution">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={[...skillsData]} barSize={20} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }} itemStyle={{ color: "#e2e8f0" }} />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                          {skillsData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Score Trends">
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={scoresTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={11} domain={[0, 10]} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }} />
                        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                        <Line type="monotone" dataKey="technical" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
                        <Line type="monotone" dataKey="communication" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <ChartCard title="Experience Distribution">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={[...experienceData]} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} outerRadius={65} innerRadius={30} paddingAngle={2} dataKey="value">
                        {experienceData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="#020617" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} candidates`, name]} contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </div>
          </div>
        )}

        {/* Candidates Tab */}
        {activeTab === "candidates" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Candidates</h2>
                <p className="mt-1 text-slate-400 text-sm">Review and manage applicants</p>
              </div>
              <div className="text-sm text-slate-400">
                Showing <span className="text-white font-medium">{filteredVideos.length}</span> of {videos.length}
              </div>
            </div>

            <FilterPanel filters={filters} onFilterChange={handleFilterChange} totalResults={filteredVideos.length} />

            {filteredVideos.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVideos.map((video) => (
                  <CandidateCard
                    key={video.id}
                    video={video}
                    isTopApplicant={topApplicants.includes(video.title)}
                    onSelect={() => onVideoSelect(video)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-slate-800/50 flex items-center justify-center">
                  <svg className="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-slate-300">No matching candidates</p>
                <p className="text-slate-500 text-sm mt-1">Try adjusting your filters</p>
              </div>
            )}
          </div>
        )}

        {/* Questions Tab */}
        {activeTab === "questions" && recruiterId && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white">Interview Questions</h2>
              <p className="mt-1 text-slate-400 text-sm">Manage questions for your interviews</p>
            </div>
            <InterviewQuestions recruiterId={recruiterId} />
          </div>
        )}
      </main>

      {/* Floating Chat */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isChatOpen && (
          <div className="w-80 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-800">
              <span className="text-sm font-medium text-white">AI Assistant</span>
              <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your pipeline..."
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
              />
              <button
                onClick={sendChat}
                disabled={isChatLoading || !chatInput.trim()}
                className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {isChatLoading ? "Thinking..." : "Send"}
              </button>
              {chatReply && (
                <div className="p-3 rounded-lg bg-slate-800/50 text-sm text-slate-300 whitespace-pre-wrap max-h-40 overflow-auto">
                  {chatReply}
                </div>
              )}
            </div>
          </div>
        )}
        <button
          onClick={() => setIsChatOpen((v) => !v)}
          className="w-11 h-11 rounded-xl bg-blue-600 text-white shadow-lg hover:bg-blue-500 flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Sub-components
const MetricCard = ({ value, label, color }: { value: number; label: string; color: "blue" | "emerald" | "indigo" | "amber" }) => {
  const colorMap = {
    blue: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
    indigo: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  };
  const c = colorMap[color];

  return (
    <div className={`rounded-xl ${c.bg} border ${c.border} p-4`}>
      <div className={`text-2xl font-semibold ${c.text}`}>{value}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
    </div>
  );
};

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl bg-slate-900/50 border border-slate-800/50 p-5">
    <h3 className="text-sm font-medium text-white mb-4">{title}</h3>
    {children}
  </div>
);

const CandidateCard = ({ video, isTopApplicant, onSelect }: { video: Video; isTopApplicant: boolean; onSelect: () => void }) => (
  <button
    onClick={onSelect}
    className={`w-full text-left rounded-xl p-4 transition-all group ${
      isTopApplicant
        ? "bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 hover:border-blue-500/30"
        : "bg-slate-900/50 border border-slate-800/50 hover:bg-slate-800/50 hover:border-slate-700/50"
    }`}
  >
    {isTopApplicant && (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
        Top Candidate
      </div>
    )}
    
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 text-sm font-medium shrink-0">
        {video.candidate_details?.full_name?.charAt(0) || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white text-sm truncate">{video.candidate_details?.full_name || video.title}</p>
        <p className="text-xs text-slate-500 truncate">{video.candidate_details?.email || ""}</p>
      </div>
    </div>

    {video.candidate_details?.experience && (
      <div className="mt-3 text-xs text-slate-500">
        {video.candidate_details.experience} years experience
      </div>
    )}

    <div className="mt-3 flex items-center justify-between">
      <span className="text-xs text-slate-600">
        {video.created_at ? new Date(video.created_at).toLocaleDateString() : ""}
      </span>
      <span className="text-xs text-blue-400 group-hover:text-blue-300 transition-colors flex items-center gap-1">
        View
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </span>
    </div>
  </button>
);

export default Dashboard;
