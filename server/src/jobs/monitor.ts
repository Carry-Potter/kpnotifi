/**
 * Nadzor scrapinga: broji uzastopne greške po vrsti i alarmira admina
 * (Telegram) kad pređu prag — npr. KP promenio strukturu stranice ili nas
 * blokira. Uspeh resetuje brojač; alarm ima cooldown da ne spamuje.
 */

export type FailureKind = 'parse' | 'block' | 'other';

export interface MonitorState {
  consecutive: Record<FailureKind, number>;
  lastAlertAt: Record<FailureKind, number | null>;
  lastOkAt: number | null;
}

interface MonitorOptions {
  /** posle ovoliko uzastopnih grešaka iste vrste šalje se alarm */
  threshold?: number;
  /** najmanji razmak između dva alarma iste vrste (ms) */
  cooldownMs?: number;
  alert: (message: string) => Promise<void>;
  now?: () => number;
}

const KIND_LABEL: Record<FailureKind, string> = {
  parse: 'Parser ne ume da pročita KP stranicu (promenjena struktura ili captcha?)',
  block: 'KP odbija zahteve (429/403) — moguće da smo blokirani',
  other: 'Provere feedova padaju',
};

export function createMonitor(opts: MonitorOptions) {
  const threshold = opts.threshold ?? 5;
  const cooldownMs = opts.cooldownMs ?? 6 * 3_600_000;
  const now = opts.now ?? Date.now;

  const state: MonitorState = {
    consecutive: { parse: 0, block: 0, other: 0 },
    lastAlertAt: { parse: null, block: null, other: null },
    lastOkAt: null,
  };

  async function recordFailure(kind: FailureKind, detail: string): Promise<void> {
    state.consecutive[kind]++;
    const count = state.consecutive[kind];
    if (count < threshold) return;
    const last = state.lastAlertAt[kind];
    if (last !== null && now() - last < cooldownMs) return;
    state.lastAlertAt[kind] = now();
    await opts
      .alert(
        `⚠️ <b>KP Notify nadzor</b>\n${KIND_LABEL[kind]}\n` +
          `Uzastopnih grešaka: ${count}\nPoslednja: ${detail}`
      )
      .catch(() => {}); // alarm ne sme da obori poller
  }

  function recordSuccess(): void {
    state.consecutive.parse = 0;
    state.consecutive.block = 0;
    state.consecutive.other = 0;
    state.lastOkAt = now();
  }

  return { recordFailure, recordSuccess, state };
}
