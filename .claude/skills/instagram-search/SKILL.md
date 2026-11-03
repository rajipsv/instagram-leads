---
name: instagram-search
description: >-
  Search and extract any kind of content from Instagram using the user's signed-in
  browser session — DM and group chat messages, shared Reels, hashtag feeds, free-text
  keyword search, creator profiles and recent posts, location pages, audio/music pages,
  comments, stories, highlights, saved posts, and profile stats. Trigger this skill any
  time the user mentions Instagram alongside finding, searching, scraping, browsing,
  summarising, exporting, or analysing content — even when they don't say "search
  Instagram". Common phrasings: "pull the reels from my group chat", "find recent
  posts about [topic]", "what is @username posting lately", "trending under #hashtag",
  "what's tagged at [location]", "comments on this reel", "summarise this Instagram
  thread", "export these reels to a spreadsheet", "make a map of places from this DM".
---

# Instagram Search

Read content of any kind from Instagram by running JavaScript inside the user's already-logged-in browser session. No scraping farms, no credentials handled — just the user's own cookies, called through the official `mcp__Claude_in_Chrome__*` tools.

## The mandatory first step: ask before you search

Instagram is broad. A vague request like "find me reels about Goa" can mean ten different things. **Before issuing any API call, ask the user the smallest set of clarifying questions needed to narrow the search.** Use whatever clarifying-question tool the host environment provides (e.g. `AskUserQuestion` in Cowork). The four questions that matter most:

1. **Source** — DM thread / hashtag / creator profile / free-text / location page / audio page / something else. If the user gave a URL, you can usually infer this.
2. **Scope** — how many results, how far back, top-ranked or chronological.
3. **Filters** — keywords the captions must contain, date range, minimum engagement, must be Reels only, must be from creators in [list].
4. **Deliverable** — a chat summary, a spreadsheet, a Word doc, an interactive map, a CSV download, or "just show me the URLs". This shapes how much detail to pull per item.

Skip the questions only when the user has clearly already answered them ("pull every reel from this URL and put them in a spreadsheet" — Source = thread, Scope = all, Filters = none, Deliverable = spreadsheet). When in doubt, ask. One extra question is much cheaper than a wasted 200-item pull in the wrong format.

## Prerequisites — verify before issuing any API call

There is **no API key, no Meta developer registration, no OAuth flow** for this skill. The user's existing Instagram login is the credential. Before any API call, walk through these checks and help the user fix whatever's missing — never just bail with a vague error.

### Check 1 — Is the Chrome MCP connected?

Call `mcp__Claude_in_Chrome__list_connected_browsers`. If the list is empty, the user hasn't paired Chrome to Claude yet. Walk them through it:

> "I need to talk to Instagram through your Chrome browser. You'll need the Claude in Chrome extension paired to this session. Two quick steps:
>
> 1. Install the extension from <https://chromewebstore.google.com/detail/claude-for-chrome> if you haven't already.
> 2. Click the Claude icon in Chrome's toolbar and pick **Connect to Claude**. Tell me when the icon turns green."

Then re-run `list_connected_browsers`. If multiple browsers are paired, ask which one to use, or call `mcp__Claude_in_Chrome__select_browser` with the `deviceId` they specify.

### Check 2 — Is the user signed in to Instagram?

Open or focus a Chrome tab on `https://www.instagram.com/`. If the page shows the login form, the user is signed out. **Do not type their credentials.** Ask them:

> "I need you to sign in to Instagram yourself in the Chrome window. Use your normal username + password, finish any 2FA prompts, and tell me when you see your feed. I never see or store your password — I'll read your session cookie at runtime only to call instagram.com API endpoints."

After they confirm, verify by hitting `/api/v1/users/web_profile_info/?username={their_username_or_any_public_handle}`. A 200 with non-empty `data.user` means the session is good. A 401 means they're still logged out.

### Check 3 — Is the active tab on instagram.com?

All API calls rely on the page's origin sending the cookie. If the active tab is elsewhere, every fetch will fail. Navigate the active Chrome tab to `https://www.instagram.com/` (or the specific page you need — DM URL, profile, hashtag) before running JS.

