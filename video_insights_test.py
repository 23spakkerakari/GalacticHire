import os
import tempfile
import subprocess
import requests
import numpy as np
import torch
import librosa
from dotenv import load_dotenv
from transformers import Wav2Vec2FeatureExtractor, WavLMModel


load_dotenv()

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")

# WavLM is an encoder model - use FeatureExtractor (no tokenizer needed)
print("Loading WavLM model...")
feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained("microsoft/wavlm-large")
model = WavLMModel.from_pretrained("microsoft/wavlm-large")
model.eval()
print("Model loaded!\n")

TEST_VIDEO_URL = "https://usbvchfamioprsvxhazt.supabase.co/storage/v1/object/sign/videos/711fcb15-79e5-4f91-96b5-7f36355e4382_1768600070904.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80ZjZiY2JlNS05ZmU2LTQ3YTMtYTVlZC1iMzRhZmIwNzc1Y2UiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2aWRlb3MvNzExZmNiMTUtNzllNS00ZjkxLTk2YjUtN2YzNjM1NWU0MzgyXzE3Njg2MDAwNzA5MDQubXA0IiwiaWF0IjoxNzY4NjAwMDczLCJleHAiOjE3Njg2MzYwNzN9.DKYZwQyLX3c4OMjxet7kAJqkLgPpZxMXltrjAgRESlY"


def download_video(video_url: str) -> str:
    """Download video from signed URL to temp file"""
    ext = ".mp4" if ".mp4" in video_url else ".webm"
    output_path = tempfile.mktemp(suffix=ext)
    
    print("Downloading video...")
    response = requests.get(video_url, stream=True, timeout=60)
    response.raise_for_status()
    
    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    print(f"Downloaded to: {output_path}")
    return output_path


def extract_audio(video_path: str) -> str:
    """Extract audio from video as 16kHz mono WAV (required for WavLM)"""
    audio_path = video_path.rsplit(".", 1)[0] + ".wav"
    
    print("Extracting audio...")
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        audio_path
    ], check=True, capture_output=True)
    
    print(f"Audio extracted to: {audio_path}")
    return audio_path


def analyze_pauses(audio: np.ndarray, sr: int, silence_threshold: float = 0.02) -> dict:
    """Analyze pause patterns in speech"""
    # Compute RMS energy in small frames
    frame_length = int(0.025 * sr)  # 25ms frames
    hop_length = int(0.010 * sr)    # 10ms hop
    
    rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
    
    # Detect silence frames
    silence_mask = rms < silence_threshold
    
    # Find pause segments
    pauses = []
    in_pause = False
    pause_start = 0
    
    for i, is_silent in enumerate(silence_mask):
        if is_silent and not in_pause:
            in_pause = True
            pause_start = i
        elif not is_silent and in_pause:
            in_pause = False
            pause_duration = (i - pause_start) * hop_length / sr
            if pause_duration > 0.3:  # Only count pauses > 300ms
                pauses.append(pause_duration)
    
    total_duration = len(audio) / sr
    
    return {
        "num_pauses": len(pauses),
        "avg_pause_duration": np.mean(pauses) if pauses else 0,
        "total_pause_time": sum(pauses),
        "pause_ratio": sum(pauses) / total_duration if total_duration > 0 else 0,
        "longest_pause": max(pauses) if pauses else 0,
    }


def analyze_pitch_and_energy(audio: np.ndarray, sr: int) -> dict:
    """Analyze pitch variation and energy for engagement assessment"""
    # Pitch (F0) analysis
    f0, _voiced_flag, _ = librosa.pyin(
        audio, 
        fmin=float(librosa.note_to_hz("C2")),
        fmax=float(librosa.note_to_hz("C6")),
        sr=sr
    )
    f0_valid = f0[~np.isnan(f0)]
    
    # Energy analysis
    rms = librosa.feature.rms(y=audio)[0]
    
    # Speaking rate estimation (via zero crossings as proxy for articulation)
    zcr = librosa.feature.zero_crossing_rate(audio)[0]
    
    return {
        "pitch_mean": float(np.mean(f0_valid)) if len(f0_valid) > 0 else 0,
        "pitch_std": float(np.std(f0_valid)) if len(f0_valid) > 0 else 0,
        "pitch_range": float(np.ptp(f0_valid)) if len(f0_valid) > 0 else 0,
        "energy_mean": float(np.mean(rms)),
        "energy_std": float(np.std(rms)),
        "energy_consistency": 1 - (float(np.std(rms)) / (float(np.mean(rms)) + 1e-6)),
        "articulation_rate": float(np.mean(zcr)),
    }


