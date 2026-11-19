# 視界之外 · Beyond the Horizon

A physics-based, half sci-fi space exploration game that runs in the browser (Three.js). Year 3385: a wandering black hole is tearing Earth apart. You have three minutes to get a suit, reach the launch site and fly yourself to space, then cross the solar system to Mars.

**Play:** https://pschanwkca.github.io/beyond-the-horizon/

## What's in it (v0.10.3)

- **Prologue:** a ruined masonry street under meteor fire, the spacesuit shop, the NASA lab and the RJ-7 rocket pack. Free flight from the street to 100 km while Earth comes apart.
- **Voyage:** the Morning Star's bridge, a weightless flip at the midpoint, orbit insertion and Mars in the floor window.
- **Mars:** a seamless descent from orbit to Lyra's station, then on foot through Jezero crater and a lava tube. Souls-like fights against three creatures that talk, and the first Builders' shard with its star-map record.

Desktop: WASD, mouse, Space, Shift, E. Phones in landscape get on-screen controls.

## Running it locally

It is a static site with no build step. Serve the folder and open `index.html`:

```
python3 -m http.server 8765
```

Three.js r160 loads from jsDelivr through the import map in `index.html`.

## Layout

| Path | What it is |
|---|---|
| `index.html` | Page, HUD, styles, import map |
| `js/game.js` | Game flow, prologue, checkpoints, HUD |
| `js/city.js`, `js/classic.js`, `js/nasa.js` | Earth street, shop, launch site |
| `js/flight.js`, `js/meteors.js`, `js/finale.js` | Ascent, meteors, Earth's destruction |
| `js/ship.js`, `js/voyage.js` | The Morning Star and the trip to Mars |
| `js/mars.js`, `js/explore.js`, `js/cave.js` | Mars landing, exploration, the lava tube |
| `js/combat.js`, `js/creatures.js` | Souls-like combat and the three creatures |
| `js/player.js` | The hero: model, suit, animation, movement |
| `js/rock.js`, `js/env.js`, `js/earth.js`, `js/doomsky.js` | Shared rock, lighting, Earth and sky |
| `tex/` | Earth (day, night, clouds) and Mars maps |
