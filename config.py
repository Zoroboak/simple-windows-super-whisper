import os
from dotenv import load_dotenv
import json
import tempfile

# Application version
APP_VERSION = "0.2.0"
APP_NAME = "Windows Whisper"

# Load environment variables from .env file
load_dotenv()

# API Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Recording settings
MAX_RECORDING_SECONDS = int(os.getenv("MAX_RECORDING_SECONDS", 300))
SAMPLE_RATE = int(os.getenv("SAMPLE_RATE", 16000))
CHANNELS = 1  # Mono recording
TEMP_DIR = tempfile.gettempdir()

# Whisper API settings
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-1") 
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "en")  # Default to English
WHISPER_PROMPT = os.getenv("WHISPER_PROMPT", "Transcribe this audio exactly as spoken, preserving the original language. Guidelines: 1) Keep technical terms, code snippets, and variable names exactly as pronounced. 2) Add appropriate punctuation for readability. 3) If Spanish is spoken, respond in Spanish. If English is spoken, respond in English. 4) Maintain proper formatting for code-related content. 5) Don't translate or change the language - preserve exactly what was said. 6) For mixed languages, keep each phrase in its original language.")
API_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions"

# UI settings
UI_THEME = os.getenv("UI_THEME", "light")
UI_OPACITY = float(os.getenv("UI_OPACITY", 0.9))

# Hotkey settings
SHORTCUT_KEY = "ctrl+space"

# Auto-insert settings
AUTO_INSERT_ENABLED = os.getenv("AUTO_INSERT_ENABLED", "true").lower() == "true"

def validate_config():
    """Validate that all required configuration is available"""
    if not OPENAI_API_KEY:
        raise ValueError("OpenAI API key is not set. Please set OPENAI_API_KEY in .env file.")
    
    return True

def get_temp_audio_path():
    """Generate a temporary path for the audio file"""
    return os.path.join(TEMP_DIR, "whisper_recording_temp.wav") 