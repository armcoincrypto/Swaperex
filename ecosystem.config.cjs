/**
 * PM2 Ecosystem Configuration
 *
 * Provides stable production deployment for frontend.
 * Uses local serve binary instead of npx to avoid argument parsing issues.
 */

module.exports = {
  apps: [
    {
      name: "frontend",
      cwd: "/root/Swaperex/frontend",
      script: "./node_modules/.bin/serve",
      args: "-s dist -l 3000",
      env: {
        NODE_ENV: "production"
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: "10s",
      // Logging
      error_file: "/root/Swaperex/logs/frontend-error.log",
      out_file: "/root/Swaperex/logs/frontend-out.log",
      merge_logs: true,
      // Don't watch files in production
      watch: false
    },
    {
      name: "backend-signals",
      cwd: "/root/Swaperex/backend-signals",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production"
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: "10s",
      // Logging
      error_file: "/root/Swaperex/logs/backend-error.log",
      out_file: "/root/Swaperex/logs/backend-out.log",
      merge_logs: true,
      watch: false
    }
  ]
};
