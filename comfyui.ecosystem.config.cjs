module.exports = {
  apps: [
    {
      name: "comfyui",
      cwd: "C:/Ony/ComfyUI",
      script: "main.py",
      interpreter: "C:/Ony/ComfyUI/.venv/Scripts/python.exe",
      args: "--listen 127.0.0.1 --port 8188",
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};
