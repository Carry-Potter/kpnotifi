/**
 * Telegram bot: prijava korisnika (/start izda link za sajt), pregled
 * pretraga i slanje obaveštenja o novim oglasima.
 *
 * Lokalno (bez PUBLIC_URL) radi u long-polling režimu; u produkciji preko
 * webhook-a (webhook zahtev ujedno budi uspavani Render servis).
 */
import { Bot, InlineKeyboard } from 'grammy';
import { KP_BASE } from '../kp/filters.ts';
import type { KpAd } from '../kp/types.ts';
import {
  countSearches,
  createSearch,
  createSession,
  deactivateUser,
  ensureFeed,
  findLinkCode,
  listSearches,
  markLinkClaimed,
  upsertUser,
} from '../db/repo.ts';

const token = process.env.TELEGRAM_BOT_TOKEN;
export const bot = token ? new Bot(token) : null;

const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');

let botUsername = '';

/** Korisničko ime bota (za t.me link na sajtu); prazno dok se ne sazna. */
export function getBotUsername(): string {
  return botUsername;
}

function siteBase(): string {
  return publicUrl || 'http://localhost:' + (process.env.PORT ?? 3000);
}

/** Poruka sa klikabilnim linkom za prijavu; dugme samo za https (Telegram ne prima localhost u dugmetu). */
async function sendLoginLink(ctx: { reply: Function }, intro: string, token: string): Promise<void> {
  const link = `${siteBase()}/#token=${token}`;
  const options: Record<string, unknown> = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  if (link.startsWith('https://')) {
    options.reply_markup = new InlineKeyboard().url('Otvori sajt ↗', link);
  }
  await ctx.reply(
    `${intro}\n\n👉 <a href="${link}">Otvori sajt i napravi pretragu</a>\n\n` +
      `Link važi 30 dana i lični je — ne deli ga. Nov link: /sajt`,
    options
  );
}

export function setupBot(): void {
  if (!bot) {
    console.warn('TELEGRAM_BOT_TOKEN nije podešen — bot je isključen.');
    return;
  }

  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // /start KOD — gost je napravio pretragu na sajtu; jedan tap i sve je povezano
    const code = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (code) {
      const link = await findLinkCode(code);
      if (link) {
        const user = await upsertUser(from);
        const maxSearches = Number(process.env.MAX_SEARCHES_PER_USER ?? 10);
        if ((await countSearches(user.id)) >= maxSearches) {
          await ctx.reply(
            `Dostigao si limit od ${maxSearches} pretraga — obriši neku na sajtu (/sajt) pa pokušaj ponovo.`
          );
          return;
        }
        const feed = await ensureFeed(link.params);
        await createSearch(user.id, feed.id, link.name);
        const session = await createSession(user.id);
        await markLinkClaimed(code, session);
        await ctx.reply(
          `✅ Povezano! Pretraga „<b>${escapeHtml(link.name)}</b>" je aktivna.\n\n` +
            `Čim se pojavi nov oglas koji je pogađa, stiže ti poruka ovde — ne moraš ništa više da radiš.\n` +
            `Kartica na sajtu se prijavila sama; nove pretrage praviš tamo (/sajt).`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      // nepoznat/istekao kod -> nastavi kao običan /start
    }

    const user = await upsertUser(from);
    const session = await createSession(user.id);
    await sendLoginLink(
      ctx,
      `Zdravo${from.first_name ? ', ' + escapeHtml(from.first_name) : ''}! 👋\n` +
        `Javljam ti čim se na KupujemProdajem pojavi <b>nov oglas</b> po tvojim filterima.\n\n` +
        `Komande: /pretrage · /sajt · /stop`,
      session
    );
  });

  bot.command('sajt', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const user = await upsertUser(from);
    const session = await createSession(user.id);
    await sendLoginLink(ctx, 'Evo novog linka za prijavu. 🔑', session);
  });

  bot.command('pretrage', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const user = await upsertUser(from);
    const searches = await listSearches(user.id);
    if (searches.length === 0) {
      await ctx.reply('Nemaš nijednu pretragu. Kucni /sajt pa je napravi na sajtu.');
      return;
    }
    const lines = searches.map(
      (s) => `${s.isEnabled ? '🔔' : '🔕'} ${s.name}`
    );
    await ctx.reply(`Tvoje pretrage:\n\n${lines.join('\n')}\n\nUključivanje/isključivanje: /sajt`);
  });

  bot.command('stop', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    await deactivateUser(from.id);
    await ctx.reply(
      'Obaveštenja su pauzirana za sve tvoje pretrage. Kucni /start kad poželiš da ih vratiš.'
    );
  });

  bot.catch((err) => console.error('bot greška:', err.message));

  bot.api
    .getMe()
    .then((me) => {
      botUsername = me.username;
      console.log(`telegram: bot @${me.username}`);
    })
    .catch((err) => console.error('getMe greška:', err.message));
}

