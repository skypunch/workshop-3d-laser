#!/usr/bin/env python3
"""
Push the latest Plex additions from Tautulli to a TRMNL webhook plugin.

Runs ON the Tautulli host, queries Tautulli over localhost, and POSTs outbound
to TRMNL -- so Tautulli never needs to be exposed to the internet.

Trigger it either way:
  * Tautulli -> Settings -> Notification Agents -> Script, on "Recently Added"
  * or cron, e.g.  */30 * * * *  /usr/bin/python3 /path/tautulli_to_trmnl.py

The only thing you must supply is the TRMNL webhook URL -- either as the
--webhook argument (easiest under Tautulli), the TRMNL_WEBHOOK_URL environment
variable, or by editing TRMNL_WEBHOOK_DEFAULT below.

Tautulli passes TAUTULLI_URL and TAUTULLI_APIKEY to its scripts automatically,
so under the Script agent those need no configuration. Running from cron, set
them yourself.

  --webhook URL / TRMNL_WEBHOOK_URL   https://trmnl.com/api/custom_plugins/<UUID>
  --count N     / TRMNL_COUNT         how many items to show (default 5)
  TAUTULLI_URL                        default http://localhost:8181
  TAUTULLI_APIKEY                     Tautulli > Settings > Web Interface > API key
  TRMNL_STATE_FILE                    dedupe state (default alongside this script)

Stdlib only -- no pip installs.
"""

import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

# Optional: paste your webhook URL here to avoid passing it in every time.
TRMNL_WEBHOOK_DEFAULT = ""


def _arg(flag):
    """Read '--flag value' from argv, if present."""
    if flag in sys.argv:
        idx = sys.argv.index(flag)
        if idx + 1 < len(sys.argv):
            return sys.argv[idx + 1]
    return None


TAUTULLI_URL = (
    _arg("--tautulli-url")
    or os.environ.get("TAUTULLI_URL")
    or "http://localhost:8181"
).rstrip("/")
TAUTULLI_APIKEY = os.environ.get("TAUTULLI_APIKEY", "")
TRMNL_WEBHOOK_URL = (
    _arg("--webhook") or os.environ.get("TRMNL_WEBHOOK_URL") or TRMNL_WEBHOOK_DEFAULT
)
COUNT = int(_arg("--count") or os.environ.get("TRMNL_COUNT", "5"))


def _default_state_file():
    """Prefer sitting next to the script; fall back to temp if that's read-only."""
    here = os.path.dirname(os.path.abspath(__file__))
    if os.access(here, os.W_OK):
        return os.path.join(here, ".trmnl_plex_state")
    return os.path.join(tempfile.gettempdir(), "trmnl_plex_state")


STATE_FILE = os.environ.get("TRMNL_STATE_FILE") or _default_state_file()

# TRMNL allows 12 webhook posts/hour (standard plan). Adding a whole season fires
# one Tautulli notification per episode, so refuse to post more often than this.
MIN_SECONDS_BETWEEN_POSTS = 120

# Plex reports a bulk add (a whole season/series at once) as a single "season" or
# "show" entry rather than individual episodes -- so those must be included, or
# adding a full season would never reach the display.
ALLOWED_MEDIA_TYPES = {"episode", "movie", "season", "show"}

# Cloudflare (in front of TRMNL) blocks the default "Python-urllib/x.y" agent
# with error 1010, so send a real identifier instead.
USER_AGENT = "tautulli-to-trmnl/1.0"


def log(msg):
    print(f"[tautulli_to_trmnl] {msg}", flush=True)


def fetch_recently_added(limit):
    """Ask Tautulli for recent additions (over-fetch, since we filter after)."""
    params = urllib.parse.urlencode(
        {"apikey": TAUTULLI_APIKEY, "cmd": "get_recently_added", "count": limit}
    )
    url = f"{TAUTULLI_URL}/api/v2?{params}"
    log(f"querying Tautulli at {TAUTULLI_URL}")
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"TAUTULLI returned HTTP {exc.code} for {TAUTULLI_URL}. "
            "If that URL goes through a reverse proxy or auth gateway, override it: "
            "--tautulli-url http://localhost:8181"
        ) from None
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"TAUTULLI unreachable at {TAUTULLI_URL} ({exc.reason}). "
            "Try --tautulli-url http://localhost:8181"
        ) from None

    body = payload.get("response", {})
    if body.get("result") != "success":
        raise RuntimeError(f"Tautulli API error: {body.get('message')!r}")
    return body.get("data", {}).get("recently_added", [])


