# Agent Guidelines

## Local Runtime

- This project runs locally on Poiesis and is exposed through a Cloudflare tunnel.
- The production web service is the user systemd unit `droplink-web.service`.
- The tunnel service is `cloudflared-droplink.service`.
- The web service listens on `127.0.0.1:3020`; do not assume port `3000` is the active runtime.

## After Code Updates

- After changes that affect the running app, run `bun run build`.
- Restart the managed service with `systemctl --user restart droplink-web.service`.
- Verify the service with `systemctl --user status droplink-web.service --no-pager -l`.
- Smoke-check the local service through `http://127.0.0.1:3020/` and any route that changed.

## Process Hygiene

- Do not leave `next dev`, `bun run dev`, or other ad hoc background terminals running.
- Prefer the managed systemd service over starting local development servers.
- If `droplink-web.service` fails with `EADDRINUSE` on port `3020`, check for a stale `next-server` or `bun run start` process before restarting again.
- Confirm `cloudflared-droplink.service` is active when validating the tunneled deployment.
