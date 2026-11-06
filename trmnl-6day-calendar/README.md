# 6-Day Calendar — TRMNL Private Plugin

A family wall display on TRMNL e-ink, laid out as a **2×3 grid**:

| | | |
|---|---|---|
| Today | +1 day | **Weather** |
| +2 days | +3 days | **Plex** |

The left two columns are **four days** of calendar, with **today always top-left**
and its header inverted (black fill) so it stands out. The right column is an
info stack: current weather on top, latest Plex additions below.

(It started life as a six-day grid -- hence the folder name -- and lost a day to
each panel.)

## How data gets in — private, no server, no API key

This plugin uses TRMNL's **Plugin Merge** ("data only") strategy. You connect
TRMNL's **built-in Google Calendar plugin** (which logs in with Google via
**OAuth**), and this custom plugin re-renders that already-parsed event data in
the 6-day layout.

- ✅ Calendar stays **private** — nothing is shared publicly or indexed by Google.
- ✅ **No server** to host and **no API key** to manage.
- The 6-day window and "today" are computed in the templates from the user's
  TRMNL timezone.

## Files

This is a standard [`trmnlp`](https://github.com/usetrmnl/trmnlp) project, so it
can be served locally and pushed to TRMNL with one command (see **Deploying**).

| File | Purpose |
|------|---------|
| `src/full.liquid` | Main 2×3 six-day grid (full screen) |
| `src/half_horizontal.liquid` | Next 3 days across (mashup half) |
| `src/half_vertical.liquid` | Today + tomorrow stacked (mashup half) |
| `src/quadrant.liquid` | Today's agenda (mashup quarter) |
| `src/settings.yml` | Plugin config: `strategy: plugin_merge`, and `id: 355410` (ties `trmnlp push` to the live plugin) |
| `.trmnlp.yml` | Local-preview config + mock calendar/Plex data (not uploaded) |
| `scripts/tautulli_to_trmnl.py` | Pushes the latest Plex additions from Tautulli to a TRMNL webhook plugin (see **Info panel**) |

The live plugin is **"Family Calendar"** (id **355410**), reading the native
Google Calendar plugin's events via `google_calendar_14059.events`.

## Setup (click-by-click)

You need the **Developer add-on** or a **BYOD** license (TRMNL → device picker
gear → Developer perks).

### 1. Connect Google Calendar (private, OAuth)
- TRMNL → **Plugins → Google Calendar → Connect with Google Calendar**.
- Pick the Google account and approve access. Choose the calendar you want.

### 2. Add it to a playlist and hide it
Only plugins on a **playlist** sync fresh data. Add the Google Calendar plugin to
your playlist, then click the **eyeball icon to hide it** (so it provides data
without showing its own screen).

### 3. Create the Private Plugin with Plugin Merge
- TRMNL → **Plugins → Private Plugin → Add new**.
- Set the strategy to **Plugin Merge** (a.k.a. "data only") and **save**.
- There is **no "select source" control** -- this is expected. Any plugin on your
  playlist (Step 2) automatically exposes its parsed data; you pick which one by
  referencing its variable node in the markup (Step 5). The Google Calendar node
  only appears once it's on the playlist and has synced (Force Refresh it once).

### 4. Add the markup
Either **deploy with `trmnlp push`** (see **Deploying** below — recommended now
that the plugin exists), or open **Edit Markup** and paste each `src/*.liquid`
file into its matching layout tab (Full, Half Horizontal, Half Vertical, Quadrant).

### 5. Confirm two lines against the "Variables" panel
Open the **Variables** dropdown and find the events array. Each `.liquid` file has
two lines at the top to confirm:

1. **The array node** — these templates are wired to this calendar's node:
   ```liquid
   {% assign events = google_calendar_14059.events %}
   ```
   If you rebuild against a different Google Calendar instance, check the
   Variables panel for its `google_calendar_<id>` node and update this line in
   each file to match.

2. **Timezone fix** — if events land on the wrong day near midnight, the parsed
   `date_time` isn't local; change:
   ```liquid
   {% assign TZ_FIX = 0 %}
   ```
   to `{% assign TZ_FIX = trmnl.user.utc_offset %}` in each file.

### 6. Preview
Click **Force Refresh**, check the render, then add this Private Plugin to a
playlist to show it on the device.

## Weather panel (top-right cell)

Rain chance + current UV for **West Singapore**, from
[Open-Meteo](https://open-meteo.com) -- free, no API key, no script.

Served by its own private plugin, **"Weather" (id 396837)**, strategy **polling**,
refreshing every **15 minutes**. Its source lives in **`../trmnl-weather/`** -- edit
there and `trmnlp push` (its `src/settings.yml` carries `id: 396837`, so pushing
updates rather than creating a duplicate).

```
https://api.open-meteo.com/v1/forecast?latitude=1.3590&longitude=103.7637&current=uv_index&hourly=precipitation_probability&forecast_hours=2&timezone=Asia%2FSingapore
```

The calendar reads it as `private_plugin_396837`. It **must be on a playlist**
(hidden is fine) or the merge node stays empty.

- **Rain** is the *higher* of the current and next clock-hour probabilities, so a
  spike either side of the hour boundary still shows.
- **UV** is `current.uv_index`, rounded. Polling matches Open-Meteo's own 15-minute
  `current` cadence, so it stays fresh.
- The **header time** is `current.time` -- when the data was pulled. Open-Meteo
  steps it in 15-minute increments (15:00, 15:15, 15:30 ...), matching the polling
  interval, so it reads cleanly and shows at a glance that the data is fresh.
  (`hourly.time[0]` is the alternative: always on the hour, but it labels the
  forecast window rather than the fetch.)
- Coordinates are **Bukit Batok** (1.3590, 103.7637). Open-Meteo's grid is
  ~1-11km, so nearby areas resolve to the same cell -- Jurong and Bukit Batok both
  snap to 1.371, 103.731 and return identical forecasts. A postcode wouldn't
  change anything; only a move of several km would.
- The template tries `.merge_variables` first and falls back to the root, since
  webhook and polling plugins nest their data differently.

## Plex panel (bottom-right cell)

The full view shows **five day cells + one info panel** in the bottom-right,
currently listing the **last 5 items added to Plex**.

Data path (no inbound exposure -- Tautulli stays private):

```
Tautulli  --(localhost API)-->  scripts/tautulli_to_trmnl.py  --(HTTPS POST)-->  TRMNL webhook plugin
                                                                                        |
                                          Family Calendar (plugin_merge) reads it -------+
```

A `plugin_merge` plugin can't poll, so the Plex feed is a **second private
plugin** (webhook strategy) that this one reads -- exactly like the calendar.

### Setting it up
1. **TRMNL** -> Plugins -> Private Plugin -> Add new, strategy **Webhook**, name
   it e.g. "Plex Recently Added". Save, then copy its **Webhook URL**
   (`https://trmnl.com/api/custom_plugins/<UUID>`).
2. Add that plugin to your playlist and **hide it** (eyeball icon) so its data
   syncs without taking a screen slot.
3. Copy `scripts/tautulli_to_trmnl.py` into a folder the **Tautulli process** can
   read. Under Docker that must be a path *inside* the container (e.g. map host
   `/docker/tautulli/scripts` to `/scripts`). Make it readable/executable:
   `chmod 755 tautulli_to_trmnl.py`.
4. **Tautulli** > Settings > Notification Agents > **Add a new notification agent**
   > **Script**:
   - *Configuration* tab -- **Script Folder**: the folder from step 3;
     **Script File**: `tautulli_to_trmnl.py` (if it isn't in the dropdown, the
     folder path is wrong or the file isn't readable). Default 30s timeout is
     ample -- the script takes ~1s.
   - *Triggers* tab -- tick **Recently Added** only.
   - *Arguments* tab -- on the **Recently Added** row, put:
     `--webhook https://trmnl.com/api/custom_plugins/<UUID>`
     No Tautulli `{parameters}` are needed; the script queries the API itself.
   - Save.

   Tautulli passes `TAUTULLI_URL` and `TAUTULLI_APIKEY` to its own scripts
   automatically, so there is nothing else to configure.

   Also enable Tautulli's *grouping* for recently-added notifications
   (Settings > Notifications) so adding a season fires one notification rather
   than one per episode.
5. Test it: Tautulli's **Test Notifications** tab -> pick the agent -> *Recently
   Added* -> Send (re-enter the `--webhook` argument there if the test form asks
   for it). Check Tautulli's logs for `[tautulli_to_trmnl] posted 5 items -> HTTP 200`.

   Cron alternative (no notification agent needed) -- set the two variables
   yourself since Tautulli isn't invoking it:
   ```sh
   */30 * * * * TAUTULLI_APIKEY=xxx /usr/bin/python3 /path/tautulli_to_trmnl.py --webhook https://trmnl.com/api/custom_plugins/<UUID>
   ```
6. In the **Family Calendar** plugin's Variables panel, find the new node for the
   Plex plugin and set this line in `src/full.liquid` to match:
   ```liquid
   {% assign plex_recent = plex.recent %}
   ```

### Notes
- **Rate limits:** TRMNL accepts 12 webhook posts/hour (30 on TRMNL+). The script
  guards this two ways -- it skips posting when the payload is unchanged, and
  refuses to post more than once every `MIN_SECONDS_BETWEEN_POSTS` (120s).
- **Bulk adds:** when a whole season or series lands at once, Plex reports it as a
  single `season`/`show` entry rather than individual episodes -- so those types
  must stay in `ALLOWED_MEDIA_TYPES`, or adding a full season silently never
  reaches the display. (Tautulli's `media_type` parameter can't force episode-level
  expansion; it only accepts artist/movie/show and still returns grouped entries.)
  A season entry renders as `Series: Season 1`.
- **Payload:** ~400 bytes for 5 items, well under the 2kb standard limit.
- **Cloudflare / error 1010:** TRMNL sits behind Cloudflare, which rejects
  Python's default `Python-urllib/x.y` User-Agent with `HTTP 403 ... error code:
  1010`. The script sends `User-Agent: tautulli-to-trmnl/1.0` to avoid it -- don't
  remove that header.
- **`--tautulli-url`:** Tautulli hands its scripts the *configured* URL, which may
  point through a reverse proxy that refuses the call. Pass
  `--tautulli-url http://localhost:8181` to talk to Tautulli directly.
- Episodes render as `Series: S01 E03`; films show the title alone. The script
  sends raw `season`/`episode` numbers (Tautulli's `parent_media_index` /
  `media_index`) and the template zero-pads them, so the format can be changed by
  editing the template alone -- no need to touch the host script again.

## Deploying (no more copy-paste)

This project pushes straight to the live plugin via `trmnlp`, so edits don't need
to be pasted into the web UI.

```sh
# one-time auth (saves a token to ~/.config/trmnlp; enter your API key from
# trmnl.com -> Account/Settings -> Developer):
trmnlp login

# deploy: uploads src/*.liquid + src/settings.yml to plugin id 355410
cd trmnl-6day-calendar
trmnlp push
```

Then **Force Refresh** on the dashboard and the device picks it up on its next
wake (or power-cycle to pull immediately).

- `src/settings.yml` carries `id: 355410`, so `push` **updates** the existing
  plugin instead of creating a new one. Don't remove that line.
- `push` does **not** change the Plugin Merge binding (that lives in the markup as
  `google_calendar_14059.events`), so deploying only updates your layout/logic.
- Only **real files** can be pushed — don't use symlinks in `src/`.

## How it works (for future tweaks)

- **Parsed event shape** (from the native plugin): each event has `summary`
  (title), `start` / `end` (pre-formatted local time strings), `all_day` (bool),
  and `date_time` (sortable timestamp). The templates bucket events into the six
  day-cells by comparing `date_time`'s date against each day.
- **Six-day window:** the grid always starts on **today** (top-left) and runs six
  days; "today" comes from `now` shifted by `trmnl.user.utc_offset`.
- **Overflow:** each cell caps the list and shows `+N more` beyond the cap.

### Tuning
- **More/fewer events per day:** change the `shown < 4` caps in `src/*.liquid`
  (the full view auto-scales text to fill each cell, so 4 + "+N more" is the safe fit).
- **Week starting on a fixed day** (instead of always today): adjust the loop start
  in `src/full.liquid`.

### Local preview (verified)
The same [`trmnlp`](https://github.com/usetrmnl/trmnlp) renders `src/*.liquid`
against mock data in a browser — handy for checking the layout and timezone before
deploying. `.trmnlp.yml` holds sample events (under `google_calendar_14059.events`,
matching the real merge node) and is set to Asia/Singapore.

```sh
# trmnlp needs Ruby >= 3.4 (e.g. `brew install ruby`), then:
gem install trmnl_preview
cd trmnl-6day-calendar
trmnlp serve            # open http://localhost:4567
```

Notes from getting this running:
- **Templates must be ASCII-only.** trmnlp throws `Liquid error: Invalid template
  encoding` on any non-ASCII byte in the *template source* (e.g. an em-dash in a
  comment). Event *data* with Unicode is fine. These templates use `&mdash;` etc.
  to stay ASCII.
- **True 1-bit bitmap export** (what the device shows): `GET
  /render/<view>.png?width=W&height=H&color_depth=1`. Needs ImageMagick
  (`brew install imagemagick`) and a local Chrome (Selenium auto-fetches the
  driver). The HTML preview needs neither.
- **Chrome can't bitmap-render below 500px wide.** The `full` (800) and
  `half_horizontal` (800) views export fine; `half_vertical` (400) and `quadrant`
  (400) error with "browser clamped the viewport to 500x480" *locally only* --
  the real device renders them normally. Use the HTML preview for those two.
- Edit `utc_offset` / events in `preview/.trmnlp.yml` to simulate other timezones
  and calendars.

## Display font

The templates request **Futura** first, then fall back to **Jost** -- a free,
geometric near-clone loaded from Google Fonts -- then a generic sans:

```css
font-family: 'Futura', 'Futura PT', 'Jost', system-ui, sans-serif;
```

Futura is proprietary and isn't available in TRMNL's server-side render
environment, so the **device will display Jost** (visually near-identical).
Machines that have Futura installed (e.g. macOS local preview) show real Futura.
The Google Fonts `<link>` for Jost is included at the top of each template; to use
a different face, change that link and the `font-family` line in all four files.

## Troubleshooting
- **Empty cells / no events:** confirm the Google Calendar plugin is on your
  playlist (hidden is fine) so its data syncs, and that `events` points at the
  right node (step 5).
- **Events on the wrong day:** apply the `TZ_FIX` change in step 5.
- **Nothing in Variables panel:** Force Refresh the native Google Calendar plugin
  first, then the Private Plugin.
