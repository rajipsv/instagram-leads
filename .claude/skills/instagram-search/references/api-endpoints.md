# Instagram private web API — endpoint catalogue

All endpoints sit on `https://www.instagram.com/api/v1/...` and require these headers:

```
x-csrftoken: {value from csrftoken cookie}
x-ig-app-id: 936619743392459
x-requested-with: XMLHttpRequest
accept: */*
```

Plus `credentials: 'include'` on the fetch call so the user's session cookie is sent.

```javascript
const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1];
```

## Table of contents

1. DM / group thread items
2. Hashtag sections
3. Universal keyword search
4. User profile + feed
5. Location sections
6. Audio / music — clips using a sound
7. Comments on a Reel or post
8. Stories (current) and highlights
9. Saved posts (signed-in user only)
10. Profile stats
11. Status codes
12. Rate-limiting policy

---

## 1. DM / group thread items

**Endpoint:** `GET /api/v1/direct_v2/threads/{thread_id}/`

**Query params:** `limit` (max 50), `cursor` (from previous `oldest_cursor`).

**Thread ID:** the integer in the DM URL `/direct/t/{id}/`.

**Response shape:**

```jsonc
{
  "thread": {
    "thread_id": "...",
    "thread_title": "Your Group Chat Name",
    "items": [ /* newest first */ ],
    "has_older": true,
    "oldest_cursor": "<opaque base64>"
  }
}
```

**Item types and where the useful fields are:**

| `item_type` | Useful fields |
|---|---|
| `clip` (Reel) | `it.clip.clip.code`, `.caption.text`, `.user.username`, `.location?.name` |
| `media_share` (post) | `it.media_share.code`, `.caption.text`, `.user.username` |
| `text` | `it.text` |
| `link` | `it.link.text`, `.link_context.{link_url,link_title,link_summary}` |
| `action_log` | `it.action_log.description` — usually ignorable |
| `placeholder` | skip |
| `animated_media` (GIF) | `it.animated_media.images.fixed_height.url` |
| `profile` | `it.profile.username` |

**Pagination — keep state on `window`, not in return value:**

```javascript
const key = `thread_${threadId}`;
const state = window.__igCache[key] = window.__igCache[key] || { items: [], cursor: null, hasOlder: true };
for (let p = 0; p < 4 && state.hasOlder; p++) {
  const url = `/api/v1/direct_v2/threads/${threadId}/?limit=50` +
              (state.cursor ? `&cursor=${encodeURIComponent(state.cursor)}` : '');
  const r = await fetch(url, { headers, credentials: 'include' });
  const data = await r.json();
  state.items.push(...(data.thread.items || []));
  state.hasOlder = !!data.thread.has_older;
  state.cursor = data.thread.oldest_cursor;
  if (!state.cursor) { state.hasOlder = false; break; }
  await sleep(300);
}
```

---

## 2. Hashtag sections

**Endpoint:** `POST /api/v1/tags/{tag_without_hash}/sections/`

**Headers:** standard + `content-type: application/x-www-form-urlencoded`

**Body:** `supported_tabs=["top","recent","clips"]&tab=top` (or `recent`, or `clips`).

**Response shape:**

```jsonc
{
  "sections": [
    {
      "layout_type": "media_grid",
      "layout_content": {
        "medias": [
          { "media": { "code": "...", "user": {...}, "caption": { "text": "..." }, "taken_at": 1734567890, "like_count": 123 } }
        ]
      }
    }
  ],
  "next_max_id": "...",
  "more_available": true
}
```

**Tag-discovery tip:** common-sense hashtags often don't exist. Fan out to 3-4 variants per topic.

---

## 3. Universal keyword search (explore grid)

**Endpoint:** `GET /api/v1/discover/web/explore_grid/`

**Query params:** `q` (URL-encoded), `_d=clips_search`, `include_fixed_destinations=true`, `omit_cover_media=true`.

