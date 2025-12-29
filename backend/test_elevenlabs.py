import os
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

# Load environment variables
load_dotenv()

# Configuration
API_KEY = os.getenv("ELEVENLABS_API_KEY")
FILE_PATH = "uploads/b170a5a41c2ff3b036d45571c9ae5dae" # The ~22KB file

def test_transcription():
    print("Testing ElevenLabs Transcription (Python)...")
    
    if not API_KEY:
        print("❌ Error: ELEVENLABS_API_KEY not found in .env")
        return

    print(f"API Key found: {API_KEY[:5]}...")
    
    if not os.path.exists(FILE_PATH):
        print(f"❌ Error: Test file not found at {FILE_PATH}")
        return

    client = ElevenLabs(api_key=API_KEY)

    try:
        print("Sending request to ElevenLabs Scribe v1...")
        
        # Open file in binary read mode
        with open(FILE_PATH, "rb") as audio_file:
            transcript = client.speech_to_text.convert(
                file=audio_file,
                model_id="scribe_v1"
            )
            
        print("\n✅ Success! Transcription result:")
        print("Language:", transcript.language_code)
        print("Text:", transcript.text)
        
    except Exception as e:
        print(f"\n❌ API Error: {str(e)}")
        # Check if it has a body/message attribute commonly returned by the SDK
        if hasattr(e, 'body'):
            print("Details:", e.body)

if __name__ == "__main__":
    test_transcription()
