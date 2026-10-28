# De Meridian-server installeren

De server haalt je saldi en posities op bij Trading 212, OKX en je Trezor, en geeft ze aan de app. Je API-sleutels staan alleen op de server, versleuteld. De app krijgt ze nooit te zien.

```
telefoon (app)  ──►  jouw server  ──►  Trading 212 · OKX · Trezor (xpub) · koersen
                       sleutels versleuteld opgeslagen
```

Deze handleiding gaat uit van een **Linux-server** (Ubuntu, Debian of Raspberry Pi OS) met **Docker**. Heb je iets anders, zeg het, dan pas ik de stappen aan.

> **Veilig houden:** zet poort 8000 **nooit** open naar internet (geen port forwarding op je router). Wil je de app buiten je eigen wifi gebruiken, gebruik dan Tailscale (stap 7).

---

## 1. Inloggen op je server

Vanaf Windows in PowerShell (vervang naam en adres door die van jou):

```powershell
ssh jarno@192.168.1.50
```

## 2. De server leegmaken

Je zei dat alles wat er nu op staat weg mag. Kijk eerst **wat** er draait, zodat je niets kwijtraakt wat je toch nog wilt bewaren:

```bash
docker ps -a                                              # draaiende/gestopte containers
docker volume ls                                          # opgeslagen data van containers
systemctl list-units --type=service --state=running       # andere programma's die als dienst draaien
```

Wil je iets bewaren? Kopieer het dan eerst naar je pc, bijvoorbeeld met `scp`.

Alles van Docker verwijderen (containers, images, volumes en netwerken):

```bash
docker stop $(docker ps -q) 2>/dev/null
docker system prune -a --volumes
```

Docker vraagt om bevestiging; typ `y`. Draaien er andere diensten die je niet meer wilt (bijv. een oude webserver), stop die dan met `sudo systemctl disable --now <naam>`. Twijfel je over een dienst, stuur me dan de lijst, dan kijk ik mee.

## 3. Docker en Git installeren (als ze er nog niet zijn)

```bash
docker --version || curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # daarna één keer uit- en weer inloggen
sudo apt install -y git
```

## 4. Meridian ophalen en starten

```bash
cd ~
git clone https://github.com/kali-linux2008/finance-app.git
cd finance-app/server
docker compose up -d --build
```

Controleer of hij draait:

```bash
curl http://localhost:8000/api/health
```

Zie je `{"ok":true,"name":"meridian",...}`, dan is het gelukt. Bij de eerste start maakt de server zelf een hoofdsleutel aan (`master.key`) in zijn eigen Docker-volume `meridian-data`.

**Het IP-adres van je server** heb je straks nodig in de app:

```bash
hostname -I     # het eerste adres, bijv. 192.168.1.50
```

## 5. Je bronnen toevoegen

Alle opdrachten hieronder beginnen met `docker compose exec meridian`. Typ ze in de map `~/finance-app/server`. Sleutels typ je niet zichtbaar in: plakken met de rechtermuisknop en Enter.

### Trading 212
1. Open Trading 212 → **Instellingen → API (bèta)** → **Generate API key**.
2. Zet alleen de **leesrechten** aan: *Account data*, *Metadata* en *Portfolio*. Laat *Orders* uit: voor handelen maak je een aparte sleutel (zie stap 8).
3. Optioneel, maar slim: beperk de sleutel tot het IP-adres van je thuisnetwerk.
4. Kopieer de sleutel en het geheim. Het geheim zie je maar één keer.

```bash
docker compose exec meridian python -m meridian bron trading212
```

Eerst oefenen met het demo-account? Maak de sleutel aan in de *Practice*-omgeving en voeg `--demo` toe aan de opdracht.

### OKX
1. OKX → **Profiel → API → Create API key**.
2. Rechten: **alleen "Read"**. Nooit "Withdraw".
3. Optioneel: zet het IP-adres van je thuisnetwerk bij de toegestane IP's.
4. Je krijgt een API-sleutel, een secret en de passphrase die je zelf kiest.

```bash
docker compose exec meridian python -m meridian bron okx
```

### Trezor Safe 5
1. Open **Trezor Suite** en kies je Bitcoin-account.
2. Ga naar **Details → Toon publieke sleutel** en bevestig op je Trezor.
3. Kopieer de sleutel (begint met `zpub`, `xpub` of `tr(`). Dit is je **publieke** sleutel. Deel nooit je seed of iets dat met `xprv` begint; de server weigert dat ook.

```bash
docker compose exec meridian python -m meridian bron trezor
```

