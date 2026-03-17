from datetime import datetime
import os
import requests
import pdfplumber


def _normalize_question_texts(raw_questions) -> list[str]:
    """Normalize question payloads into a clean list of strings."""
    if not isinstance(raw_questions, list):
        return []

    normalized: list[str] = []
    for item in raw_questions:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = str(item.get("question", "")).strip()
        else:
            text = ""
        if text:
            normalized.append(text)
    return normalized


def _merge_unique_questions(existing_questions, generated_questions: list[str]) -> list[str]:
    """Append generated questions while preventing case-insensitive duplicates."""
    merged: list[str] = []
    seen: set[str] = set()

    for question in _normalize_question_texts(existing_questions) + _normalize_question_texts(generated_questions):
        key = question.lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(question)

    return merged


def generate_resume_questions_and_sync_profile(
    *,
    supabase,
    user_id: str,
    resume_question_generator,
) -> dict:
    """Generate resume questions, persist them, and sync profiles.questions."""
    result = (
        supabase.table("resumes")
        .select("id, file_path, original_name, uploaded_at")
        .eq("user_id", user_id)
        .order("uploaded_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data or len(result.data) == 0:
        return {"error": "No resume found for this user."}

    resume = result.data[0]
    pdf_url = resume["file_path"]

    pdf_response = requests.get(pdf_url)
    if pdf_response.status_code != 200:
        return {"error": f"Failed to download PDF from storage. Status code: {pdf_response.status_code}"}

    with open("temp_resume.pdf", "wb") as f:
        f.write(pdf_response.content)
    try:
        with pdfplumber.open("temp_resume.pdf") as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    finally:
        os.remove("temp_resume.pdf")

    if not text.strip():
        return {"error": "Could not extract text from the PDF."}

    job_desc_result = (
        supabase.table("job_descriptions")
        .select("description")
        .eq("recruiter_id", user_id)
        .limit(1)
        .execute()
    )
    job_description = ""
    if getattr(job_desc_result, "data", None):
        job_description = job_desc_result.data[0].get("description", "") or ""

    questions = resume_question_generator(text, job_description, num_questions=3)
    if not questions:
        return {"error": "No questions could be generated from the resume."}

    generated_question_texts = _normalize_question_texts(questions)

    for idx, question in enumerate(questions):
        supabase.table("resume_questions").insert(
            {
                "user_id": user_id,
                "question_index": idx,
                "question_text": question["question"],
                "created_at": datetime.now().isoformat(),
            }
        ).execute()

    profile_result = (
        supabase.table("profiles").select("questions").eq("id", user_id).limit(1).execute()
    )
    existing_questions = []
    if getattr(profile_result, "data", None):
        existing_questions = profile_result.data[0].get("questions") or []

    merged_questions = _merge_unique_questions(existing_questions, generated_question_texts)
    supabase.table("profiles").upsert(
        {
            "id": user_id,
            "questions": merged_questions,
            "updated_at": datetime.utcnow().isoformat(),
        }
    ).execute()

    return {"questions": questions}
