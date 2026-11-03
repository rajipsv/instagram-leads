# Output recipes — turning Instagram search results into deliverables

The skill's job is not to dump JSON — it's to give the user the format they actually want. Read this file when the user has named a deliverable in their answers to the front-door questions.

## 1. Chat summary (fastest, default for small results)

Use when the user said "just tell me what's there" or didn't pick a heavier format.

**Template:**

```
Found N items across [sources].

Top themes:
- Theme A (~X mentions, e.g., from @creator1, @creator2)
- Theme B (~Y mentions, ...)

Notable individual items:
- @creator: one-line takeaway → URL
- @creator: one-line takeaway → URL
- @creator: one-line takeaway → URL

Next step suggestion: "Want me to [pivot to richer deliverable]?"
```

Keep this under ~250 words. The user clicks links if they want depth.

## 2. Spreadsheet

Use when the user said "spreadsheet", "Excel", "CSV", or implied tabular data ("compare these", "make a list of …").

Hand off to the `xlsx` skill (or write CSV directly). Standard columns:

| Column | Source field |
|---|---|
| # | Row index |
| Place / Topic | Heuristic from caption (place name in first line, or from hashtag) |
| Category | Classify: waterfall / cafe / stay / viewpoint / trek / etc. — domain-specific |
| Region | Caption-derived if no Instagram location tag |
| Caption summary | First ~600 chars of caption |
| Owner | `creator username` |
| Type | reel / post / link / text |
| Source URL | Instagram URL |

Sort sensibly: by region, by category, or by Meghalaya-relevance flag if mixed signal.

Add a second tab "By Region" or "By Category" with aggregated counts and notable mentions per group.

Add a third tab "Tips & Practicals" if any captions contain structured tip lists (numbered points are a strong signal).

## 3. Word document / report

Use when the user said "doc", "report", "Word", or "itinerary".

Hand off to the `docx` skill. Standard structure:

1. **Cover** — title, one-line subtitle, item counts.
2. **At a glance** — short prose paragraph summarising what's in the dataset, plus a bulleted list of clusters.
3. **Body sections** — one heading per cluster/region/theme. Inside each, prose with embedded creator attribution and source URLs.
4. **Tips / Practicals** — extract structured tip lists from any captions that contain them.
5. **Source** — note that the data came from Instagram via this skill, mention method ("private DM API via authenticated browser session"), date generated.

Avoid dumping the spreadsheet into the doc. The doc is for prose, the spreadsheet is for data.

## 4. Interactive map (HTML + Leaflet)

Use when the user said "map", or when the data is clearly location-heavy and a map is a better summary than a list.

Single self-contained HTML file with:

- Leaflet from `unpkg.com/leaflet@1.9.4/...` (CSS + JS).
- OpenStreetMap tile layer (default) — optionally let the user toggle to satellite via Esri tiles.
- One marker per place, colour-coded by category.
- Click marker → popup with: place name, category chip, region, short description, source Reel owners with links to each Reel.
- Sidebar list grouped by region, click to fly to.
- Search box that filters by name/region/caption text.
- Filter chips per category.
- Mark "approx" any place whose coordinates were inferred from caption text rather than an Instagram location tag.

Many Reels don't have Instagram location tags — the location info is in the caption text. So you'll need to maintain a small hand-curated coordinate table for the destinations the user cares about. Build it once per project, save it to a JSON file in the project folder, and reuse.

## 5. Plain URL list

Use when the user said "just give me the URLs" or "send the links".

Markdown bullet list:

```
- @creator — one-line caption preview · https://...reel/...
- @creator — one-line caption preview · https://...reel/...
```

No tables, no headers, no fluff. They want to open the links.

## 6. CSV

Use when the user said "CSV" explicitly. Same columns as the spreadsheet (recipe #2) but plain text, no formatting. Save to outputs.

## Choosing without asking — heuristics

The skill should *always* ask the user about deliverable in step 0. But if the user keeps the interaction terse and just wants "an answer", use these defaults:

- **< 10 items, no place data:** chat summary (#1).
- **10-30 items, mixed types:** chat summary + offer "Want me to put this in a spreadsheet?"
- **> 30 items:** spreadsheet by default + chat summary of top themes.
- **Lots of geo-tagged items, or user is planning a trip:** map (#4) + spreadsheet.
- **Items contain structured tip lists or itineraries:** doc (#3) plus spreadsheet.

## Cross-deliverable note: attribution

Every deliverable, in every format, must credit the source creator. Instagram's culture is built on attribution. Carrying through the creator handle and a link back to the original Reel is non-negotiable.