def analyze_spectral_clarity(audio: np.ndarray, sr: int) -> dict:
    """Analyze spectral features related to speech clarity"""
    # Spectral centroid (brightness/clarity indicator)
    spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
    
    # Spectral rolloff (frequency below which 85% of energy is contained)
    spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
    
    # Spectral contrast (clarity of harmonic structure)
    spectral_contrast = librosa.feature.spectral_contrast(y=audio, sr=sr)
    
    # MFCC for articulation quality
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfcc_delta = librosa.feature.delta(mfccs)
    
    return {
        "spectral_centroid_mean": float(np.mean(spectral_centroid)),
        "spectral_rolloff_mean": float(np.mean(spectral_rolloff)),
        "spectral_contrast_mean": float(np.mean(spectral_contrast)),
        "mfcc_variance": float(np.mean(np.var(mfccs, axis=1))),
        "articulation_dynamics": float(np.mean(np.abs(mfcc_delta))),
    }


def extract_wavlm_features(audio: np.ndarray, sr: int) -> dict:
    """Extract deep features using WavLM for communication analysis"""
    # Resample to 16kHz if needed
    if sr != 16000:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    
    # Process with WavLM feature extractor
    inputs = feature_extractor(audio, sampling_rate=16000, return_tensors="pt", padding=True)
    
    with torch.no_grad():
        outputs = model(**inputs, output_hidden_states=True)
    
    # Get embeddings from last hidden state
    embeddings = outputs.last_hidden_state.squeeze(0).numpy()
    
    # Analyze embedding patterns for communication quality
    # High variance in embeddings = more dynamic/engaging speech
    embedding_variance = np.mean(np.var(embeddings, axis=0))
    
    # Temporal consistency (smoothness of transitions)
    embedding_diff = np.diff(embeddings, axis=0)
    temporal_smoothness = 1 / (1 + np.mean(np.linalg.norm(embedding_diff, axis=1)))
    
    # Compute embedding statistics across time
    embedding_mean = np.mean(embeddings, axis=0)
    embedding_std = np.std(embeddings, axis=0)
    
    return {
        "embedding_variance": float(embedding_variance),
        "temporal_smoothness": float(temporal_smoothness),
        "embedding_mean_norm": float(np.linalg.norm(embedding_mean)),
        "embedding_dynamics": float(np.mean(embedding_std)),
    }


def compute_clarity_score(metrics: dict) -> float:
    """Compute overall clarity score (0-100)"""
    scores = []
    
    # Spectral clarity (higher centroid = clearer articulation)
    centroid_score = min(metrics["spectral_centroid_mean"] / 3000, 1.0) * 100
    scores.append(centroid_score * 0.2)
    
    # Articulation dynamics (more dynamic = clearer)
    dynamics_score = min(metrics["articulation_dynamics"] * 50, 100)
    scores.append(dynamics_score * 0.2)
    
    # Energy consistency (consistent = clearer)
    consistency_score = metrics["energy_consistency"] * 100
    scores.append(max(0, consistency_score) * 0.2)
    
    # Low pause ratio = clearer
    pause_penalty = (1 - min(metrics["pause_ratio"], 0.5) * 2) * 100
    scores.append(pause_penalty * 0.2)
    
    # WavLM embedding quality
    embedding_score = min(metrics["embedding_variance"] * 1000, 100)
    scores.append(embedding_score * 0.2)
    
    return round(sum(scores), 1)


