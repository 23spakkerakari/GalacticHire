from datetime import datetime, timedelta
import io
import re
import assemblyai as aai  
from supabase import create_client, Client
from openai import OpenAI
from dotenv import load_dotenv
import os
import time
import math
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import spacy
import json
from services.sentiment import summarize_text, analyze_communication, generate_behavioral_insights
from services.resume_questions_service import generate_resume_questions_and_sync_profile
import requests
import subprocess
import librosa
import numpy as np
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests as httpx
import pdfplumber

load_dotenv()
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
OPEN_AI_API_KEY = os.getenv("OPEN_AI_API_KEY")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

aai.settings.api_key = ASSEMBLYAI_API_KEY
transcriber = aai.Transcriber()
client = OpenAI(api_key=OPEN_AI_API_KEY)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
nlp = spacy.load("en_core_web_sm")

def get_current_user_id(req: Request) -> str:
    """Resolve current user id (UUID) via Supabase Auth /auth/v1/user.
    Requires Authorization: Bearer <access_token> header from the client.
    """
    auth = req.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = auth.split(" ", 1)[1]

    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_KEY,
            },
            timeout=5,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Auth service unavailable")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user_json = resp.json()
        return user_json["id"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth response")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InterviewInvite(BaseModel):
    email: EmailStr
    invite_code: int
    interview_title: str
    recruiter_name: str
    interview_id: int | None = None


def upsert_interview_invite(invite: InterviewInvite) -> None:
    """
    Upsert `interview_invites` by (email, interview_id) when interview_id is provided.
    Raises HTTPException on failure.
    """
    now_iso = datetime.now().isoformat()

    if not invite.interview_id:
        raise HTTPException(status_code=400, detail="Missing interview_id in request body")

    existing = supabase.table("interview_invites") \
        .select("id") \
        .eq("email", invite.email) \
        .eq("interview_id", invite.interview_id) \
        .limit(1) \
        .execute()

    if getattr(existing, "error", None):
        raise HTTPException(status_code=500, detail=f"Supabase select failed: {existing.error}")

    if getattr(existing, "data", None):
        existing_id = existing.data[0]["id"]
        result = supabase.table("interview_invites").update({
            "invite_code": invite.invite_code,
            "status": "pending",
            "created_at": now_iso,
        }).eq("id", existing_id).execute()
        print(f"[invite-upsert][update] id={existing_id} data={getattr(result, 'data', None)} error={getattr(result, 'error', None)}")
        if getattr(result, "error", None):
            raise HTTPException(status_code=500, detail=f"Supabase update failed: {result.error}")
        return

    result = supabase.table("interview_invites").insert({
        "interview_id": invite.interview_id,
        "email": invite.email,
        "invite_code": invite.invite_code,
        "status": "pending",
        "created_at": now_iso,
    }).execute()
    print(f"[invite-upsert][insert] data={getattr(result, 'data', None)} error={getattr(result, 'error', None)}")
    if getattr(result, "error", None):
        raise HTTPException(status_code=500, detail=f"Supabase insert failed: {result.error}")
    return

class VideoURL(BaseModel):
    video_url: str
    user_id: str = None
    question_index: int = None
    question_text: str = None
    interview_id: str = None

class ResumeText(BaseModel):
    resume_text: str
    user_id: str = None

class ResumeQuestionsRequest(BaseModel):
    user_id: str

class GetPersonalizedQuestionsRequest(BaseModel):
    user_id: str

class RecruiterChatRequest(BaseModel):
    prompt: str
    recruiter_id: str | None = None

class ResumeRelevanceRequest(BaseModel):
    candidate_id: str
    recruiter_id: str
    max_items: int | None = 6

class ResumeQualityRequest(BaseModel):
    candidate_id: str | None = None
    resume_text: str | None = None

class EnsureSampleParticipantRequest(BaseModel):
    user_id: str

class RecordSampleCompletionRequest(BaseModel):
    interview_id: str
    user_id: str
    completed_at: str | None = None

def extract_main_themes(transcript: str, num_themes: int = 4) -> list:
    prompt = (
        f"Extract {num_themes} main themes from the following transcript. "
        "Make sure each theme is a short descriptive phrase.\n\n"
        f"Transcript: {transcript}\n\n"
        "Themes (comma-separated):"
    )

    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": "You extract concise interview themes."},
            {"role": "user", "content": prompt},
        ],
        max_completion_tokens=100,
        temperature=0.5,
    )

    raw_themes = (response.choices[0].message.content or "").strip()
    themes = [theme.strip() for theme in raw_themes.split(",") if theme.strip()]
    return themes[:num_themes]

def extract_resume_text_from_pdf_url(pdf_url: str) -> str:
    response = requests.get(pdf_url, timeout=20)
    response.raise_for_status()
    with pdfplumber.open(io.BytesIO(response.content)) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)

