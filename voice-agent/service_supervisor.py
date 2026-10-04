"""
GrowForge Service Registry and Lifecycle Supervisor.
Manages deterministic external and local service processes for NORA on Windows 11.
"""

import os
import sys
import time
import socket
import asyncio
import logging
import subprocess
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import urllib.request
import urllib.error
import json

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ServiceSupervisor")

class ServiceType:
    PROCESS = "PROCESS"                      # Standalone OS process managed by supervisor
    CAPABILITY = "CAPABILITY"                # Functional subsystem exposed by a process
    MODEL = "MODEL"                          # Neural network weights loaded into RAM/VRAM
    REMOTE_API = "REMOTE_API"                # External or cloud API endpoint (BYOK)
    BROWSER_CLIENT = "BROWSER_CLIENT"        # Web / Spatial Canvas client interface
    EMBEDDED_LIBRARY = "EMBEDDED_LIBRARY"    # In-process library (e.g. CTranslate2, ONNX)

class ServiceState:
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    READY = "READY"
    DEGRADED = "DEGRADED"
    FAILED = "FAILED"

class StartupPolicy:
    ALWAYS = "ALWAYS"
    WARM = "WARM"
    ON_DEMAND = "ON_DEMAND"
    MANUAL = "MANUAL"
    DISABLED = "DISABLED"

class ResourceClass:
    MICRO = "MICRO"     # < 50 MB RAM, negligible CPU
    LOW = "LOW"         # 50 - 200 MB RAM
    MEDIUM = "MEDIUM"   # 200 - 800 MB RAM
    HIGH = "HIGH"       # > 800 MB RAM / GPU VRAM

@dataclass
class ServiceCapability:
    name: str
    type: str  # CAPABILITY or MODEL
    details: str
    status: str = "READY"

@dataclass
class ServiceDefinition:
    id: str
    name: str
    command: List[str]
    cwd: str
    health_url: Optional[str] = None
    health_port: Optional[int] = None
    startup_policy: str = StartupPolicy.WARM
    resource_class: str = ResourceClass.LOW
    dependencies: List[str] = field(default_factory=list)
    capabilities: List[ServiceCapability] = field(default_factory=list)
    timeout_seconds: float = 15.0
    restart_limit: int = 3
    
    # Dynamic runtime tracking
    state: str = ServiceState.STOPPED
    process: Optional[subprocess.Popen] = None
    pid: Optional[int] = None
    last_health_check: float = 0.0
    last_health_status: bool = False
    last_error: Optional[str] = None
    restart_count: int = 0

