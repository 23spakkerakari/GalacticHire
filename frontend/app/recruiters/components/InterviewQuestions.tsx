"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/auth";

interface Question {
  id: string;
  question: string;
  order_index: number;
  interview_id: string;
  interview?: { recruiter_id: string };
}

interface InterviewQuestionsProps {
  recruiterId: string;
  theme?: "dark" | "light";
}

export default function InterviewQuestions({ recruiterId, theme = "dark" }: InterviewQuestionsProps) {
  const supabase = createClient();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme-aware classes
  const t = {
    cardBg: theme === "dark" ? "bg-slate-900/50 border-slate-800/50" : "bg-white border-gray-200",
    innerBg: theme === "dark" ? "bg-slate-800/30 border-slate-800/50 hover:bg-slate-800/50 hover:border-slate-700/50" : "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300",
    inputBg: theme === "dark" ? "bg-slate-900/50 border-slate-700/50" : "bg-white border-gray-300",
    emptyBg: theme === "dark" ? "bg-slate-800/20 border-slate-700/50" : "bg-gray-50 border-gray-300",
    textPrimary: theme === "dark" ? "text-white" : "text-gray-900",
    textSecondary: theme === "dark" ? "text-slate-400" : "text-gray-600",
    textMuted: theme === "dark" ? "text-slate-500" : "text-gray-500",
    textPlaceholder: theme === "dark" ? "placeholder-slate-500" : "placeholder-gray-400",
  };

  useEffect(() => {
    async function fetchQuestions() {
      setLoading(true);
      const { data, error } = await supabase
        .from("interview_questions")
        .select("*, interview:interview_id(recruiter_id)")
        .order("order_index");
      if (error) {
        setError(error.message);
      } else {
        const filtered = (data || []).filter(q => q.interview && q.interview.recruiter_id === recruiterId);
        setQuestions(filtered);
      }
      setLoading(false);
    }
    if (recruiterId) fetchQuestions();
  }, [recruiterId]);

  const addQuestion = async () => {
    if (!newQuestion.trim()) return;
    setLoading(true);
    setError(null);
    
    let interviewId: string | null = null;
    const { data: interviews, error: interviewError } = await supabase
      .from("interview")
      .select("id")
      .eq("recruiter_id", recruiterId)
      .limit(1);
    
    if (interviewError) {
      setError(interviewError.message);
      setLoading(false);
      return;
    }
    
    if (interviews && interviews.length > 0) {
      interviewId = interviews[0].id;
    } else {
      const { data: newInterview, error: createError } = await supabase
        .from("interview")
        .insert({ recruiter_id: recruiterId, invite_code: Math.floor(Math.random() * 1000000000) })
        .select()
        .single();
      if (createError) {
        setError(createError.message);
        setLoading(false);
        return;
      }
      interviewId = newInterview.id;
    }
    
    const { data: questionData, error: questionError } = await supabase
      .from("interview_questions")
      .insert([{ interview_id: interviewId, question: newQuestion }])
      .select()
      .single();
    
    if (questionError) {
      setError(questionError.message);
    } else if (questionData) {
      setQuestions([...questions, questionData]);
      setNewQuestion("");
    }
    setLoading(false);
  };

  const deleteQuestion = async (id: string) => {
    setLoading(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from("interview_questions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    }
    setLoading(false);
  };

  return (
    <div className={`rounded-xl border p-5 transition-colors ${t.cardBg}`}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className={`text-sm font-medium ${t.textPrimary}`}>Questions</h3>
            <p className={`text-xs ${t.textMuted}`}>Craft focused prompts for candidates</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-md text-xs ${theme === "dark" ? "bg-slate-800/50 border border-slate-700/50 text-slate-400" : "bg-gray-100 border border-gray-200 text-gray-600"}`}>
          {questions.length} {questions.length === 1 ? "question" : "questions"}
        </span>
      </div>

      {loading && questions.length === 0 ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`h-12 rounded-lg animate-pulse ${theme === "dark" ? "bg-slate-800/30" : "bg-gray-200"}`} />
          ))}
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
              {error}
            </div>
          )}

          {questions.length === 0 ? (
            <div className={`py-10 text-center rounded-lg border border-dashed ${t.emptyBg}`}>
              <div className={`w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center ${theme === "dark" ? "bg-slate-800/50" : "bg-gray-200"}`}>
                <svg className={`w-5 h-5 ${t.textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className={`text-sm ${t.textPrimary}`}>No questions yet</p>
              <p className={`text-xs mt-1 ${t.textMuted}`}>Add your first interview question below</p>
            </div>
          ) : (
            <div className="space-y-2 mb-5">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className={`group flex items-start gap-3 p-3 rounded-lg border transition-colors ${t.innerBg}`}
                >
                  <div className="w-6 h-6 shrink-0 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xs font-medium text-blue-500">
                    {idx + 1}
                  </div>
                  <p className={`flex-1 text-sm leading-relaxed pt-0.5 ${t.textSecondary}`}>{q.question}</p>
                  <button
                    type="button"
                    aria-label="Remove question"
                    onClick={() => deleteQuestion(q.id)}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${t.textMuted} hover:text-red-500`}
                    disabled={loading}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-slate-800/20 border border-slate-800/50" : "bg-gray-50 border border-gray-200"}`}>
            <label htmlFor="new-question" className={`block text-xs font-medium mb-2 ${t.textSecondary}`}>
              Add a question
            </label>
            <div className="flex gap-2">
              <input
                id="new-question"
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                placeholder="e.g., Describe a challenging project you led..."
                className={`flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-blue-500/50 transition-colors ${t.inputBg} ${t.textPrimary} ${t.textPlaceholder}`}
              />
              <button
                onClick={addQuestion}
                disabled={loading || !newQuestion.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
            <p className={`mt-2 text-xs ${theme === "dark" ? "text-slate-600" : "text-gray-400"}`}>Press Enter to add quickly</p>
          </div>
        </>
      )}
    </div>
  );
}
