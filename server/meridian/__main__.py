"""Beheer op de server: python -m meridian <opdracht>. Zie `python -m meridian help`."""

import asyncio
import getpass
import os
import re
import sys
from datetime import datetime

import httpx
from . import auth, config
from .sources import okx, trading212, trezor
from .store import Store

try:
    import readline  # noqa: F401  (pijltjes en geschiedenis bij het typen van antwoorden)
except ImportError:  # niet op elk systeem aanwezig, bijv. Windows
    pass

HELP = """Meridian-server beheren

  python -m meridian init                  eenmalig: maakt de geheime hoofdsleutel aan (data/master.key)
  python -m meridian koppelcode            code om je telefoon te koppelen (10 min geldig)
  python -m meridian bron trading212       API-sleutel van Trading 212 opslaan (--demo voor oefenaccount)
  python -m meridian bron okx              API-sleutel van OKX opslaan (--demo voor demo-handel)
  python -m meridian bron trezor           publieke sleutel (xpub/zpub) van je Trezor opslaan
  python -m meridian bron trading212-handel  handelssleutel van je Trading 212-oefenaccount (Practice)
  python -m meridian bron okx-handel       handelssleutel van OKX Demo trading
  python -m meridian bron weg <naam>       koppeling verwijderen (bijv. trading212 of okx-handel)
  python -m meridian handmatig             banksaldi (Rabobank), goud, pensioen en woning invullen
  python -m meridian status                alles ophalen en een overzicht tonen
  python -m meridian handel                handelen: sleutels, dagmaximum en het orderlogboek
  python -m meridian handel maximum 250    dagmaximum voor oefengeld in euro instellen
  python -m meridian handel echtgeld aan   handelen met echt geld toestaan (uit: handel echtgeld uit)
  python -m meridian handel echtgeld maximum 25   dagmaximum voor echt geld
  python -m meridian handel periodiek      periodiek inleggen bekijken (aan / uit / maximum 400)
  (handelssleutel van je echte account: bron trading212-handel --echt / bron okx-handel --echt)
  python -m meridian melding               meldingen instellen via je eigen ntfy-server (melding test = testmelding)
  python -m meridian apparaten             gekoppelde telefoons tonen
  python -m meridian ontkoppel             alle telefoons ontkoppelen
"""

SOURCE_IDS = {"trading212": "t212", "t212": "t212", "okx": "okx", "trezor": "trezor",
              "trading212-handel": "t212.handel", "okx-handel": "okx.handel"}


def clean(text: str) -> str:
    """Haalt stuurcodes weg (bijv. ^[[D van pijltjestoetsen) en overbodige spaties."""
    text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]|\x1b.?", "", text)
    return "".join(ch for ch in text if ch.isprintable()).strip()


def ask(prompt: str, default: str | None = None, secret: bool = False) -> str:
    hint = f" [{default}]" if default not in (None, "") else ""
    value = clean((getpass.getpass if secret else input)(f"{prompt}{hint}: "))
    return value or (default or "")


def parse_amount(raw: str) -> float:
    """Bedrag zoals een Nederlander het typt: 12400, 12.400, 12.400,50 of 1,5."""
    raw = raw.replace("€", "").replace(" ", "")
    if "," in raw or re.fullmatch(r"\d{1,3}(\.\d{3})+", raw):
        raw = raw.replace(".", "").replace(",", ".")
    return float(raw)


def ask_number(prompt: str, default: float | None = None) -> float | None:
    while True:
        raw = ask(prompt, None if default is None else f"{default:g}")
        if raw == "":
            return None
        try:
            return parse_amount(raw)
        except ValueError:
            print("  Vul een getal in, bijv. 12400 of 12.400,50")


def eur(v: float) -> str:
    """€ 1.438,92 (alleen het bedrag omzetten, niet de rest van de zin)."""
    return "€ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def describe(e: Exception) -> str:
    """Foutmelding die nooit leeg is (netwerkfouten van httpx hebben vaak geen tekst)."""
    text = str(e).strip()
    if isinstance(e, httpx.TimeoutException):
        return f"De dienst reageert te traag ({e.__class__.__name__}). Controleer de internetverbinding van de server."
    if isinstance(e, httpx.HTTPError):
        return f"Geen verbinding ({e.__class__.__name__}){': ' + text if text else ''}. Controleer de internetverbinding van de server."
    return text or e.__class__.__name__


