const path = require("node:path");

const releaseRoot = __dirname;
const nodeInterpreter = process.env.ERP_NODE_BIN || "node";

module.exports = {
  apps: [
    {
      name: "jincheng-erp-api",
      script: "apps/api/dist/main.js",
      cwd: releaseRoot,
      interpreter: nodeInterpreter,
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        API_PORT: 3101,
      },
      max_memory_restart: "600M",
      kill_timeout: 10000,
      listen_timeout: 15000,
      time: true,
    },
    {
      name: "jincheng-erp-web",
      script: path.join(
        "apps",
        "web",
        ".next",
        "standalone",
        "apps",
        "web",
        "server.js",
      ),
      cwd: releaseRoot,
      interpreter: nodeInterpreter,
      instances: 1,
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
        HOSTNAME: "127.0.0.1",
        API_BASE_URL: "http://127.0.0.1:3101/api/v1",
      },
      max_memory_restart: "700M",
      kill_timeout: 10000,
      listen_timeout: 15000,
      time: true,
    },
  ],
};