**Response shape:** sectional with mixed layouts. Media can live in three different paths per section:

- `sectional_items[].layout_content.one_by_two_item.clips.items[]`
- `sectional_items[].layout_content.fill_items[]`
- `sectional_items[].layout_content.medias[]`

Walk all three buckets per section and dedupe by `media.code`.

**Post-filter:** the algorithm matches loosely. Always re-filter captions for relevance.

---

## 4. User profile + feed

**Step 1 — resolve user ID and stats:** `GET /api/v1/users/web_profile_info/?username={u}`

```jsonc
{
  "data": {
    "user": {
      "id": "1234567890",
      "username": "...",
      "full_name": "...",
      "biography": "...",
      "edge_followed_by": { "count": 12345 },
      "edge_follow": { "count": 678 },
      "edge_owner_to_timeline_media": { "count": 234 },
      "is_verified": false,
      "is_private": false,
      "external_url": "...",
      "profile_pic_url_hd": "..."
    }
  }
}
```

**Step 2 — feed:** `GET /api/v1/feed/user/{user_id}/?count=24`

```jsonc
{
  "items": [
    { "code": "...", "media_type": 2, "caption": { "text": "..." }, "taken_at": 1734567890, "like_count": 12, "comment_count": 3 }
  ],
  "more_available": true,
  "next_max_id": "..."
}
```

`media_type`: 1 = image, 2 = video (Reel), 8 = carousel.

---

## 5. Location sections (geo-tagged content)

**Endpoint:** `POST /api/v1/locations/{location_id}/sections/`

**Headers:** standard + `content-type: application/x-www-form-urlencoded`

**Body:** `tab=ranked` (or `recent`). **Important — do not send `tab=top`** for location sections; Instagram returns 500. The valid tab names for locations are `ranked` and `recent`, not `top` (which works only for hashtags).

**Location ID:** the integer in the Instagram location URL: `https://www.instagram.com/explore/locations/{location_id}/{slug}/`.

**Response shape:** items can live at three paths per section (just like universal search):
- `sectional_items[].layout_content.one_by_two_item.clips.items[]`
- `sectional_items[].layout_content.fill_items[]`
- `sectional_items[].layout_content.medias[]`

Walk all three buckets per section and dedupe by `media.code`. Do not assume `medias[]` only.

**Tip:** if the user doesn't have a location ID but has a place name, do a search step first via `/api/v1/fbsearch/web/top_serp/?query={name}` and pick a place result.

---

## 6. Audio / music page

**Endpoint:** `GET /api/v1/clips/music/?music_canonical_id={canonical_id}&max_id=`

**Known limitation:** this endpoint returns `200 OK` but an empty body for many music ids — including original-sound audio_asset_ids and licensed-music canonical_ids. The endpoint shape is correct (the same one the web client uses on `/reels/audio/{id}/` pages), but Instagram's response is inconsistent. Likely they restrict unauthenticated audio browsing or expect a slightly different param shape that varies by audio_type. Treat audio as best-effort until this is resolved.

**Finding the canonical ID:** scroll through Reels using the sound, take any reel item, and read `clips_metadata.music_canonical_id` (preferred) or `clips_metadata.original_sound_info.audio_asset_id`. Audio page URLs of shape `https://www.instagram.com/reels/audio/{canonical_id}/` give it directly.

Response items, when present, are at `data.items[]` with the same shape as a Reel from the feed endpoint.

---

## 7. Comments

Instagram's `/api/v1/media/{shortcode}/info/` endpoint **rejects shortcodes** as of late 2025 — it requires the numeric media `pk`. Decode shortcode→pk locally; no network round-trip needed.

