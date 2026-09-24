# Privacy

AstroTrack is private by design.

- **No account, no authentication, no cloud database, no server-side profile.**
- **No analytics and no telemetry.** The app contains no tracking code.
- All user data — observing locations, equipment, favourites, plans, journal
  entries and images, calibrations, settings — is stored only in the browser's
  IndexedDB on this device. It leaves the device only when _you_ export a
  backup file.

## Network requests

| When                                                               | Destination                                                | What is sent                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Always (app and data files)                                        | the server hosting the app                                 | ordinary static-file requests                                                               |
| Weather enabled (explicit opt-in on first use; toggle in Settings) | `api.open-meteo.com`                                       | latitude and longitude **rounded to 0.01° (≈ 1 km)**, requested hourly fields; nothing else |
| You press "Load survey image" (can be disabled)                    | `alasky.cds.unistra.fr` (hips2fits)                        | the target's sky coordinates and field size — no location                                   |
| You press "Download from the Minor Planet Center"                  | `www.minorplanetcenter.net`                                | nothing beyond the request                                                                  |
| You press "Check for updates" / "Download" on Offline Data         | the configured data source (default: the app's own server) | nothing beyond the request                                                                  |

Geolocation is requested only when you press "Use my current position", and the
result is stored only in your local location list.

## Backups

The JSON backup contains all of the above user data (images base64-encoded).
Treat it like any personal file. Importing a backup replaces or merges data
only after the file has been fully validated; a failed import changes nothing.
