"""UNIT/INJECTED: stop intent and echo logic only, not acoustic proof."""
import asyncio
import numpy as np
from agent import NoraVoiceAgent

class STT:
    def __init__(self,text):
        self.text=text
        self.last_info={"avgLogprob":-.2,"noSpeechProbability":.01}
    async def transcribe(self,*args,**kwargs): return self.text

async def main():
    agent=NoraVoiceAgent()
    receipts=[]
    async def receive(**kwargs): receipts.append(kwargs)
    agent.update_bridge_state=receive
    pcm=np.zeros(8000,dtype=np.int16).tobytes()
    for phrase in ["Stop.","Stop talking.","Quiet.","Cancel.","Never mind.","No, stop."]:
        agent.stt_provider=STT(phrase)
        await agent.process_audio_utterance(pcm,0)
        assert receipts[-1].get("stopIntent"),phrase
        assert agent.current_state=="listening"
    agent.last_spoken_text="You currently have no active missions running."
    agent.stt_provider=STT(agent.last_spoken_text)
    await agent.process_audio_utterance(pcm,0,overlap=True)
    assert receipts[-1]["lifecycleEvent"]=="suspected_echo_suppressed"
    await agent.http_client.aclose()
    await agent.tts_audio_source.aclose()
    print("PASS UNIT/INJECTED stop phrases bypass NORA and overlapping matching output suppressed; not physical echo evidence.")

if __name__=="__main__":asyncio.run(main())
