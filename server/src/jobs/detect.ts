/**
 * Čista logika: koji su oglasi sa stranice zaista NOVI za dati feed.
 * Izdvojena iz pollera da bi se testirala bez baze.
 */
import type { KpAd } from '../kp/types.ts';

export interface DetectInput {
  ads: KpAd[];
  /** ad_id-jevi koje smo već videli u ovom feedu */
  seenIds: Set<number>;
  /** kada je feed napravljen — stariji "obnovljeni" oglasi se ne računaju kao novi */
  feedCreatedAt: Date;
}

/** KP postedRaw ("2026-08-16 08:38:04", lokalno KP vreme) -> Date. */
export function parsePostedRaw(postedRaw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(postedRaw);
  if (!m) return null;
  // KP vreme tretiramo kao Europe/Belgrade; za poređenje "posle nastanka feeda"
  // dovoljna je preciznost na sat-dva, pa parsiramo kao lokalno vreme servera.
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
}

/**
 * Nov oglas = nije viđen ranije I objavljen je posle nastanka feeda
 * (uz toleranciju od 24h unazad, da razlika časovnih zona/sata ne proguta
 * legitimno nove oglase).
 */
export function detectNewAds({ ads, seenIds, feedCreatedAt }: DetectInput): KpAd[] {
  const cutoff = feedCreatedAt.getTime() - 24 * 3_600_000;
  return ads.filter((ad) => {
    if (seenIds.has(ad.id)) return false;
    const posted = parsePostedRaw(ad.postedRaw);
    // ako ne umemo da parsiramo datum, radije pošalji nego prećuti
    if (!posted) return true;
    return posted.getTime() >= cutoff;
  });
}
