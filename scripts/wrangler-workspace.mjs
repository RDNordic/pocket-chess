// Runs a Wrangler command with its global config/metrics/log state
// redirected into a project-local, gitignored directory instead of the
// user's OS profile, and with telemetry explicitly disabled at the process
// level. Used by both `npm run cf:dev` and `npm run cf:dry-run` - anything
// that doesn't need to find a real login session.
//
// Usage: node scripts/wrangler-workspace.mjs <wrangler subcommand and args...>
//   node scripts/wrangler-workspace.mjs dev
//   node scripts/wrangler-workspace.mjs deploy --dry-run
//
// Why the redirection: Wrangler writes global state (metrics.json, debug
// logs, the local dev registry) under an XDG-style config path that
// defaults, on Windows, to `%APPDATA%\xdg.config\.wrangler` - see
// `xdgConfig()`/`getGlobalConfigPath()` in
// node_modules/wrangler/wrangler-dist/cli.js. `XDG_CONFIG_HOME` and
// `WRANGLER_LOG_PATH` are genuine Wrangler-supported environment variables
// (confirmed in that same source, not guessed) that redirect it.
//
// Why WRANGLER_SEND_METRICS=false in addition to wrangler.jsonc's
// `send_metrics: false`: this env var is Wrangler's own highest-priority
// override for `getMetricsConfig()` (checked before the config file value),
// so it disables telemetry for this process regardless of how config
// loading resolves. With metrics disabled, Wrangler's own dispatcher logs
// "Metrics dispatcher: Dispatching disabled - would have sent ..." and
// returns *before* ever calling fetch() - it never logs "Posting data" and
// never makes the network request that log line precedes (see the
// `dispatch2()` function in wrangler-dist/cli.js).
//
// Runs the installed Wrangler's own bin entry point
// (node_modules/wrangler/bin/wrangler.js) directly via `node`, not through
// `npx wrangler` and not with `shell: true`. `npx` adds a resolution step
// that isn't needed - the exact devDependency version is already on disk -
// and running a shell to interpret the command line is unnecessary attack
// surface for a script whose arguments are just forwarded CLI flags.
// `node <path> <args>` needs no shell at all: `node.exe` is a real
// executable, not a batch/shell script, so Node's default `shell: false`
// spawns it directly and identically on every platform.
//
// This is deliberately NOT used for `npm run cf:deploy`: a real deployment
// needs Wrangler to find the OAuth token written by a separately-run `npx
// wrangler login`, which lives in that same normal global location by
// design. Redirecting it here too would just make every developer log in
// again from inside this repo instead of reusing their existing Cloudflare
// session - see README.md's Cloudflare section.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workspaceConfigDir = path.join(repoRoot, '.wrangler-workspace');
const wranglerBin = path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const env = {
  ...process.env,
  XDG_CONFIG_HOME: workspaceConfigDir,
  WRANGLER_LOG_PATH: path.join(workspaceConfigDir, '.wrangler', 'logs'),
  WRANGLER_SEND_METRICS: 'false',
};

const wranglerArgs = process.argv.slice(2);

const result = spawnSync(process.execPath, [wranglerBin, ...wranglerArgs], {
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);