**Shortcode-to-pk algorithm** (Instagram's custom base64 alphabet):

```javascript
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function shortcodeToPk(sc) {
  let id = 0n;
  for (const c of sc) {
    id = id * 64n + BigInt(ALPHABET.indexOf(c));
  }
  return id.toString();
}
// e.g. shortcodeToPk('Cabc123XYZ-') returns the matching numeric pk
```

**Comments endpoint:** `GET /api/v1/media/{media_pk}/comments/?can_support_threading=true&max_id={cursor}`

```jsonc
{
  "comments": [
    { "pk": "...", "text": "...", "user": { "username": "..." }, "created_at": 1734567890, "like_count": 5 }
  ],
  "next_min_id": "...",
  "has_more_comments": true
}
```

Paginate via `next_min_id` (NB: not `next_max_id` like other endpoints).

---

## 8. Stories and highlights

### Current stories (24-hour tray)

**Endpoint:** `GET /api/v1/feed/user/{user_id}/story/` — note this requires the **numeric user_id**, not the username (the username variant returns 404). Resolve the username first via `/api/v1/users/web_profile_info/?username={u}` and extract `data.user.id`.

Only works when the user follows the account or the account is public. Returns `reel.items[]` — each is a story media item with `image_versions2`, `video_versions`, `taken_at`, `caption?`. If the user has no active stories the endpoint returns 200 with `reel: null` — that's a normal empty state, not a failure.

### Highlights (the permanent ones below the bio)

**Step 1 — get the tray:** `GET /api/v1/highlights/{user_id}/highlights_tray/` returns a list of highlight IDs and titles.

**Step 2 — fetch a highlight's stories:** `GET /api/v1/feed/reels_media/?reel_ids=highlight%3A{highlight_id}` — note the `highlight:` prefix.

---

## 9. Saved posts (signed-in user only)

### All saved (default collection)

`GET /api/v1/feed/saved/posts/?count=50&max_id={cursor}`

### Collections (named saved-folders)

**List collections:** `GET /api/v1/collections/list/` — note this is on `/collections/list/`, not `/feed/collections/`. The `/feed/` prefix returns 404.

**Items in a collection:** `GET /api/v1/feed/collection/{collection_id}/posts/?count=50&max_id={cursor}`

Saved posts only work for the signed-in user — can't read other people's saves.

---

## 10. Profile stats / quick lookup

Same call as Step 1 of #4: `GET /api/v1/users/web_profile_info/?username={u}`.

The slim payload to return:

```javascript
{
  username, full_name, biography, external_url,
  followers: data.user.edge_followed_by.count,
  following: data.user.edge_follow.count,
  posts: data.user.edge_owner_to_timeline_media.count,
  is_verified: data.user.is_verified,
  is_private: data.user.is_private,
  is_business: data.user.is_business_account,
  category: data.user.category_name,
  profile_pic: data.user.profile_pic_url_hd
}
```

---

## 11. Status codes

| Code | Meaning | Fix |
|---|---|---|
| 200 | Success | — |
| 401 / 403 | Session expired or resource not allowed (e.g., private account) | Ask user to refresh Instagram tab |
| 404 | Endpoint or resource doesn't exist | Try a synonym (tag, location name) |
| 429 | Rate-limited | Back off 60 s; halve frequency |
| 500 | Instagram-side hiccup | Retry once after a few seconds |

---

## 12. Rate-limiting policy

| Endpoint | Safe rate | Throttle starts at |
|---|---|---|
| DM thread pages | 3-4/s | >15 in a tight loop |
| Hashtag queries | 1/300 ms | >10 in a tight loop |
| Universal search | 1/250 ms | >10 in a tight loop |
| User feed | 1/400 ms | >8 in a tight loop |
| Location sections | 1/350 ms | >10 in a tight loop |
| Audio page | 1/400 ms | >8 |
| Comments | 1/350 ms | >10 |
| Stories / highlights | 1/500 ms | >6 |
| Saved posts | 1/400 ms | own account only |
| Profile lookup | 2/s | rare to hit limits |

Always `await new Promise(r => setTimeout(r, 250-400))` between paginated calls. If you see a `429` once, back off 60 s. Two in a row: end politely.
