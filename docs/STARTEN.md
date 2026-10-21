# Meridian op je telefoon: stap voor stap

Deze handleiding is voor Windows en een Android-telefoon. Je doet dit één keer; daarna is het elke keer alleen stap 5.

## Wat heb je nodig?

| Programma | Waarvoor | Downloaden |
|---|---|---|
| **Node.js** (versie LTS) | Draait de ontwikkelserver die de app naar je telefoon stuurt | https://nodejs.org → de groene knop **LTS** |
| **Git** | Haalt de code van GitHub naar je computer | https://git-scm.com/download/win |
| **Expo Go** (op je telefoon) | Opent de app zonder dat je hem hoeft te installeren | Google Play Store: zoek op "Expo Go" |

Installeer Node.js en Git met de standaardinstellingen: steeds **Next** en daarna **Install**. Herstart je computer daarna één keer.

Controleer of het gelukt is. Open **PowerShell** (startmenu → typ "PowerShell") en typ:

```powershell
node -v
git --version
```

Zie je twee versienummers (bijv. `v22.x.x` en `git version 2.x`), dan is het goed.

## 1. De code ophalen (één keer)

In PowerShell:

```powershell
cd $HOME\Documents
git clone https://github.com/kali-linux2008/finance-app.git
cd finance-app\app
```

Je hebt nu een map `Documenten\finance-app` met alles erin.

## 2. De onderdelen installeren (één keer, en na elke update)

Nog steeds in de map `finance-app\app`:

```powershell
npm install
```

Dit duurt een paar minuten. `npm` hoort bij Node.js en downloadt alle onderdelen waarmee de app is gebouwd naar de map `node_modules`. Die map komt nooit in GitHub.

## 3. Starten

```powershell
npm start
```

Na een paar seconden zie je een grote **QR-code** in PowerShell.

## 4. Openen op je telefoon

1. Zorg dat je telefoon op **hetzelfde wifi-netwerk** zit als je computer.
2. Open **Expo Go** en tik op **Scan QR code**.
3. Scan de QR-code uit PowerShell.

De eerste keer duurt laden even (± 30 seconden). Daarna zie je het vergrendelscherm van Meridian.

**Eerste keer openen:** je kiest een pincode van 5 cijfers en herhaalt die. Daarna opent de app met je vingerafdruk (als die op je telefoon is ingesteld) of met je pincode.

## 5. De volgende keren

```powershell
cd $HOME\Documents\finance-app
git pull
cd app
npm install
npm start
```

- `git pull` haalt de nieuwste versie van GitHub op.
- `npm install` is alleen nodig als er nieuwe onderdelen bij zijn gekomen, maar kan geen kwaad.

Stoppen doe je met **Ctrl + C** in PowerShell.

## Werkt het niet?

| Probleem | Oplossing |
|---|---|
| Expo Go blijft laden of zegt "Could not connect" | Zitten telefoon en computer op hetzelfde wifi? Probeer anders `npx expo start --tunnel` (de eerste keer vraagt hij iets te installeren: typ `y`). |
| Windows vraagt om toegang voor Node.js tot het netwerk | Kies **Toestaan** (privénetwerk). |
| Expo Go zegt "Project is incompatible with this version of Expo Go" | Expo Go is nieuwer of ouder dan het project. Laat het weten, dan zet ik het project op de juiste versie. |
| `npm` of `node` wordt niet herkend | Herstart je computer na het installeren van Node.js. |
| Ik ben mijn pincode vergeten | Telefoon → Instellingen → Apps → Expo Go → Opslag → **Gegevens wissen**. Daarna kies je een nieuwe pincode. (Dit wist alleen de testgegevens in Expo Go.) |
| Rode foutmelding in de app | Maak een schermafbeelding en stuur die door. |

## Even uitgelegd

- **Node.js** draait JavaScript op je computer. De app is geschreven in TypeScript (JavaScript met types), en de ontwikkelserver van Expo draait op Node.js.
- **npm** is de "app store" voor code-onderdelen. `npm install` leest `package.json` en haalt alles op wat daarin staat.
- **Expo** is het gereedschap rond React Native. Daarmee kun je één code-basis als echte Android-app draaien. Met **Expo Go** probeer je de app uit zonder hem te bouwen of te installeren.
- Wijzigingen in de code zie je meteen op je telefoon (Fast Refresh). Je hoeft niets opnieuw te scannen.
- Later, als de app klaar is, maken we er een echte installeerbare app (APK) van met EAS Build. Dan heb je Expo Go niet meer nodig.
