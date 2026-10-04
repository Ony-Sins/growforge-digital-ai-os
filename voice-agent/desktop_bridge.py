"""
NORA Desktop Bridge & Companion Daemon for Windows 11.
Provides local loopback control API, process supervision, OS window foregrounding, and SSE voice state broadcasting.
"""

import os
import sys
import json
import time
import ctypes
import asyncio
import logging
import webbrowser
from typing import Set, Dict, Any, Optional
from aiohttp import web, WSMsgType

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from service_supervisor import ServiceSupervisor, StartupPolicy
from desktop_audio_participant import DesktopAudioParticipant

import secrets

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("DesktopBridge")

class DesktopBridge:
    def __init__(self, host: str = "127.0.0.1", port: int = 7890):
        self.host = host
        self.port = port
        self.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.supervisor = ServiceSupervisor(self.repo_root)
        self.bridge_key = self._load_or_create_bridge_key()

        self.app = web.Application(client_max_size=4_000_000)
        self.sse_clients: Set[web.Response] = set()
        self.current_voice_state = {
            "state": "idle",
            "energy": 0.0,
            "timestamp": time.time(),
        }

        self.audio_participant: Optional[DesktopAudioParticipant] = None
        self._setup_routes()

    def _load_or_create_bridge_key(self) -> str:
        env_key = os.environ.get("GROWFORGE_BRIDGE_KEY") or os.environ.get("GROWFORGE_INTERNAL_KEY")
        if env_key:
            return env_key.strip()

        key_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bridge_key")
        if os.path.exists(key_file):
            try:
                with open(key_file, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if len(content) >= 32:
                        return content
            except Exception:
                pass

        token = secrets.token_hex(32)
        try:
            with open(key_file, "w", encoding="utf-8") as f:
                f.write(token)
        except Exception as e:
            logger.warning(f"Could not persist bridge key: {e}")
        return token

    def _verify_auth(self, request: web.Request) -> bool:
        key = (
            request.headers.get("X-GrowForge-Bridge-Key") or 
            request.headers.get("X-GrowForge-Internal-Key") or 
            request.headers.get("Authorization", "").replace("Bearer ", "").strip()
        )
        if not key:
            return False
        return secrets.compare_digest(key, self.bridge_key)

    def _setup_routes(self):
        # Enable CORS for local UI
        self.app.router.add_route("OPTIONS", "/{tail:.*}", self.handle_options)
        self.app.router.add_get("/health", self.handle_health)
        self.app.router.add_get("/services", self.handle_services)
        self.app.router.add_post("/services/{id}/start", self.handle_service_start)
        self.app.router.add_post("/services/{id}/stop", self.handle_service_stop)
        self.app.router.add_post("/navigate", self.handle_navigate)
        self.app.router.add_get("/voice/state", self.handle_get_voice_state)
        self.app.router.add_post("/voice/state", self.handle_post_voice_state)
        self.app.router.add_get("/voice/events", self.handle_voice_events)
        self.app.router.add_post("/voice/trigger", self.handle_voice_trigger)
        self.app.router.add_post("/voice/evaluate", self.handle_voice_evaluate)
        self.app.router.add_post("/voice/mic-owner", self.handle_mic_owner)
        self.app.router.add_post("/voice/token", self.handle_voice_token)

    def _cors_headers(self, request: Optional[web.Request] = None) -> Dict[str, str]:
        origin = request.headers.get("Origin", "*") if request else "*"
        # Restrict CORS to trusted local origins
        allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
        chosen_origin = origin if origin in allowed_origins else "http://127.0.0.1:3000"
        return {
            "Access-Control-Allow-Origin": chosen_origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GrowForge-Bridge-Key, X-GrowForge-Internal-Key",
        }

    async def handle_options(self, request: web.Request) -> web.Response:
        return web.Response(headers=self._cors_headers(request))

    async def handle_health(self, request: web.Request) -> web.Response:
        return web.json_response({
            "status": "ok",
            "service": "nora-desktop-bridge",
            "platform": "windows",
            "timestamp": time.time(),
            "voiceState": self.current_voice_state["state"],
            "micOwner": self.current_voice_state.get("micOwner", "none"),
        }, headers=self._cors_headers(request))

    async def handle_services(self, request: web.Request) -> web.Response:
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))
        summary = await asyncio.to_thread(self.supervisor.get_status_summary)
        return web.json_response({"services": summary}, headers=self._cors_headers(request))

    async def handle_service_start(self, request: web.Request) -> web.Response:
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))
        service_id = request.match_info["id"]
        success = self.supervisor.start_service(service_id)
        svc = self.supervisor.get_service(service_id)
        return web.json_response({
            "success": success,
            "id": service_id,
            "state": svc.state if svc else "UNKNOWN",
            "pid": svc.pid if svc else None
        }, headers=self._cors_headers(request))

    async def handle_service_stop(self, request: web.Request) -> web.Response:
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))
        service_id = request.match_info["id"]
        success = self.supervisor.stop_service(service_id)
        return web.json_response({"success": success, "id": service_id}, headers=self._cors_headers(request))

    def _foreground_or_launch_window(self, url: str) -> bool:
        """Attempts to find and foreground an open GrowForge window, or opens default browser."""
        foregrounded = False
        if sys.platform == "win32":
            try:
                user32 = ctypes.windll.user32
                EnumWindows = user32.EnumWindows
                EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
                GetWindowText = user32.GetWindowTextW
                GetWindowTextLength = user32.GetWindowTextLengthW
                IsWindowVisible = user32.IsWindowVisible
                SetForegroundWindow = user32.SetForegroundWindow
                ShowWindow = user32.ShowWindow

                matched_hwnd = None

                def callback(hwnd, extra):
                    nonlocal matched_hwnd
                    if IsWindowVisible(hwnd):
                        length = GetWindowTextLength(hwnd)
                        if length > 0:
                            buff = ctypes.create_unicode_buffer(length + 1)
                            GetWindowText(hwnd, buff, length + 1)
                            title = buff.value
                            if "GrowForge" in title or "localhost:3000" in title or "127.0.0.1:3000" in title:
                                matched_hwnd = hwnd
                                return False  # Stop enumeration
                    return True

                EnumWindows(EnumWindowsProc(callback), 0)

                if matched_hwnd:
                    ShowWindow(matched_hwnd, 9)  # SW_RESTORE
                    SetForegroundWindow(matched_hwnd)
                    foregrounded = True
                    logger.info(f"Foregrounded existing GrowForge window (HWND: {matched_hwnd}).")
            except Exception as e:
                logger.warning(f"Win32 window focus check: {e}")

        # Always ensure navigation happens in browser
        try:
            webbrowser.open(url)
            logger.info(f"Opened URL in system browser: {url}")
        except Exception as e:
            logger.error(f"Failed to open browser URL: {e}")

        return foregrounded

    async def handle_navigate(self, request: web.Request) -> web.Response:
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))
        try:
            body = await request.json()
        except Exception:
            body = {}

        target_path = body.get("path") or "/?tier=home"
        full_url = f"http://127.0.0.1:3000{target_path}"

        foregrounded = self._foreground_or_launch_window(full_url)
        return web.json_response({
            "success": True,
            "targetUrl": full_url,
            "foregrounded": foregrounded,
            "action": body
        }, headers=self._cors_headers(request))

    async def handle_mic_owner(self, request: web.Request) -> web.Response:
        """Sets the active authoritative microphone owner."""
        try:
            body = await request.json()
        except Exception:
            body = {}

        new_owner = body.get("owner", "none")
        logger.info(f"Microphone ownership changed to: {new_owner}")

        # Strict single-owner invariant:
        # If browser acquires mic, desktop audio participant must yield
        if new_owner == "browser_livekit" and self.audio_participant and self.audio_participant.is_running:
            try:
                await self.audio_participant.stop()
                logger.info("Desktop Audio Participant yielded microphone to browser LiveKit participant.")
            except Exception as e:
                logger.warning(f"Error yielding desktop audio participant: {e}")

        self.current_voice_state["micOwner"] = new_owner
        self.current_voice_state["timestamp"] = time.time()
        asyncio.create_task(self._broadcast_voice_state())

        return web.json_response({"success": True, "micOwner": new_owner}, headers=self._cors_headers(request))

    async def handle_voice_token(self, request: web.Request) -> web.Response:
        """Generates a LiveKit JWT token for local room access."""
        try:
            body = await request.json()
        except Exception:
            body = {}

        room_name = body.get("room", "room_vs_headless_default")
        identity = body.get("identity", "browser_user_" + secrets.token_hex(4))
        name = body.get("name", "Ony (Browser)")

        try:
            from livekit import api
            api_key = os.environ.get("LIVEKIT_API_KEY", "devkey")
            api_secret = os.environ.get("LIVEKIT_API_SECRET", "secret")
            token = (
                api.AccessToken(api_key, api_secret)
                .with_identity(identity)
                .with_name(name)
                .with_grants(
                    api.VideoGrants(
                        room_join=True,
                        room=room_name,
                        can_publish=True,
                        can_subscribe=True,
                        can_publish_data=True,
                    )
                )
            ).to_jwt()

            return web.json_response({
                "token": token,
                "room": room_name,
                "identity": identity
            }, headers=self._cors_headers(request))
        except Exception as e:
            return web.json_response({"error": f"Token generation error: {e}"}, status=500, headers=self._cors_headers(request))

    async def handle_get_voice_state(self, request: web.Request) -> web.Response:
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))
        return web.json_response(self.current_voice_state, headers=self._cors_headers(request))

    async def handle_post_voice_state(self, request: web.Request) -> web.Response:
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))
        try:
            body = await request.json()
            self.current_voice_state.update(body)
            self.current_voice_state["timestamp"] = time.time()
            asyncio.create_task(self._broadcast_voice_state())
            return web.json_response({"success": True}, headers=self._cors_headers(request))
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400, headers=self._cors_headers(request))

    async def _broadcast_voice_state(self):
        payload = f"data: {json.dumps(self.current_voice_state)}\n\n".encode("utf-8")
        dead_clients = set()
        for resp in self.sse_clients:
            try:
                await resp.write(payload)
            except Exception:
                dead_clients.add(resp)
        self.sse_clients.difference_update(dead_clients)

    async def handle_voice_events(self, request: web.Request) -> web.StreamResponse:
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))

        resp = web.StreamResponse(
            status=200,
            reason="OK",
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                **self._cors_headers(request)
            }
        )
        await resp.prepare(request)
        self.sse_clients.add(resp)

        # Send current initial state
        init_payload = f"data: {json.dumps(self.current_voice_state)}\n\n".encode("utf-8")
        await resp.write(init_payload)

        try:
            while True:
                await asyncio.sleep(15.0)
                await resp.write(b": keepalive\n\n")
        except (asyncio.CancelledError, ConnectionResetError):
            pass
        finally:
            self.sse_clients.discard(resp)

        return resp

    async def handle_voice_evaluate(self, request: web.Request) -> web.Response:
        if not self._verify_auth(request):
            return web.json_response({"error":"Unauthorized"},status=401)
        if getattr(self, "evaluating", False):
            return web.json_response({"error":"EVALUATION_BUSY"},status=409)
        if self.current_voice_state.get("inputParticipant"):
            return web.json_response({"error":"STOP_VOICE_SESSION_BEFORE_EVALUATION"},status=409)
        from stt_evaluation import compare
        from urllib.parse import unquote
        expected = unquote(request.headers.get("X-Expected-Transcript", ""))
        if not expected or len(expected)>2000:
            return web.json_response({"error":"REFERENCE_REQUIRED"},status=400)
        recording = await request.read()
        self.evaluating = True
        try:
            return web.json_response(await asyncio.to_thread(compare, recording, expected, request.headers.get("X-Calibration-Category", "normal_english")))
        except Exception as error:
            return web.json_response({"error":str(error)[:200]},status=400)
        finally:
            self.evaluating = False
            recording = None

    async def handle_voice_trigger(self, request: web.Request) -> web.Response:
        """Manual development trigger for a headless voice session."""
        if not self._verify_auth(request):
            return web.json_response({"error": "Unauthorized: valid bridge key required"}, status=401, headers=self._cors_headers(request))

        logger.info("Manual voice trigger received. Ensuring voice services ready...")
        body = await request.json() if request.can_read_body else {}
        
        # 1. Ensure LiveKit Server is ready
        if not await asyncio.to_thread(self.supervisor.ensure_service_ready, "livekit_server"):
            return web.json_response({"error": "LiveKit server failed to start"}, status=500, headers=self._cors_headers(request))

        # 2. Ensure Voice Agent is ready
        # In development slice, if voice agent isn't running, start it
        if not await asyncio.to_thread(self.supervisor.ensure_service_ready, "voice_agent"):
            return web.json_response({"error": "VOICE_AGENT_START_FAILED"}, status=503)

        # Browser owns capture/playback in this path; never open a second mic.
        if body.get("micOwner") == "browser_livekit":
            self.current_voice_state["micOwner"] = "browser_livekit"
            return web.json_response({"success": True, "sessionState": "starting", "room": "room_vs_headless_default"})

        # 3. Start Desktop Audio Participant if not active
        if not self.audio_participant or not self.audio_participant.is_running:
            self.audio_participant = DesktopAudioParticipant()
            try:
                await self.audio_participant.start()
                logger.info("Desktop Audio Participant connected to room.")
            except Exception as e:
                logger.error(f"Failed to start Desktop Audio Participant: {e}")
                return web.json_response({"error": f"Audio Participant error: {e}"}, status=500, headers=self._cors_headers(request))

        return web.json_response({
            "success": True,
            "sessionState": "active",
            "room": "room_vs_headless_default",
            "message": "Desktop Audio Participant is live. Speak into your microphone."
        }, headers=self._cors_headers(request))

    async def start(self):
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, self.host, self.port)
        await site.start()
        logger.info(f"NORA Desktop Bridge listening on http://{self.host}:{self.port}")

        # Ensure baseline WARM services asynchronously in background
        logger.info("Ensuring baseline WARM services...")
        asyncio.create_task(asyncio.to_thread(self.supervisor.ensure_service_ready, "livekit_server"))

async def main():
    bridge = DesktopBridge()
    await bridge.start()
    try:
        while True:
            await asyncio.sleep(1.0)
    except (KeyboardInterrupt, asyncio.CancelledError):
        bridge.supervisor.stop_all()

if __name__ == "__main__":
    asyncio.run(main())
