# Srdíčková pošta ♡

React + TypeScript, soukromé odkazy pro dva, jeden náhodný vzkaz denně a krátké komentáře. Bez e-mailového přihlášení, účtů Supabase Auth a SMTP. Vzkazy a komentáře zůstávají v Supabase. Firebase Cloud Messaging doručuje upozornění, GitHub Actions je odesílá pomocí Firebase Admin SDK — stejný princip jako v projektu `birthday_gift`.

## Spuštění a ověření

Použij Node.js **24.12 nebo novější**. GitHub workflow používají Node 24.

```sh
npm ci
npm run dev
npm run build
npm test
```

Bez nastavení Supabase se spouští lokální ukázka. Ta nesdílí komentáře a neposílá upozornění. Testy ověřují skutečné SQL v lokálním PostgreSQL přes PGlite (přístupová oprávnění, soukromé odkazy, skrytí budoucích vzkazů, autorství, limity komentářů), časové pásmo a FCM retry logiku. Reálné doručení na telefon vyžaduje nakonfigurované služby.

## 1. Supabase — pokud už máš nahrané vzkazy

Pokud už máš soukromé odkazy, spusť pouze `supabase/migrations/20261117_equal_notifications.sql`. Pokud je ještě nemáš, spusť nejprve `supabase/migrations/20261117_private_links_fcm.sql` a potom `20261117_equal_notifications.sql`. Pokud jsi ještě neprovedla přechod na náhodný výběr, spusť nejdřív `supabase/migrations/20261116_random_daily_message.sql`. Existující `schema.sql` s náhodným výběrem už první migraci obsahoval.

Nový projekt bez tabulek: jednou spusť celý aktuální `supabase/schema.sql`; samostatné migrace potom už nespouštěj. Migrace nejsou určeny k opakovanému spouštění.

Vzkazy se nemažou. Ani existující komentáře se nemažou. Nové tabulky jsou `link_members`, `fcm_tokens`, `fcm_deliveries`. Staré Auth tabulky a push subscriptions zůstanou zachované, ale aplikace je už nepoužívá. Jejich přímá oprávnění pro prohlížeč jsou odebraná.

Účty ani SMTP nevytvářej. Funkce ověřují tajný klíč ze soukromého odkazu; v DB je uložen jen SHA-256 hash. Prohlížeč nemá přímý přístup k žádné tabulce. `delivery_date = NULL` znamená dosud nepoužitý vzkaz. Importované texty nepřidávej znovu.

## 2. Firebase — jen pro upozornění

Použij Firebase projekt s webovou aplikací. Můžeš založit samostatný projekt pro Olivera, nebo přidat novou webovou aplikaci do projektu z `birthday_gift`. Firestore ani Firebase Auth pro Olivera nepotřebuješ. Kód nečte ani neupravuje data nebo tokeny birthday_gift.

1. Firebase Console → Project settings → General → Your apps → přidej Web app (`</>`). Zkopíruj veřejný konfigurační objekt: `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId` (případně `storageBucket`).
2. Project settings → Cloud Messaging → Web Push certificates → Generate key pair. Zkopíruj veřejný klíč. Musí být ze stejného Firebase projektu jako konfigurace a service account.
3. Ověř, že je v projektu povolená Firebase Cloud Messaging API (HTTP v1).
4. Project settings → Service accounts → Generate new private key. Celý JSON vlož přímo do GitHub Secret `FIREBASE_SERVICE_ACCOUNT_JSON`. Soubor ani jeho obsah nepatří do repozitáře, `.env` frontendu ani chatu. Existující údaje z birthday_gift nebyly automaticky zkopírovány.

## 3. Web a veřejné proměnné

Pro lokální spuštění zkopíruj `.env.example` do `.env`. Pro GitHub Pages nastav stejné hodnoty v repozitáři → Settings → Secrets and variables → Actions → **Variables**:

| Název | Hodnota |
| --- | --- |
| `VITE_SUPABASE_URL` | URL tvého existujícího Supabase projektu |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable nebo anon klíč; nikdy serverový secret/service-role klíč |
| `VITE_FIREBASE_CONFIG` | Jednořádkový platný JSON veřejné Firebase webové konfigurace, klíče i řetězce v dvojitých uvozovkách |
| `VITE_FIREBASE_VAPID_KEY` | Veřejný Web Push key pair z Firebase |
| `VITE_BASE_PATH` | `/oliver/` pro project GitHub Pages, `/` pro vlastní doménu či root hosting |

Příklad JSON tvaru (doplň skutečné hodnoty):

```json
{"apiKey":"...","authDomain":"...firebaseapp.com","projectId":"...","messagingSenderId":"...","appId":"..."}
```

V Settings → Pages vyber GitHub Actions. Dostupnost Pages v soukromém repozitáři závisí na GitHub tarifu; pokud není dostupné, `dist` může běžet na jiném HTTPS statickém hostingu. Repo nemusíš kvůli tomu zveřejňovat. Při jiném hostingu nastav stejné build proměnné a příkaz `npm ci && npm run build`; výstup `dist`. Workflow Pages pak nepoužívej.

Po změně proměnných spusť nový build. Frontend i `sw.js` dostanou totožnou veřejnou Firebase konfiguraci při sestavení. VAPID private key a staré `VAPID_SUBJECT` již nepotřebuješ.