def extract_relevant_resume_lines(resume_text: str, job_description: str, max_items: int = 6) -> list:
    if not resume_text or not job_description:
        return []

    stop_words = nlp.Defaults.stop_words
    job_tokens = re.findall(r"[A-Za-z0-9+#.\-]{2,}", job_description.lower())
    keywords = {
        token for token in job_tokens
        if token not in stop_words and len(token) > 2
    }
    if not keywords:
        return []

    lines = [line.strip() for line in resume_text.splitlines()]
    scored = []
    for line in lines:
        if len(line) < 5 or len(line) > 220:
            continue
        tokens = re.findall(r"[A-Za-z0-9+#.\-]{2,}", line.lower())
        if not tokens:
            continue
        matched = [token for token in tokens if token in keywords]
        if not matched:
            continue
        unique_matches = sorted(set(matched))
        is_bullet = line.lstrip().startswith(("-", "•", "*", "·", "▪", "–"))
        score = len(unique_matches) * 2 + len(matched) + (1 if is_bullet else 0)
        scored.append((score, line, unique_matches))

    scored.sort(key=lambda item: (-item[0], len(item[1])))
    seen = set()
    highlights = []
    for _, line, matches in scored:
        if line in seen:
            continue
        seen.add(line)
        highlights.append({"text": line, "matches": matches[:8]})
        if len(highlights) >= max_items:
            break
    return highlights

def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()

def _extract_keywords(text: str, max_items: int = 8) -> list:
    if not text:
        return []
    stop_words = nlp.Defaults.stop_words
    tokens = re.findall(r"[A-Za-z0-9+#.\-]{2,}", text.lower())
    keywords = []
    seen = set()
    for token in tokens:
        if token in stop_words or len(token) < 3:
            continue
        if token in seen:
            continue
        seen.add(token)
        keywords.append(token)
        if len(keywords) >= max_items:
            break
    return keywords

def chunk_resume_experiences(resume_text: str, max_chunks: int = 60) -> list:
    if not resume_text:
        return []
    lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    bullet_re = re.compile(r"^[-•*·▪–]\s+(.*)")
    header_buffer: list[str] = []
    chunks = []
    for line in lines:
        bullet_match = bullet_re.match(line)
        if bullet_match:
            bullet = bullet_match.group(1).strip()
            if len(bullet) < 4:
                continue
            context = " | ".join(header_buffer[-2:]) if header_buffer else ""
            text = f"{context} - {bullet}" if context else bullet
            chunks.append({"text": _normalize_whitespace(text), "context": context, "source": "bullet"})
            continue

        header_buffer.append(line)
        if len(header_buffer) > 3:
            header_buffer = header_buffer[-3:]

        looks_like_role = bool(re.search(r"\b(Engineer|Developer|Manager|Analyst|Designer|Intern|Lead|Director)\b", line, re.IGNORECASE))
        has_dates = bool(re.search(r"\b(20\d{2}|19\d{2})\b", line))
        if looks_like_role or has_dates:
            chunks.append({"text": _normalize_whitespace(line), "context": line, "source": "header"})

    seen = set()
    deduped = []
    for chunk in chunks:
        text = chunk["text"]
        if not text or len(text) < 5:
            continue
        if text in seen:
            continue
        seen.add(text)
        deduped.append(chunk)
        if len(deduped) >= max_chunks:
            break
    return deduped

def chunk_job_requirements(job_description: str, max_requirements: int = 30) -> list:
    if not job_description:
        return []
    lines = [line.strip() for line in job_description.splitlines() if line.strip()]
    bullet_re = re.compile(r"^[-•*·▪–]\s+(.*)")
    requirements = []
    active_section = ""
    for line in lines:
        if line.endswith(":") and len(line) < 60:
            active_section = line[:-1].strip()
            continue
        bullet_match = bullet_re.match(line)
        if bullet_match:
            req = bullet_match.group(1).strip()
            if active_section:
                req = f"{active_section}: {req}"
            requirements.append(req)
            continue

        if active_section and len(line) > 20:
            requirements.append(f"{active_section}: {line}")
            continue

        if re.search(r"\b(must|should|required|responsibilities|requirements|qualifications)\b", line, re.IGNORECASE):
            for part in re.split(r"[.;•]", line):
                cleaned = part.strip()
                if cleaned:
                    requirements.append(cleaned)

    normalized = []
    seen = set()
    for req in requirements:
        cleaned = _normalize_whitespace(req)
        if cleaned and cleaned not in seen:
            normalized.append(cleaned)
            seen.add(cleaned)
            if len(normalized) >= max_requirements:
                break
    return normalized

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)

def _embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    return [item.embedding for item in response.data]

def _cross_encoder_rerank(requirement: str, experiences: list[dict]) -> list[dict]:
    if not requirement or not experiences:
        return []
    prompt_lines = [
        "You are evaluating resume evidence for a job requirement.",
        "For each experience, score how well it provides evidence for the requirement.",
        "Return ONLY valid JSON as an array of objects with:",
        '  {"experience_id": <int>, "score": <0-100>, "rationale": <short sentence>, "matched_skills": [..] }',
        "",
        f"Requirement: {requirement}",
        "",
        "Experiences:"
    ]
    for idx, exp in enumerate(experiences):
        prompt_lines.append(f"{idx}: {exp['text']}")
    prompt = "\n".join(prompt_lines)

    try:
        response = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": "You are a strict JSON formatter."},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=320,
            temperature=0.2,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.strip("`").replace("json", "").strip()
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            cleaned = []
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                cleaned.append({
                    "experience_id": int(item.get("experience_id", 0)),
                    "score": float(item.get("score", 0)),
                    "rationale": str(item.get("rationale", "")).strip(),
                    "matched_skills": item.get("matched_skills", []) if isinstance(item.get("matched_skills", []), list) else [],
                })
            return cleaned
    except Exception as e:
        print(f"Cross-encoder rerank error: {str(e)}")
    return []

