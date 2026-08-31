/**
 * PM2 process definitions.
 *
 * Both apps run as the cPanel account user and bind to localhost only — Apache
 * is the single thing listening on 80 and 443. Nothing here should ever be
 * reachable directly from the internet.
 *
 * Run from the app directory, which sits OUTSIDE public_html: everything under
 * the document root is downloadable, and this repository holds .env.
 *
 *   pm2 start infra/ecosystem.config.cjs
 *   pm2 save && pm2 startup      # survive a reboot
 */
const path = require("path");
const root = path.resolve(__dirname, "..");

/** Shared across both apps. Secrets come from the environment, never from here. */
const common = {
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  max_restarts: 10,
  min_uptime: "20s",
  // Restart before the box starts swapping rather than after.
  max_memory_restart: "600M",
  kill_timeout: 8000,
  wait_ready: false,
  env: { NODE_ENV: "production" },
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: "fantazia-web",
      cwd: path.join(root, "apps/web"),
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000 --hostname 127.0.0.1",
      env: { ...common.env, PORT: 3000 },
      error_file: "/var/log/fantazia/web.error.log",
      out_file: "/var/log/fantazia/web.out.log",
    },
    {
      ...common,
      name: "fantazia-admin",
      cwd: path.join(root, "apps/admin"),
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3001 --hostname 127.0.0.1",
      env: { ...common.env, PORT: 3001 },
      error_file: "/var/log/fantazia/admin.error.log",
      out_file: "/var/log/fantazia/admin.out.log",
    },
    {
      ...common,
      name: "fantazia-worker",
      cwd: path.join(root, "apps/worker"),
      // node directly, with tsx as a loader — NOT the tsx binary. The tsx
      // binary spawns a child and does not forward SIGTERM, so `pm2 reload`
      // would kill the worker mid-call instead of letting it finish. A
      // reservation call killed halfway is a lost response, which is the one
      // failure this whole system is arranged to avoid.
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      // Nothing here serves traffic, and one pass a minute is ample: the
      // shortest retry backoff is two seconds but the ladder stretches to four
      // minutes, so a minute of granularity costs nothing.
      env: { ...common.env, WORKER_INTERVAL_MS: 60000 },
      // Longer than the apps: a pass may be mid-reservation when a reload
      // lands, and the shutdown handler waits up to twenty seconds for it.
      kill_timeout: 25000,
      max_memory_restart: "300M",
      error_file: "/var/log/fantazia/worker.error.log",
      out_file: "/var/log/fantazia/worker.out.log",
    },
  ],
};