def compute_communication_score(metrics: dict) -> float:
    """Compute overall communication score (0-100)"""
    scores = []
    
    # Pitch variation (engaging speech has varied pitch)
    pitch_var_score = min(metrics["pitch_std"] / 50, 1.0) * 100
    scores.append(pitch_var_score * 0.25)
    
    # Energy variation (dynamic delivery)
    energy_var_score = min(metrics["energy_std"] / 0.05, 1.0) * 100
    scores.append(energy_var_score * 0.2)
    
    # Temporal smoothness (fluent transitions)
    smoothness_score = metrics["temporal_smoothness"] * 100
    scores.append(smoothness_score * 0.2)
    
    # Reasonable pause pattern (some pauses are good)
    ideal_pause_ratio = 0.15
    pause_score = (1 - abs(metrics["pause_ratio"] - ideal_pause_ratio) * 5) * 100
    scores.append(max(0, pause_score) * 0.2)
    
    # Embedding dynamics (varied content)
    dynamics_score = min(metrics["embedding_dynamics"] * 200, 100)
    scores.append(dynamics_score * 0.15)
    
    return round(sum(scores), 1)


def extract_features(audio_path: str) -> dict:
    """
    Extract clarity and communication metrics from audio using WavLM.
    
    Returns a dict with:
    - clarity_score: Overall speech clarity (0-100)
    - communication_score: Overall communication effectiveness (0-100)
    - pause_analysis: Pause patterns and hesitations
    - pitch_energy: Pitch and energy dynamics
    - spectral_clarity: Spectral features for articulation
    - wavlm_features: Deep learning based features
    """
    print(f"\n{'='*50}")
    print(f"Analyzing: {audio_path}")
    print(f"{'='*50}\n")
    
    # Load audio
    audio, sr = librosa.load(audio_path, sr=16000)
    sr = int(sr)
    duration = len(audio) / sr
    print(f"Audio duration: {duration:.1f} seconds")
    
    # Extract all features
    print("\n[1/4] Analyzing pause patterns...")
    pause_metrics = analyze_pauses(audio, sr)
    
    print("[2/4] Analyzing pitch and energy...")
    pitch_energy_metrics = analyze_pitch_and_energy(audio, sr)
    
    print("[3/4] Analyzing spectral clarity...")
    spectral_metrics = analyze_spectral_clarity(audio, sr)
    
    print("[4/4] Extracting WavLM features...")
    wavlm_metrics = extract_wavlm_features(audio, sr)
    
    # Combine all metrics
    all_metrics = {
        **pause_metrics,
        **pitch_energy_metrics,
        **spectral_metrics,
        **wavlm_metrics,
    }
    
    # Compute final scores
    clarity_score = compute_clarity_score(all_metrics)
    communication_score = compute_communication_score(all_metrics)
    
    results = {
        "duration_seconds": round(duration, 1),
        "clarity_score": clarity_score,
        "communication_score": communication_score,
        "pause_analysis": {
            "num_pauses": pause_metrics["num_pauses"],
            "avg_pause_duration_sec": round(pause_metrics["avg_pause_duration"], 2),
            "total_pause_time_sec": round(pause_metrics["total_pause_time"], 2),
            "pause_percentage": round(pause_metrics["pause_ratio"] * 100, 1),
            "longest_pause_sec": round(pause_metrics["longest_pause"], 2),
        },
        "pitch_energy": {
            "pitch_mean_hz": round(pitch_energy_metrics["pitch_mean"], 1),
            "pitch_variation_hz": round(pitch_energy_metrics["pitch_std"], 1),
            "pitch_range_hz": round(pitch_energy_metrics["pitch_range"], 1),
            "energy_consistency_pct": round(pitch_energy_metrics["energy_consistency"] * 100, 1),
        },
        "spectral_clarity": {
            "spectral_centroid_hz": round(spectral_metrics["spectral_centroid_mean"], 1),
            "articulation_dynamics": round(spectral_metrics["articulation_dynamics"], 4),
        },
        "wavlm_features": {
            "embedding_variance": round(wavlm_metrics["embedding_variance"], 4),
            "temporal_smoothness": round(wavlm_metrics["temporal_smoothness"], 4),
            "speech_dynamics": round(wavlm_metrics["embedding_dynamics"], 4),
        },
    }
    
    return results