def cmd_init() -> None:
    existed = bool(os.environ.get("MERIDIAN_MASTER_KEY")) or config.KEY_PATH.exists()
    config.master_key(create=True)
    Store()
    if existed:
        print("Er is al een hoofdsleutel. Niets veranderd.")
        return
    print(f"Hoofdsleutel aangemaakt in {config.KEY_PATH}.")
    print("Maak je een back-up van de map data/, dan zit deze sleutel erin. Bewaar die back-up veilig.")


async def _test(sid: str, secret: dict) -> None:
    fetch = {"t212": trading212.fetch, "okx": okx.fetch, "trezor": trezor.fetch}[sid]
    async with httpx.AsyncClient(timeout=20) as c:
        res = await fetch(c, secret)
    print(f"Gelukt: {res.name} · {eur(res.value)} in {len(res.positions)} posities")
    for w in res.warnings:
        print("  Let op:", w)


def cmd_source(args: list[str]) -> None:
    s = Store()
    if not args:
        print(HELP)
        return
    if args[0] == "weg":
        sid = SOURCE_IDS.get(args[1] if len(args) > 1 else "")
        if not sid:
            print("Welke? trading212, okx, trezor, trading212-handel of okx-handel")
            return
        s.delete_secret(sid)
        print("Koppeling verwijderd.")
        return
    sid = SOURCE_IDS.get(args[0])
    demo = "--demo" in args
    if sid in ("t212.handel", "okx.handel"):
        add_trade_key(s, sid, live="--echt" in args)
        return
    if sid == "t212":
        print("Trading 212 → Instellingen → API: maak een sleutel met alleen leesrechten.")
        secret = {"key": ask("API-sleutel", secret=True), "secret": ask("API-geheim", secret=True), "demo": demo}
    elif sid == "okx":
        print("OKX → Profiel → API: maak een sleutel met alleen 'Lezen'. Nooit 'Opnemen'.")
        secret = {"key": ask("API-sleutel", secret=True), "secret": ask("Secret", secret=True),
                  "passphrase": ask("Passphrase", secret=True), "demo": demo}
        print("OKX-regio zoeken…")
        try:
            async def detect() -> str:
                async with httpx.AsyncClient(timeout=20) as c:
                    return await okx.find_domain(c, secret)
            secret["domain"] = asyncio.run(detect())
            print(f"Gevonden: {secret['domain']}")
        except Exception as e:
            print("Mislukt:", describe(e))
            return
    elif sid == "trezor":
        print("Trezor Suite → je Bitcoin-account → Details → Toon publieke sleutel.")
        secret = {"xpub": ask("Publieke sleutel (zpub/xpub of descriptor)"), "label": ask("Naam", "Trezor Safe 5")}
        trezor.parse(secret["xpub"])  # meteen fout melden bij een verkeerde sleutel
    else:
        print("Onbekende bron. Kies trading212, okx of trezor.")
        return
    print("Verbinding testen…")
    try:
        asyncio.run(_test(sid, secret))
    except Exception as e:
        print("Mislukt:", describe(e))
        if ask("Toch opslaan? (j/n)", "n").lower() != "j":
            return
    s.set_secret(sid, secret)
    print("Opgeslagen (versleuteld).")


