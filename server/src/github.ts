/**
 * Pokretanje worker workflow-a na GitHubu na zahtev — da pregled i seed nove
 * pretrage ne čekaju cron. Radi samo ako je GITHUB_DISPATCH_TOKEN podešen
 * (fine-grained PAT sa Actions: write za ovaj repo); bez njega tiho preskače
 * i sve radi preko crona.
 */
const token = process.env.GITHUB_DISPATCH_TOKEN ?? '';
const repo = process.env.GITHUB_REPO ?? 'Carry-Potter/kpnotifi';

let lastDispatchAt = 0;

export function isDispatchConfigured(): boolean {
  return token !== '';
}

export async function requestWorkerRun(reason: string): Promise<void> {
  if (!token) return;
  // jedan dispatch u minutu je dovoljan — jedan run obradi sve što čeka
  if (Date.now() - lastDispatchAt < 60_000) return;
  lastDispatchAt = Date.now();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/worker.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'kpnotifi',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ref: 'master' }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (res.ok) console.log(`worker dispatch (${reason})`);
    else console.error(`worker dispatch ${res.status}: ${await res.text()}`);
  } catch (err: any) {
    console.error('worker dispatch greška:', err.message);
  }
}
