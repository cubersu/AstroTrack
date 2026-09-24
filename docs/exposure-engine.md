# Exposure engine

The exposure recipe separates **physically calculable constraints** from
**empirical guidance** and labels each in the UI. No precision is invented:
without sensor noise data, ISO/gain and sub-exposure are ranges.

## Field of view and sampling (physical)

```
FOV = 2·atan(d / 2f)                       (width, height, diagonal)
pixel scale ["/px] = 206.265 · p[µm] / f[mm]
pixel pitch p = sensor width / horizontal resolution   (checked against height, 2 %)
f-ratio N = f / D ;  D = f / N ;  reducers/Barlows multiply f and N
```

Zoom lenses with variable maximum aperture interpolate N in log(focal length)
between the short- and long-end values.

### Working aperture for camera lenses

Maximum aperture is rarely optimal (coma, astigmatism, vignetting). Automatic
starting point: `N_max ≤ 2.8 → ×√2 (not faster than f/2.8)`,
`2.8 < N_max < 5 → ×1.19 (½ stop)`, `N_max ≥ 5 → wide open`, rounded to standard
⅓-stop values; always shown with a warning to test the lens. A user-specified
preferred astro aperture overrides it. Telescopes use their native focal ratio.

## Fixed tripod — NPF rule (physical)

Detailed NPF rule (F. Michaud, Société d'Astronomie Populaire):

```
t = (16.856·N + 0.0997·f + 13.713·p) / (f · cos δ)
```

δ is taken at the frame edge nearest the celestial equator
(`max(0, |δ| − FOV_h/2)`), clamped to |δ| ≤ 80°. Trail length for a given
exposure: `15.041″/s · cos δ · t / pixelScale`.

| Preset     | Multiplier | Meaning                                            |
| ---------- | ---------- | -------------------------------------------------- |
| Safe       | 1.0 × NPF  | stars round at 100 % (≈ ≤ 2 px drift)              |
| Balanced   | 1.5 × NPF  | slight elongation when pixel-peeping               |
| Aggressive | 2.0 × NPF  | ≈ simplified NPF `(35N + 30p)/f`; visible at 100 % |

The trail length in pixels is always displayed. The legacy 500 rule
`500 / (f · crop)` is shown for comparison only.

Alt-azimuth tracking: field rotation rate `ω⊕ · cos φ · cos A / cos h`; the
limit keeps a corner star within 1 px.

## Tracking mode — empirical mount calibration

Users record points _(focal length → longest reliable round-star exposure)_,
manually or by explicitly ticking “use this session for mount calibration” on a
journal entry with round stars. Between points: log–log interpolation. Outside:
`t ∝ 1/f` from the nearest point (tracking error is roughly constant in arcsec
while the tolerance scales with pixel scale ∝ 1/f), flagged; beyond 2× the
range it is flagged as far extrapolation and lowers confidence. Without
calibration an explicit default applies — `t = 12000/f s`, capped at 300 s
(unguided) or 600 s (guided) — and is labelled as an uncalibrated assumption.

## Sub-exposure

Sky electron rate per pixel (physical, approximate photometry):

```
F_sky = Φ₀ · Δλ · 10^(−0.4·SQM_eff) · Ω_px · A · QE · T_opt · τ_sky
Φ₀ ≈ 1.0·10⁴ photons s⁻¹ cm⁻² nm⁻¹ (V = 0),  Δλ ≈ 100 nm (Bayer pixel) / 300 nm (mono)
Ω_px = pixelScale² [arcsec²],  A = π(D/2)² [cm²],  QE default 0.5,  T_opt 0.9
```

`SQM_eff` includes the mean moonlight over the window.

- **With read noise** (advanced camera data): sky-limited sub
  `t = 10 · RN² / F_sky` (read noise adds ≲ 5 % to the total noise) —
  labelled _physically calculated_.
- **Without**: empirical starting point of 90 s at f/4, 4.3 µm under a
  20.0 mag/arcsec² sky (histogram peak near ¼–⅓), scaled by the ratio of sky
  electron rates — labelled _empirical_.

The recommended sub is capped by the tracking/NPF limit, and by 60 s for bright
cores (planetary nebulae, SB < 19). Values are rounded down to practical
exposures (…, 30, 45, 60, 90, 120, 180 s …).

### ISO / gain

Photographic cameras: ISO 400–800 under bright skies (SQM < 19), 800–1600 in
suburban skies, 800–3200 under dark skies — always a range and marked
approximate without sensor data; ISO is never inferred from sensor size.
Astro cameras: "unity gain or the manufacturer's recommended HCG setting".

### Test-frame calibration workflow

After a test frame the user reports the histogram background (<5, 5–10, 10–20,
20–30, >30 %), star shape (round/mild/obvious trailing) and bright-star
clipping (none/mild/excessive). Rules (`suggestFromTestFrame`): reductions take
precedence — obvious trailing ×0.5, mild ×0.75, excessive clipping ×0.5, mild
×0.85, background > 30 % ×0.6; otherwise background < 5 % ×2, 5–10 % ×1.5.
Increases are capped by the mount/trailing limit. Every suggestion lists its
reasons. With round stars the result can be stored as a mount calibration
point (explicit user action).

## Total integration (empirical anchors + physical scaling)

```
R_phys = (τb·B + τs·S) / (τs² · (B_ref + S))        B includes mean moonlight; S includes
                                                      mean-airmass extinction 10^(−0.4k(X̄−1))
F_sb   = 10^(0.3 · clamp(SB − SB_ref(type), −3, 3))
Recommended = base(type) · F_sb · R_phys^0.5 · (N/5)² · F_mono     clamped 0.25–30 h
Minimum = 0.3 × Recommended  (≈ 55 % of the SNR)
Ideal   = 3 × Recommended    (≈ 173 % of the SNR)
```

Reference conditions: Bortle 4 zenith (21.1 mag/arcsec²), no Moon, f/5,
Hα-sensitive colour camera. `F_mono = 0.8`. Base values (hours at the type's
reference SB): galaxy 2 (22.0), galaxy group 3 (22.0), open cluster 0.5 (21.0),
globular 0.75 (20.0), emission/HII 2 (22.0), SNR 3.5 (23.0), PN 1 (19.5),
reflection 3 (22.0), emission/reflection 2 (22.0), cluster+nebula 1.5 (21.5),
unclassified nebula 2.5 (22.0), dark nebula 4 (22.5), star cloud 0.75 (21.0).

The exponent 0.5 on `R_phys` and the 0.3 SB softening are explicit empirical
choices: in poorer conditions the "recommended" target accepts a lower SNR,
while the Ideal value approaches reference-quality results. The UI states that
SNR grows roughly with √t and that no image quality is guaranteed. Light-frame
counts are `ceil(hours · 3600 / sub)`.

## Calibration frames (guidance)

Darks 15–30 matching exposure, ISO/gain and temperature (dithering helps more
for uncooled cameras); flats 20–30 per session and optical setup; bias 30–50 for
DSLR/mirrorless; dark-flats 20–30 for CMOS astro cameras. Presented as workflow
guidance, not rules.
