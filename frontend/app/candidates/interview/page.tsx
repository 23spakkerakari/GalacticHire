"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/utils/auth";
import { getBackendUrl } from "@/utils/env";
import { ProfileForm } from "../components/ProfileForm";
import { VideoPreview } from "../components/VideoPreview";
import { RecordingControls } from "../components/RecordingControls";
import { useVideoRecording } from "@/hooks/useVideoRecording";
import { useSupabaseUpload } from "@/hooks/useSupabaseUpload";
import { useProfile } from "@/hooks/useProfile";
import type { ProfileFormData } from "@/types/candidate";
import { AudioLevelMeter } from "../components/AudioLevelMeter";
import { DeviceSelector } from "../components/DeviceSelector";
import React from "react";

const supabase = createClient();
const QUESTION_CACHE_KEY_PREFIX = "hirevision:interview-questions";
const SAMPLE_INTERVIEW_FALLBACK_QUESTIONS = [
  "Tell me about yourself and what excites you most about this role.",
  "Describe a challenging project you worked on and how you approached solving it.",
  "Why do you want to join our company, and what impact do you hope to make in your first 90 days?",
];

interface QuestionCachePayload {
  interviewQuestions: string[];
  profileQuestions: string[];
  updatedAt: string;
}

export default function InterviewSession() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get('interview_id');

  // Interview state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [recordedAnswers, setRecordedAnswers] = useState<Record<number, Blob>>({});
  const [isAnswerRecorded, setIsAnswerRecorded] = useState<boolean>(false);
  const [isInterviewFinished, setIsInterviewFinished] = useState<boolean>(false);
  const [isAnalysisComplete, setIsAnalysisComplete] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [isQuestionsLoading, setIsQuestionsLoading] = useState<boolean>(true);
  const [usedPersonalized, setUsedPersonalized] = useState<boolean>(false);
  const [isSampleInterviewSession, setIsSampleInterviewSession] = useState(false);
  const [showConfirmFinishModal, setShowConfirmFinishModal] = useState(false);
  const [hasConfirmedFinish, setHasConfirmedFinish] = useState(false);
  const [showCameraDuringInterview, setShowCameraDuringInterview] = useState(true);

  const normalizeQuestions = (raw: any): string[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((q: any) => (typeof q === "string" ? q : q?.question))
      .filter((q: any) => typeof q === "string" && q.trim().length > 0);
  };

  const getQuestionCacheKey = (userId: string, currentInterviewId: string) =>
    `${QUESTION_CACHE_KEY_PREFIX}:${userId}:${currentInterviewId}`;

  const readQuestionCache = (userId: string, currentInterviewId: string): QuestionCachePayload | null => {
    try {
      const raw = sessionStorage.getItem(getQuestionCacheKey(userId, currentInterviewId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as QuestionCachePayload;
      if (!Array.isArray(parsed.interviewQuestions) || !Array.isArray(parsed.profileQuestions)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const writeQuestionCache = (
    userId: string,
    currentInterviewId: string,
    interviewQuestions: string[],
    profileQuestions: string[],
  ) => {
    const payload: QuestionCachePayload = {
      interviewQuestions,
      profileQuestions,
      updatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(getQuestionCacheKey(userId, currentInterviewId), JSON.stringify(payload));
  };

  const fetchInterviewQuestionList = async (currentInterviewId: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from("interview")
      .select("title, questions")
      .eq("id", currentInterviewId)
      .single();

    if (error) {
      console.error("Error retrieving questions from supabase:", error.message);
      setIsSampleInterviewSession(false);
      return [];
    }

    const interviewQuestions = normalizeQuestions(data?.questions);
    const interviewTitle = String(data?.title || "").toLowerCase();
    const isSampleInterview = interviewTitle.includes("sample") || interviewTitle.includes("test");
    setIsSampleInterviewSession(isSampleInterview);

    if (interviewQuestions.length === 0 && isSampleInterview) {
      return SAMPLE_INTERVIEW_FALLBACK_QUESTIONS;
    }

    return interviewQuestions;
  };

  const fetchProfileQuestionList = async (userId: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("questions")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error retrieving profile questions from supabase:", error.message);
      return [];
    }

    return normalizeQuestions(data?.questions);
  };

  const loadAndCacheQuestionSets = async (
    userId: string,
    currentInterviewId: string,
    forceRefresh = false,
  ): Promise<QuestionCachePayload> => {
    const cached = readQuestionCache(userId, currentInterviewId);
    if (cached && !forceRefresh) return cached;

    try {
      const [interviewQuestions, profileQuestions] = await Promise.all([
        fetchInterviewQuestionList(currentInterviewId),
        fetchProfileQuestionList(userId),
      ]);

      writeQuestionCache(userId, currentInterviewId, interviewQuestions, profileQuestions);
      return {
        interviewQuestions,
        profileQuestions,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return cached || {
        interviewQuestions: [],
        profileQuestions: [],
        updatedAt: new Date().toISOString(),
      };
    }
  };

  const fetchInterviewQuestions = async () => {
    if (!interviewId) return;
    const list = await fetchInterviewQuestionList(interviewId);
    setQuestions(list.length > 0 ? list : SAMPLE_INTERVIEW_FALLBACK_QUESTIONS);
    setIsQuestionsLoading(false);
  };

  // On interview start, load both question sets for this user and interview from cache/network.
  const startInterview = async () => {
    if (!isCameraActive) {
      await activateCamera();
    }
    setIsInterviewStarted(true);
    setIsQuestionsLoading(true);
    const currentInterviewId = interviewId;
    const userId = (await supabase.auth.getUser()).data.user?.id || null;

    if (!currentInterviewId) {
      setQuestions([]);
      setUsedPersonalized(false);
      setIsQuestionsLoading(false);
      return;
    }

    if (!userId) {
      const fallbackQuestions = await fetchInterviewQuestionList(currentInterviewId);
      setQuestions(fallbackQuestions);
      setUsedPersonalized(false);
      setIsQuestionsLoading(false);
      return;
    }

    const { interviewQuestions, profileQuestions } = await loadAndCacheQuestionSets(userId, currentInterviewId, true);
    const selectedQuestions = profileQuestions.length > 0
      ? profileQuestions
      : interviewQuestions.length > 0
        ? interviewQuestions
        : SAMPLE_INTERVIEW_FALLBACK_QUESTIONS;
    setQuestions(selectedQuestions);
    setUsedPersonalized(profileQuestions.length > 0);
    setIsQuestionsLoading(false);
  };

  useEffect(() => {
    setIsQuestionsLoading(true);
    fetchInterviewQuestions();
  }, [interviewId]);

  useEffect(() => {
    if (!isInterviewStarted) {
      initializeCamera();
    }
    // Optionally, clean up camera on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isInterviewStarted]);

  const {
    isRecording,
    recordingTime,
    isLoading: cameraLoading,
    cameraError,
    streamRef,
    startRecording,
    stopRecording,
    initializeCamera,
  } = useVideoRecording(
    isCameraActive,
    selectedVideoDeviceId,
    selectedAudioDeviceId
  );

  const { isUploading, uploadProgress, uploadVideo } = useSupabaseUpload();

  const { isLoading, showProfileForm, profileData, userEmail, updateProfile, updateVideoUrl } = useProfile();
  const handleProfileSubmit = async (formData: ProfileFormData): Promise<void> => {
    await updateProfile(formData);
  };

  const activateCamera = async () => {
    setIsCameraActive(true);
    await initializeCamera();
  };

  const handleVideoDeviceChange = async (deviceId: string) => {
    setSelectedVideoDeviceId(deviceId);
    if (isCameraActive) {
      await initializeCamera();
    }
  };

  const handleAudioDeviceChange = async (deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
    if (isCameraActive) {
      await initializeCamera();
    }
  };

  const handleStopAnswerRecording = async () => {
    const videoBlob = await stopRecording();
    setRecordedAnswers((prev) => ({
      ...prev,
      [currentQuestionIndex]: videoBlob,
    }));
    setIsAnswerRecorded(true);
    const { signedUrl: newSignedUrl } = await uploadVideo(videoBlob);
    if (newSignedUrl) {
      setSignedUrl(newSignedUrl);
      setTimeout(() => setShowPreview(true), 300);
      console.log("Preview video URL:", newSignedUrl);
    }
  };

  const handleNextQuestion = () => {
    setCurrentQuestionIndex((prev) => prev + 1);
    setIsAnswerRecorded(false);
    setSignedUrl(null);
    setShowPreview(false);
  };

  const markInterviewCompleted = async (interviewId: string, userId: string) => {
    const { error } = await supabase
      .from("interview_participants")
      .update({
        completed: true,
      })
      .eq("interview_id", interviewId)
      .eq("user_id", userId);
    if (error) {
      console.error("Error marking interview as completed:", error);
    }
  };

  const handleFinishInterview = async () => {
    setIsInterviewFinished(true);
    setProcessingStatus("Uploading and analyzing your interview responses...");
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const completedAt = new Date().toISOString();
    let completedUploads = 0;
    let failedUploads = 0;
    for (const [questionIndex, videoBlob] of Object.entries(recordedAnswers)) {
      try {
        const { publicUrl, signedUrl: newSignedUrl, filename } = await uploadVideo(videoBlob);
        if (publicUrl && newSignedUrl) {
          const response = await fetch(`${getBackendUrl()}/analyze-video`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              video_url: newSignedUrl,
              user_id: userId,
              question_index: parseInt(questionIndex),
              question_text: questions[parseInt(questionIndex)],
              interview_id: interviewId,
            }),
          });
          if (response.ok) {
            completedUploads++;
            setProcessingStatus(
              `Processed ${completedUploads} of ${Object.keys(recordedAnswers).length} responses...`
            );
          } else {
            failedUploads++;
            const errBody = await response.json().catch(() => null);
            console.error(
              `Failed processing question ${questionIndex}:`,
              errBody?.detail || response.statusText
            );
          }
        } else {
          failedUploads++;
        }
      } catch (error) {
        failedUploads++;
        console.error(`Error processing answer for question ${questionIndex}:`, error);
      }
    }
    if (failedUploads > 0) {
      setIsAnalysisComplete(false);
      setProcessingStatus(
        `Processed ${completedUploads} responses, but ${failedUploads} failed. Please retry this interview.`
      );
      return;
    }

    setIsAnalysisComplete(true);
    setProcessingStatus("All responses have been uploaded and sent for analysis!");
    // Normal interviews become completed. Sample interviews keep one active row
    // and add a completed copy for each attempt so testing history accumulates.
    if (interviewId && userId && isSampleInterviewSession) {
      try {
        const response = await fetch(`${getBackendUrl()}/record-sample-interview-completion`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            interview_id: interviewId,
            user_id: userId,
            completed_at: completedAt,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          console.error(
            `Error inserting sample completion for interview ${interviewId}:`,
            errorBody?.detail || response.statusText
          );
        } else {
          console.log(`Successfully stored sample completion copy for interview ${interviewId}`);
        }
      } catch (error) {
        console.error("Error storing sample interview completion copy:", error);
      }
    } else if (interviewId && userId) {
      try {
        const { error: updateError } = await supabase
          .from("interview_participants")
          .update({
            completed: true,
          })
          .eq("interview_id", interviewId)
          .eq("user_id", userId);
        if (updateError) {
          console.error(`Error updating interview ${interviewId}:`, updateError);
        } else {
          console.log(`Successfully marked interview ${interviewId} as completed`);
        }
      } catch (error) {
        console.error("Error updating interview completion status:", error);
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setTimeout(() => {
      router.push("/candidates/thank-you");
    }, 3000);
  };

  const handleFinishClick = () => {
    setShowConfirmFinishModal(true);
  };

  const handleConfirmFinish = async () => {
    setShowConfirmFinishModal(false);
    setHasConfirmedFinish(true);
    await handleFinishInterview();
  };

  const handleCancelFinish = () => {
    setShowConfirmFinishModal(false);
  };

  if (!interviewId) {
    return <div>Missing interview ID in URL.</div>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  if (showProfileForm) {
    return (
      <ProfileForm onSubmit={handleProfileSubmit} profileData={profileData || undefined} />
    );
  }

  return (
    <Suspense fallback={<div>Loading interview...</div>}>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-gray-900/80 rounded-2xl shadow-2xl p-8">
          {!isInterviewStarted ? (
            <div>
              <h2 className="text-2xl text-white/90 font-medium mb-4 text-center">
                You're about to start your interview
              </h2>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-8">
                <h3 className="text-blue-300 font-medium flex items-center text-lg mb-2">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Important Tips:
                </h3>
                <ul className="text-white/70 space-y-2 pl-7 list-disc">
                  <li>Find a quiet place with good lighting.</li>
                  <li>Test your camera and microphone.</li>
                  <li>Speak clearly and maintain good posture.</li>
                  <li>You'll answer {questions.length} questions one at a time.</li>
                  <li>You can review each recording before moving to the next question.</li>
                </ul>
              </div>
              {/* Device/camera/mic check only before interview starts */}
              <div className="mb-6">
                <DeviceSelector
                  selectedVideoDeviceId={selectedVideoDeviceId}
                  selectedAudioDeviceId={selectedAudioDeviceId}
                  onVideoDeviceChange={handleVideoDeviceChange}
                  onAudioDeviceChange={handleAudioDeviceChange}
                />
              </div>
              <div className="mb-6">
                <VideoPreview
                  stream={streamRef.current}
                  recordedUrl={signedUrl}
                  isLoading={cameraLoading}
                  error={cameraError}
                />
                {streamRef.current && !cameraError && !cameraLoading && (
                  <AudioLevelMeter stream={streamRef.current} />
                )}
              </div>
              {/* Only show Begin Interview button if not finished/confirmed */}
              {(!hasConfirmedFinish && !isInterviewFinished) && (
                <button
                  onClick={startInterview}
                  className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold shadow-lg hover:from-blue-700 hover:to-purple-700 transition-all"
                >
                  Begin Interview
                </button>
              )}
            </div>
          ) : (
            <div>
              {isQuestionsLoading ? (
                <div className="text-gray-400 text-center py-8">Loading questions...</div>
              ) : (
                <div className="mb-6">
                  {usedPersonalized && (
                    <div className="mb-2 text-green-400 text-sm text-center">These questions are personalized based on your resume.</div>
                  )}
                  <div className="text-lg font-semibold text-white mb-2">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </div>
                  <div className="text-xl text-blue-300 font-bold mb-4">
                    {questions[currentQuestionIndex]}
                  </div>
                </div>
              )}
              {/* Camera preview and toggle during interview */}
              <div className="mb-4 flex flex-col items-end">
                {showCameraDuringInterview && (
                  <VideoPreview
                    stream={streamRef.current}
                    recordedUrl={null}
                    isLoading={cameraLoading}
                    error={cameraError}
                  />
                )}
                <button
                  className="mt-2 px-4 py-1 text-xs rounded bg-gray-700 text-white hover:bg-gray-600 focus:outline-none"
                  onClick={() => setShowCameraDuringInterview((prev) => !prev)}
                >
                  {showCameraDuringInterview ? "Hide Camera" : "Show Camera"}
                </button>
              </div>
              {/* Only show RecordingControls and Back button if not finished/confirmed */}
              {(!hasConfirmedFinish && !isInterviewFinished) && (
                <>
                  <RecordingControls
                    isRecording={isRecording}
                    recordingTime={recordingTime}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    onStartRecording={startRecording}
                    onStopRecording={handleStopAnswerRecording}
                    onGoBack={() => router.push("/candidates")}
                  />
                </>
              )}
              {isAnswerRecorded && !isRecording && !isUploading && !hasConfirmedFinish && !isInterviewFinished && (
                <div className="flex justify-end mt-6">
                  {currentQuestionIndex < questions.length - 1 ? (
                    <button
                      onClick={handleNextQuestion}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 transition-all"
                    >
                      Next Question
                    </button>
                  ) : (
                    <button
                      onClick={handleFinishClick}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold shadow hover:bg-green-700 transition-all"
                    >
                      Finish Interview
                    </button>
                  )}
                </div>
              )}
              {showConfirmFinishModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50">
                  <div className="bg-gray-900 rounded-xl p-8 shadow-xl text-center">
                    <div className="text-white text-lg mb-4">Are you sure you want to finish and submit your interview? You won't be able to make changes after this.</div>
                    <div className="flex justify-center gap-4">
                      <button
                        onClick={handleConfirmFinish}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold shadow hover:bg-green-700 transition-all"
                      >
                        Yes, Submit
                      </button>
                      <button
                        onClick={handleCancelFinish}
                        className="px-6 py-2 bg-gray-600 text-white rounded-lg font-semibold shadow hover:bg-gray-700 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {(hasConfirmedFinish || isInterviewFinished) && (
                <div className="mt-8 text-center text-blue-300 font-medium animate-pulse">
                  {processingStatus || "Processing your interview. Please wait..."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Suspense>
  );
} 