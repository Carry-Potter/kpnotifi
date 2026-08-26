/**
 * Landing za goste: opis proizvoda + builder pretrage BEZ prijave.
 * Posle snimanja gost jednim tapom na START u Telegramu aktivira pretragu;
 * sajt polluje /api/claim i sam se prijavi kad se to desi.
 */
import { useEffect, useRef, useState } from 'react';
import { api, storeToken } from './api';
import { FilterBuilder } from './FilterBuilder';

export function Landing() {
  const [botUsername, setBotUsername] = useState('');
  const [connect, setConnect] = useState<{ code: string; telegramUrl: string } | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setBotUsername(c.botUsername ?? ''))
      .catch(() => {});
  }, []);

  // dok čekamo tap na START u botu, proveravaj da li je povezano
  useEffect(() => {
    if (!connect) return;
    const timer = setInterval(async () => {
      try {
        const r = await api.claim(connect.code);
        if (r.claimed && r.token) {
          clearInterval(timer);
          storeToken(r.token);
          location.reload(); // App sada vidi token -> prijavljen, pretraga već aktivna
        }
      } catch {
        // prolazna greška — pokušaće ponovo
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [connect]);

  if (connect) {
    return (
      <div className="container center">
        <h1>Još jedan tap 👆</h1>
        <p>
          Pretraga je spremna. Otvori Telegram i klikni <b>START</b> — time se sve povezuje i
          obaveštenja kreću.
        </p>
        <a className="cta" href={connect.telegramUrl} target="_blank" rel="noreferrer">
          ✈️ Otvori Telegram i klikni START
        </a>
        <p className="muted">
          Čekam potvrdu iz Telegrama… ova strana će se sama osvežiti kad klikneš START.
        </p>
        <p className="muted">
          <a href="#" onClick={(e) => { e.preventDefault(); setConnect(null); }}>← nazad na izmenu pretrage</a>
        </p>
      </div>
    );
  }

  return (
    <div className="container landing">
      <div className="hero">
        <h1>🔔 KP Notify</h1>
        <p className="tagline">
          Ne osvežavaj KupujemProdajem svakih pet minuta — <b>pusti da oglasi pronađu tebe</b>.
        </p>
        <p>
          Napravi pretragu sa istim filterima kao na KP-u, a mi ti šaljemo poruku na Telegram{' '}
          <b>čim neko objavi nov oglas</b> — sa slikom, cenom i linkom.
        </p>
        <button
          className="cta"
          onClick={() => builderRef.current?.scrollIntoView({ behavior: 'smooth' })}
        >
          Napravi pretragu — bez registracije
        </button>
        <p className="muted">Prijava? Ne treba. Na kraju samo tapneš START u Telegramu.</p>
      </div>

      <div ref={builderRef}>
        <h2>Tvoja prva pretraga</h2>
        <FilterBuilder onSaved={() => {}} onGuestSaved={setConnect} />
      </div>

      <h2>Kako radi</h2>
      <div className="steps">
        <div className="card">
          <div className="step-num">1</div>
          <b>Sastavi filter ovde</b>
          <p className="muted">
            Ključne reči, cena, mesto, stanje… ili nalepi link pretrage sa KP-a — prenose se svi
            filteri, i oni najsitniji (godište, model, kilometraža).
          </p>
        </div>
        <div className="card">
          <div className="step-num">2</div>
          <b>Tapni START u Telegramu</b>
          <p className="muted">
            Jedan tap — bez registracije, mejlova i lozinki. Time se pretraga aktivira.
          </p>
        </div>
        <div className="card">
          <div className="step-num">3</div>
          <b>Čekaj zvono 🔔</b>
          <p className="muted">
            Proveravamo KP na ~5 minuta. Nov oglas → poruka sa slikom, cenom i dugmetom „Otvori
            oglas".
          </p>
        </div>
      </div>

      <h2>Zašto je zgodno</h2>
      <ul className="features">
        <li>⚡ <b>Prvi na oglasu</b> — najbolje stvari odu za sat-dva; saznaš odmah, ne sutra.</li>
        <li>🎯 <b>Filteri kao na KP-u</b> — od kategorije i cene do godišta i modela auta.</li>
        <li>🔕 <b>Bez spama</b> — samo novi oglasi; postojeće ti ne šaljemo, duplikate nikad.</li>
        <li>👥 <b>Više pretraga odjednom</b> — telefon, auto, stan… uključi/isključi jednim klikom.</li>
      </ul>

      <p className="muted center">
        Već imaš nalog? Kucni <b>/sajt</b>{' '}
        {botUsername ? (
          <>u botu <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">@{botUsername}</a>{' '}</>
        ) : (
          'u botu '
        )}
        za link za prijavu.
      </p>
    </div>
  );
}
