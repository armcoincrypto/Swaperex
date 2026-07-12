/**
 * Application version label for diagnostics.
 * Production uses /version.txt; local builds may not have a commit baked in.
 */

let cachedVersion: string | null = null;

function parseVersionTxt(body: string): string | undefined {
  const short = body.match(/(?:^|\n)short=([^\n]+)/)?.[1]?.trim();
  const commit = body.match(/(?:^|\n)commit=([^\n]+)/)?.[1]?.trim();
  return short || commit?.slice(0, 7);
}

export function getEmbeddedAppVersion(): string {
  const envCommit =
    typeof import.meta.env.VITE_GIT_COMMIT === 'string'
      ? import.meta.env.VITE_GIT_COMMIT.trim()
      : '';
  if (envCommit) return envCommit.slice(0, 7);
  return 'unknown';
}

export async function resolveAppVersionLabel(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  const embedded = getEmbeddedAppVersion();
  if (embedded !== 'unknown') {
    cachedVersion = embedded;
    return embedded;
  }
  try {
    const res = await fetch('/version.txt', { cache: 'no-store' });
    if (res.ok) {
      const label = parseVersionTxt(await res.text());
      if (label) {
        cachedVersion = label;
        return label;
      }
    }
  } catch {
    // ignore — fall through
  }
  cachedVersion = 'unknown';
  return 'unknown';
}