def add_trade_key(s: Store, sid: str, live: bool = False) -> None:
    """Handelssleutel opslaan, apart van de leessleutel. Standaard oefengeld; met --echt je echte account."""
    from . import trading

    if live and not trading.live_allowed(s):
        print("Handelen met echt geld staat uit. Zet het eerst aan met: python -m meridian handel echtgeld aan")
        return
    if live:
        print("LET OP: deze sleutel handelt met ECHT GELD op je echte account.")
        print(f"Dagmaximum voor echt geld: {eur(trading.day_max(s, False))}. Geef nooit het recht om op te nemen.")
    else:
        print("Let op: deze sleutel mag kopen en verkopen, met oefengeld (demo).")
    if sid == "t212.handel":
        if live:
            print("Trading 212 → je echte account → Instellingen → API → nieuwe sleutel.")
        else:
            print("Trading 212 → wissel naar je oefenaccount (Practice) → Instellingen → API.")
        print("Rechten: Account data, Metadata, Portfolio en Orders. Beperk de sleutel bij voorkeur tot het IP-adres van je thuisnetwerk.")
        secret = {"key": ask("API-sleutel", secret=True), "secret": ask("API-geheim", secret=True), "demo": not live}
        test = trading212.fetch
    else:
        if live:
            print("OKX → Profiel → API → Create API key (je echte account).")
        else:
            print("OKX → Trade → Demo trading → Profiel → Demo trading API → Create API key.")
        print("Rechten: Read en Trade. NOOIT Withdraw. Zet bij voorkeur het IP-adres van je thuisnetwerk erbij.")
        secret = {"key": ask("API-sleutel", secret=True), "secret": ask("Secret", secret=True),
                  "passphrase": ask("Passphrase", secret=True), "demo": not live}
        print("OKX-regio zoeken…")
        try:
            async def detect() -> str:
                async with httpx.AsyncClient(timeout=20) as c:
                    return await okx.find_domain(c, secret)
            secret["domain"] = asyncio.run(detect())
            print(f"Gevonden: {secret['domain']}")
        except Exception as e:
            print("Mislukt:", describe(e))
            return
        test = okx.fetch
    print("Verbinding testen…")
    try:
        async def run():
            async with httpx.AsyncClient(timeout=20) as c:
                return await test(c, secret)
        res = asyncio.run(run())
        print(f"Gelukt: {'echt account' if live else 'oefenaccount'} met {eur(res.value)} in {len(res.positions)} posities")
    except Exception as e:
        print("Mislukt:", describe(e))
        if sid == "t212.handel" and "401" in str(e) and not live:
            print("Tip: maak de sleutel aan terwijl je in je oefenaccount (Practice) zit; een sleutel van je echte "
                  "account werkt hier niet. Plak sleutel en geheim elk apart en typ één opdracht tegelijk.")
        return
    s.set_secret(sid, secret)
    print("Opgeslagen (versleuteld). Je kunt nu vanuit de app handelen met " + ("ECHT GELD." if live else "oefengeld."))


def cmd_trade(args: list[str]) -> None:
    from . import trading

    s = Store()
    if args[:1] == ["echtgeld"]:
        cmd_live(s, args[1:])
        return
    if args[:1] == ["periodiek"]:
        cmd_plan(s, args[1:])
        return
    if args[:1] == ["maximum"]:
        try:
            value = parse_amount(args[1])
        except (IndexError, ValueError):
            print("Gebruik: python -m meridian handel maximum 250")
            return
        if value < 0:
            print("Het maximum kan niet negatief zijn.")
            return
        s.set_setting("trade.daymax", value)
        print(f"Dagmaximum ingesteld op {eur(value)}.")
        return
    print(f"Handelen · echt geld staat {'AAN' if trading.live_allowed(s) else 'uit'}\n")
    for broker, ok in trading.connected(s).items():
        kind = "oefengeld" if trading.is_demo(s, broker) else "ECHT GELD"
        print(f"  {'✓' if ok else '·'} {trading.NAMES[broker]:<12} {f'handelssleutel ({kind})' if ok else 'geen handelssleutel'}")
    print(f"\n  Oefengeld: dagmaximum {eur(trading.day_max(s))} · vandaag {eur(trading.used_today(s))}")
    print(f"  Echt geld: dagmaximum {eur(trading.day_max(s, False))} · vandaag {eur(trading.used_today(s, False))}\n")
    rows = s.orders_log(20)
    if not rows:
        print("Nog geen orders.")
    for r in rows:
        when = datetime.fromtimestamp(r["ts"]).strftime("%d-%m %H:%M")
        amount = eur(r["amount"]) if r["amount"] else ""
        mark = ("✓" if r["ok"] else "✗") + ("" if r["demo"] else " €")
        print(f"  {mark} {when}  {r['action']:<9} {r['symbol'][:16]:<16} {amount:>12}  {r['message'] or ''}")


def cmd_live(s: Store, args: list[str]) -> None:
    """Echt geld aan- of uitzetten, en het dagmaximum daarvoor."""
    from . import trading

    if args[:1] == ["uit"]:
        s.set_setting("trade.live", False)
        print("Handelen met echt geld staat UIT. De app kan alleen nog oefenen.")
        return
    if args[:1] == ["maximum"]:
        try:
            value = parse_amount(args[1])
        except (IndexError, ValueError):
            print("Gebruik: python -m meridian handel echtgeld maximum 25")
            return
        s.set_setting("trade.daymax.live", max(value, 0))
        print(f"Dagmaximum voor echt geld: {eur(max(value, 0))}.")
        return
    if args[:1] == ["aan"]:
        print("Hiermee kan de app kopen en verkopen met ECHT GELD, met elke order bevestigd met je vingerafdruk of pincode.")
        print(f"Dagmaximum voor echt geld: {eur(trading.day_max(s, False))} (aanpassen: handel echtgeld maximum <bedrag>).")
        print("Uitzetten kan altijd met: python -m meridian handel echtgeld uit")
        if ask("Typ ECHT GELD om te bevestigen").upper() != "ECHT GELD":
            print("Niet aangezet.")
            return
        s.set_setting("trade.live", True)
        print("Echt geld staat AAN. Voeg nu een handelssleutel van je echte account toe, bijv.:")
        print("  python -m meridian bron okx-handel --echt")
        return
    print("Gebruik: python -m meridian handel echtgeld aan | uit | maximum <bedrag>")