### Check 4 — Persistent state warning

If the user's Chrome window navigates away from instagram.com between JS calls, `window.__igCache` clears and any in-progress pagination has to restart from page 0. If you're doing a long thread pull, tell the user to leave the Instagram tab alone until you say it's done.

### When the session expires mid-task

Instagram cookies last weeks but eventually expire — typically after a password change, a "log out everywhere" action, or 30+ days of inactivity. Symptom: endpoints suddenly return 401 or 403. Tell the user:

> "Your Instagram session expired. Please refresh the Instagram tab in Chrome, sign back in if it prompts you, and tell me when you're back. I'll pick up where we left off."

### Credentials, in one paragraph

Passwords are never seen, typed, or stored by this skill. The only "credential" is the Instagram session cookie that lives in the user's own Chrome — the skill reads it via `document.cookie` inside the page and sends it only to instagram.com endpoints. The cookie value itself is never returned to the model context, logged, or persisted anywhere. If the user asks "is this safe", repeat that to them in your own words.

## The technique

Instagram's web client talks to a private JSON API at `https://www.instagram.com/api/v1/...`. From inside any Instagram page you can call those endpoints with `fetch` — the session cookie is sent automatically, and Instagram accepts the same headers the official client uses. Every workflow in this skill is one or two `fetch` calls with this shape:

```javascript
const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1];
const headers = {
  'x-csrftoken': csrf || '',
  'x-ig-app-id': '936619743392459',     // public web app id, identical to official client
  'x-requested-with': 'XMLHttpRequest',
  'accept': '*/*'
};
const r = await fetch(URL, { headers, credentials: 'include' });
```

For convenience, `scripts/prelude.js` packages all the workflows below into `window.IGSearch.*` helpers. Inject it on first use of the session, then every subsequent JS call is a one-liner. Optional but strongly recommended when doing many queries.

### Constraints — internalise these once, never trip on them again

1. **JS execution times out at 45 seconds.** Pagination loops with >4-5 pages per call will time out and lose state. Chunk to 4 pages and cache progress on `window.__igCache`.
2. **Long base64-looking strings in the return value get blocked by Cowork's content-protection filter** (cursors, signed URLs, JWTs, internal IDs). Don't *return* those from JS — keep them on `window` and re-use them in the next call. Return only projected, slim objects.
3. **Be polite to Instagram.** Sleep 250-400 ms between paginated requests. Don't fire 5 hashtag queries in a tight loop — Instagram throttles after ~10 rapid calls and may serve a 429 for several minutes.

## Workflows — all the Instagram search shapes

For full endpoint specs, response shapes, and copy-pasteable JS, read `references/api-endpoints.md`. The capsule version of each workflow is below. Pick the one that matches the user's source.

### 1. DM / group thread

When the user gives you a `/direct/t/{thread_id}/` URL or names a group chat.

- Navigate to the thread URL so cookies are valid for the DM origin.
- Paginate `GET /api/v1/direct_v2/threads/{thread_id}/?limit=50&cursor=...` — four pages per JS call, repeat until `has_older` is false.
- Item types you'll see: `clip` (Reel), `media_share` (post), `text`, `link`, `action_log`, `placeholder`, `animated_media`, `profile`. Project to slim objects.

Helper: `window.IGSearch.thread(threadId)` then `window.IGSearch.projectThread(threadId, {offset, chunkSize})`.

### 2. Hashtag

When the user names a hashtag or asks "what's trending under #X".

- `POST /api/v1/tags/{tag_without_#}/sections/` with body `supported_tabs=["top"]&tab=top` for ranked, or `tab=recent` for chronological, or `tab=clips` for Reels-only.
- Items live at `data.sections[].layout_content.medias[].media`.

**Reality check:** many intuitive hashtags don't exist. `#meghalayachecklist`, `#shillongcab`, `#meghalayapacking` all return zero. Always fan out to 3-4 synonyms (`#meghalayadiaries`, `#meghalayatraveltips`, `#meghalayamonsoon`) before declaring the topic missing.

