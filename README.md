# Pokemon damage calculator (gen6 mechanics)

I assume you are aware of the very powerful Pokemon damage calculator from Smogon at https://calc.pokemonshowdown.com/.
But sometimes we just wanna quickly type in "jolly garchomp eq vs conkeldurr" instead of fiddling with the site. 
This is a calculator that does that in an offline CLI environment. 
Mechanics is gen 6 for now, probably won't change in the future. Please feel free to fork. 

## 0) How to run it

Requires **Node.js 18 or newer** on PATH — nothing else. Clone the repo, then:

- **Windows:** double-click `calc.bat` for a prompt, or run `calc.bat "<line>"` for a one-shot.
- **Linux/macOS:** same with `./calc.sh`, or `node scripts/damage.mjs "<line>"` directly.
- **Agent:** a pre-baked skill can be found in `skills/pokemon-damage-calc/SKILL.md`.

Downloaded as a zip instead of cloned? It works the same on Windows, but zip
extraction drops the executable bit that a git clone preserves, so on
Linux/macOS either run `bash calc.sh "<line>"` or `chmod +x calc.sh` once.

First run installs the dependencies and builds the engine once; after that it is
fully offline. To set up by hand instead, run `npm install` then `npm run build`.
Two caveats on that setup step: it needs network access to the npm registry
(only that first run does — every calc afterwards is offline), and it must be
the **full** install, because the compiler lives in `devDependencies` and
`npm install --omit=dev` leaves you without `npm run build`.

## 1) Offline one-liner CLI input

Minimal input: `<attacker> <move> vs <defender>`

`keldeo scald vs venusaur`
```
  Attacker  Keldeo  Serious  Justified
  Defender  Venusaur  Serious  Overgrow
  Move      Scald
  Damage    18% - 21.2%  (28-33)
  KO        guaranteed 6HKO (5HKO 32.2%)
```

More input variables are accepted but they are optional, and can be in any order.

`+2 atk jolly Garchomp banded earthquake vs 252 hp heatran`

Damage numbers are exact with the Smogon calculator except for a few unimplemented cases. Run `-limits` for full details.

## 2) Alias support

- `EQ` -> earthquake
- `Rock` -> stealth rock
- `zard Y` -> Mega Charizard Y

Case insensitive; hyphens are dealt with.
Full lists of aliases in `aliases.md`, human readable and editable.

## 3) Powerful default rules

- lv50 for battles on consoles.
- `Adamant` -> adamant nature + 252 atk ev
- `Berry` -> resist berry
- `Plate` -> the plate that boosts the attack move
- `Hippowdon` -> sand
- `Max atk` -> 252 in atk ev + adamant
- `Toxic Breloom` -> poison heal
- `Breloom mach punch` -> technician
- ...and many more.

However, **explicit inputs always win.**

- `adamant 102 atk` -> 102 atk ev suppresses adamant default 252 atk ev
- `Poison heal Breloom mach punch` -> still poison heal, not overridden by technician

Full lists of default rules in `auto-fill-defaults.md`, human readable and editable.
Like using illuminate Starmie? Just edit the file yourself.

## 4) Boost move converter

- `dd dragonite` -> +1 atk, +1 spe dragonite
- `cm gardevoir` -> +1 spa, +1 spd gardevoir

## 5) Move switch-up

Simply putting 2 attack moves on the left side of `vs` makes it calculate for move A then move B.

```
  Attacker  Garchomp-Mega  Naive | ATK 252  Sand Force  [-1 atk]
  Defender  Landorus-Therian @ Leftovers  Impish | HP 252 / DEF 252  Intimidate
  Arena     Sandstorm
            passives: chip none   heal Leftovers 1/16
            turn |
               1 | Draco Meteor 52.5% - 62.7%  (103-123)
               2 | Stone Edge 23.9% - 28.5%  (47-56)
  Result    survives both moves: 100% · HP left 21-36%
            72% chance to hit all attacks
```

Currently only 1 or 2 attack moves are supported.

## 6) Multi-hit moves

Instead of needing an explicit X hit factor like the Smogon Calculator, this calculator gives a curated KO probability.

```
  Attacker  Breloom @ Life Orb  Jolly | ATK 252 / SPE 252  Technician
  Defender  Clefable @ Leftovers  Bold | HP 252 / DEF 252  Magic Guard
  Move      Bullet Seed
  Damage    35.6% - 108.9%  (72-220) [2-5 hits]
  KO        guaranteed 3HKO (1HKO 5.6%, 2HKO 58.0%)
```

Skill Link is of course implemented.

## 7) Hit chance compilation

Your DD'd Tyrantrum is probably not sweeping with Head Smash, and here is why.

```
  Attacker  Tyrantrum @ Life Orb  Adamant | ATK 252  Rock Head  [+1 atk / +1 spe]
  Defender  Bronzong  Impish | HP 252 / DEF 252  Levitate
  Move      Head Smash
  Damage    49.4% - 58%  (86-101)
  KO        guaranteed 3HKO (2HKO 96.9%)
            51.2% chance to hit all attacks (80% x3)
```

## 8) Echo printout

User's exact input is pasted with labels underneath to signal how the input is understood by the engine.

```
plate modest dragalge draco spike vs heatran max hp spikes
item  nature species  move  arena    species ev:hp  arena
```

```
conflict on spikes layers: 1 vs 3
```

## 9) Legal

### License

The original source code in this repository is released under the [MIT License](LICENSE). That license covers only the code authored here, and does not extend to Pokemon intellectual property or to the third-party data under `data/`.

### Pokemon

Pokemon and all respective names of characters, moves, abilities, items, and other properties are trademarks of and (c) Nintendo, Creatures Inc., GAME FREAK inc., and The Pokemon Company. This is an unofficial, non-commercial fan project. It is not affiliated, authorized, sponsored, or endorsed by Nintendo, Creatures Inc., GAME FREAK inc., or The Pokemon Company. No game assets (sprites, artwork, audio) are included or redistributed.

### Data

Files under `data/` are generated from Smogon's Pokemon Showdown dex and then curated by hand. They are third-party data and are **not** covered by the MIT license above: upstream is MIT-licensed by Pokemon Showdown's contributors, and that project's required notice is reproduced in [`data/LICENSE`](data/LICENSE) — keep it with the data if you redistribute these files.

- `data/xy-pokemon.json` - source: https://www.smogon.com/dex/xy/pokemon/ (RPC `dump-basics`), generated **2026-09-02**.
- `data/moves-xy.json`, `data/abilities-xy.json`, `data/natures-xy.json`, `data/types-xy.json` - source: https://www.smogon.com/dex/xy/ (RPC `dump-basics`), generated **2026-09-03**.
- `data/_raw-xy-basics.json` - the raw `dump-basics` response from https://www.smogon.com/dex/_rpc/dump-basics.

Credit and thanks to Smogon University and the Pokemon Showdown contributors. Regenerate with `npm run fetch:data` (Pokemon dex) and `npm run gen:aux` (moves / abilities / natures / types). The optional `@smogon/calc` package, used only as a test oracle and never at runtime, is distributed under the MIT license.

### Trademarks

Product names, logos, and brands are the property of their respective owners and are used here for identification only. Use of a name does not imply endorsement.
