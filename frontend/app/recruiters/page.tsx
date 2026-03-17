"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/auth";
import { useRecruiterProfile } from "./hooks/useRecruiterProfile";
import { RecruiterProfileForm } from "./components/RecruiterProfileForm";
import { useTransition } from "react";
import Dashboard from "./components/Dashboard";
import VideoAnalysis from "./components/VideoAnalysis";
import {
  Video,
  CandidateInterview,
  InterviewAnswer,
  CandidateDetails,
  Analysis,
} from "./types";
import { useVideoAnalysis } from "./hooks/useVideoAnalysis";
import { getBackendUrl } from "@/utils/env";
import NewInterview from "./components/NewInterview";

const supabase = createClient();

export default function RecruitersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewIdParam = searchParams.get("interview") || null;


  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/recruiters/login");
  }, [router]);

  const { isLoading, showProfileForm, profileData, userEmail, updateProfile } =
    useRecruiterProfile();
  const [candidateInterviews, setCandidateInterviews] = useState<
    CandidateInterview[]
  >([]);
  const [legacyVideos, setLegacyVideos] = useState<Video[]>([]); // For backward compatibility
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<InterviewAnswer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<InterviewAnswer | null>(null);
  const [isPending, startTransition] = useTransition();
  const [newInterviewOpen, setNewInterviewOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const { analysis, isAnalyzing, analyzeVideo, analyzeAnswer } = useVideoAnalysis();
const [currentInterviewId, setCurrentInterviewId] = useState<number | null>(null);

const sendInvite = async () => {
  console.log("currentInterviewId: ", currentInterviewId);
  if (!inviteEmail.trim()) return;
  setInviteMessage(null);
  try {
    if (!currentUserId) {
      setInviteMessage("Unable to determine recruiter. Please log in again.");
      return;
    }

    if (!currentInterviewId) {
      setInviteMessage("No interview selected. Create a new interview first.");
      return;
    }
    

    const { data: interviewRow, error: interviewError } = await supabase
      .from("interview")
      .select("id, title")
      .eq("recruiter_id", currentUserId)
      .eq("id", currentInterviewId)
      .single();

    if (interviewError || !interviewRow) {
      setInviteMessage("Could not load interview. Please try again.");
      return;
    }

    // Generate a per-candidate invite code for interview_invites (candidate flow uses this table).
    const inviteCode = Math.floor(100000 + Math.random() * 900000);

    const payload = {
      email: inviteEmail.replace(/[\r\n]/g, "").trim(),
      invite_code: inviteCode,
      interview_id: Number(currentInterviewId),
      interview_title: interviewRow?.title || "Interview Invitation",
      recruiter_name: profileData?.full_name || "HireVision Recruiter",
    };

    console.log("payload: ", payload);

    const res = await fetch(`${getBackendUrl()}/send-interview-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errorMessage = "Failed to send invite";
      try {
        const errorBody = await res.json();
        const detail = errorBody?.detail ?? errorBody?.message ?? errorBody?.error;
        if (Array.isArray(detail)) {
          errorMessage = detail
            .map((d) => d?.msg || d?.message || (Array.isArray(d?.loc) ? `${d.loc.join(".")}: invalid` : "Invalid input"))
            .join("; ");
        } else if (typeof detail === "string") {
          console.log("errorMessage: ", errorMessage);
          errorMessage = detail;
        } else if (detail && typeof detail === "object") {
          errorMessage = JSON.stringify(detail);
        }
      } catch {
        // fallback to default error message below
      }
      throw new Error(errorMessage);
    }

    const data = await res.json();

    if (data.success) {
      setInviteMessage(data.message || "Invite sent successfully! 🎉");
      setInviteEmail("");
    } else {
      throw new Error(data.message || "Failed to send invite");
    }
  } catch (err: any) {
    console.error(err);
    setInviteMessage(err.message ?? "Error sending invite");
  }
};

const handleLogout = async () => {
  supabase.auth.signOut().catch(() => {});
  startTransition(() => {
    router.push("/recruiters/login");
  });
};

const handleVideoSelect = async (video: Video) => {
  setSelectedVideo(video);

  // Find all answers for this candidate in the candidateInterviews array
  const candidateId = video.id;
  const candidateInterview = candidateInterviews.find(
    (interview) => interview.candidate_id === candidateId
  );

  if (candidateInterview && candidateInterview.answers.length > 0) {
    // We have interview answers for this candidate
    setSelectedAnswers(candidateInterview.answers);

    // Set the first answer as the selected one and analyze it
    const firstAnswer = candidateInterview.answers[0];
    setSelectedAnswer(firstAnswer);
    await analyzeAnswer(firstAnswer);
  } else {
    // Fall back to the legacy behavior - analyze the video directly
    setSelectedAnswers([]);
    setSelectedAnswer(null);
    await analyzeVideo(video);
  }
};

  // New function to handle selection of specific answer
const handleAnswerSelect = (answer: any) => {
  const casted = answer as unknown as InterviewAnswer;
  setSelectedAnswer(casted);
  analyzeAnswer(casted);
};

const handleCloseAnalysis = () => {
  setSelectedVideo(null);
  setSelectedAnswers([]);
  setSelectedAnswer(null);
};

  useEffect(() => {
    const fetchCandidateInterviews = async () => {
      try {
        if (!currentUserId) {
          return;
        }
        console.log("Fetching interview data from Supabase...");

        // First check the connection to Supabase
        try {
          const { data: connectionTest, error: connectionError } =
            await supabase.from("profiles").select("count").limit(1);

          if (connectionError) {
            console.error("Supabase connection test failed:", connectionError);
            console.log(
              "Connection to Supabase failed, falling back to legacy method"
            );
            fetchLegacyVideos();
            return;
          }

          console.log("Supabase connection test successful:", connectionTest);
        } catch (connErr) {
          console.error("Supabase connection error:", connErr);
          fetchLegacyVideos();
          return;
        }

        // Load interviews owned by this recruiter so dashboard only shows relevant results.
        const { data: recruiterInterviews, error: recruiterInterviewsError } = await supabase
          .from("interview")
          .select("id, title")
          .eq("recruiter_id", currentUserId);

        if (recruiterInterviewsError) {
          console.error("Error fetching recruiter interviews:", recruiterInterviewsError);
          setCandidateInterviews([]);
          setLegacyVideos([]);
          return;
        }

        const allowedInterviewIds = (recruiterInterviews || []).map((item: any) => String(item.id));
        const interviewTitleById = new Map(
          (recruiterInterviews || []).map((item: any) => [String(item.id), item.title || "Untitled Interview"])
        );

        if (!interviewIdParam && allowedInterviewIds.length === 0) {
          setCandidateInterviews([]);
          setLegacyVideos([]);
          return;
        }

        // Fetch interview answers scoped to this recruiter's interviews.
        let answersCheckQuery = supabase
          .from("interview_answers")
          .select("*")
          .order("created_at", { ascending: false });
        if (interviewIdParam) {
          answersCheckQuery = answersCheckQuery.eq("interview_id", interviewIdParam);
        } else {
          answersCheckQuery = answersCheckQuery.in("interview_id", allowedInterviewIds);
        }
        const { data: allAnswers, error: answersError } = await answersCheckQuery;

        if (answersError) {
          console.error(
            "Error checking interview_answers table:",
            answersError
          );
          console.log("Falling back to legacy method due to table error");
          fetchLegacyVideos();
          return;
        }

        // Log the raw response
        console.log("Raw response from interview_answers table:", allAnswers);

        if (!allAnswers || allAnswers.length === 0) {
          if (!interviewIdParam) {
            console.log(
              "No interview answers found, falling back to legacy method"
            );
            fetchLegacyVideos();
            return;
          } else {
            // When filtering by a specific interview, don't fallback; show empty
            setCandidateInterviews([]);
            setLegacyVideos([]);
            return;
          }
        }

        console.log("Successfully found interview answers table with data");

        // Get unique user IDs using answer payload
        const uniqueUserIds = [...new Set(allAnswers.map((item) => item.user_id))];
        console.log(
          `Found ${uniqueUserIds.length} unique candidates with interviews`
        );

        if (uniqueUserIds.length === 0) {
          if (!interviewIdParam) {
            console.log(
              "No unique candidate IDs found, falling back to legacy method"
            );
            fetchLegacyVideos();
          } else {
            // When filtering by a specific interview, it's fine to be empty
            setCandidateInterviews([]);
            setLegacyVideos([]);
          }
          return;
        }

        // Fetch candidate profiles for these users when available.
        const { data: candidates, error: candidatesError } = await supabase
          .from("profiles")
          .select("*")
          .in("id", uniqueUserIds);

        if (candidatesError) {
          console.error("Error fetching candidate profiles:", candidatesError);
        }

        const profilesById = new Map((candidates || []).map((candidate: any) => [candidate.id, candidate]));
        console.log(`Found ${candidates?.length || 0} candidate profiles`);

        // Group answers by candidate and keep sample/test interview labels visible.
        const candidateInterviewsData: CandidateInterview[] = [];
        const videoObjects: Video[] = [];
        const answersByCandidate = new Map<string, any[]>();
        for (const answer of allAnswers) {
          const key = String(answer.user_id);
          if (!answersByCandidate.has(key)) {
            answersByCandidate.set(key, []);
          }
          answersByCandidate.get(key)!.push(answer);
        }

        for (const [candidateId, answers] of answersByCandidate.entries()) {
          const candidate = profilesById.get(candidateId);
          if (!answers || answers.length === 0) continue;

          const firstAnswer = answers[0];
          const interviewLabel = interviewTitleById.get(String(firstAnswer.interview_id)) || "Interview";

          const candidateDetails: CandidateDetails = {
            id: candidateId,
            full_name: candidate?.full_name || `Candidate ${candidateId.slice(0, 8)}`,
            email: candidate?.email || "",
            phone: candidate?.phone || "",
            experience: candidate?.experience || "",
            linkedin: candidate?.linkedin || "",
          };

          const processedAnswers: InterviewAnswer[] = answers.map((answer) => {
            // Prepare analysis object from the answer data
            const analysis: Analysis = {
              summary: answer.summary || "",
              behavioral_scores: answer.behavioral_scores,
              communication_analysis: answer.communication_analysis,
            };

            return {
              id: answer.id,
              user_id: answer.user_id,
              question_index: answer.question_index,
              question_text:
                answer.question_text || `Question ${answer.question_index + 1}`,
              video_url: answer.video_url,
              summary: answer.summary || "",
              transcript: answer.transcript,
              behavioral_scores: answer.behavioral_scores,
              communication_analysis: answer.communication_analysis,
              behavioral_insights: answer.behavioral_insights,
              created_at: answer.created_at,
              analysis: analysis,
            };
          });

          // Add candidate interview data
          candidateInterviewsData.push({
            candidate_id: candidateId,
            candidate_details: candidateDetails,
            answers: processedAnswers,
            created_at: answers[0].created_at,
            latest_answer_date: answers[0].created_at,
          });

          // Create a legacy Video object for the candidate (using the first answer's video)
          // This is needed for compatibility with the existing Dashboard component
          videoObjects.push({
            id: candidateId,
            title: `${candidateDetails.full_name} - ${interviewLabel}`,
            url: firstAnswer.video_url,
            created_at: firstAnswer.created_at,
            interview_id: firstAnswer.interview_id,
            interview_title: interviewLabel,
            candidate_details: candidateDetails,
          });
        }

        if (candidateInterviewsData.length === 0) {
          console.log(
            "No complete candidate interviews found, falling back to legacy method"
          );
          fetchLegacyVideos();
          return;
        }

        console.log(
          `Successfully processed ${candidateInterviewsData.length} candidate interviews`
        );
        setCandidateInterviews(candidateInterviewsData);
        setLegacyVideos(videoObjects);
      } catch (error) {
        console.error("Error in fetchCandidateInterviews:", error);
        console.log("Falling back to legacy method due to error");
        fetchLegacyVideos();
      }
    };

    // Legacy method - for backward compatibility
    const fetchLegacyVideos = async () => {
      try {
        console.log("Fetching legacy video data from profiles...");
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("*")
          .not("video_url", "is", null);

        if (error) {
          console.error("Error fetching profiles:", error);
          return;
        }

        console.log(`Found ${profiles.length} profiles with video_url`);

        // Transform profiles into Video objects
        const videoData: Video[] = profiles.map((profile) => ({
          id: profile.id,
          title: `${profile.full_name}'s Interview`,
          url: profile.video_url || "",
          created_at: profile.created_at,
          candidate_details: {
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone || "",
            experience: profile.experience || "",
            linkedin: profile.linkedin || "",
          },
        }));

        setLegacyVideos(videoData);
      } catch (error) {
        console.error("Error in fetchLegacyVideos:", error);
      }
    };

    fetchCandidateInterviews();
  }, [interviewIdParam, currentUserId]);

  // Get current user ID
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getUser();
  }, []);

  useEffect(() => {
    const fetchLatestInterviewId = async () => {
      if (!currentUserId) return;
      try {
        const { data, error } = await supabase
          .from("interview")
          .select("id")
          .eq("recruiter_id", currentUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (!error && data?.id) {
          setCurrentInterviewId(data.id);
        }
      } catch {
        // best-effort lookup for latest interview id
      }
    };
    if (!currentInterviewId) {
      fetchLatestInterviewId();
    }
  }, [currentUserId, currentInterviewId]);

  // Show loading state while profile data is being fetched
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  // Show profile form if the recruiter hasn't completed their profile
  if (showProfileForm) {
    return (
      <RecruiterProfileForm
        onSubmit={updateProfile}
        profileData={profileData}
      />
    );
  }

  // Define top applicants based on most recent interviews
  const topApplicants =
    candidateInterviews.length > 0
      ? candidateInterviews
        .slice(0, 2)
        .map((interview) => interview.candidate_details.full_name)
      : legacyVideos
        .slice(0, 2)
        .map((video) => video.candidate_details?.full_name || "Unknown");

  // Choose which videos array to use based on whether we have new format data
  const videosToUse = legacyVideos; // Always use legacy format for Dashboard component compatibility

  return (
    <div className="min-h-screen bg-gray-900">

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 w-full max-w-md rounded-xl p-8 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">
              Invite a Candidate
            </h3>

            <input
              type="email"
              placeholder="candidate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
            />

            {
              <p className="mt-2 text-sm text-center text-gray-300">
                {inviteMessage}
              </p>
            }

            <div className="mt-6 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setInviteOpen(false);
                  setInviteMessage(null);
                  setInviteEmail("");
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
              >
                Close
              </button>
              <button
                onClick={sendInvite}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
              >
                Invite Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {newInterviewOpen && (
        <NewInterview
          onClose={() => setNewInterviewOpen(false)}
          recruiterId={currentUserId}
          companyNumber={profileData?.company_number || ""}
          onCreated = {(interview) => {
            setCurrentInterviewId(interview.id);
          }}
        />
      )}

      {selectedVideo ? (
        <VideoAnalysis
          video={selectedVideo}
          candidateAnswers={selectedAnswers}
          analysis={analysis}
          isAnalyzing={isAnalyzing}
          onClose={handleCloseAnalysis}
          onAnswerSelect={handleAnswerSelect}
          recruiterId={currentUserId}
        />
      ) : (
        <Dashboard
          videos={videosToUse}
          topApplicants={topApplicants}
          onVideoSelect={handleVideoSelect}
          onOpenInvite={() => setInviteOpen(true)}
          onNewInterview={() => setNewInterviewOpen(true)}
          onBackClick={() => router.push("/recruiter-dashboard")}
          recruiterName={profileData?.full_name}
          recruiterEmail={userEmail || undefined}
          recruiterId={currentUserId || undefined}
        />
      )}
    </div>
  );
}
