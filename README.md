# Srdíčková pošta ♡

Soukromá připomínková aplikace pro dva. React + TypeScript + Vite, růžové pixelové srdíčko, denní dopis, archiv, plánování vzkazů a komentáře. Klidně připrav 100 i více vzkazů: jeden na každé datum. Žádný vlastní běžící server: přihlášení, databázi a přístupová pravidla zajišťuje Supabase; web push posílá GitHub Actions.

## Lokální spuštění

Vyžaduje Node.js 22 a npm.

```sh
npm install
npm run dev
```

Bez `.env` se spustí **ukázkový režim** se čtyřmi vzkazy. Změny se ukládají v localStorage tohoto prohlížeče, nejsou sdílené a oznámení se neposílají. Pro smazání ukázky odstraň klíč `love-demo` z localStorage. `npm run build` ověří TypeScript a vytvoří `dist`; `npm test` ověří časové pásmo a omezení push endpointů.

## Připojení soukromé schránky

1. Vytvoř projekt na [Supabase](https://supabase.com/). V SQL editoru jednou spusť `supabase/schema.sql`.
2. V Authentication vytvoř dva potvrzené uživatele s vašimi e-maily. Vypni veřejné registrace (Allow new users to sign up). Přihlášení v aplikaci používá e-mailový odkaz a `shouldCreateUser: false`.
3. V SQL editoru vlož dva záznamy do `members`, podle zakomentovaného příkladu na konci schématu. Použij UUID z Authentication. Role `author` může přidávat vzkazy a vidí budoucí; `recipient` vidí jen dnešní a starší vzkazy. Jména zvol podle vás. Unikátní role omezují schránku na dva členy.
4. V Authentication → URL Configuration nastav Site URL a povolenou Redirect URL na přesnou HTTPS adresu webu včetně cesty a koncového `/`. Pro vývoj lze přidat `http://localhost:5173/`. Pro přihlašování obou účtů nastav vlastní SMTP: výchozí testovací e-mailová služba Supabase má omezení příjemců i četnosti.
5. Zkopíruj `.env.example` do `.env`. Vyplň URL projektu a veřejný anon/publishable klíč. **Nikdy sem nevkládej service-role klíč.**
6. Vygeneruj VAPID klíče:

```sh
npx web-push generate-vapid-keys
```

Veřejný klíč vlož jako `VITE_VAPID_PUBLIC_KEY`. Soukromý klíč patří pouze do GitHub Secrets. Při změně VAPID klíčů musí telefony vytvořit nové odběry oznámení.

## Nasazení a automatické doručování

Soubory workflow jsou připravené; projekt se sám nikam nepublikuje. Vytvoř repozitář na GitHubu a nahraj zdrojové soubory včetně `package-lock.json` na větev `main`.

### Web

V Settings → Pages vyber zdroj **GitHub Actions**. Ve Settings → Secrets and variables → Actions → Variables nastav:

| Variable                 | Hodnota                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | URL Supabase projektu                                                         |
| `VITE_SUPABASE_ANON_KEY` | veřejný anon/publishable klíč                                                 |
| `VITE_VAPID_PUBLIC_KEY`  | veřejný VAPID klíč                                                            |
| `VITE_BASE_PATH`         | `/nazev-repozitare/`; pro vlastní doménu nebo `uzivatel.github.io` použij `/` |

Workflow `Deploy web` sestaví a publikuje web. Manifest i service worker používají relativní cesty. U vlastní domény nastav také GitHub Pages custom domain. Statický web lze stejně tak nasadit na jiný HTTPS hosting; na placených funkcích GitHub Pages aplikace nezávisí.

### Denní job

Do **Secrets**, nikoli Variables, přidej:

| Secret                      | Hodnota                                            |
| --------------------------- | -------------------------------------------------- |
| `SUPABASE_URL`              | stejná URL projektu                                |
| `SUPABASE_SERVICE_ROLE_KEY` | serverový service-role klíč Supabase               |
| `VAPID_PUBLIC_KEY`          | stejný veřejný VAPID klíč jako ve webu             |
| `VAPID_PRIVATE_KEY`         | soukromý VAPID klíč                                |
| `VAPID_SUBJECT`             | kontaktní adresa ve formátu `mailto:tvuj@email.cz` |

Přítel se přihlásí na telefonu a klikne na **Zapnout upozornění**. Oznámení se doručují pouze účtu `recipient`; autor může používat komentáře a plánovat další vzkazy. Každý jeho telefon přihlášený k odběru dostane vlastní oznámení.

Job běží každou hodinu v 17. minutě mezi 07–21 UTC. Skript respektuje pásmo Europe/Prague včetně letního času a začne nejdříve po 9. hodině. Posílá pouze vzkaz na dnešní datum. Po úspěšném přijetí push službou zapisuje doručení zvlášť pro každý telefon, další běhy ho vynechají. Neplatné odběry (404/410) odstraňuje, ostatní chyby označí job jako neúspěšný a následující běh opakuje pokus. Neúspěch mezi přijetím push službou a zápisem do DB může způsobit opakované doručení; stejný notification tag brání hromadění stejného oznámení. Úspěch push služby ještě negarantuje zobrazení telefonem.

Spouštění Actions není přesný budík: může mít zpoždění nebo být vynecháno. V **public repozitáři se plánování vypíná po 60 dnech bez aktivity**, což je důležité právě pro zásobu 100 vzkazů. Použij private repo pro job (s dostupnými Actions minutami; dostupnost Pages u private repo závisí na tarifu), případně ponech web na jiném statickém hostingu. Sleduj běhy Actions a upozornění na chyby. Přesná pravidla: [GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Pro první ověření vytvoř dnešní vzkaz, povol odběr na účtu příjemce a po 9. hodině použij Actions → Daily love letter → Run workflow. Druhý běh nemá vytvořit nové oznámení pro stejný telefon. Nepřipravuj vzkazy do zdrojového kódu či GitHub Secrets, ukládají se pouze do databáze.

## Fairphone / Android

Ano: otevři HTTPS web v Chrome a z nabídky ⋮ zvol **Přidat na plochu / Nainstalovat aplikaci**. Jde o PWA bez instalace z obchodu; samotný web funguje i bez přidání na plochu. Oznámení vyžadují souhlas uživatele a podporovaný prohlížeč. U alternativních systémů Fairphone bez Google služeb se podpora může lišit; Firefox používá vlastní push službu. Režim Nerušit, úspora baterie a připojení mohou doručení ovlivnit. [Instalace PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing), [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

Aplikace záměrně neukládá soukromou schránku do offline service-worker cache. Pro čtení sdílených vzkazů je potřeba síť; oznámení mohou přijít i se zavřeným webem. Na zamčené obrazovce je pouze obecné upozornění, nikoli text vzkazu.

## Soukromí a kontrola

- RLS na všech tabulkách; anonymní klient nemá přístup. Členství a role spravuje jen správce databáze. Příjemce nemůže načíst budoucí vzkazy ani jejich komentáře přes přímé API.
- Komentář musí patřit přihlášenému členovi a viditelnému vzkazu. Limity délky se vynucují i v DB. DOMPurify odstraní HTML na klientovi, databázový trigger odmítne tagy, React text escapuje. Nepoužívá se `dangerouslySetInnerHTML`.
- Push odběry může člen číst a upravovat jen své. Tabulku doručení spravuje jen serverový klíč. Server odmítá libovolné cílové URL a posílá pouze na povolené push služby (Chrome, Firefox, Safari).
- Ukázka používá localStorage; sdílená schránka neukládá obsah vzkazů do localStorage, ale Supabase tam uchovává přihlašovací session. Používejte vlastní zařízení. Písmo se stahuje z Google Fonts, s lokálními fallbacky.
- Databázové schéma je pro první instalaci, není opakovatelná migrace. Před změnami produkční DB si vytvoř zálohu.

Před skutečným používáním ověř dva účty v oddělených prohlížečích: autor uloží dnešní i budoucí vzkaz; příjemce vidí jen dnešní; oba přidají komentář; druhý prohlížeč ho uvidí do 30 sekund. Ověř i přímý REST požadavek s tokenem příjemce na budoucí vzkaz (prázdný výsledek), podvržené `user_id` komentáře (odmítnutí) a anonymní přístup (odmítnutí). Integrační ověření DB a skutečného push vyžaduje nakonfigurovaný projekt a telefon; lokální testy je nenahrazují.

Volitelný test UI je v `scripts/browser-check.mjs`. S běžícím Vite na portu 5173 a izolovaným Chrome s `--remote-debugging-port=9223` spusť `node scripts/browser-check.mjs`. Používej ho pouze v ukázkovém režimu: upravuje lokální ukázková data testovacího profilu. Ověří komentáře včetně odstranění HTML a zachování `&`, naplánování vzkazu, obnovení stránky, mobilní šířku, manifest a service worker.
