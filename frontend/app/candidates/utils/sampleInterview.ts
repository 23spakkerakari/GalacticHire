export const SAMPLE_INTERVIEW_TITLE_FILTER = "title.ilike.%sample%,title.ilike.%test%";

export interface SampleInterviewRow {
  id: string;
  title?: string | null;
  scheduled_date?: string | null;
  company?: string | null;
}

export async function getLatestSampleInterview(
  supabase: any
): Promise<SampleInterviewRow | null> {
  const { data } = await supabase
    .from("interview")
    .select("id, title, scheduled_date, company")
    .or(SAMPLE_INTERVIEW_TITLE_FILTER)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as SampleInterviewRow | null) || null;
}

export async function ensureLatestSampleInterviewParticipant(
  supabase: any,
  userId: string
): Promise<void> {
  const sampleInterview = await getLatestSampleInterview(supabase);

  if (!sampleInterview?.id) {
    return;
  }

  const { data: existingParticipant } = await supabase
    .from("interview_participants")
    .select("id, completed")
    .eq("interview_id", sampleInterview.id)
    .eq("user_id", userId)
    .eq("completed", false)
    .maybeSingle();

  if (existingParticipant?.id) {
    return;
  }

  await supabase.from("interview_participants").insert({
    interview_id: sampleInterview.id,
    user_id: userId,
    status: "active",
    joined_at: new Date().toISOString(),
    completed: false,
  });
}
