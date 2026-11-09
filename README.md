# BB84-szimulátor

A BB84 kvantumkulcs-szétosztó protokoll lépésenként követhető, grafikus szimulátora.

## Futtatás

Nyisd meg böngészőben a [dist/BB84-szimulator.html](dist/BB84-szimulator.html) fájlt. Telepítés és internetkapcsolat nem kell.

## Tudnivalók

- A qubiteket állapotvektorok, a kapukat komplex mátrixok írják le, a mérést a Born-szabály sorsolja.
- A bitek és bázisok a táblázat celláira kattintva adhatók meg.
- Éva elfogás–továbbküldés támadása kapcsolható, az elfogott qubitek aránya állítható.
- A protokoll lépésenként, oda-vissza követhető a kulcs elkészültéig vagy a megszakításig.
- A felület magyarul és angolul, világos és sötét módban is használható, 320 px szélességig.

A részletes leírás: [docs/BB84-dokumentacio.pdf](docs/BB84-dokumentacio.pdf).

## Fejlesztés

Csak Node.js kell, külső csomag nem.

```bash
npm test
```

```bash
npm run build
```