> Privacy: om je saldo te bepalen vraagt de server de adressen op bij mempool.space (en als die te traag is bij blockstream.info). Die dienst kan dan zien welke adressen bij elkaar horen. Draai je later een eigen Bitcoin-node met mempool, zet dan `MERIDIAN_ESPLORA_URL` in `.env` (zie `.env.example`).

### Rabobank, goud, pensioen en woning (handmatig)
```bash
docker compose exec meridian python -m meridian handmatig
```

De server stelt een paar vragen: je rekeningen met saldo (betaal of spaar), goud in gram, je opgebouwde pensioen en de WOZ-waarde met hypotheek. Saldi veranderd? Draai de opdracht gewoon opnieuw. Een echte koppeling met Rabobank (PSD2) komt later als aparte stap.

### Controleren
```bash
docker compose exec meridian python -m meridian status
```

Je ziet per bron een ✓ (in orde) of een ✗ met de foutmelding, en daaronder al je posities.

## 6. De app koppelen

1. Op de server:
   ```bash
   docker compose exec meridian python -m meridian koppelcode
   ```
   Je krijgt een code van 6 cijfers, 10 minuten geldig.
2. In de app: tik op **JV** rechtsboven → **Server**.
3. Vul het adres in (bijv. `192.168.1.50:8000`) en de koppelcode, en tik op **Koppelen**.

Je telefoon moet op hetzelfde wifi-netwerk zitten als de server. Daarna toont de app je echte cijfers, en hij ververst elke minuut zolang hij open staat. Je kunt ook omlaag trekken om te verversen. Ontkoppelen kan op hetzelfde scherm; dan zie je weer de voorbeelddata.

Telefoon kwijt? Ontkoppel dan alle telefoons op de server:
```bash
docker compose exec meridian python -m meridian ontkoppel
```

## 7. Buiten je eigen wifi (Tailscale)