def build_items(raw, count):
    """Reduce Tautulli's verbose records to the few fields the display needs."""
    items = []
    for entry in raw:
        kind = entry.get("media_type")
        if kind not in ALLOWED_MEDIA_TYPES:
            continue
        title = (entry.get("title") or "").strip()
        show = season = episode = ""

        if kind == "episode":
            # Series name is in grandparent_title; parent_media_index = season,
            # media_index = episode.
            show = (entry.get("grandparent_title") or "").strip()
            season = str(entry.get("parent_media_index") or "").strip()
            episode = str(entry.get("media_index") or "").strip()
        elif kind == "season":
            # A whole season added at once. Its parent is the series, and
            # media_index is the season number.
            show = (entry.get("parent_title") or "").strip()
            season = str(entry.get("media_index") or "").strip()
        # movie / show: the title alone says it.

        if not title and not show:
            continue
        items.append(
            {
                "title": title,
                "show": show,
                "season": season,
                "episode": episode,
                "kind": kind,
                "added": entry.get("added_at", ""),
            }
        )
        if len(items) >= count:
            break
    return items


def read_state():
    try:
        with open(STATE_FILE) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def write_state(state):
    try:
        with open(STATE_FILE, "w") as fh:
            json.dump(state, fh)
    except OSError as exc:
        log(f"warning: could not write state file: {exc}")


def post_to_trmnl(items):
    body = json.dumps({"merge_variables": {"recent": items}}).encode()
    if len(body) > 2048:
        log(f"warning: payload is {len(body)}b, over TRMNL's 2kb standard limit")
    # TRMNL is behind Cloudflare, which rejects Python's default
    # "Python-urllib/3.x" User-Agent with error 1010. Identify ourselves properly.
    req = urllib.request.Request(
        TRMNL_WEBHOOK_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode()[:200]
        except Exception:
            pass
        raise RuntimeError(
            f"TRMNL webhook returned HTTP {exc.code}. Check the webhook URL is the "
            f"exact 'Webhook URL' from the plugin's settings page. {detail}"
        ) from None


def main():
    if not TAUTULLI_APIKEY:
        log("ERROR: no TAUTULLI_APIKEY. Tautulli's Script agent sets this itself; "
            "from cron, export it yourself.")
        return 2
    if not TRMNL_WEBHOOK_URL.startswith("http"):
        log("ERROR: no TRMNL webhook URL. Pass --webhook https://trmnl.com/api/"
            "custom_plugins/<UUID>, set TRMNL_WEBHOOK_URL, or fill in "
            "TRMNL_WEBHOOK_DEFAULT.")
        return 2

    items = build_items(fetch_recently_added(max(COUNT * 4, 20)), COUNT)
    if not items:
        log("nothing to send (no episodes/movies found)")
        return 0

    # Skip identical payloads, and rate-limit bursts (season adds fire per episode).
    fingerprint = hashlib.sha256(
        json.dumps(items, sort_keys=True).encode()
    ).hexdigest()
    state = read_state()
    now = time.time()

    if state.get("fingerprint") == fingerprint:
        log("unchanged since last post -- skipping")
        return 0

    elapsed = now - state.get("posted_at", 0)
    if elapsed < MIN_SECONDS_BETWEEN_POSTS:
        log(f"posted {int(elapsed)}s ago -- skipping to respect rate limit")
        return 0

    status = post_to_trmnl(items)
    log(f"posted {len(items)} items -> HTTP {status}")
    for item in items:
        if item["kind"] == "episode" and item["season"] and item["episode"]:
            label = f"{item['show']}: S{int(item['season']):02d} E{int(item['episode']):02d}"
        elif item["kind"] == "season" and item["season"]:
            label = f"{item['show']}: Season {item['season']}"
        elif item["show"]:
            label = f"{item['show']}: {item['title']}"
        else:
            label = item["title"]
        log(f"  - {label}")

    write_state({"fingerprint": fingerprint, "posted_at": now})
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # keep Tautulli's log readable on failure
        log(f"ERROR: {exc}")
        sys.exit(1)