## 4. Dva soukromé odkazy

Až znáš skutečnou HTTPS adresu webu, spusť lokálně (nahraď URL):

```sh
npm run links:create -- https://TVOJE-DOMENA/CESTA/
```

Skript vytvoří ignorovanou složku `.private/` s přístupem jen pro tvůj systémový účet:

- `.private/setup-links.sql`: vlož celý obsah do Supabase SQL Editoru a spusť jednou. Vytvoří dvě identity bez Auth účtů.
- `.private/links.txt`: dva různé odkazy. `author` je pro tebe, `recipient` pro Olivera. Klíče se nevypisují do terminálu.

Otevřete každý vlastní odkaz. Klíč je v URL fragmentu `#key=…`, takže se neposílá hostingu v URL požadavku; aplikace jej uloží do localStorage a odstraní z adresního řádku. Další otevření a zkratka na ploše fungují bez zadávání klíče. Po vymazání dat prohlížeče je potřeba původní odkaz otevřít znovu. Na společném zařízení lze použít „Zapomenout přístup“; při úspěchu se zruší i místní odběr oznámení.

Kdokoliv má soukromý odkaz, má přístup. Odkazy nesdílej veřejně. Pro zneplatnění nastav u identity `active = false`; pro výměnu změň její `token_hash` na hash nového náhodného klíče. Nová generace nesmí přepsat existující `.private` automaticky. Při změně domény lze ve stávajících odkazech změnit pouze základ URL a klíče ponechat. Žádná analytics služba se nenačítá.

## 5. GitHub Actions — tajné hodnoty

Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Hodnota |
| --- | --- |
| `SUPABASE_URL` | URL databáze s vzkazy |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase serverový service-role / secret klíč |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Celý JSON service accountu Firebase |
| `FIREBASE_PROJECT_ID` | Stejné `projectId` jako ve veřejné Firebase konfiguraci |

`APP_LINK` z birthday_gift tady nepotřebuješ: kliknutí na oznámení otevře adresu webu podle scope service workeru. Soukromý klíč ani text vzkazu se do FCM payloadu neposílají.

Workflow kontroluje čas každých 15 minut (`7,22,37,52`). Odesílá v okně **10:17–11:29 Europe/Prague**, stejně jako birthday_gift, s automatickým letním časem. V databázi atomicky vybere jeden nepoužitý vzkaz pro dnešek; pak posílá oznámení na zařízení obou aktivních soukromých odkazů. Pro každý telefon eviduje úspěch zvlášť. Dočasné chyby se zkusí při dalším běhu znovu, vypršené tokeny odstraní. Po vyčerpání vzkazů nic nevybírá znovu.

Přijetí zprávy FCM negarantuje její zobrazení telefonem. Při pádu mezi odesláním a zápisem do DB se může oznámení opakovat; stejný tag omezuje hromadění duplicit. GitHub může běhy zpozdit nebo vynechat; ve veřejném repozitáři se plánování může vypnout po 60 dnech bez aktivity. Soukromý repozitář podléhá dostupným Actions minutám.

## 6. První test na telefonu

1. Nasaď aktuální kód. Oliver otevře svůj `recipient` odkaz v podporovaném prohlížeči na HTTPS.
2. V menu zvolí „posílej mi upozornění“ a povolí oznámení. V Supabase se objeví řádek `fcm_tokens`.
3. GitHub → Actions → Daily love letter → Run workflow → `force_send = true`. To vybere dnešní vzkaz i mimo časové okno a odešle oznámení. Další ruční test pošle stejné dnešní oznámení znovu, nevybere jiný vzkaz.
4. Vyzkoušej oznámení se zavřeným webem i s otevřenou aplikací. Jedno odeslání má vyvolat jedno oznámení. Otevření má ukázat stejný vzkaz a jeho datum.
5. Ty otevři svůj `author` odkaz a přidej komentář; na jeho telefonu se načte do 30 sekund. Oba můžete zapnout upozornění na svých telefonech.
6. Nakonec lze web přidat na plochu z nabídky prohlížeče. Pokud už měl telefon starý Web Push odběr, musí tlačítkem zaregistrovat nový Firebase odběr.

## Soubory a bezpečnost

- Soukromá CSV, `.env`, `.private/` a běžné názvy service-account JSON jsou ignorované Gitem.
- `supabase/VZKAZY.md` popisuje formát CSV a chování data zveřejnění.
- Text komentáře čistí DOMPurify; server validuje prostý text a limit 280 znaků, identitu odvozuje z klíče, ne z hodnoty poslané klientem. Limit je 10 komentářů za minutu na odkaz a 10 odběrů na osobu.
- Bez klíče nelze načíst ani aktuální vzkaz. Ani platný odkaz nevrací budoucí vzkazy, celou zásobu, tokeny, hashe či serverové klíče. Staré e-mailové účty nemají přímá tabulková oprávnění.
- `npm test` nezahrnuje skutečné externí služby. Volitelný `node scripts/browser-check.mjs` vyžaduje Vite na 5173 a izolovaný Chrome na debugging portu 9223; upravuje jen lokální ukázku.

Oba odkazy mají stejné možnosti: čtení, komentáře a upozornění. Označení `author` a `recipient` jsou nyní jen identifikátory dvou osob, nikoliv rozdílná oprávnění. Každý dostává stejný denní vzkaz.
