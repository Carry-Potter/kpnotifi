# 🔔 KP Notify

Obaveštenja na Telegram čim se na [KupujemProdajem](https://www.kupujemprodajem.com) pojavi nov
oglas koji odgovara tvojim filterima. Višekorisnički: svako se prijavi preko Telegram bota i pravi
svoje pretrage na web sajtu.

- **Filteri kao na KP-u** — kategorija, podgrupa, ključne reči, cena, lokacija, stanje… a za
  100% paritet postoji „Nalepi KP link": podesiš filtere na KP sajtu i nalepiš adresu.
- **Bez lozinki** — prijava na sajt ide preko linka koji ti bot pošalje na /start.
- **Štedljiv prema KP-u** — isti filter više korisnika deli jedan zahtev; čita se samo prva
  strana; throttle + backoff.

## Arhitektura

```
Telegram bot (grammY) ──┐
Web UI (React/Vite) ────┤── Fastify server (Node 24, TS) ── Postgres
cron-job.org ► /internal/tick ──┘        │
                                         └── poller ► kupujemprodajem.com (__NEXT_DATA__ JSON)
```

## Pokretanje lokalno

Preduslovi: Node ≥ 24, Docker.

```bash
cp .env.example .env          # popuni TELEGRAM_BOT_TOKEN (od @BotFather)
docker compose up -d          # lokalni Postgres na portu 5433
npm install
npm run migrate
npm run dev                   # server na http://localhost:3000 (bot u polling režimu)
```

Frontend u razvoju: `npm run dev --workspace web` (Vite na 5173, proxy na 3000).
Za produkcijski prikaz: `npm run build` pa server servira `web/dist`.

Korisni alati:

```bash
npm test                      # testovi parsera, filtera i detekcije
npm run typecheck
npm run kp:probe -- "https://www.kupujemprodajem.com/pretraga?categoryId=23"
```

## Deploy (besplatno: Render + Neon + cron-job.org)

1. **Neon** (baza): na [neon.tech](https://neon.tech) napravi projekat i kopiraj connection
   string (`...neon.tech/neondb?sslmode=require`).
2. **Telegram bot**: kod [@BotFather](https://t.me/BotFather) `/newbot` → token.
3. **Render**: [render.com](https://render.com) → New → Blueprint → poveži ovaj repo
   (`render.yaml` se sam pročita). U Environment popuni:
   - `DATABASE_URL` — Neon string
   - `TELEGRAM_BOT_TOKEN`
   - `PUBLIC_URL` — adresa servisa, npr. `https://kpnotifi.onrender.com`
   - `KP_CONTACT` — npr. `kpnotifi (kontakt: tvoj@mejl.com)`
   Migracije i webhook se postavljaju sami pri startu.
4. **cron-job.org** (budi uspavani free servis i tera proveru): novi cron na svakih 5 min:
   `POST https://<tvoj-servis>.onrender.com/internal/tick?secret=<TICK_SECRET>`
   (`TICK_SECRET` prepiši iz Render Environment taba).

> Render free se uspava posle 15 min bez saobraćaja; cron ga budi, pa provera efektivno radi
> na ~5 min. Prvi zahtev posle buđenja ume da potraje ~30 s — to je normalno.

### Prelazak na svoj server (Oracle/VPS)

Sve je u Dockeru: `docker build -t kpnotifi . && docker run --env-file .env -p 3000:3000 kpnotifi`
uz bilo koji Postgres. Ništa u kodu nije vezano za Render.

## Kako radi detekcija

- Feed = jedinstven filter (hash normalizovanih parametara). Prvi prolaz samo „zaseje" zatečene
  oglase, bez poruka.
- Nov oglas = neviđen u feedu **i** objavljen posle nastanka feeda (obnovljeni stari oglasi se
  ne računaju). Poslate poruke se beleže — ista stvar ne stiže dvaput.
- Više od 20 novih odjednom → jedna zbirna poruka (filter je preširok).

## Nadzor i limiti

- Postavi `ADMIN_TELEGRAM_ID` (svoj Telegram ID, npr. od @userinfobot) — stiže ti alarm kad
  5 uzastopnih provera padne na parsiranju (KP promenio strukturu) ili na 429/403 (blokada).
  Alarm iste vrste se ne ponavlja unutar 6 h; `/health` pokazuje brojače.
- `MAX_SEARCHES_PER_USER` (podrazumevano 10) i `MAX_RESULTS_PER_SEARCH` (10.000) štite KP i
  hosting od preširokih pretraga — snimanje takvog filtera se odbija uz objašnjenje.

## Fer korišćenje

Servis čita javne stranice pretrage (dozvoljene u `robots.txt`), najviše 1 zahtev na ~2 s,
sa identifikovanim User-Agentom. Ne obilazi stranice dublje od prve i deli zahteve među
korisnicima. Budi umeren sa brojem pretraga.