const adminTelegramId = Number(process.env.ADMIN_TELEGRAM_ID ?? 0);

/** Poruka adminu (nadzor). Tiho preskače ako ADMIN_TELEGRAM_ID nije podešen. */
export async function notifyAdmin(html: string): Promise<void> {
  if (!bot || !adminTelegramId) return;
  await bot.api.sendMessage(adminTelegramId, html, { parse_mode: 'HTML' });
}

/** Potvrda u Telegramu odmah po kreiranju pretrage — da korisnik zna šta da očekuje. */
export async function notifySearchCreated(
  telegramId: number,
  searchName: string,
  total: number
): Promise<void> {
  if (!bot) return;
  const countLine =
    total >= 0
      ? `Trenutno postojećih oglasa: ${total.toLocaleString('sr-RS')} — za njih ti <i>neću</i> slati poruke. `
      : `Za oglase koji već postoje ti <i>neću</i> slati poruke. `;
  await bot.api.sendMessage(
    telegramId,
    `✅ Pretraga „<b>${escapeHtml(searchName)}</b>" je aktivna.\n\n` +
      countLine +
      `Javljam se čim neko objavi <b>nov</b> oglas koji pogađa filter (proveravam na ~5 minuta).`,
    { parse_mode: 'HTML' }
  );
}

/** Pošalje obaveštenje o novom oglasu jednom korisniku. */
export async function notifyAd(
  telegramId: number,
  searchName: string,
  ad: KpAd
): Promise<void> {
  if (!bot) return;
  const url = KP_BASE + ad.adUrl;
  const caption =
    `🆕 <b>${escapeHtml(ad.name)}</b>\n` +
    `💰 ${escapeHtml(ad.priceText)}\n` +
    `📍 ${escapeHtml(ad.location)}${ad.condition ? ' · ' + escapeHtml(ad.condition) : ''}\n` +
    `🔎 ${escapeHtml(searchName)}`;
  const keyboard = new InlineKeyboard().url('Otvori oglas ↗', url);

  try {
    if (ad.image) {
      await bot.api.sendPhoto(telegramId, ad.image, {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else {
      await bot.api.sendMessage(telegramId, caption, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }
  } catch (err: any) {
    // slika ume da bude nedostupna — probaj bar tekst
    if (ad.image) {
      await bot.api.sendMessage(telegramId, caption + `\n${url}`, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else {
      throw err;
    }
  }
}

/** Pretraga ugašena jer je preširoka (provera pri prvom obilasku u workeru). */
export async function notifySearchTooBroad(
  telegramId: number,
  searchName: string,
  total: number,
  kpUrl: string
): Promise<void> {
  if (!bot) return;
  await bot.api.sendMessage(
    telegramId,
    `⚠️ Pretraga „<b>${escapeHtml(searchName)}</b>" pogađa ${total.toLocaleString('sr-RS')} oglasa — ` +
      `preširoka je za praćenje, pa sam je isključio.\n` +
      `Suzi filter (kategorija, cena, preciznije reči) pa napravi novu na sajtu (/sajt).`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().url('Pogledaj na KP ↗', kpUrl),
    }
  );
}

/** Zbirna poruka kad je novih oglasa previše za pojedinačne poruke. */
export async function notifyBatch(
  telegramId: number,
  searchName: string,
  count: number,
  kpUrl: string
): Promise<void> {
  if (!bot) return;
  await bot.api.sendMessage(
    telegramId,
    `🔔 <b>${count} novih oglasa</b> za pretragu „${escapeHtml(searchName)}".\n` +
      `Filter je verovatno preširok — pogledaj ih na KP-u i razmisli o sužavanju.`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().url('Pogledaj na KP ↗', kpUrl),
    }
  );
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
