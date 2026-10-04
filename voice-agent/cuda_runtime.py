"""Load NVIDIA's official wheel DLLs from this environment, without system changes."""
import os
import sys
from pathlib import Path
_handles = []
def configure_cuda():
    if os.name != "nt": return []
    root = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    folders = sorted({str(path.parent) for path in root.glob("**/*.dll")})
    for folder in folders: _handles.append(os.add_dll_directory(folder))
    if folders: os.environ["PATH"] = os.pathsep.join(folders) + os.pathsep + os.environ.get("PATH", "")
    return folders
configure_cuda()