Met [Tailscale](https://tailscale.com) maak je een privé-netwerk tussen je server en je telefoon. Daarvoor zet je niets open op je router.

1. Op de server: `curl -fsSL https://tailscale.com/install.sh | sh` en daarna `sudo tailscale up`.
2. Op je telefoon: installeer de Tailscale-app en log in met hetzelfde account.
3. Gebruik in Meridian het Tailscale-adres van je server (bijv. `100.x.y.z:8000`, te zien met `tailscale ip -4`).

## 8. Handelen met oefengeld (demo)

Vanuit de app kun je kopen en verkopen via de Handelen-knop of via Kopen/Verkopen op een belegging. **In deze versie gaat dat alleen naar je oefenaccounts**, dus zonder echt geld. Daarvoor heeft de server aparte **handelssleutels** nodig. Je leessleutels blijven alleen-lezen.

### Trading 212 (Practice)
1. Open Trading 212 en wissel bovenin naar je **oefenaccount (Practice)**.
2. **Instellingen → API (bèta) → Generate API key**. Rechten: *Account data*, *Metadata*, *Portfolio* en *Orders*.
3. Op de server:
   ```bash
   docker compose exec meridian python -m meridian bron trading212-handel
   ```

### OKX (Demo trading)
1. OKX → **Trade → Demo trading**. Daarna in je profiel: **Demo trading API → Create API key**.
2. Rechten: **Read** en **Trade**. **Nooit Withdraw.**
3. Op de server:
   ```bash
   docker compose exec meridian python -m meridian bron okx-handel
   ```

### Veiligheid
- Elke order bevestig je in de app met je vingerafdruk of pincode.
- De server controleert elke order opnieuw: minimaal € 1, verkopen niet meer dan er op het oefenaccount staat (bij bitcoin alleen het OKX-deel, de Trezor is alleen-lezen), kopen niet meer dan het vrije saldo, en een **dagmaximum** (standaard € 250).
- Elke poging komt in het orderlogboek, ook als hij mislukt. Bekijken:
  ```bash
  docker compose exec meridian python -m meridian handel
  ```
- Dagmaximum aanpassen, bijvoorbeeld naar € 500:
  ```bash
  docker compose exec meridian python -m meridian handel maximum 500
  ```
- Handelssleutel weghalen: `python -m meridian bron weg trading212-handel` (of `okx-handel`).

### Handelen met echt geld
Standaard staat echt geld **uit**. Zo zet je het bewust aan:

1. Op de server (je moet `ECHT GELD` typen om te bevestigen):
   ```bash
   docker compose exec meridian python -m meridian handel echtgeld aan
   ```
2. Maak een **nieuwe** sleutel in je echte account, apart van je leessleutel:
   - Trading 212: Instellingen → API, rechten *Account data*, *Metadata*, *Portfolio* en *Orders*.
   - OKX: Profiel → API, rechten **Read** en **Trade**. **Nooit Withdraw.**
   - Beperk de sleutel tot het IP-adres van je thuisnetwerk als dat kan.
3. Voeg hem toe met `--echt`:
   ```bash
   docker compose exec meridian python -m meridian bron trading212-handel --echt
   docker compose exec meridian python -m meridian bron okx-handel --echt
   ```

Voor echt geld geldt een **eigen dagmaximum van € 25**, los van het oefengeld. Aanpassen: `handel echtgeld maximum 50`. Uitzetten kan altijd met `handel echtgeld uit`. In de app zie je een rode balk "ECHT GELD" en een extra waarschuwing voordat je bevestigt. Trading 212 staat met echt geld via de API alleen **marktorders** toe, geen limietorders.

### Periodiek inleggen
Elke maand op een vaste dag dezelfde bedragen kopen bij Trading 212, zoals een spaarplan.

1. Stel je plan in de app in: **Portefeuille → Periodiek**. Kies je beleggingen en bedragen, de inlegdag, en sla op met je vingerafdruk.
2. Zet automatisch kopen één keer aan op de server (typ `JA` om te bevestigen):
   ```bash
   docker compose exec meridian python -m meridian handel periodiek aan
   ```
3. Maandmaximum (standaard € 400) aanpassen: `handel periodiek maximum 500`. Bekijken: `handel periodiek`. Uitzetten: `handel periodiek uit`.

De server koopt op de inlegdag rond 15:45, als de Europese en Amerikaanse beurzen allebei open zijn. Valt de dag in het weekend, dan de eerstvolgende werkdag. Staat er te weinig vrij saldo, dan koopt hij niets en probeert hij het de volgende werkdag opnieuw. Elke maand wordt maar één keer gekocht. De inleg telt niet mee voor het dagmaximum.

Na elke inleg krijg je een melding in de app (zie [MELDINGEN.md](MELDINGEN.md)). Testen: `docker compose exec meridian python -m meridian melding test`.

Lopende limietorders zie je in de app onder **Portefeuille → Orders**. Daar kun je de limiet wijzigen of de order annuleren.

## 9. Koersalerts en volglijst

Een melding als een koers boven of onder een doel komt.

- **Alert maken:** open een belegging en tik rechtsboven op het belletje. Kies **Stijgt boven** of **Daalt onder**, het percentage, en of je **elke keer** een melding wilt.
- **Volglijst:** **Meer → Volglijst**. Met **+** zoek je een coin of een van je eigen aandelen; tik op een tegel voor een alert. Met het potlood haal je tegels weg.

De server kijkt elke 2 minuten, ook als je telefoon uit staat. De melding komt via de gewone meldingen (zie [MELDINGEN.md](MELDINGEN.md)). Een eenmalige alert gaat daarna uit; een alert "elke keer" gaat pas opnieuw af als de koers eerst 1% terug is geweest, zodat je niet elke 2 minuten een melding krijgt.

Koersen komen alleen van bronnen die Meridian al gebruikt: je eigen posities (Trading 212, OKX) en de openbare koersen van OKX voor crypto. Er gaat niets extra's naar buiten. Daardoor kun je aandelen die je niet hebt (nog) niet volgen, en is er voor aandelen geen koersgrafiek. De koers van een aandeel ververst zolang de beurs open is.

## 12. Echt rendement per broker

```bash
docker compose exec meridian python -m meridian rendement                  # nu waard vs. ingelegd
docker compose exec meridian python -m meridian rendement start t212 5000  # wat je vóór je eerste CSV al stortte
```

De stortingen komen uit je Rabo-CSV (inleg Trading 212 en OKX; terugstorten telt eraf). Stortingen van vóór je eerste CSV geef je één keer op als startbedrag. BTC op je Trezor telt niet mee bij OKX.

## 11. Herbalanceren

Stel je doelverdeling in (stappen van 5%, samen 100%):

```bash
docker compose exec meridian python -m meridian herbalanceren doel aandelen 70 crypto 20 cash 10 goud 0
docker compose exec meridian python -m meridian herbalanceren                 # nu vs. doel en voorgestelde orders
docker compose exec meridian python -m meridian herbalanceren bijkopen 375    # hoe verdeel je € 375 nieuw geld
```

- **Alleen bijkopen:** nieuw geld gaat eerst naar wat achterloopt; de rest volgens je doel. Er wordt niets verkocht.
- **Kopen & verkopen:** orders om in één keer op je doel uit te komen. Eerst verkopen, dan kopen. Aandelen via Trading 212, crypto via OKX; BTC op je Trezor wordt nooit verkocht. Cash en goud staan onder "zelf doen". Binnen 1 procentpunt van je doel gebeurt niets, en orders onder € 10 laat Meridian weg.

Uitvoeren doe je straks in de app, met je vingerafdruk. Het dagmaximum voor handelen geldt ook hier.

## 10. Rabobank koppelen

Je betaal- en spaarrekening, alleen-lezen. Meridian mag als privépersoon niet zelf bij de bank (daarvoor is een PSD2-vergunning nodig), dus het gaat via **Enable Banking**. Dat is gratis zolang je alleen je eigen rekeningen koppelt.

**Eenmalig bij Enable Banking (op je computer):**
1. Maak een account op [enablebanking.com](https://enablebanking.com) en open het **Control Panel**.
2. **Applications → Register new application**. Kies **Production**. Laat de sleutel in je browser maken: je downloadt dan een `.pem`-bestand. Vul bij **Allowed redirect URLs** in: `https://localhost/meridian`.
3. Activeer de applicatie met **Link accounts → Rabobank** (inloggen met de Rabo-app). Zo werkt hij gratis, alleen voor je eigen rekeningen.

**Op de server:**
```bash
docker compose exec meridian python -m meridian bron rabobank
```
- Vul de **Application ID** in en plak de inhoud van het `.pem`-bestand (van `-----BEGIN` tot en met `-----END … KEY-----`). Plak dit alleen in het SSH-venster, nooit in een chat.
- De server geeft een adres. Open het, log in bij de Rabobank en geef toestemming voor je rekeningen.
- Je komt daarna op een pagina die niet laadt (`https://localhost/meridian?…`). Dat hoort zo: kopieer het **hele adres** uit de adresbalk en plak het op de server.

De saldi staan daarna in de app. De bank staat hooguit 4 opvragingen per dag toe, dus de server haalt ze hooguit **elke 6 uur** op (ook als je ververst). De toestemming is 180 dagen geldig; twee weken van tevoren zie je een waarschuwing. Vernieuwen: dezelfde opdracht nog eens. Een andere applicatie gebruiken: `bron rabobank --nieuw`.

Rabo-saldi die je eerder met `handmatig` invulde, telt Meridian niet meer mee zodra de koppeling er is. Uitzondering: je **spaarrekening**. Die geeft de Rabobank meestal niet door via PSD2 (alleen betaalrekeningen); vul hem in met `handmatig` (bank: Rabobank, "Spaarrekening?" j), dan telt hij gewoon mee.

### Spaarrekening via een CSV-bestand

Wat de koppeling niet doorgeeft (meestal je spaarrekening), stuur je als CSV-bestand:

1. Log in op rabobank.nl (Rabo Online Bankieren), kies je spaarrekening → **Download transacties** → formaat **CSV**.
2. Open in Meridian **Meer → Rabo-CSV** en tik op **Kies CSV-bestand**.

Meridian leest per rekening het saldo na de laatste transactie. Het bestand blijft op je eigen server. Elke **zondag om 10:00** krijg je een herinnering (niet als je de afgelopen 3 dagen al een bestand stuurde); tik erop en je komt meteen op het juiste scherm.

```bash
docker compose exec meridian python -m meridian melding csv          # bekijken
docker compose exec meridian python -m meridian melding csv wo 19    # woensdag 19:00
docker compose exec meridian python -m meridian melding csv uit      # uitzetten (aan = weer aan)
docker compose exec meridian python -m meridian melding csv test     # testherinnering
```

Zodra er een CSV is, tellen handmatig ingevulde Rabo-saldi niet meer mee.

### Waar je geld heen gaat

Stuur je ook de CSV van je **betaalrekening**, dan deelt de server elke transactie in: inleg bij Trading 212, inleg bij OKX, je abonnementenrekening, eigen rekening (bijv. naar je spaarrekening), inkomsten of uitgaven. Geld dat terugkomt van een broker telt van de inleg af. Dezelfde transactie telt nooit dubbel, ook niet als je een periode twee keer stuurt.

```bash
docker compose exec meridian python -m meridian bank                  # overzicht per maand + totaal ingelegd
docker compose exec meridian python -m meridian bank tegenpartijen    # hoe alles is ingedeeld
docker compose exec meridian python -m meridian bank regel LT98… abo  # deze rekening = abonnementen
docker compose exec meridian python -m meridian bank regels           # je regels (weg: bank regel weg 1)
```

Soorten: `t212`, `okx`, `abo` (abonnementen), `eigen`, `in`, `uit`. Een regel kan een IBAN zijn of een stukje van de naam of omschrijving. Trading 212 en OKX herkent de server zelf aan de naam; je **abonnementenrekening** bij Trading 212 moet je één keer aanwijzen met een regel op haar IBAN (zie `bank tegenpartijen`).

## Bijwerken

```bash
cd ~/finance-app && git pull
cd server && docker compose up -d --build
```

## Back-up

**Automatisch:** elke nacht na 03:00 maakt de server een kopie van de database in `data/backups/` (de laatste 14 dagen). Dat helpt bij een fout of een kapotte database, maar niet als de schijf van de server stukgaat. Kopieer daarom af en toe ook naar een USB-stick of een andere computer (zie hieronder). De `master.key` staat er niet in; die heb je nodig om de sleutels in een back-up te kunnen lezen.

Ook nieuw: werkt een bron (bijv. Trezor of de Rabobank) langer dan een dag niet, dan krijg je één melding met de fout. De server werkt je bronnen elk uur bij, ook als je de app niet opent, zodat het weekoverzicht en de mijlpalen kloppen.

**Met de hand:** alles staat in het Docker-volume `meridian-data`: de database met je versleutelde sleutels en de hoofdsleutel `master.key`. Een kopie maken:

```bash
cd ~/finance-app/server
docker compose cp meridian:/app/data ./backup-$(date +%F)
```

Met die map heb je alles terug. **Bewaar de back-up veilig**, want wie hem heeft, kan je sleutels ontcijferen. Daarom heb je overal alleen leesrechten gegeven.

Terugzetten op een nieuwe server: start Meridian één keer, kopieer de map terug en herstel de rechten:

```bash
docker compose cp ./backup-JJJJ-MM-DD/. meridian:/app/data
docker compose exec -u root meridian chown -R meridian /app/data
docker compose restart
```

## Problemen

| Probleem | Oplossing |
|---|---|
| App zegt "Server niet bereikbaar" | Zit je telefoon op hetzelfde wifi? Klopt het adres (`hostname -I`)? Draait hij (`docker compose ps`)? Blokkeert een firewall poort 8000? Dan: `sudo ufw allow from 192.168.0.0/16 to any port 8000`. |
| "Koppelcode onjuist of verlopen" | Maak een nieuwe code; een code werkt maar één keer en 10 minuten. |
| Trading 212: 401 | Sleutel of geheim klopt niet, of je gebruikt een demo-sleutel zonder `--demo` (of andersom). |
| Trading 212: 403 | De sleutel mist leesrechten. Maak een nieuwe met *Account data*, *Metadata* en *Portfolio*. |
| OKX: "Invalid Sign" of "Invalid OK-ACCESS-PASSPHRASE" | Secret of passphrase verkeerd geplakt; voeg de bron opnieuw toe. |
| OKX: "APIKey does not match current environment" (50101) | Je gebruikt een sleutel van je echte account waar een demo-sleutel hoort (of andersom). Voor `okx-handel`: maak hem in Demo trading → Demo trading API. |
| OKX: "API key doesn't exist" (50119) | De sleutel hoort bij een andere OKX-regio. De server zoekt die zelf (Europa = eea.okx.com); lukt dat niet, dan is de sleutel fout of gemaakt in de demo-omgeving (gebruik dan `--demo`). |
| Trezor-saldo klopt niet | Controleer of je de sleutel van het juiste account hebt (Native SegWit, Taproot of Legacy). Heb je meerdere accounts, dan telt alleen dit ene mee. |
| Handelen: "Nog geen handelssleutel" | Voeg de handelssleutel toe (stap 8). De leessleutel kan niet handelen. |
| Handelen: "Dagmaximum bereikt" | Wacht tot morgen of verhoog het maximum met `handel maximum <bedrag>`. |
| Trading 212: "mist het recht Orders" (403) | Maak de Practice-sleutel opnieuw, met het recht *Orders* aan. |
| Logboek bekijken | `docker compose logs -f meridian` |

## Zonder Docker (bijv. op je Windows-pc om te proberen)

```powershell
cd finance-app\server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m meridian init
uvicorn meridian.api:app --host 0.0.0.0 --port 8000
```

Daarna werken dezelfde opdrachten, zonder `docker compose exec meridian`, bijvoorbeeld `python -m meridian koppelcode`.

## Voor ontwikkelaars

```bash
cd server
pip install -r requirements-dev.txt
pytest
```

De tests bootsen de antwoorden van Trading 212, OKX en mempool.space na. Er gaan geen echte verzoeken naar buiten.
