# Scoring

Three independent scores are computed. They are never averaged into each other.

| Score                             | Applies to            | Depends on                                                | Source                      |
| --------------------------------- | --------------------- | --------------------------------------------------------- | --------------------------- |
| **Astro Score** (0–100)           | deep-sky objects only | geometry, Moon, sky brightness, equipment, catalogue data | `src/astro/scoring.ts`      |
| **Weather Score** (0–100, hourly) | an hour at a site     | Open-Meteo forecast                                       | `src/astro/weatherScore.ts` |
| **Tonight Score**                 | deep-sky objects only | Astro × weather multiplier × time multiplier              | `src/astro/tonight.ts`      |

Sky events (Moon, planets, conjunctions, eclipses, meteor showers, comets) are
**never** scored and never ranked against deep-sky objects.

All tunable numbers live in `src/astro/config.ts` and `src/astro/objectTypes.ts`.
Users can only change _preferences_ (`ScoringSettings`, validated by
`sanitizeSettings`): minimum/preferred altitude, Moon tolerance, minimum frame
fill, minimum target pixels, trailing tolerance, weather sensitivity, class
thresholds and the extinction coefficient. The astronomy cannot be changed.

## Astro Score

```
AstroScore = Σ weight_i · component_i
```

| Component                  | Weight | Summary                                                                 |
| -------------------------- | ------ | ----------------------------------------------------------------------- |
| altitude / airmass         | 20 %   | mean per-sample altitude quality over the best imaging window           |
| equipment / framing        | 20 %   | frame fill of the best optics/focal length for the chosen framing style |
| Moon impact                | 15 %   | Krisciunas & Schaefer sky brightening, type-aware                       |
| light pollution            | 15 %   | background degradation vs. pristine sky, type-aware                     |
| photographic accessibility | 10 %   | intrinsic surface brightness / magnitude                                |
| usable duration            | 10 %   | hours above the minimum altitude in darkness                            |
| camera / filter            | 5 %    | spectral match of camera modification and filter                        |
| tracking / exposure        | 5 %    | achievable sub-exposure vs. desired sub-exposure                        |

Classification: ≥ 80 Recommended, 60–79 Worth Trying, 40–59 Difficult,
< 40 Unsuitable (thresholds adjustable).

### Hard constraints

| Constraint                                                                    | Effect                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| not a DSO (star, nonexistent entry)                                           | score 0                                       |
| never rises                                                                   | score 0                                       |
| no astronomical or nautical darkness                                          | score 0                                       |
| never above the minimum altitude during darkness (or in "Now" mode, from now) | score 0                                       |
| too small: frame fill < 1.5 % **or** < 20 px across at the best focal length  | capped at 39                                  |
| too large: fill > 2 (≈ 2×2 mosaic or more) with every optic                   | capped at 39                                  |
| no optics in the equipment profile                                            | capped at 39                                  |
| insufficient data: neither size nor photometry in the catalogue               | capped at 50 (not a hard constraint; flagged) |

### Imaging window

Per 10-minute sample the engine computes an altitude quality and a Moon
quality. The window length is `min(available time, max(recommended
integration, 1 h))`; the contiguous window maximising
`Σ q_alt · (0.5 + 0.5·q_moon/100)` is chosen. In "Now" mode the window starts
at the current sample. This window drives the altitude and Moon components,
the mean airmass used for extinction, and the weather evaluation.

### Altitude quality

Airmass uses Kasten & Young (1989): `X = 1 / (cos Z + 0.50572·(96.07995° − Z)^−1.6364)`.
Per-sample quality is a piecewise-linear function of altitude built from the
user's preferences: 0 below the minimum altitude (default 25°), 45 at the
minimum, 68 half-way, 88 at the preferred altitude (default 45°) and 100 at
≥ 60° (X ≲ 1.15). Samples outside darkness or below the minimum contribute 0.

### Surface brightness

Priority (`src/astro/surfaceBrightness.ts`):

1. Catalogue value (OpenNGC `SurfBr`: mean B-band SB within the 25 mag/arcsec²
   isophote, galaxies only) converted to V with a type-typical B−V (galaxies 0.8).
2. Derived: `SB = m + 2.5·log10(π/4 · a · b)` (a, b in arcsec) — flagged _estimated_.
3. Assumed type-typical value — flagged, lowers confidence.

### Physical background model (Moon and light pollution)

With target surface flux `S` and sky background `B` (linear, relative to a
pristine 22.0 mag/arcsec² sky) and filter/camera transmissions `τs` (signal)
and `τb` (sky), sky-limited per-pixel SNR requires `t ∝ (τb·B + τs·S)/(τs·S)²`.
The **degradation factor** relative to a reference background is

```
G = (τb·B_site + τs·S) / (τb·B_ref + τs·S)
component score = 100 · G^(−e_type)
```