def print_results(results: dict):
    """Pretty print the analysis results"""
    print(f"\n{'='*50}")
    print("SPEECH CLARITY & COMMUNICATION ANALYSIS")
    print(f"{'='*50}\n")
    
    print(f"Duration: {results['duration_seconds']} seconds\n")
    
    # Main scores
    print("OVERALL SCORES")
    print("-" * 30)
    clarity = results["clarity_score"]
    comm = results["communication_score"]
    
    clarity_bar = "█" * int(clarity / 5) + "░" * (20 - int(clarity / 5))
    comm_bar = "█" * int(comm / 5) + "░" * (20 - int(comm / 5))
    
    print(f"  Clarity:       [{clarity_bar}] {clarity}/100")
    print(f"  Communication: [{comm_bar}] {comm}/100")
    
    # Pause analysis
    print("\nPAUSE ANALYSIS")
    print("-" * 30)
    pa = results["pause_analysis"]
    print(f"  Number of pauses:    {pa['num_pauses']}")
    print(f"  Avg pause duration:  {pa['avg_pause_duration_sec']}s")
    print(f"  Total pause time:    {pa['total_pause_time_sec']}s ({pa['pause_percentage']}%)")
    print(f"  Longest pause:       {pa['longest_pause_sec']}s")
    
    # Pitch & Energy
    print("\nPITCH & ENERGY")
    print("-" * 30)
    pe = results["pitch_energy"]
    print(f"  Average pitch:       {pe['pitch_mean_hz']} Hz")
    print(f"  Pitch variation:     {pe['pitch_variation_hz']} Hz")
    print(f"  Pitch range:         {pe['pitch_range_hz']} Hz")
    print(f"  Energy consistency:  {pe['energy_consistency_pct']}%")
    
    # Clarity indicators
    print("\nCLARITY INDICATORS")
    print("-" * 30)
    sc = results["spectral_clarity"]
    print(f"  Spectral centroid:   {sc['spectral_centroid_hz']} Hz")
    print(f"  Articulation:        {sc['articulation_dynamics']}")
    
    # WavLM insights
    print("\nDEEP LEARNING INSIGHTS (WavLM)")
    print("-" * 30)
    wf = results["wavlm_features"]
    print(f"  Embedding variance:  {wf['embedding_variance']}")
    print(f"  Temporal smoothness: {wf['temporal_smoothness']}")
    print(f"  Speech dynamics:     {wf['speech_dynamics']}")
    
    # Interpretation
    print(f"\n{'='*50}")
    print("INTERPRETATION")
    print(f"{'='*50}")
    
    if clarity >= 70:
        print("✓ Speech clarity is GOOD - clear articulation detected")
    elif clarity >= 50:
        print("○ Speech clarity is MODERATE - some mumbling or unclear segments")
    else:
        print("✗ Speech clarity NEEDS IMPROVEMENT - consider speaking more clearly")
    
    if comm >= 70:
        print("✓ Communication is ENGAGING - good pitch/energy variation")
    elif comm >= 50:
        print("○ Communication is ADEQUATE - could be more dynamic")
    else:
        print("✗ Communication is FLAT - try varying tone and pace more")
    
    if pa["pause_percentage"] > 30:
        print("! High pause ratio - may indicate hesitation or uncertainty")
    elif pa["pause_percentage"] < 10:
        print("! Low pause ratio - consider adding strategic pauses")


if __name__ == "__main__":
    print("=== WavLM Speech Clarity & Communication Analysis ===\n")
    
    try:
        # 1. Download video
        downloaded_video_path = download_video(TEST_VIDEO_URL)
        
        # 2. Extract audio
        extracted_audio_path = extract_audio(downloaded_video_path)
        
        # 3. Extract features with WavLM
        analysis_results = extract_features(extracted_audio_path)
        
        # 4. Print results
        print_results(analysis_results)
        
        # Cleanup temp files
        os.remove(downloaded_video_path)
        os.remove(extracted_audio_path)
        print(f"\n{'='*50}")
        print("Temp files cleaned up. Analysis complete!")
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 400:
            print("ERROR: Token expired! Get a fresh signed URL from your app.")
        else:
            print(f"HTTP Error: {e}")
    except FileNotFoundError as e:
        if "ffmpeg" in str(e).lower():
            print("ERROR: ffmpeg not found. Install it with: choco install ffmpeg")
        else:
            print(f"File not found: {e}")
    except Exception as e:  # pylint: disable=broad-except
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()