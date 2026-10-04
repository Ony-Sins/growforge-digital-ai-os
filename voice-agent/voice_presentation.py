"""Bounded sentence buffering: never feed Markdown tables/code or unfinished clauses to speech."""
import re

class SpeechBuffer:
    def __init__(self, display="NORA", spoken="Nora", limit=2):
        self.pending = ""
        self.display, self.spoken, self.limit = display, spoken, limit
        self.count = 0
        self.characters = 0
        self.blocked = False

    def feed(self, delta):
        self.pending += delta
        ready = []
        while self.count < self.limit:
            match = re.search(r"[.!?।](?:\s|$)", self.pending)
            if not match: break
            sentence, self.pending = self.pending[:match.end()].strip(), self.pending[match.end():]
            if re.search(r"```|https?://|^\s*[|#>]|^\s*[*-]\s|^\s*\d+[.)]\s", sentence):
                self.blocked = True
                break
            sentence = re.sub(r"[*_`]", "", sentence)
            sentence = re.sub(r"(?<!\w)"+re.escape(self.display)+r"(?!\w)", self.spoken, sentence)
            if self.blocked or self.characters + len(sentence) > (1200 if self.limit > 2 else 450): break
            self.count += 1; self.characters += len(sentence)
            ready.append(sentence)
        return ready
