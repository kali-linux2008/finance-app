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
2. Zet alleen de **leesrechten** aan: *Account data*, *Metadata* en *Portfolio*. Laat *Orders* nog uit (dat is stap 5).
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

> Privacy: om je saldo te bepalen vraagt de server de adressen op bij mempool.space. Die dienst kan dan zien welke adressen bij elkaar horen. Draai je later een eigen Bitcoin-node met mempool, zet dan `MERIDIAN_ESPLORA_URL` in `.env` (zie `.env.example`).

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

## Bijwerken

```bash
cd ~/finance-app && git pull
cd server && docker compose up -d --build
```

## Back-up

Alles staat in het Docker-volume `meridian-data`: de database met je versleutelde sleutels en de hoofdsleutel `master.key`. Een kopie maken:

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
| OKX: "API key doesn't exist" (50119) | De sleutel hoort bij een andere OKX-regio. De server zoekt die zelf (Europa = eea.okx.com); lukt dat niet, dan is de sleutel fout of gemaakt in de demo-omgeving (gebruik dan `--demo`). |
| Trezor-saldo klopt niet | Controleer of je de sleutel van het juiste account hebt (Native SegWit, Taproot of Legacy). Heb je meerdere accounts, dan telt alleen dit ene mee. |
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
