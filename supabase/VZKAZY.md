# Náhodný vzkaz na každý den

Pro import použij `vzkazy-nahodne.csv`. Obsahuje tvoje vzkazy z původního souboru, bez naplánovaných dat. Původní `vzkazy-vzor.csv` zůstal nezměněný. Chybějící interní názvy jsou doplněné jako „Vzkaz 01“; v aplikaci nejsou viditelně zobrazené.

| Sloupec | Obsah |
| --- | --- |
| `title` | Povinný interní název, 1–100 znaků. |
| `body` | Vzkaz, 1–2 000 znaků, bez HTML. Odstavce a emoji fungují. |

CSV exportuj v UTF-8 s čárkou jako oddělovačem. Uvozovky uvnitř hodnot se zdvojují; tabulkový editor to řeší při exportu. Importuj v Supabase Table Editor do tabulky `messages`. Vynechané `id` a `created_at` doplní databáze; `delivery_date` zůstane NULL. Soubor importuj jen jednou, další import by vytvořil duplicitní vzkazy.

## Jednorázové nastavení

- Nová databáze: spusť `schema.sql`.
- Existující databáze: spusť pouze `migrations/20261116_random_daily_message.sql` a nasaď aktualizovaný denní job.
- Migrace zachová všechna existující data. Řádky s již vyplněným datem se náhodně nevybírají. Budoucí naplánované vzkazy mají ve svém dni přednost.
- Pokud chceš existující budoucí vzkazy převést do náhodné zásoby, nastav jejich `delivery_date` na NULL v administraci. Nemaž data u dříve zveřejněných vzkazů, jinak budou znovu zařazeny do výběru. Neimportuj znovu texty, které už v tabulce máš.

## Jak to funguje

Job v okně 10:17–11:29 českého času zavolá databázovou funkci `pick_daily_message`. Pokud už pro dnešek existuje vzkaz, použije jej. Jinak náhodně vybere jeden řádek s `delivery_date IS NULL` a atomicky mu zapíše dnešní datum. Opakované i souběžné spuštění tedy nezvolí další vzkaz. Každý telefon vidí stejný výběr.

Datum zveřejnění je zobrazené nad vzkazem včetně roku. Není to potvrzení přečtení ani doručení oznámení. Při neúspěšném push se výběr nemění a další job zkouší oznámení znovu. Pokud je zásoba prázdná, nic se neposílá a aplikace nechá poslední zveřejněný vzkaz. Ruční test s `force_send` může výběr provést i mimo denní okno. Lokální ukázka náhodný serverový výběr nesimuluje.

Vyplněné CSV obsahuje soukromé texty; nepublikuj je do veřejného repozitáře. Po nastavení ověř dva běhy jobu v jednom dni: musí vrátit stejný vzkaz a stejné datum. Další den má být vybraný jiný dosud nepoužitý řádek. Zkontroluj také, že účet příjemce nemůže načíst řádky s NULL ani s budoucím datem.

Pro přístup přes soukromé odkazy a upozornění Firebase postupuj podle aktuálního README. Pokud už máš vzkazy importované, použij migraci `20261117_private_links_fcm.sql`; data znovu neimportuj. SMTP ani Auth účty nejsou potřeba. Denní automatické doručení probíhá v okně 10:17–11:29 českého času.