class ServiceSupervisor:
    def __init__(self, repo_root: str):
        self.repo_root = os.path.abspath(repo_root)
        self.services: Dict[str, ServiceDefinition] = {}
        self._register_all_known_services()

    def _register_all_known_services(self):
        py_exe = sys.executable
        livekit_bin = os.path.join(self.repo_root, "voice-agent", "bin", "livekit-server.exe")
        livekit_cfg = os.path.join(self.repo_root, "voice-agent", "config", "livekit-local.yaml")

        # 1. Desktop Bridge Companion Daemon
        self.register(ServiceDefinition(
            id="desktop_bridge",
            name="NORA Desktop Bridge & Control Plane",
            command=[py_exe, os.path.join(self.repo_root, "voice-agent", "desktop_bridge.py")],
            cwd=os.path.join(self.repo_root, "voice-agent"),
            health_url="http://127.0.0.1:7890/health",
            health_port=7890,
            startup_policy=StartupPolicy.ALWAYS,
            resource_class=ResourceClass.MICRO,
            timeout_seconds=5.0
        ))

        # 2. LiveKit WebRTC Server (Native Windows binary)
        self.register(ServiceDefinition(
            id="livekit_server",
            name="LiveKit WebRTC Server",
            command=[livekit_bin, "--config", livekit_cfg],
            cwd=os.path.join(self.repo_root, "voice-agent"),
            health_url="http://127.0.0.1:7880/",
            health_port=7880,
            startup_policy=StartupPolicy.WARM,
            resource_class=ResourceClass.LOW,
            timeout_seconds=8.0
        ))

        # 3. GrowForge NORA Backend (Next.js Node Server)
        self.register(ServiceDefinition(
            id="nora_backend",
            name="GrowForge Core Backend & Router",
            command=["npm.cmd", "run", "dev"],
            cwd=os.path.join(self.repo_root, "growforge-ui"),
            health_url="http://127.0.0.1:3000/api/health",
            health_port=3000,
            startup_policy=StartupPolicy.WARM,
            resource_class=ResourceClass.MEDIUM,
            timeout_seconds=20.0,
            capabilities=[
                ServiceCapability("ModelRouter", ServiceType.CAPABILITY, "Authoritative zero-spend model routing"),
                ServiceCapability("JobOrchestrator", ServiceType.CAPABILITY, "Multi-department agent execution"),
                ServiceCapability("UserMemory", ServiceType.CAPABILITY, "Persistent operator shadow memory")
            ]
        ))

        # 4. NORA LiveKit Voice Agent (Python STT/TTS Pipeline)
        agent_script = os.path.join(self.repo_root, "voice-agent", "agent.py")
        self.register(ServiceDefinition(
            id="voice_agent",
            name="NORA LiveKit Voice Agent",
            command=[py_exe, agent_script, "start"],
            cwd=os.path.join(self.repo_root, "voice-agent"),
            health_port=None,
            startup_policy=StartupPolicy.WARM,
            resource_class=ResourceClass.MEDIUM,
            dependencies=["livekit_server", "nora_backend"],
            timeout_seconds=90.0,
            capabilities=[
                ServiceCapability("TurnDetector", ServiceType.MODEL, "v1-mini (LiveKit native inference)"),
                ServiceCapability("faster-whisper", ServiceType.MODEL, "base.en int8 CTranslate2 STT"),
                ServiceCapability("Kokoro-82M", ServiceType.MODEL, "af_heart PyTorch 24kHz TTS")
            ]
        ))

        # 5. Desktop Audio Participant (Windows Mic & Speaker LiveKit Client)
        participant_script = os.path.join(self.repo_root, "voice-agent", "desktop_audio_participant.py")
        self.register(ServiceDefinition(
            id="desktop_audio_participant",
            name="NORA Desktop Audio Participant",
            command=[py_exe, participant_script],
            cwd=os.path.join(self.repo_root, "voice-agent"),
            health_port=None,
            startup_policy=StartupPolicy.WARM,
            resource_class=ResourceClass.LOW,
            dependencies=["livekit_server"],
            timeout_seconds=10.0,
            capabilities=[
                ServiceCapability("WindowsMicCapture", ServiceType.CAPABILITY, "Direct MediaDevices input capture with AEC/AGC"),
                ServiceCapability("WindowsSpeakerPlayback", ServiceType.CAPABILITY, "LiveKit room audio subscription and playback")
            ]
        ))

        # 6. Ollama Daemon (Local LLM Gateway)
        self.register(ServiceDefinition(
            id="ollama",
            name="Ollama Local LLM Server",
            command=["ollama", "serve"],
            cwd=self.repo_root,
            health_url="http://127.0.0.1:11434/api/version",
            health_port=11434,
            startup_policy=StartupPolicy.WARM,
            resource_class=ResourceClass.LOW,
            timeout_seconds=10.0,
            capabilities=[
                ServiceCapability("LocalModels", ServiceType.MODEL, "On-demand loaded models (qwen2.5:7b, deepseek-r1:7b)")
            ]
        ))

        # 7. SearXNG Local Search Gateway (Native Python PM2 Service)
        searx_python = "C:\\Ony\\searxng-src\\.venv\\Scripts\\python.exe"
        searx_cwd = "C:\\Ony\\searxng-src"
        self.register(ServiceDefinition(
            id="searxng",
            name="SearXNG Local Search Engine",
            command=[searx_python if os.path.exists(searx_python) else py_exe, "searx/webapp.py"],
            cwd=searx_cwd if os.path.exists(searx_cwd) else self.repo_root,
            health_url="http://localhost:8088/healthz",
            health_port=8088,
            startup_policy=StartupPolicy.WARM,
            resource_class=ResourceClass.LOW,
            timeout_seconds=10.0
        ))

        # 8. ComfyUI Local Image Generation Engine (On-Demand)
        comfy_python = "C:\\Ony\\ComfyUI\\.venv\\Scripts\\python.exe"
        comfy_cwd = "C:\\Ony\\ComfyUI"
        self.register(ServiceDefinition(
            id="comfyui",
            name="ComfyUI Local Image Generator",
            command=[comfy_python if os.path.exists(comfy_python) else py_exe, "main.py", "--listen", "127.0.0.1", "--port", "8188"],
            cwd=comfy_cwd if os.path.exists(comfy_cwd) else self.repo_root,
            health_url="http://127.0.0.1:8188/system_stats",
            health_port=8188,
            startup_policy=StartupPolicy.ON_DEMAND,
            resource_class=ResourceClass.HIGH,
            timeout_seconds=25.0
        ))

        # 9. OmniRoute Local AI Gateway (PM2 Service)
        self.register(ServiceDefinition(
            id="omniroute",
            name="OmniRoute Local AI Gateway",
            command=["npm.cmd", "run", "omniroute"],
            cwd=self.repo_root,
            health_url="http://localhost:20128/v1/models",
            health_port=20128,
            startup_policy=StartupPolicy.WARM,
            resource_class=ResourceClass.LOW,
            timeout_seconds=10.0
        ))

    def register(self, service: ServiceDefinition):
        self.services[service.id] = service

    def get_service(self, service_id: str) -> Optional[ServiceDefinition]:
        return self.services.get(service_id)

    def is_port_open(self, port: int, host: str = "127.0.0.1") -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.15)
                return s.connect_ex((host, port)) == 0
        except Exception:
            return False

    def check_health(self, service_id: str) -> bool:
        svc = self.services.get(service_id)
        if not svc:
            return False

        svc.last_health_check = time.time()
        if service_id == "voice_agent":
            try:
                key = os.environ.get("GROWFORGE_BRIDGE_KEY") or os.environ.get("GROWFORGE_INTERNAL_KEY")
                if not key:
                    with open(os.path.join(self.repo_root, "voice-agent", ".bridge_key"), encoding="utf-8") as handle:
                        key = handle.read().strip()
                req = urllib.request.Request("http://127.0.0.1:7890/voice/state", headers={"X-GrowForge-Bridge-Key": key})
                with urllib.request.urlopen(req, timeout=1) as response:
                    data = json.load(response)
                healthy = bool(data.get("agentReady")) and time.time()-data.get("timestamp", 0)<4
            except Exception:
                healthy = False
            svc.last_health_status = healthy
            svc.state = ServiceState.READY if healthy else (ServiceState.STARTING if svc.process and svc.process.poll() is None else ServiceState.STOPPED)
            return healthy

        # If it has a port, check port first to avoid long HTTP timeouts on stopped services
        if svc.health_port and not self.is_port_open(svc.health_port):
            svc.last_health_status = False
            svc.state = ServiceState.STOPPED
            return False

        # If it has a health URL, probe HTTP
        if svc.health_url:
            try:
                req = urllib.request.Request(svc.health_url, headers={"User-Agent": "GrowForge-Supervisor/1.0"})
                with urllib.request.urlopen(req, timeout=0.5) as resp:
                    if resp.status in (200, 204, 401, 404):  # Valid responding HTTP service
                        svc.last_health_status = True
                        svc.state = ServiceState.READY
                        return True
            except Exception as e:
                svc.last_health_status = False
                svc.last_error = str(e)
                if svc.state == ServiceState.READY:
                    svc.state = ServiceState.DEGRADED
                return False

        # If it has only a port
        if svc.health_port:
            healthy = self.is_port_open(svc.health_port)
            svc.last_health_status = healthy
            svc.state = ServiceState.READY if healthy else ServiceState.STOPPED
            return healthy

        # Process-only check
        if svc.process and svc.process.poll() is None:
            svc.last_health_status = True
            svc.state = ServiceState.READY
            return True

        svc.last_health_status = False
        return False

    def start_service(self, service_id: str) -> bool:
        svc = self.services.get(service_id)
        if not svc:
            logger.error(f"Service {service_id} not registered")
            return False

        # First check if already healthy and running externally
        if self.check_health(service_id):
            logger.info(f"Service '{svc.name}' is already healthy and reachable.")
            svc.state = ServiceState.READY
            return True

        if svc.process and svc.process.poll() is None:
            # Wait on the existing warm-up; never launch another agent identity.
            deadline = time.time() + svc.timeout_seconds
            while time.time() < deadline and svc.process.poll() is None:
                if self.check_health(service_id): return True
                time.sleep(.5)
            return False

        # Resolve dependencies first
        for dep_id in svc.dependencies:
            logger.info(f"Resolving dependency: {dep_id} for {service_id}")
            if not self.ensure_service_ready(dep_id):
                svc.state = ServiceState.FAILED
                svc.last_error = f"Dependency '{dep_id}' failed to start"
                return False

        logger.info(f"Starting service '{svc.name}' ({service_id})...")
        svc.state = ServiceState.STARTING

        try:
            flags = 0
            if sys.platform == "win32":
                flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW

            log_dir = os.path.join(self.repo_root, "voice-agent", "logs")
            os.makedirs(log_dir, exist_ok=True)
            log_file = open(os.path.join(log_dir, service_id + ".log"), "a", encoding="utf-8")
            proc = subprocess.Popen(
                svc.command,
                cwd=svc.cwd,
                stdout=log_file,
                stderr=log_file,
                creationflags=flags
            )
            log_file.close()
            svc.process = proc
            svc.pid = proc.pid

            # Wait for health probe
            start_time = time.time()
            while time.time() - start_time < svc.timeout_seconds:
                if proc.poll() is not None:
                    svc.state = ServiceState.FAILED
                    svc.last_error = f"Process exited immediately with code {proc.returncode}"
                    logger.error(f"Service '{svc.name}' died immediately ({svc.last_error})")
                    return False

                if self.check_health(service_id):
                    logger.info(f"Service '{svc.name}' is now READY (PID: {svc.pid}).")
                    svc.state = ServiceState.READY
                    return True

                time.sleep(0.5)

            # Timed out
            logger.warning(f"Service '{svc.name}' start timed out after {svc.timeout_seconds}s")
            svc.state = ServiceState.DEGRADED
            return False

        except Exception as e:
            svc.state = ServiceState.FAILED
            svc.last_error = str(e)
            logger.error(f"Failed to spawn service '{svc.name}': {e}")
            return False

    def ensure_service_ready(self, service_id: str) -> bool:
        if self.check_health(service_id):
            return True
        return self.start_service(service_id)

    def stop_service(self, service_id: str) -> bool:
        svc = self.services.get(service_id)
        if not svc:
            return False

        if not svc.process or svc.process.poll() is not None:
            svc.state = ServiceState.STOPPED
            return True

        logger.info(f"Stopping service '{svc.name}' (PID: {svc.pid})...")
        try:
            svc.process.terminate()
            try:
                svc.process.wait(timeout=3.0)
            except subprocess.TimeoutExpired:
                svc.process.kill()
                svc.process.wait(timeout=1.0)
        except Exception as e:
            logger.warning(f"Error terminating service '{svc.name}': {e}")

        svc.state = ServiceState.STOPPED
        svc.process = None
        svc.pid = None
        return True

    def stop_all(self):
        for svc_id in list(self.services.keys()):
            self.stop_service(svc_id)

    def get_status_summary(self) -> Dict[str, Any]:
        result = {}
        for s_id, s in self.services.items():
            self.check_health(s_id)
            result[s_id] = {
                "id": s.id,
                "name": s.name,
                "state": s.state,
                "policy": s.startup_policy,
                "resourceClass": s.resource_class,
                "pid": s.pid,
                "lastHealthStatus": s.last_health_status,
                "lastError": s.last_error,
                "capabilities": [{"name": c.name, "type": c.type, "details": c.details} for c in s.capabilities]
            }
        return result