def cmd_plan(s: Store, args: list[str]) -> None:
    """Periodiek inleggen: tonen, aan/uit en maandmaximum."""
    from . import plans

    if args[:1] == ["uit"]:
        s.set_setting("plan.enabled", False)
        print("Periodiek inleggen staat UIT. De server koopt niets meer automatisch.")
        return
    if args[:1] == ["maximum"]:
        try:
            value = max(parse_amount(args[1]), 0)
        except (IndexError, ValueError):
            print("Gebruik: python -m meridian handel periodiek maximum 400")
            return
        s.set_setting("plan.monthmax", value)
        print(f"Maandmaximum voor periodiek inleggen: {eur(value)}.")
        return
    if args[:1] == ["aan"]:
        plan = plans.get_plan(s)
        print("Hiermee koopt de server elke maand automatisch, zonder vingerafdruk, volgens het plan in de app.")
        print(f"Plan nu: {eur(plans.total(plan))} per maand op dag {plan['day']} · maandmaximum {eur(plans.month_max(s))}.")
        print("Uitzetten kan altijd met: python -m meridian handel periodiek uit")
        if ask("Typ JA om aan te zetten").upper() != "JA":
            print("Niet aangezet.")
            return
        s.set_setting("plan.enabled", True)
        print("Periodiek inleggen staat AAN.")
        return
    plan = plans.get_plan(s)
    print(f"Periodiek inleggen · automatisch kopen staat {'AAN' if plans.enabled(s) else 'uit'}")
    print(f"Plan in de app: {'actief' if plan['active'] else 'gepauzeerd'} · dag {plan['day']} · "
          f"{eur(plans.total(plan))} per maand · maandmaximum {eur(plans.month_max(s))}\n")
    for line in plan["lines"]:
        print(f"   {line['tk'] or line['posId']:<8} {line['name'][:30]:<30} {eur(line['amount']):>12}")
    if (nxt := plans.next_run(s)) and plans.enabled(s):
        print(f"\nVolgende inleg: {datetime.fromtimestamp(nxt).strftime('%d-%m-%Y %H:%M')}")
    for run in (s.get_setting("plan.runs") or [])[:5]:
        when = datetime.fromtimestamp(run["at"]).strftime("%d-%m %H:%M")
        print(f"  {'✓' if run['ok'] else '✗'} {when}  {run['message']}")


def cmd_notify(args: list[str]) -> None:
    """Meldingen via je eigen ntfy-server: uitleg tonen, testmelding, of een nieuw geheim onderwerp."""
    from . import notify

    s = Store()
    if args[:1] == ["test"]:
        async def run() -> bool:
            async with httpx.AsyncClient(timeout=20) as c:
                return await notify.send(s, c, "Meridian", "Testmelding: meldingen werken.", ["white_check_mark"])
        if asyncio.run(run()):
            print("Testmelding verstuurd. Zie je hem niet? Controleer het onderwerp en het serveradres in de ntfy-app.")
        else:
            print(f"Mislukt: ntfy niet bereikbaar op {config.NTFY_URL}. Draait hij? docker compose ps")
        return
    name = notify.topic(s, new=args[:1] == ["nieuw"])
    print("Meldingen via je eigen ntfy-server\n")
    print("1. Installeer de app 'ntfy' op je telefoon (Play Store of F-Droid).")
    print("2. In de app: + → 'Use another server' aanvinken en invullen:")
    print("     Server:    http://<adres-van-je-server>:8090   (bijv. je Tailscale-adres 100.x.y.z)")
    print(f"     Onderwerp: {name}")
    print("3. Test: python -m meridian melding test")
    print("\nHoud het onderwerp geheim. Nieuw onderwerp nodig? python -m meridian melding nieuw")


