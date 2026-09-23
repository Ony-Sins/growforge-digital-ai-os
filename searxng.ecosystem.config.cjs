module.exports = {
  apps: [
    {
      name: "searxng",
      cwd: "C:/Ony/searxng-src",
      script: "searx/webapp.py",
      interpreter: "C:/Ony/searxng-src/.venv/Scripts/python.exe",
      env: {
        PYTHONUNBUFFERED: "1",
        PYTHONPATH: "C:/Ony/searxng-src",
        SEARXNG_SETTINGS_PATH: "C:/Ony/GrowForge-Digital-AI-OS/searxng/settings.yml",
      },
    },
  ],
};
