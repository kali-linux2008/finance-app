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
  python -m meridian bron weg <naam>       koppeling verwijderen (trading212, okx of trezor)
  python -m meridian handmatig             banksaldi (Rabobank), goud, pensioen en woning invullen
  python -m meridian status                alles ophalen en een overzicht tonen
  python -m meridian apparaten             gekoppelde telefoons tonen
  python -m meridian ontkoppel             alle telefoons ontkoppelen
"""

SOURCE_IDS = {"trading212": "t212", "t212": "t212", "okx": "okx", "trezor": "trezor"}


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
    print(f"Gelukt: {res.name} · € {res.value:,.2f} in {len(res.positions)} posities".replace(",", "X").replace(".", ",").replace("X", "."))
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
            print("Welke? trading212, okx of trezor")
            return
        s.delete_secret(sid)
        print("Koppeling verwijderd.")
        return
    sid = SOURCE_IDS.get(args[0])
    demo = "--demo" in args
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
            return await portfolio.build(Store(), c, force=True)

    p = asyncio.run(run())
    eur = lambda v: f"€ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    print(f"Belegd vermogen: {eur(p['total'])}\n")
    for src in p["sources"]:
        mark = {"ok": "✓", "oud": "~", "fout": "✗"}[src["status"]]
        print(f" {mark} {src['name']:<24} {eur(src['value']):>14}" + (f"   {src['error']}" if src["error"] else ""))
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
    rows = list(s._conn.execute("SELECT name, created, last_seen FROM devices ORDER BY created"))
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
    elif cmd == "apparaten":
        cmd_devices()
    elif cmd == "ontkoppel":
        cmd_devices(remove=True)
    else:
        print(HELP)


if __name__ == "__main__":
    main(sys.argv[1:])