The type exponent `e_type` (`objectTypes.ts`) encodes practical effects not
captured by the mean SB (gradients, colour casts, faint outer structure, the
high peak brightness of stars in clusters):

| Type                                     | LP exponent | Moon exponent |
| ---------------------------------------- | ----------- | ------------- |
| galaxy, galaxy group                     | 0.50        | 0.55          |
| reflection nebula                        | 0.60        | 0.65          |
| dark nebula                              | 0.70        | 0.75          |
| emission nebula, HII region              | 0.40        | 0.45          |
| supernova remnant                        | 0.45        | 0.50          |
| planetary nebula                         | 0.50        | 0.50          |
| emission/reflection, unclassified nebula | 0.50        | 0.55          |
| cluster + nebula                         | 0.40        | 0.45          |
| open cluster                             | 0.20        | 0.20          |
| globular cluster, star cloud             | 0.30        | 0.30          |

Because `S` enters `G`, high-surface-brightness targets are automatically less
affected; the exponent adds type behaviour on top. **Moon tolerance**
multiplies the Moon exponent (strict 1.3, normal 1.0, relaxed 0.7).

#### Light pollution

`B_site` comes from the location's sky brightness with this priority:
manual SQM reading → manual Bortle class → light-pollution atlas **estimate** →
explicit assumption (Bortle 5 / 20.0 mag/arcsec², lowers confidence).
Bortle ↔ SQM uses the commonly cited approximate ranges
(1: ≥ 21.99, 2: 21.89–21.99, 3: 21.69–21.89, 4: 20.49–21.69, 5: 19.50–20.49,
6: 18.94–19.50, 7: 18.38–18.94, 8/9: < 18.38; representative values
22.0/21.9/21.75/21.1/20.0/19.2/18.65/18.1/17.5). Bortle is a visual scale and is
never presented as measured.

#### Moon — Krisciunas & Schaefer (1991), PASP 103, 1033

```
I*(α)  = 10^(−0.4 (3.84 + 0.026|α| + 4·10⁻⁹ α⁴))   (×(1.35 − 0.05|α|) for |α| < 7°)
f(ρ)   = 10^5.36 (1.06 + cos²ρ) + 10^(6.15 − ρ/40)
X(Z)   = (1 − 0.96 sin² Z)^−1/2
B_moon = f(ρ) I* 10^(−0.4 k X(Z_m)) (1 − 10^(−0.4 k X(Z)))    [nL]
B[nL]  = 34.08 exp(20.7233 − 0.92104 V)
```

α = lunar phase angle, ρ = Moon–target separation (clamped at 10°; closer
separations lower confidence), Z_m/Z = zenith distances, k = extinction
coefficient (default 0.25 mag/airmass). Moonlight is expressed relative to the
moonless background at the target's altitude (dark-sky gradient
`B(Z) = B_zen · 10^(−0.4k(X−1)) · X`), so the same Moon matters less under a
light-polluted sky. Validated in tests: a full Moon 30° away gives a sky of
≈ 17–18 mag/arcsec².

### Filters and camera response

`FILTER_TRANSMISSION` (lightPollution.ts) lists approximate signal and sky
transmissions per spectral class (broadband, stellar, emission, mixed,
absorption). Examples: dual-band on an emission nebula (signal 0.60, sky 0.05);
dual-band on a galaxy (0.05, 0.05). Custom filters with passbands are modelled
from bandwidth (sky ≈ Σ bandwidth / 300 nm) and whether principal emission
lines (Hβ, [O III], Hα, [N II], [S II]) fall inside; custom filters without
passbands are neutral and lower confidence. The engine picks the filter from the
rig (or none) that minimises the physical time factor. A stock DSLR/mirrorless
camera passes ≈ 45 % of emission-line signal (Hα blocked by the IR-cut filter)
and ≈ 75 % for mixed targets. **These values are engineering approximations,
not measurements**, and are documented as such in the UI.

Camera/filter component: emission targets score 55 with a stock camera without
a line filter, 70 with a stock camera and a line/UHC filter, 100 with modified,
full-spectrum or astro cameras; mixed targets 80 (stock) / 100; others 100.

### Framing

`fill = max(a/W, b/H)` after rotating the major axis `a` onto the long side `W`
(`framing.ts`). Target bands: Wide 20–40 %, Balanced 40–70 % (default),
Tight 70–90 %. Below the band the score is `100·(fill/lo)^0.55`; above it
declines to 75 at fill 1, then 70/45/30/15/5 at 1/1.25/1.5/2/3. Zoom lenses are
searched analytically for the focal length giving the ideal fill (30/55/80 %),
clamped to the zoom range (after reducer/Barlow multipliers). The optics are
chosen by `0.75·framing + 0.15·tracking + 0.10·speed`. Camera rotation is the
target's position angle (long side at PA N→E), reported as landscape/portrait
when within 15°, and omitted for round (b/a > 0.8) targets or unknown PA.