Helper: `window.IGSearch.tag(hashtag, 'top'|'recent'|'clips')`.

### 3. Universal keyword search (explore)

When the user describes a topic that isn't a clean hashtag ("find reels about shillong cabs", "meghalaya packing list").

- `GET /api/v1/discover/web/explore_grid/?_d=clips_search&q={encoded query}&include_fixed_destinations=true&omit_cover_media=true`.
- Walk all three buckets per section: `one_by_two_item.clips.items`, `fill_items`, `medias`.

**Quality warning:** explore search is keyword-loose. A query like "meghalaya packing list" can return a Dua Lipa music video because the algorithm matched on "list". Always post-filter captions with a relevance regex — at minimum, require the destination/topic word to appear in the caption.

Helper: `window.IGSearch.search(query)`.

### 4. Creator profile + recent posts

When the user names a specific Instagram handle.

- Resolve username → user ID: `GET /api/v1/users/web_profile_info/?username={u}`. The same response gives you bio, follower count, post count, verification status, profile pic URL — handy for "profile stats" requests.
- Pull their feed: `GET /api/v1/feed/user/{uid}/?count=24`.

Creators pivot — someone who was posting India travel content a year ago may now be posting from Vietnam, and their feed is dominated by the new beat. Always check `taken_at_iso` and post-filter by topic instead of trusting that a creator who matched once still matches today.

Helper: `window.IGSearch.user(username)`.

### 5. Location page (geo-tagged content)

When the user asks "what's tagged at this place" or shares a location URL like `https://www.instagram.com/explore/locations/{location_id}/{slug}/`.

- `POST /api/v1/locations/{location_id}/sections/` with body `tab=ranked` (or `recent`). Do **not** use `tab=top` — Instagram returns 500. The valid tab names for locations are `ranked` and `recent`.
- Items live in three possible buckets per section (same as universal search): `one_by_two_item.clips.items`, `fill_items`, `medias`. Walk all three.

Helper: `window.IGSearch.location(locationId, 'ranked'|'recent')`.

### 6. Audio / music page (reels using a specific sound)

When the user wants to find Reels that use a particular sound or trending audio.

- `GET /api/v1/clips/music/?music_canonical_id={canonical_id}&max_id=`.
- Canonical ID lives at `item.clip.clip.clips_metadata.music_canonical_id` or `clips_metadata.original_sound_info.audio_asset_id`.

**Known limitation:** the endpoint frequently returns 200 OK with an empty body, even for IDs that show real Reels on the audio page in the web UI. The helper treats this gracefully — it returns `{ items: [], note: 'known limitation' }` instead of erroring. If you need audio search reliably, open the audio URL in the Chrome window and scrape the rendered page as a fallback.

Helper: `window.IGSearch.audio(canonicalId)`.

### 7. Comments on a specific post or Reel

When the user wants to see what people are saying under a Reel or post.

- Decode shortcode → numeric `pk` locally using Instagram's custom-alphabet base64 (no network round-trip needed — see `references/api-endpoints.md` for the algorithm).
- Then `GET /api/v1/media/{pk}/comments/?can_support_threading=true`. Paginated via `next_min_id`.

Helper: `window.IGSearch.comments(shortcode, {limit})`.

### 8. Stories + highlights

When the user asks "what stories has @creator posted" or wants highlights.

- Current stories tray: resolve username → numeric user_id first (the `/story/` endpoint rejects usernames with 404), then `GET /api/v1/feed/user/{user_id}/story/`. Only works if the user follows them or the account is public. Returns `reel: null` when no active stories.
- Highlights: `GET /api/v1/highlights/{user_id}/highlights_tray/` returns highlight IDs + titles + item counts.

Helper: `window.IGSearch.stories(username)` for current, `window.IGSearch.highlights(username)` for saved highlights.

### 9. Saved posts (the user's own collection)

When the user says "summarise what I've saved" or "what's in my Goa collection".