def cmd_manual() -> None:
    s = Store()
    data = s.get_setting("manual") or {}
    print("Laat een vraag leeg om hem over te slaan of de huidige waarde te houden.\n")

    banks = data.get("banks", [])
    if banks:
        print("Huidige rekeningen:")
        for b in banks:
            print(f"  - {b['bank']} · {b['name']} ({b['kind']}): € {b['value']:g}")
        if ask("Opnieuw invullen? (j/n)", "n").lower() == "j":
            banks = []
    if not banks:
        while True:
            name = ask("Naam rekening (bijv. 'Rabobank Betaalrekening', leeg = klaar)")
            if not name:
                break
            bank = ask("Bank", name.split()[0])
            kind = "spaar" if ask("Spaarrekening? (j/n)", "n").lower() == "j" else "betaal"
            value = ask_number("Saldo in euro") or 0
            rate = ask("Rente (bijv. '1,5% rente', leeg = geen)") if kind == "spaar" else ""
            banks.append({"name": name, "bank": bank, "kind": kind, "value": value, **({"rate": rate} if rate else {})})
    data["banks"] = banks

    grams = ask_number("Goud in gram", data.get("gold_grams") or None)
    data["gold_grams"] = grams or 0
    if grams:
        data["gold_price"] = ask_number("Reserveprijs per gram als de koers niet lukt", data.get("gold_price"))

    pension = ask_number("Opgebouwd pensioen in euro (UPO)", (data.get("pension") or {}).get("value"))
    data["pension"] = {"name": ask("Pensioenfonds", (data.get("pension") or {}).get("name") or "Pensioen"), "value": pension} if pension else None

    home = data.get("home") or {}
    woz = ask_number("WOZ-waarde woning", home.get("woz"))
    if woz:
        mortgage = ask_number("Hypotheek (restschuld)", home.get("mortgage")) or 0
        data["home"] = {"woz": woz, "mortgage": mortgage, "note": ask("Omschrijving hypotheek", home.get("note") or "")}
    else:
        data["home"] = None
    s.set_setting("manual", data)
    print("\nOpgeslagen.")


def cmd_status() -> None:
    from . import portfolio

    async def run() -> dict:
        async with httpx.AsyncClient(timeout=20) as c:
            return await portfolio.build(Store(), c, force=True, wait=None)

    p = asyncio.run(run())
    print(f"Belegd vermogen: {eur(p['total'])}\n")
    for src in p["sources"]:
        mark = {"ok": "✓", "oud": "~", "fout": "✗"}[src["status"]]
        took = f"{src['took']:>6.1f} s" if src.get("took") is not None else " " * 8
        print(f" {mark} {src['name']:<24} {eur(src['value']):>14} {took}" + (f"   {src['error']}" if src["error"] else ""))
    print()
    for pos in p["positions"]:
        print(f"   {pos['tk']:<6} {pos['name'][:28]:<28} {eur(pos['value']):>14}")
    for w in p["warnings"]:
        print("Let op:", w)


def cmd_devices(remove: bool = False) -> None:
    s = Store()
    if remove:
        with s.tx() as c:
            c.execute("DELETE FROM devices")
        print("Alle telefoons ontkoppeld. Koppel opnieuw met een koppelcode.")
        return
    rows = s._all("SELECT name, created, last_seen FROM devices ORDER BY created")
    if not rows:
        print("Nog geen telefoon gekoppeld.")
    for name, created, seen in rows:
        when = datetime.fromtimestamp(seen or created).strftime("%d-%m-%Y %H:%M")
        print(f"  {name:<20} laatst gezien {when}")


def main(argv: list[str]) -> None:
    cmd, args = (argv[0], argv[1:]) if argv else ("help", [])
    if cmd == "init":
        cmd_init()
    elif cmd == "koppelcode":
        code = auth.new_pair_code(Store())
        print(f"Koppelcode: {code[:3]} {code[3:]}  (10 minuten geldig)")
        print("Vul deze in de app in: tik rechtsboven op JV → Server.")
    elif cmd == "bron":
        cmd_source(args)
    elif cmd == "handmatig":
        cmd_manual()
    elif cmd == "status":
        cmd_status()
    elif cmd == "melding":
        cmd_notify(args)
    elif cmd == "handel":
        cmd_trade(args)
    elif cmd == "apparaten":
        cmd_devices()
    elif cmd == "ontkoppel":
        cmd_devices(remove=True)
    else:
        print(HELP)


if __name__ == "__main__":
    main(sys.argv[1:])
