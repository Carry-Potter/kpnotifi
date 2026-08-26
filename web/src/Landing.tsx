/** Landing za neprijavljene: šta proizvod radi + dugme ka Telegram botu. */
import { useEffect, useState } from 'react';

export function Landing() {
  const [botUsername, setBotUsername] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setBotUsername(c.botUsername ?? ''))
      .catch(() => {});
  }, []);

  const botLink = botUsername ? `https://t.me/${botUsername}` : '';

  return (
    <div className="container landing">
      <div className="hero">
        <h1>🔔 KP Notify</h1>
        <p className="tagline">
          Ne osvežavaj KupujemProdajem svakih pet minuta — <b>pusti da oglasi pronađu tebe</b>.
        </p>
        <p>
          Napraviš pretragu sa istim filterima kao na KP-u, a mi ti šaljemo poruku na
          Telegram <b>čim neko objavi nov oglas</b> koji je pogađa. Sa slikom, cenom i
          linkom — kupuješ dok je oglas još svež.
        </p>
        {botLink ? (
          <a className="cta" href={botLink} target="_blank" rel="noreferrer">
            ✈️ Otvori bota u Telegramu
          </a>
        ) : (
          <p className="muted">Učitavam link ka botu…</p>
        )}
        {botUsername && <p className="muted">@{botUsername}</p>}
      </div>

      <h2>Kako radi — tri koraka</h2>
      <div className="steps">
        <div className="card">
          <div className="step-num">1</div>
          <b>Kucni /start u botu</b>
          <p className="muted">
            Bot ti pošalje lični link za ovaj sajt. Bez registracije, mejlova i lozinki.
          </p>
        </div>
        <div className="card">
          <div className="step-num">2</div>
          <b>Napravi pretragu</b>
          <p className="muted">
            Ključne reči, cena, mesto, stanje… ili samo nalepi link pretrage sa KP-a — prenose
            se <b>svi</b> filteri, i oni najsitniji (godište, model, kilometraža).
          </p>
        </div>
        <div className="card">
          <div className="step-num">3</div>
          <b>Čekaj zvono 🔔</b>
          <p className="muted">
            Proveravamo KP na ~5 minuta. Nov oglas → poruka sa slikom, cenom i dugmetom
            „Otvori oglas".
          </p>
        </div>
      </div>

      <h2>Zašto je zgodno</h2>
      <ul className="features">
        <li>⚡ <b>Prvi na oglasu</b> — najbolje stvari odu za sat-dva; saznaš odmah, ne sutra.</li>
        <li>🎯 <b>Filteri kao na KP-u</b> — od kategorije i cene do godišta i modela auta.</li>
        <li>🔕 <b>Bez spama</b> — samo novi oglasi; postojeće ti ne šaljemo, duplikate nikad.</li>
        <li>👥 <b>Više pretraga odjednom</b> — telefon, auto, stan… svaka sa svojim filterom,
          uključi/isključi jednim klikom.</li>
      </ul>

      <p className="muted center">
        Već imaš nalog, a link ti je istekao? Kucni <b>/sajt</b> u botu za nov link.
      </p>
    </div>
  );
}