- All saved: `GET /api/v1/feed/saved/posts/?count=50&max_id=`.
- List collections: `GET /api/v1/collections/list/` (note: this lives on `/collections/list/`, not `/feed/collections/`).
- Items in a specific collection: `GET /api/v1/feed/collection/{collection_id}/posts/?count=50`.

Saved posts only work for the signed-in user — no one else's saves are accessible.

Helper: `window.IGSearch.saved({collectionId?, listCollections?})`.

### 10. Profile stats / quick lookup

When the user asks "how many followers does @X have" or wants a quick profile summary.

- Single call: `GET /api/v1/users/web_profile_info/?username={u}` returns bio, follower count, following count, post count, external URL, category, is_verified, is_private.

Helper: `window.IGSearch.profile(username)`.

## Output — tailor to what the user asked for

The point of this skill is to *surface what's useful*, not to dump JSON. Always pick the format based on the user's stated deliverable (which is why you asked in step 0).

| User wanted | Output shape |
|---|---|
| Quick chat answer | Top-line counts + 3-5 highlights + 2-3 representative URLs |
| Spreadsheet | Hand to the `xlsx` skill: one row per item, columns chosen from the projected fields. Always include source URL. |
| Word doc / report | Hand to the `docx` skill: prose with embedded source links. Group by theme. |
| Interactive map | Build an HTML+Leaflet file (see `references/output-recipes.md`). Geo-tag from caption when location field is null. |
| CSV / raw | Project all items, write a plain CSV — no formatting, no styling. |
| "Just show me the URLs" | Bullet list with creator + a one-line caption preview. |

Whatever the format, **always**:
- Show the source attribution (creator username) for every item.
- Surface the *signal* you saw across items — themes, repeated places, gear tips, warnings — not just an item list.
- Note when something is approximate (e.g., locations inferred from caption text, not Instagram's location tag).
- Offer one logical next step ("Want me to turn this into a map?" / "Should I check what these creators have posted since?").

## Failure modes and how to recover

| Symptom | Likely cause | Fix |
|---|---|---|
| `401` / `403` from any endpoint | Session expired | Ask user to refresh the Instagram tab and retry |
| `404` on `/tags/.../sections/` | Hashtag doesn't exist | Try 3-4 synonym tags |
| `429` | Rate limited | Back off 60 s, then halve request rate. Two 429s in a row: end politely and tell the user. |
| JS times out at 45 s | Pagination chunk too big | Halve `pagesPerCall`, cache to `window`, continue in next call |
| Captions return as `[BLOCKED: ...]` | Cowork content filter caught a long base64 string in the caption | Slice captions to ~600 chars, return in smaller batches |
| `window.__igCache` empty in a fresh JS call | User navigated away from Instagram tab | Re-navigate, restart pagination from page 0 |
| Universal search returns irrelevant viral content | Loose keyword match | Post-filter captions with a relevance regex requiring the topic word |
| Creator's feed is full of unrelated content | They pivoted; old content is older than the request | Filter by `taken_at_iso` |
| Private account returns empty feed | Account is private and user doesn't follow | Tell the user; don't try to bypass |

## What this skill deliberately does **not** do

- **Post, comment, DM, follow, like, save, share** — all of these are write actions. If the user wants those, point them to the Chrome window so they can do it themselves.
- **Bypass private accounts or protected content** — if the user can't see it in the Instagram UI, this skill can't either.
- **Download media files** — the skill returns metadata and caption text. For the actual video/photo, use Instagram's own "Save" feature.
- **Spam / scrape at scale** — meant for individual research and personal use, not bulk extraction. If the user wants thousands of items, slow the request rate, and warn them this is grey-zone usage of Instagram's API.

## Reference files

- `references/api-endpoints.md` — full endpoint catalogue, request/response shapes, field paths, status codes, rate-limiting policy.
- `references/output-recipes.md` — patterns for the most common deliverables (map HTML, spreadsheet shape, doc template).
- `scripts/prelude.js` — injectable helper that gives you `window.IGSearch.{thread, projectThread, tag, search, user, location, audio, comments, stories, highlights, saved, profile}`. Inject once per Instagram tab, then call helpers by name.