def smart_resume_jd_match(resume_text: str, job_description: str, max_items: int = 6) -> dict:
    if not resume_text or not job_description:
        return {"highlights": [], "requirements": [], "overall_match_score": 0, "error": "Missing resume or job description."}

    experiences = chunk_resume_experiences(resume_text, max_chunks=60)
    requirements = chunk_job_requirements(job_description, max_requirements=25)
    if not experiences or not requirements:
        return {"highlights": [], "requirements": [], "overall_match_score": 0, "error": "Unable to parse resume or job description."}

    try:
        req_embeddings = _embed_texts([r for r in requirements])
        exp_embeddings = _embed_texts([e["text"] for e in experiences])
    except Exception as e:
        print(f"Embedding error: {str(e)}")
        return {"highlights": extract_relevant_resume_lines(resume_text, job_description, max_items=max_items), "requirements": [], "overall_match_score": 0, "error": "Embedding step failed."}

    requirement_matches = []
    overall_scores = []
    for idx, req in enumerate(requirements):
        if idx >= len(req_embeddings):
            continue
        similarities = []
        for exp_idx, exp in enumerate(experiences):
            if exp_idx >= len(exp_embeddings):
                continue
            sim = _cosine_similarity(req_embeddings[idx], exp_embeddings[exp_idx])
            similarities.append((sim, exp_idx, exp))
        similarities.sort(key=lambda x: x[0], reverse=True)
        top_candidates = [item for item in similarities[:4]]
        candidate_payload = [{"text": exp["text"]} for _, _, exp in top_candidates]
        reranked = _cross_encoder_rerank(req, candidate_payload) if candidate_payload else []

        matches = []
        for item in reranked:
            exp_id = item.get("experience_id", 0)
            if exp_id < 0 or exp_id >= len(candidate_payload):
                continue
            exp_text = candidate_payload[exp_id]["text"]
            matches.append({
                "experience": exp_text,
                "bi_score": float(top_candidates[exp_id][0]) if exp_id < len(top_candidates) else 0,
                "cross_score": float(item.get("score", 0)),
                "rationale": item.get("rationale", ""),
                "matched_skills": item.get("matched_skills", []),
            })
        matches.sort(key=lambda x: x["cross_score"], reverse=True)
        top_match_score = matches[0]["cross_score"] if matches else 0
        if top_match_score:
            overall_scores.append(top_match_score)
        requirement_matches.append({
            "requirement": req,
            "matches": matches[:3],
        })

    overall_match_score = int(sum(overall_scores) / max(1, len(overall_scores))) if overall_scores else 0

    highlights = []
    flat_matches = []
    for req in requirement_matches:
        for match in req["matches"]:
            flat_matches.append((match["cross_score"], req["requirement"], match))
    flat_matches.sort(key=lambda x: x[0], reverse=True)
    for score, req_text, match in flat_matches[:max_items]:
        highlights.append({
            "text": match["experience"],
            "matches": _extract_keywords(req_text, max_items=6),
            "score": score,
            "evidence": match.get("rationale", ""),
        })

    return {
        "highlights": highlights,
        "requirements": requirement_matches,
        "overall_match_score": overall_match_score,
    }

