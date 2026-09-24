module.exports = {
  apps: [
    {
      name: "omniroute",
      script: "C:/Users/USERAS/AppData/Roaming/npm/node_modules/omniroute/bin/omniroute.mjs",
      args: "serve --no-open --no-tray",
      env: {
        PORT: "20128",
        NODE_ENV: "production",
      },
    },
  ],
};
