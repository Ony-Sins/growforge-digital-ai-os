"""Explicit local capabilities. Prepared candidates are unavailable until physically evaluated."""
import re
PROVIDERS = {
    "kokoro": {"languages": ["en"], "profile": "LOCAL_FAST", "installed": True, "chunkedAudio": True, "incrementalText": True},
    "chatterbox-turbo": {"languages": ["en"], "profile": "LOCAL_QUALITY", "installed": False, "chunkedAudio": False, "incrementalText": False},
    "qwen3-tts-0.6b": {"languages": ["en"], "profile": "LOCAL_QUALITY", "installed": False, "chunkedAudio": None, "incrementalText": None},
    "indicf5": {"languages": ["bn"], "profile": "LOCAL_QUALITY", "installed": False, "chunkedAudio": False, "incrementalText": False},
}
def text_language(text):
    has_bn = bool(re.search(r"[\u0980-\u09ff]", text))
    has_en = bool(re.search(r"[A-Za-z]", text))
    return "mixed" if has_bn and has_en else "bn" if has_bn else "en"

def select_provider(text, preferred="kokoro"):
    language = text_language(text)
    candidate = PROVIDERS.get(preferred)
    # Mixed text requires a demonstrated mixed-language provider, not naive script slicing.
    if candidate and candidate["installed"] and language in candidate["languages"]:
        return preferred, language
    return None, language