def score_resume_quality(resume_text: str) -> dict:
    words = re.findall(r"\b\w+\b", resume_text or "")
    word_count = len(words)
    lines = [line.strip() for line in (resume_text or "").splitlines() if line.strip()]
    bullet_count = sum(1 for line in lines if re.match(r"^[-•*·▪–]\s+", line))
    quantified_count = len(re.findall(r"\b\d+%|\$\d+|\b\d+(?:\.\d+)?\s*(?:k|K|m|M)\b", resume_text))
    email_present = bool(re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", resume_text))
    phone_present = bool(re.search(r"(\+?\d{1,3})?[\s\-.(]*\d{3}[\s\-.)]*\d{3}[\s\-.)]*\d{4}", resume_text))
    linkedin_present = bool(re.search(r"linkedin\.com/in/", resume_text, re.IGNORECASE))

    section_headings = {
        "experience": bool(re.search(r"\b(experience|employment|work history)\b", resume_text, re.IGNORECASE)),
        "education": bool(re.search(r"\b(education|degree|university|college)\b", resume_text, re.IGNORECASE)),
        "skills": bool(re.search(r"\b(skills|technologies|technical skills)\b", resume_text, re.IGNORECASE)),
        "projects": bool(re.search(r"\b(projects|project experience)\b", resume_text, re.IGNORECASE)),
        "summary": bool(re.search(r"\b(summary|profile|objective)\b", resume_text, re.IGNORECASE)),
    }

    action_verbs = [
        "led", "built", "designed", "developed", "implemented", "optimized", "improved",
        "managed", "owned", "delivered", "launched", "created", "analyzed", "automated",
    ]
    action_verb_hits = 0
    for line in lines:
        for verb in action_verbs:
            if re.match(rf"^[-•*·▪–]?\s*{verb}\b", line, re.IGNORECASE):
                action_verb_hits += 1
                break

    sentences = re.split(r"[.!?]", resume_text or "")
    sentence_lengths = [len(re.findall(r"\b\w+\b", s)) for s in sentences if s.strip()]
    avg_sentence_len = int(sum(sentence_lengths) / max(1, len(sentence_lengths)))

    structure_score = 0
    structure_score += 20 if email_present else 0
    structure_score += 15 if phone_present else 0
    structure_score += 10 if linkedin_present else 0
    structure_score += 10 if section_headings["summary"] else 0
    structure_score += 15 if section_headings["experience"] else 0
    structure_score += 15 if section_headings["education"] else 0
    structure_score += 15 if section_headings["skills"] else 0
    structure_score = min(structure_score, 100)

    content_score = 0
    content_score += min(40, quantified_count * 8)
    content_score += min(30, action_verb_hits * 3)
    content_score += 15 if section_headings["projects"] else 0
    content_score += 15 if word_count >= 250 else max(0, int(word_count / 250 * 15))
    content_score = min(content_score, 100)

    formatting_score = 0
    formatting_score += min(40, bullet_count * 3)
    formatting_score += 20 if 300 <= word_count <= 1200 else 10 if 200 <= word_count <= 1500 else 0
    formatting_score += 20 if avg_sentence_len <= 26 else 10 if avg_sentence_len <= 32 else 0
    formatting_score += 20 if len(lines) >= 12 else 10 if len(lines) >= 8 else 0
    formatting_score = min(formatting_score, 100)

    overall = int(0.35 * content_score + 0.35 * structure_score + 0.30 * formatting_score)
    feedback = []
    if not email_present:
        feedback.append("Add a professional email address.")
    if not phone_present:
        feedback.append("Include a phone number.")
    if not linkedin_present:
        feedback.append("Add a LinkedIn profile link.")
    if quantified_count < 2:
        feedback.append("Include more quantified impact (%, $, scale).")
    if action_verb_hits < 3:
        feedback.append("Start bullets with strong action verbs.")
    if not section_headings["skills"]:
        feedback.append("Add a dedicated skills section.")

    return {
        "overall_score": overall,
        "breakdown": {
            "structure": structure_score,
            "content_strength": content_score,
            "formatting": formatting_score,
        },
        "signals": {
            "word_count": word_count,
            "bullet_count": bullet_count,
            "quantified_impact_count": quantified_count,
            "action_verb_hits": action_verb_hits,
            "avg_sentence_length": avg_sentence_len,
        },
        "feedback": feedback[:6],
    }

def extract_audio_from_video(video_url: str, output_audio: str) -> None:
    """
    Extract audio from a video URL and save it to output_audio.
    This example assumes that the video_url is accessible to ffmpeg.
    """
    command = f"ffmpeg -y -i {video_url} -q:a 0 -map a {output_audio}"
    subprocess.run(command, shell=True, check=True)

def get_job_description_for_interview(interview_id: str | None) -> str:
    """Resolve recruiter job description for the given interview."""
    if not interview_id:
        return ""

    interview_result = supabase.table("interview") \
        .select("recruiter_id") \
        .eq("id", interview_id) \
        .limit(1) \
        .execute()
    if not interview_result.data:
        return ""

    recruiter_id = interview_result.data[0].get("recruiter_id")
    if not recruiter_id:
        return ""

    job_result = supabase.table("job_descriptions") \
        .select("description") \
        .eq("recruiter_id", recruiter_id) \
        .limit(1) \
        .execute()
    if not job_result.data:
        return ""

    return job_result.data[0].get("description") or ""

def analyze_video(video_url: str, interview_id: str | None = None):
    """Analyze video and return comprehensive results"""
    try:
        print(f"Attempting to transcribe video from URL: {video_url}")
        if not video_url or not video_url.startswith('http'):
            raise ValueError("Invalid video URL format")

        transcript = transcriber.transcribe(video_url)
        if not transcript or not hasattr(transcript, 'text') or not transcript.text:
            print("Transcription failed or returned empty result")
            return {
                "summary": "Transcription could not be completed. Only basic analysis is available.",
                "filename": f"summary_{abs(hash(video_url))}.txt",
                "transcript": "",
                "behavioral_scores": {},
                "communication_analysis": {},
                "enthusiasm_timestamps": [],
                "behavioral_insights": {}
            }

        print(f"Transcription successful. Length: {len(transcript.text)}")

        transcript_text = transcript.text
        summary = summarize_text(transcript_text)
        communication_analysis = analyze_communication(transcript_text)
        job_description = get_job_description_for_interview(interview_id)
        behavioral_insights = generate_behavioral_insights(transcript_text, job_description)

        os.makedirs("txt_files", exist_ok=True)
        filename = f"summary_{abs(hash(video_url))}.txt"
        with open(os.path.join("txt_files", filename), "w") as file:
            file.write(summary)
        
        return {
            "summary": summary,
            "filename": filename,
            "transcript": transcript_text,
            "communication_analysis": communication_analysis,
            "enthusiasm_timestamps": [],
            "behavioral_insights": behavioral_insights
        }

    except Exception as e:
        print(f"Error in video analysis: {str(e)}")
        return {
            "summary": f"Error analyzing video: {str(e)}",
            "filename": "",
            "transcript": "",
            "behavioral_scores": {},
            "communication_analysis": {},
            "enthusiasm_timestamps": [],
            "behavioral_insights": {}
        }

def send_interview_invite_email(invite: InterviewInvite):
    """Send interview invitation email using Gmail SMTP"""
    upsert_interview_invite(invite)

    try:
        GMAIL_USER = os.getenv("GMAIL_USER")   
        GMAIL_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")  
        
        if not GMAIL_USER or not GMAIL_PASSWORD:
            print("Gmail credentials not configured. Falling back to simulation mode.")
            print(f"=== EMAIL SIMULATION (No Gmail Config) ===")
            print(f"To: {invite.email}")
            print(f"Subject: Interview Invitation: {invite.interview_title}")
            print(f"Content: Interview code {invite.invite_code} for {invite.interview_title}")
            print(f"=== END EMAIL SIMULATION ===")
            return {"success": True, "message": f"Interview invitation simulated for {invite.email}"}
        
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"Interview Invitation: {invite.interview_title}"
        msg['From'] = GMAIL_USER
        msg['To'] = invite.email
        
        join_link = f"{FRONTEND_URL}/candidates/join?code={invite.invite_code}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Interview Invitation</h2>
            <p>Hello,</p>
            <p>You have been invited to participate in an interview: <strong>{invite.interview_title}</strong></p>
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Access your interview:</h3>
                <p>Click the link below to join. If you don't have an account yet, you'll be prompted to create one first.</p>
                <p style="margin: 20px 0;">
                    <a href="{join_link}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Join Interview</a>
                </p>
                <p style="font-size: 12px; color: #6b7280;">Or copy this link: {join_link}</p>
            </div>
            <p>Please complete your interview within the specified timeframe.</p>
            <p>Best regards,<br><strong>{invite.recruiter_name}</strong></p>
        </div>
        """
        
        text_content = f"""
        Interview Invitation
            
        Hello,
        
        You have been invited to participate in an interview: {invite.interview_title}
        
        To access your interview, click or copy this link:
        {join_link}
        
        If you don't have an account yet, you'll be prompted to create one first.
        
        Please complete your interview within the specified timeframe.
        
        Best regards,
        {invite.recruiter_name}
        """
        
        text_part = MIMEText(text_content, 'plain')
        html_part = MIMEText(html_content, 'html')
        
        msg.attach(text_part)
        msg.attach(html_part)
        
        try:
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            
            server.send_message(msg)
            server.quit()
            
            print(f"Email sent successfully to {invite.email}")
            return {"success": True, "message": f"Interview invitation sent successfully to {invite.email}"}
            
        except smtplib.SMTPAuthenticationError:
            print(f"Gmail authentication failed for {invite.email}")
            return {"success": False, "message": "Gmail authentication failed. Please check your credentials."}
        except smtplib.SMTPException as e:
            print(f"SMTP error for {invite.email}: {str(e)}")
            return {"success": False, "message": f"SMTP error: {str(e)}"}
        except Exception as e:
            print(f"Unexpected error sending email to {invite.email}: {str(e)}")
            return {"success": False, "message": f"Unexpected error: {str(e)}"}
            
    except Exception as e:
        print(f"Email error: {str(e)}")
        print(f"=== EMAIL SIMULATION (Error Fallback) ===")
        print(f"To: {invite.email}")
        print(f"Subject: Interview Invitation: {invite.interview_title}")
        print(f"Content: Interview code {invite.invite_code} for {invite.interview_title}")
        print(f"=== END EMAIL SIMULATION ===")
        return {"success": True, "message": f"Interview invitation simulated for {invite.email}"}

    

@app.post("/send-interview-invite")
async def send_interview_invite(invite: InterviewInvite):
    """Send interview invitation email"""
    try:
        return send_interview_invite_email(invite)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-video")
async def analyze_video_endpoint(video: VideoURL):
    """Analyze video and store results"""
    try:
        print(f"Received request to analyze video: {video.video_url}")
        result = analyze_video(video.video_url, video.interview_id)

        if not result:
            return {"error": "Failed to analyze video", "details": "No result returned from analysis"}

        if video.user_id and result:
            try:
                if video.question_index is not None:
                    print(f"\n{'='*50}")
                    print(f"[analyze-video] INCOMING REQUEST DATA:")
                    print(f"  video.user_id = {video.user_id}")
                    print(f"  video.question_index = {video.question_index}")
                    print(f"  video.question_text = {video.question_text}")
                    print(f"  video.video_url = {video.video_url[:80]}...")
                    print(f"  video (all fields) = {video.model_dump()}")
                    print(f"{'='*50}\n")
                    print
                    
                    answer_payload = {
                        'user_id': video.user_id,
                        'question_index': video.question_index,
                        'question_text': video.question_text or '',
                        'video_url': video.video_url,
                        'summary': result.get('summary', ''),
                        'transcript': result.get('transcript', ''),
                        'communication_analysis': json.dumps(result.get('communication_analysis', {})),
                        'behavioral_insights': json.dumps(result.get('behavioral_insights', {})),
                        'created_at': datetime.now().isoformat(),
                        'interview_id': video.interview_id
                    }

                    is_sample_submission = False
                    if video.interview_id:
                        interview_meta = supabase.table("interview") \
                            .select("title") \
                            .eq("id", video.interview_id) \
                            .limit(1) \
                            .execute()
                        interview_title = ""
                        if getattr(interview_meta, "data", None):
                            interview_title = str(interview_meta.data[0].get("title", "")).lower()
                        is_sample_submission = ("sample" in interview_title) or ("test" in interview_title)

                    if is_sample_submission:
                        write_result = supabase.table('interview_answers').insert(answer_payload).execute()
                    else:
                        write_result = supabase.table('interview_answers').upsert(answer_payload).execute()
                    if getattr(write_result, "error", None):
                        raise Exception(f"Failed to store interview answer: {write_result.error}")
                    print(f"Analysis results stored for user {video.user_id}, question {video.question_index}")
            except Exception as e:
                print(f"Error storing analysis results: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Analysis completed but saving results failed: {str(e)}")

        return result
    except ValueError as ve:
        print(f"Value error in endpoint: {str(ve)}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        print(f"Error in endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def generate_personalized_questions_from_resume(resume_text: str, job_description: str, num_questions: int = 3) -> list:
    """
    Generate a list of personalized interview questions based on the resume text using OpenAI Chat API (gpt-4o).
    Returns a list of dicts: [{"question": ...}], suitable for frontend use.
    """
    import re
    import json
    prompt = (
        f"Given the following resume, generate {num_questions} hypter-specific interview questions "
        "based on your own knowledge of the title, the bullet points, and the company. \n"
        "The questions should be relevant to the job descrption, and company values"
        "Questions should be concise, relevant, and not generic.\n\n"
        f"Resume:\n{resume_text}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Return the questions as a JSON array of objects, each with a 'question' field. Example: [{{\"question\": \"...\"}}, ...]"
    )
    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": "You are an expert technical interviewer."},
            {"role": "user", "content": prompt}
        ],
        max_completion_tokens=512,
        temperature=0.5
    )
    raw_content = response.choices[0].message.content.strip()
    print("Raw content in generate_personalized_questions_from_resume: ", raw_content)

    if raw_content.startswith('```json'):
        raw_content = raw_content[7:]
    if raw_content.startswith('```'):
        raw_content = raw_content[3:]
    if raw_content.endswith('```'):
        raw_content = raw_content[:-3]
    raw_content = raw_content.strip()

    json_array_match = re.search(r'(\[.*?\])', raw_content, re.DOTALL)
    if json_array_match:
        json_str = json_array_match.group(1)
    else:
        json_str = raw_content

    try:
        questions = json.loads(json_str)
        if isinstance(questions, list) and all(isinstance(q, dict) and 'question' in q and isinstance(q['question'], str) and q['question'].strip() for q in questions):
            return questions[:num_questions]
        if isinstance(questions, list) and all(isinstance(q, str) and q.strip() for q in questions):
            return [{"question": q} for q in questions[:num_questions]]
    except Exception:
        questions = []
        for line in raw_content.split("\n"):
            line = line.strip()
            match = re.match(r'^[0-9]+[\).\-]?\s*(.*)', line)
            if match:
                q = match.group(1).strip()
                if q:
                    questions.append({"question": q})
            elif line:
                questions.append({"question": line})
        questions = [q for q in questions if q["question"] and len(q["question"]) > 5]
        return questions[:num_questions]
    return []

@app.post("/generate-resume-questions-from-db")
async def generate_resume_questions_from_db(request: ResumeQuestionsRequest):
    """Generate questions from the latest resume PDF in Supabase for a user"""
    try:
        return generate_resume_questions_and_sync_profile(
            supabase=supabase,
            user_id=request.user_id,
            resume_question_generator=generate_personalized_questions_from_resume,
        )
    except Exception as e:
        print(f"Error in generate_resume_questions_from_db: {str(e)}")
        return {"error": str(e)}

@app.post("/resume-relevance")
async def resume_relevance(request: ResumeRelevanceRequest):
    try:
        job_result = supabase.table("job_descriptions") \
            .select("description") \
            .eq("recruiter_id", request.recruiter_id) \
            .limit(1) \
            .execute()
        job_desc = job_result.data[0]["description"] if job_result.data else ""
        if not job_desc:
            return {"highlights": [], "error": "No job description found."}

        resume_result = supabase.table("resumes") \
            .select("file_path, original_name, uploaded_at") \
            .eq("user_id", request.candidate_id) \
            .order("uploaded_at", desc=True) \
            .limit(1) \
            .execute()
        if not resume_result.data:
            return {"highlights": [], "error": "No resume found for this candidate."}

        resume = resume_result.data[0]
        file_path = resume.get("file_path") or ""
        if not file_path.lower().endswith(".pdf"):
            return {"highlights": [], "error": "Unsupported resume format. Please upload a PDF."}

        resume_text = extract_resume_text_from_pdf_url(file_path)
        if not resume_text.strip():
            return {"highlights": [], "error": "Could not extract resume text."}

        max_items = request.max_items or 6
        smart_match = smart_resume_jd_match(resume_text, job_desc, max_items=max_items)
        if smart_match.get("highlights"):
            return smart_match

        highlights = extract_relevant_resume_lines(resume_text, job_desc, max_items=max_items)
        return {"highlights": highlights, "requirements": [], "overall_match_score": 0, "error": smart_match.get("error")}
    except Exception as e:
        return {"highlights": [], "requirements": [], "overall_match_score": 0, "error": str(e)}

@app.post("/resume-quality")
async def resume_quality(request: ResumeQualityRequest):
    try:
        resume_text = request.resume_text or ""
        if not resume_text:
            if not request.candidate_id:
                raise HTTPException(status_code=400, detail="Missing resume_text or candidate_id.")

            resume_result = supabase.table("resumes") \
                .select("file_path, uploaded_at") \
                .eq("user_id", request.candidate_id) \
                .order("uploaded_at", desc=True) \
                .limit(1) \
                .execute()
            if not resume_result.data:
                return {"error": "No resume found for this candidate."}

            file_path = resume_result.data[0].get("file_path") or ""
            if not file_path.lower().endswith(".pdf"):
                return {"error": "Unsupported resume format. Please upload a PDF."}

            resume_text = extract_resume_text_from_pdf_url(file_path)
            if not resume_text.strip():
                return {"error": "Could not extract resume text."}

        return score_resume_quality(resume_text)
    except Exception as e:
        return {"error": str(e)}

@app.get("/latest-sample-interview")
async def latest_sample_interview():
    """Return latest global sample/test interview metadata."""
    try:
        result = supabase.table("interview") \
            .select("id, title, scheduled_date, company, created_at") \
            .or_("title.ilike.%sample%,title.ilike.%test%") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if result.data and len(result.data) > 0:
            return {"interview": result.data[0]}
        return {"interview": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ensure-sample-interview-participant")
async def ensure_sample_interview_participant(req: EnsureSampleParticipantRequest):
    """Ensure user is attached to latest sample/test interview for practice flow."""
    try:
        sample = supabase.table("interview") \
            .select("id, title, created_at") \
            .or_("title.ilike.%sample%,title.ilike.%test%") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if not sample.data or len(sample.data) == 0:
            return {"ok": False, "reason": "no_sample_interview"}

        sample_interview_id = sample.data[0]["id"]
        existing = supabase.table("interview_participants") \
            .select("id") \
            .eq("interview_id", sample_interview_id) \
            .eq("user_id", req.user_id) \
            .limit(1) \
            .execute()

        if not existing.data:
            supabase.table("interview_participants").insert({
                "interview_id": sample_interview_id,
                "user_id": req.user_id,
                "status": "active",
                "joined_at": datetime.now().isoformat(),
                "completed": False,
            }).execute()

        return {"ok": True, "interview_id": sample_interview_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/record-sample-interview-completion")
async def record_sample_interview_completion(req: RecordSampleCompletionRequest):
    """Store a completed sample interview copy using service-role access."""
    try:
        completed_at = req.completed_at or datetime.now().isoformat()
        write_result = supabase.table("interview_participants").insert({
            "interview_id": req.interview_id,
            "user_id": req.user_id,
            "status": "completed",
            "joined_at": completed_at,
            "completed": True,
        }).execute()

        error = getattr(write_result, "error", None)
        if error:
            raise HTTPException(status_code=400, detail=str(error))

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        message = str(e)
        if "23505" in message or "interview_participants_unique" in message:
            return {"ok": True, "duplicate": True}
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/recruiter-chat")
async def recruiter_chat(req: RecruiterChatRequest):
    """Lightweight recruiter chatbot: returns a brief helpful answer."""
    try:
        system_prompt = "You are a concise assistant that helps recruiters. Keep replies under 120 words."
        response = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.prompt},
            ],
            max_completion_tokens=250,
            temperature=0.3,
        )
        content = response.choices[0].message.content.strip()
        return {"reply": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "HireVision API"}

@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...), user_id: str = Form(...)):
    """Upload resume file to Supabase storage"""
    ACCEPTED_RESUME_TYPES = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/rtf"
    ]
    MAX_RESUME_SIZE_MB = 5
    
    if file.content_type not in ACCEPTED_RESUME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and RTF are allowed.")
    
    contents = await file.read()
    if len(contents) > MAX_RESUME_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Max size is {MAX_RESUME_SIZE_MB}MB.")
    
    filename = f"{user_id}_{int(time.time())}_{file.filename}"
    try:
        storage_response = supabase.storage.from_('resumes').upload(filename, contents, {"content-type": file.content_type})
        public_url = supabase.storage.from_('resumes').get_public_url(filename)
        
        result = supabase.table("resumes").insert({
            "user_id": user_id,
            "filename": filename,
            "file_path": public_url,
            "original_name": file.filename,
            "mime_type": file.content_type,
            "uploaded_at": datetime.utcnow().isoformat()
        }).execute()
        
        db_record = result.data[0] if hasattr(result, 'data') and result.data else None
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload resume: {str(e)}")
    
    return {"success": True, "file_path": public_url, "filename": filename, "db_record": db_record}

class JobDescriptionUpdate(BaseModel):
    recruiter_id: str
    description: str

@app.post("/update-job-description")
async def update_job_description(job_desc: JobDescriptionUpdate):
    """Update job description for an interview"""
    try:
        from datetime import datetime
        
        existing = supabase.table('job_descriptions').select('id').eq('recruiter_id', job_desc.recruiter_id).execute()
        if existing.data and len(existing.data) > 0:
            result = supabase.table('job_descriptions').update({
                "description": job_desc.description,
            }).eq('recruiter_id', job_desc.recruiter_id).execute()
        else:
            result = supabase.table('job_descriptions').insert({
                "recruiter_id": job_desc.recruiter_id,
                "description": job_desc.description,
                "created_at": datetime.now().isoformat(),
            }).execute()
        
        
        return {"success": True, "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-job-description/{recruiter_id}")
async def get_job_description(recruiter_id: str):
    """Get job description for an interview"""
    try:
        result = supabase.table('job_descriptions').select('description').eq('recruiter_id', recruiter_id).execute()
        if result and hasattr(result, 'data') and result.data and len(result.data) > 0:
            return {"success": True, "description": result.data[0].get('description', '')}
        return {"success": True, "description": ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch job description for {recruiter_id}: {str(e)}")

@app.get("/get-job-description/me")
async def get_job_description_me(user_id: str = Depends(get_current_user_id)):
    """Get job description for the authenticated recruiter using Authorization header."""
    try:
        result = supabase.table('job_descriptions').select('description').eq('recruiter_id', user_id).execute()
        if result.data and len(result.data) > 0:
            return {"success": True, "description": result.data[0].get('description', '')}
        else:
            return {"success": True, "description": ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/manage-interview-invite")
async def manage_interview_invite(invite: InterviewInvite):
    """Manage interview invitation - update existing or create new"""
    try:
        return send_interview_invite_email(invite)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/cleanup-expired-invites")
async def cleanup_expired_invites():
    """Clean up expired interview invites (older than 30 days)"""
    try:
        thirty_days_ago = datetime.now() - timedelta(days=30)
        result = supabase.table('interview_invites').update({
            'status': 'expired'
        }).lt('created_at', thirty_days_ago.isoformat()).eq('status', 'pending').execute()
        
        return {
            "success": True, 
            "message": f"Cleaned up {len(result.data) if result.data else 0} expired invites",
            "expired_count": len(result.data) if result.data else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/bulk-manage-invites")
async def bulk_manage_invites(invites: list[InterviewInvite]):
    """Handle multiple interview invites with automatic duplicate management"""
    try:
        results = []
        
        for invite in invites:
            email_result = send_interview_invite_email(invite)
            results.append({
                "email": invite.email,
                "success": email_result.get("success", False),
                "message": email_result.get("message", "Unknown error")
            })
        
        return {
            "success": True,
            "results": results,
            "total_sent": len([r for r in results if r["success"]]),
            "total_failed": len([r for r in results if not r["success"]])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/invite-status/{invite_code}")
async def get_invite_status(invite_code: str):
    """Get the status of an interview invite"""
    try:
        result = supabase.table('interview_invites').select(
            'id, email, status, created_at, interview_id, interviews(title, description)'
        ).eq('invite_code', invite_code).single().execute()
        
        if not result.data:
            return {"valid": False, "message": "Invalid invite code"}
        
        invite = result.data
        
        invite_date = datetime.fromisoformat(invite['created_at'].replace('Z', '+00:00'))        
        if invite_date < datetime.now() - timedelta(days=30) and invite['status'] == 'pending':
            supabase.table('interview_invites').update({
                'status': 'expired'
            }).eq('id', invite['id']).execute()
            invite['status'] = 'expired'
        
        return {
            "valid": True,
            "status": invite['status'],
            "email": invite['email'],
            "created_at": invite['created_at'],
            "interview": invite['interviews'],
            "expired": invite['status'] == 'expired'
        }
    except Exception as e:
        return {"valid": False, "message": f"Error checking invite status: {str(e)}"}

@app.post("/get-personalized-questions")
async def get_personalized_questions(request: GetPersonalizedQuestionsRequest):
    """Fetch the latest 3 personalized resume questions for a user"""
    try:
        user_id = request.user_id
        result = supabase.table("resume_questions") \
            .select("question_index, question_text, created_at") \
            .eq("user_id", user_id) \
            .order("created_at", desc="desc") \
            .order("question_index", desc="asc") \
            .limit(3) \
            .execute()
        questions = result.data if result and hasattr(result, 'data') and result.data else []
        formatted = [{"question": q["question_text"]} for q in sorted(questions, key=lambda x: x["question_index"])]
        return {"questions": formatted}
    except Exception as e:
        print(f"Error in get_personalized_questions: {str(e)}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