### Other components

- **Accessibility** — SB table: 17→100, 19→95, 20→88, 21→78, 22→62, 23→42,
  24→25, 25→12; clusters use integrated V magnitude: 3→100 … 15→8; dark nebulae
  40; unknown photometry 40.
- **Duration** — hours above the minimum altitude in darkness: 0→0, 0.5→10,
  1→25, 2→50, 3→70, 4→85, ≥ 6→100.
- **Tracking/exposure** — ratio of the longest reliable sub (tracking limit or
  NPF) to the desired sky-limited/empirical sub: 0.02→10, 0.05→25, 0.1→40,
  0.25→60, 0.5→80, ≥ 1→100.

### Confidence

Starts at 100 points; deductions: size missing −40, SB assumed −25, SB derived
−10, magnitude missing −10, sky brightness assumed −20, atlas estimate −5,
uncalibrated tracking −10, far calibration extrapolation −10, custom filter
without passbands −10, Moon closer than 10° −10, unknown aperture −15.
≥ 80 High, 50–79 Medium, < 50 Low.

### Explanations

The engine emits language-neutral reason codes with parameters
(`explain.ts`); the UI shows the strongest positives and negatives and, under
"Advanced details", every component score, informational reasons and
confidence factors. Journal ratings never influence any score.

## Weather Score (hourly)

```
Ceff = max(total, low, 0.9·mid, 0.8·high)
WeatherScore = 0.45·cloud + 0.20·dew + 0.15·wind + 0.10·clarity + 0.10·precipitation
```

| Input                                            | Thresholds → score                                     |
| ------------------------------------------------ | ------------------------------------------------------ |
| Ceff (%)                                         | ≤10→100, ≤20→90, ≤35→70, ≤50→50, ≤70→25, ≤85→10, >85→0 |
| T − dew point (°C)                               | ≥6→100, ≥4→90, ≥3→75, ≥2→55, ≥1→30, >0→10, ≤0→0        |
| wind max(speed, 0.6·gust) (km/h)                 | ≤8→100, ≤12→90, ≤18→70, ≤25→40, ≤35→15, >35→0          |
| visibility (km) — _Atmospheric Clarity Estimate_ | ≥25→100, ≥15→85, ≥10→65, ≥5→35, <5→10                  |
| precipitation probability (%)                    | <10→100, <20→80, <40→50, <70→20, ≥70→0                 |

- Humidity ≥ 90 % → warning, ≥ 95 % → strong warning.
- Hard stop (score 0, "Imaging not recommended — precipitation/severe weather
  expected."): precipitation ≥ 0.2 mm/h, WMO codes 61–67, 71–77, 80–86 (rain,
  snow, showers) or ≥ 95 (thunderstorm), gusts ≥ 60 km/h.
- **Cloud cap (documented addition):** the hourly score may not exceed
  `15 + 0.85·cloudScore`, so overcast skies cannot appear "Marginal" merely
  because the air is calm and dry.
- Missing fields are skipped and weights renormalised (flagged `partial`).
- Visibility is haze, not astronomical seeing; no arcsecond seeing value is
  ever produced.
- Labels: 85–100 Very Good, 70–84 Good, 50–69 Marginal, 30–49 Poor, 0–29 Unsuitable.
- Session weather over the imaging window: `0.70·average + 0.30·worst`.

## Tonight Score

```
TonightScore = AstroScore × WeatherMultiplier × TimeMultiplier
```

| Weather score | Multiplier |     | available / recommended integration | Multiplier |
| ------------- | ---------- | --- | ----------------------------------- | ---------- |
| ≥ 90          | 1.00       |     | ≥ 100 %                             | 1.00       |
| 80–89         | 0.95       |     | 75–100 %                            | 0.95       |
| 70–79         | 0.88       |     | 50–75 %                             | 0.85       |
| 60–69         | 0.78       |     | 25–50 %                             | 0.65       |
| 50–59         | 0.65       |     | < 25 %                              | 0.40       |
| 40–49         | 0.50       |     |                                     |            |
| 30–39         | 0.35       |     |                                     |            |
| < 30          | 0.15       |     |                                     |            |

A weather hard stop sets the multiplier to 0. Weather sensitivity scales the
shortfall `(100 − score)` by 1.25 (strict) / 1.0 / 0.8 (relaxed) before the
lookup. When weather is disabled, unavailable or beyond the forecast range
(7 days requested), the multiplier is 1 and the result is explicitly labelled
("Weather forecast not yet available." for future dates).
Available time is `min(user availability, usable dark hours above the minimum
altitude)`.
