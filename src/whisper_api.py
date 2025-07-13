import requests
import json
import os
import logging
import time
from config import WHISPER_LANGUAGE, WHISPER_PROMPT

logger = logging.getLogger(__name__)

class WhisperAPI:
    """
    Client for interacting with OpenAI's Whisper API
    """
    def __init__(self, api_key, api_endpoint, model="whisper-1"):
        """
        Initialize the Whisper API client
        
        Args:
            api_key (str): OpenAI API key
            api_endpoint (str): Whisper API endpoint URL
            model (str): Whisper model to use (default: whisper-1)
        """
        self.api_key = api_key
        self.api_endpoint = api_endpoint
        self.model = "whisper-1"  # Enforcing whisper-1 as it's the only available API model
        logger.debug(f"WhisperAPI initialized with endpoint: {api_endpoint}, model: {self.model}")
        
    def transcribe(self, audio_file_path):
        """
        Transcribe audio using Whisper API
        
        Args:
            audio_file_path (str): Path to the audio file to transcribe
            
        Returns:
            tuple: (success, text or error message)
        """
        if not os.path.exists(audio_file_path):
            error_msg = f"Audio file not found: {audio_file_path}"
            logger.error(error_msg)
            return False, error_msg
            
        try:
            # Log file details
            file_size = os.path.getsize(audio_file_path)
            logger.info(f"Processing audio file: {audio_file_path} (size: {file_size/1024:.1f} KB)")
            
            # Check if file is too small
            if file_size < 1024:  # Less than 1KB
                logger.warning(f"Audio file is very small: {file_size} bytes. May contain no audio.")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}"
            }
            
            with open(audio_file_path, "rb") as audio_file:
                files = {
                    "file": (os.path.basename(audio_file_path), audio_file, "audio/wav")
                }
                
                data = {
                    "model": self.model,
                    "response_format": "json",
                    "language": WHISPER_LANGUAGE,
                    "prompt": WHISPER_PROMPT
                }
                
                logger.info(f"Sending request to Whisper API with model: {self.model}, language: {WHISPER_LANGUAGE}")
                logger.info(f"Using prompt: {WHISPER_PROMPT[:100]}..." if WHISPER_PROMPT else "No custom prompt")
                start_time = time.time()
                
                response = requests.post(
                    self.api_endpoint,
                    headers=headers,
                    files=files,
                    data=data
                )
                
                elapsed_time = time.time() - start_time
                logger.debug(f"API request completed in {elapsed_time:.2f} seconds with status code: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    transcription = result.get("text", "").strip()
                    logger.info(f"Transcription successful: {len(transcription)} chars")
                    logger.debug(f"First 100 chars of transcription: {transcription[:100]}...")
                    return True, transcription
                else:
                    error_msg = f"API Error: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    return False, error_msg
                    
        except Exception as e:
            error_msg = f"Transcription error: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
            
    def get_usage_info(self):
        """Get current Whisper API usage information (placeholder - not implemented)"""
        # This would require additional API calls to OpenAI's usage endpoints
        # Left as placeholder for potential future implementation
        return {
            "available": True,
            "usage": "Unknown"
        } 