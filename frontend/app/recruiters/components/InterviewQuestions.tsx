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
}

export default function InterviewQuestions({ recruiterId }: InterviewQuestionsProps) {
  const supabase = createClient();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="rounded-xl bg-slate-900/50 border border-slate-800/50 p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Questions</h3>
            <p className="text-xs text-slate-500">Craft focused prompts for candidates</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-md bg-slate-800/50 border border-slate-700/50 text-xs text-slate-400">
          {questions.length} {questions.length === 1 ? "question" : "questions"}
        </span>
      </div>

      {loading && questions.length === 0 ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-800/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {questions.length === 0 ? (
            <div className="py-10 text-center rounded-lg bg-slate-800/20 border border-dashed border-slate-700/50">
              <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-slate-800/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-slate-300 text-sm">No questions yet</p>
              <p className="text-xs text-slate-500 mt-1">Add your first interview question below</p>
            </div>
          ) : (
            <div className="space-y-2 mb-5">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="group flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-800/50 hover:bg-slate-800/50 hover:border-slate-700/50 transition-colors"
                >
                  <div className="w-6 h-6 shrink-0 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xs font-medium text-blue-400">
                    {idx + 1}
                  </div>
                  <p className="flex-1 text-slate-300 text-sm leading-relaxed pt-0.5">{q.question}</p>
                  <button
                    type="button"
                    aria-label="Remove question"
                    onClick={() => deleteQuestion(q.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-red-400"
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

          <div className="p-4 rounded-lg bg-slate-800/20 border border-slate-800/50">
            <label htmlFor="new-question" className="block text-xs font-medium text-slate-400 mb-2">
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
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              <button
                onClick={addQuestion}
                disabled={loading || !newQuestion.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600">Press Enter to add quickly</p>
          </div>
        </>
      )}
    </div>
  );
}
