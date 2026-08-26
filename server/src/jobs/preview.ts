/**
 * Obrada zahteva za pregled (worker): izvrši KP pretragu i upiši rezultat
 * koji sajt polluje. Format rezultata je isti kao direktan /api/preview.
 */
import { searchAds } from '../kp/client.ts';
import { buildSearchUrl, type FilterParams } from '../kp/filters.ts';
import { isDegradedResult } from '../kp/parser.ts';
import { completePreviewJob, takePendingPreviewJob } from '../db/repo.ts';

export function buildPreviewResult(params: FilterParams, r: Awaited<ReturnType<typeof searchAds>>) {
  return {
    params,
    kpUrl: buildSearchUrl(params),
    total: r.total,
    filterName: r.filterName,
    sample: r.ads.slice(0, 5).map((a) => ({
      id: a.id,
      name: a.name,
      priceText: a.priceText,
      location: a.location,
      image: a.image,
      adUrl: a.adUrl,
    })),
  };
}

/** Obradi sve zahteve na čekanju; vraća koliko ih je obrađeno. */
export async function processPreviewJobs(): Promise<number> {
  let n = 0;
  while (true) {
    const job = await takePendingPreviewJob();
    if (!job) return n;
    let result: unknown;
    try {
      const r = await searchAds(job.params);
      if (isDegradedResult(r)) throw new Error('KP je vratio prazan odgovor');
      result = buildPreviewResult(job.params, r);
    } catch (err: any) {
      result = { error: err.message };
    }
    await completePreviewJob(job.id, result);
    n++;
  }
}
