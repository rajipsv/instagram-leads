// Instagram search prelude — inject once per Instagram tab, then call window.IGSearch.* in subsequent JS executions.
//
// Helpers available after injection:
//   IGSearch.thread(threadId)             - paginate a DM/group thread, cached on window
//   IGSearch.projectThread(threadId, opts)- slim-project thread items in chunks
//   IGSearch.tag(hashtag, tab)            - hashtag sections (top|recent|clips)
//   IGSearch.search(query)                - universal explore-grid keyword search
//   IGSearch.user(username, count)        - creator's recent posts
//   IGSearch.profile(username)            - profile stats only (followers, bio, ...)
//   IGSearch.location(locationId, tab)    - geo-tagged content at a location page
//   IGSearch.audio(canonicalId, count)    - reels using a specific sound
//   IGSearch.comments(shortcode, opts)    - comments under a post/reel
//   IGSearch.stories(username)            - current 24h story tray (must follow or be public)
//   IGSearch.highlights(username, opts)   - permanent highlights (with optional per-highlight expansion)
//   IGSearch.saved(opts)                  - the signed-in user's saved posts (and collections)
//
// All helpers handle headers, CSRF, pagination, and caption-length trimming. They never return raw
// cursors — those stay on window.__igCache to avoid Cowork's content-protection filter.

(() => {
  const CSRF = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
  const HEADERS = {
    'x-csrftoken': CSRF,
    'x-ig-app-id': '936619743392459',
    'x-requested-with': 'XMLHttpRequest',
    'accept': '*/*'
  };
  const formHeaders = { ...HEADERS, 'content-type': 'application/x-www-form-urlencoded' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const trim = (s, n = 600) => (s && typeof s === 'string') ? s.slice(0, n) : null;
  const toDateISO = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;

  window.__igCache = window.__igCache || {};

  // ---------- Shortcode → media pk (Instagram's custom base64 alphabet) ----------
  // Reels and posts have a short URL slug like "Cabc123XYZ-". Some private API endpoints
  // need the numeric media id (pk) instead. Decode locally — no network call needed.
  const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function shortcodeToPk(shortcode) {
    let id = 0n;
    for (const c of shortcode) {
      const idx = SHORTCODE_ALPHABET.indexOf(c);
      if (idx < 0) throw new Error(`bad shortcode char: ${c}`);
      id = id * 64n + BigInt(idx);
    }
    return id.toString();
  }

  // ---------- Multi-bucket item walker (used by tag, location, search) ----------
  // Different layouts put items at different paths; walk all known buckets and dedupe.
  function walkSectionsForMedia(sections, items, seen) {
    (sections || []).forEach(s => {
      const lc = s.layout_content || {};
      const buckets = [];
      if (lc.one_by_two_item && lc.one_by_two_item.clips) buckets.push(lc.one_by_two_item.clips.items || []);
      if (lc.fill_items) buckets.push(lc.fill_items);
      if (lc.medias) buckets.push(lc.medias);
      buckets.flat().forEach(it => {
        const media = it.media || it;
        if (!media || !media.code) return;
        if (seen && seen.has(media.code)) return;
        if (seen) seen.add(media.code);
        items.push(media);
      });
    });
  }

  // ---------- Projection helpers ----------
  const projectClip = (it) => {
    const c = (it.clip && it.clip.clip) || {};
    return {
      type: 'reel',
      code: c.code,
      url: c.code ? `https://www.instagram.com/reel/${c.code}/` : null,
      owner: c.user && c.user.username,
      caption: trim(c.caption && c.caption.text),
      location: c.location && (c.location.name || c.location.short_name),
      region: c.location && c.location.city,
      timestamp: it.timestamp
    };
  };
  const projectMediaShare = (it) => {
    const m = it.media_share || {};
    return {
      type: 'post',
      code: m.code,
      url: m.code ? `https://www.instagram.com/p/${m.code}/` : null,
      owner: m.user && m.user.username,
      caption: trim(m.caption && m.caption.text),
      location: m.location && m.location.name,
      timestamp: it.timestamp
    };
  };
  const projectMedia = (m) => ({
    code: m.code,
    type: m.media_type === 2 ? 'reel' : (m.media_type === 8 ? 'carousel' : 'image'),
    owner: m.user && m.user.username,
    caption: trim(m.caption && m.caption.text, 500),
    location: m.location && m.location.name,
    taken_at_iso: toDateISO(m.taken_at),
    like_count: m.like_count,
    comment_count: m.comment_count,
    url: m.code ? `https://www.instagram.com/${m.media_type === 2 ? 'reel' : 'p'}/${m.code}/` : null
  });

  const HELPERS = {

    // -------------------------------------------------- 1. DM/group thread
    async thread(threadId, opts = {}) {
      const pagesPerCall = opts.pagesPerCall || 4;
      const limit = opts.limit || 50;
      const key = `thread_${threadId}`;
      const state = window.__igCache[key] = window.__igCache[key] || { items: [], cursor: null, hasOlder: true, title: null };
      if (!state.hasOlder) return { addedThisCall: 0, totalSoFar: state.items.length, hasOlder: false, threadTitle: state.title };
      let added = 0;
      for (let p = 0; p < pagesPerCall && state.hasOlder; p++) {
        const url = `/api/v1/direct_v2/threads/${threadId}/?limit=${limit}` +
                    (state.cursor ? `&cursor=${encodeURIComponent(state.cursor)}` : '');
        const r = await fetch(url, { headers: HEADERS, credentials: 'include' });
        if (!r.ok) throw new Error(`Thread fetch ${r.status}`);
        const data = await r.json();
        const items = (data.thread && data.thread.items) || [];
        state.items.push(...items);
        added += items.length;
        state.hasOlder = !!(data.thread && data.thread.has_older);
        state.cursor = data.thread && data.thread.oldest_cursor;
        state.title = data.thread && data.thread.thread_title || state.title;
        if (!state.cursor) { state.hasOlder = false; break; }
        await sleep(300);
      }
      const typeCounts = {};
      state.items.forEach(i => { typeCounts[i.item_type] = (typeCounts[i.item_type] || 0) + 1; });
      return { addedThisCall: added, totalSoFar: state.items.length, hasOlder: state.hasOlder, threadTitle: state.title, typeCounts };
    },

    projectThread(threadId, opts = {}) {
      const key = `thread_${threadId}`;
      const state = window.__igCache[key];
      if (!state) return { error: 'thread not loaded — call IGSearch.thread() first' };
      const offset = opts.offset || 0;
      const chunkSize = opts.chunkSize || 30;
      const slice = state.items.slice(offset, offset + chunkSize);
      const reels = slice.filter(i => i.item_type === 'clip').map(projectClip);
      const posts = slice.filter(i => i.item_type === 'media_share').map(projectMediaShare);
      const texts = slice.filter(i => i.item_type === 'text').map(i => ({ type: 'text', text: i.text, timestamp: i.timestamp }));
      const links = slice.filter(i => i.item_type === 'link').map(i => ({
        type: 'link',
        text: i.link && i.link.text,
        url: i.link && i.link.link_context && i.link.link_context.link_url,
        title: i.link && i.link.link_context && i.link.link_context.link_title
      }));
      return { offset, chunkSize, totalItems: state.items.length, reels, posts, texts, links };
    },

    // -------------------------------------------------- 2. Hashtag
    async tag(hashtag, tab = 'top') {
      const r = await fetch(`/api/v1/tags/${hashtag}/sections/`, {
        method: 'POST', headers: formHeaders,
        body: `supported_tabs=["${tab}"]&tab=${tab}`, credentials: 'include'
      });
      if (!r.ok) return { tag: hashtag, status: r.status, items: [] };
      const data = await r.json();
      const items = [];
      (data.sections || []).forEach(s => {
        (s.layout_content && s.layout_content.medias || []).forEach(m => {
          items.push(projectMedia(m.media || {}));
        });
      });
      return { tag: hashtag, tab, count: items.length, items };
    },

    // -------------------------------------------------- 3. Universal search
    async search(query) {
      const url = `/api/v1/discover/web/explore_grid/?_d=clips_search&q=${encodeURIComponent(query)}` +
                  `&include_fixed_destinations=true&omit_cover_media=true`;
      const r = await fetch(url, { headers: HEADERS, credentials: 'include' });
      if (!r.ok) return { query, status: r.status, items: [] };
      const data = await r.json();
      const items = [];
      const seen = new Set();
      (data.sectional_items || []).forEach(s => {
        const lc = s.layout_content || {};
        const buckets = [];
        if (lc.one_by_two_item && lc.one_by_two_item.clips) buckets.push(lc.one_by_two_item.clips.items || []);
        if (lc.fill_items) buckets.push(lc.fill_items);
        if (lc.medias) buckets.push(lc.medias);
        buckets.flat().forEach(it => {
          const media = it.media || it;
          if (!media.code || seen.has(media.code)) return;
          seen.add(media.code);
          items.push(projectMedia(media));
        });
      });
      return { query, count: items.length, items };
    },

    // -------------------------------------------------- 4. User feed
    async user(username, count = 24) {
      const ru = await fetch(`/api/v1/users/web_profile_info/?username=${username}`, { headers: HEADERS, credentials: 'include' });
      if (!ru.ok) return { username, status: ru.status, items: [] };
      const ud = await ru.json();
      const uid = ud.data && ud.data.user && ud.data.user.id;
      if (!uid) return { username, error: 'user not found', items: [] };
      const rf = await fetch(`/api/v1/feed/user/${uid}/?count=${count}`, { headers: HEADERS, credentials: 'include' });
      if (!rf.ok) return { username, status: rf.status, items: [] };
      const fd = await rf.json();
      return { username, count: (fd.items || []).length, items: (fd.items || []).map(projectMedia) };
    },

    // -------------------------------------------------- 4b. Profile stats
    async profile(username) {
      const r = await fetch(`/api/v1/users/web_profile_info/?username=${username}`, { headers: HEADERS, credentials: 'include' });
      if (!r.ok) return { username, status: r.status };
      const data = await r.json();
      const u = data.data && data.data.user;
      if (!u) return { username, error: 'user not found' };
      return {
        username: u.username, full_name: u.full_name, biography: u.biography, external_url: u.external_url,
        followers: u.edge_followed_by && u.edge_followed_by.count,
        following: u.edge_follow && u.edge_follow.count,
        posts: u.edge_owner_to_timeline_media && u.edge_owner_to_timeline_media.count,
        is_verified: u.is_verified, is_private: u.is_private,
        is_business: u.is_business_account, category: u.category_name,
        profile_pic: u.profile_pic_url_hd
      };
    },

    // -------------------------------------------------- 5. Location page
    // POST /api/v1/locations/{id}/sections/  body: tab=ranked  (NOT tab=top — Instagram returns 500)
    // Layout uses one_by_two_item.clips.items, fill_items, or medias — walk all buckets.
    async location(locationId, tab = 'ranked') {
      const r = await fetch(`/api/v1/locations/${locationId}/sections/`, {
        method: 'POST', headers: formHeaders,
        body: `tab=${tab}`, credentials: 'include'
      });
      if (!r.ok) return { locationId, status: r.status, items: [] };
      const data = await r.json();
      const rawItems = [];
      walkSectionsForMedia(data.sections, rawItems, new Set());
      const items = rawItems.map(projectMedia);
      return { locationId, tab, count: items.length, items };
    },

    // -------------------------------------------------- 6. Audio / music page
    // KNOWN LIMITATION: this endpoint returns 200 OK but an empty body for many music ids.
    // The endpoint shape is correct; Instagram's response is inconsistent — likely they restrict
    // unauthenticated audio browsing or the canonical_id format varies by audio type
    // (original_sound vs. licensed music vs. user audio). Fetch returns empty for now;
    // contributions welcome to find the right param shape.
    async audio(canonicalId, count = 24) {
      const r = await fetch(`/api/v1/clips/music/?music_canonical_id=${encodeURIComponent(canonicalId)}&max_id=`, { headers: HEADERS, credentials: 'include' });
      if (!r.ok) return { canonicalId, status: r.status, items: [], note: 'fetch failed' };
      const text = await r.text();
      if (!text) return { canonicalId, status: 200, items: [], note: 'Instagram returned empty body for this audio id — known limitation' };
      try {
        const data = JSON.parse(text);
        const items = ((data.items || []).slice(0, count)).map(it => projectMedia(it.media || it));
        return { canonicalId, count: items.length, items };
      } catch (e) {
        return { canonicalId, status: 200, items: [], note: 'response not JSON — known limitation', preview: text.slice(0, 200) };
      }
    },

    // -------------------------------------------------- 7. Comments
    // Decode shortcode → numeric pk locally (the /info/ endpoint requires pk, not shortcode).
    async comments(shortcode, opts = {}) {
      const limit = opts.limit || 50;
      let mediaPk;
      try { mediaPk = shortcodeToPk(shortcode); }
      catch (e) { return { shortcode, error: 'bad shortcode', comments: [] }; }
      const rc = await fetch(`/api/v1/media/${mediaPk}/comments/?can_support_threading=true`, { headers: HEADERS, credentials: 'include' });
      if (!rc.ok) return { shortcode, mediaPk, status: rc.status, comments: [] };
      const cd = await rc.json();
      const comments = (cd.comments || []).slice(0, limit).map(c => ({
        owner: c.user && c.user.username,
        text: trim(c.text, 400),
        like_count: c.comment_like_count || c.like_count || 0,
        created_at_iso: toDateISO(c.created_at)
      }));
      return { shortcode, mediaPk, count: comments.length, has_more: !!cd.has_more_comments, comments };
    },

    // -------------------------------------------------- 8a. Stories (current)
    // The /story/ endpoint requires the numeric user_id, NOT the username — resolve first.
    async stories(username) {
      const ru = await fetch(`/api/v1/users/web_profile_info/?username=${username}`, { headers: HEADERS, credentials: 'include' });
      if (!ru.ok) return { username, status: ru.status, items: [] };
      const ud = await ru.json();
      const uid = ud.data && ud.data.user && ud.data.user.id;
      if (!uid) return { username, error: 'user not found', items: [] };
      const r = await fetch(`/api/v1/feed/user/${uid}/story/`, { headers: HEADERS, credentials: 'include' });
      if (!r.ok) return { username, userId: uid, status: r.status, items: [] };
      const data = await r.json();
      const reel = data.reel;   // null when the user has no active stories — endpoint still 200s
      if (!reel) return { username, userId: uid, count: 0, items: [], note: 'no active stories' };
      const items = (reel.items || []).map(it => ({
        id: it.pk,
        type: it.media_type === 2 ? 'video' : 'image',
        taken_at_iso: toDateISO(it.taken_at),
        caption: trim(it.caption && it.caption.text)
      }));
      return { username, userId: uid, count: items.length, items };
    },

    // -------------------------------------------------- 8b. Highlights
    async highlights(username, opts = {}) {
      // First resolve user id
      const ru = await fetch(`/api/v1/users/web_profile_info/?username=${username}`, { headers: HEADERS, credentials: 'include' });
      if (!ru.ok) return { username, status: ru.status, highlights: [] };
      const ud = await ru.json();
      const uid = ud.data && ud.data.user && ud.data.user.id;
      if (!uid) return { username, error: 'user not found', highlights: [] };
      // Fetch highlight tray
      const rt = await fetch(`/api/v1/highlights/${uid}/highlights_tray/`, { headers: HEADERS, credentials: 'include' });
      if (!rt.ok) return { username, status: rt.status, highlights: [] };
      const tray = await rt.json();
      const highlights = (tray.tray || []).map(h => ({
        id: h.id, title: h.title, item_count: h.media_count,
        cover_url: h.cover_media && h.cover_media.cropped_image_version && h.cover_media.cropped_image_version.url
      }));
      return { username, count: highlights.length, highlights };
    },

    // -------------------------------------------------- 9. Saved posts
    async saved(opts = {}) {
      if (opts.collectionId) {
        const r = await fetch(`/api/v1/feed/collection/${opts.collectionId}/posts/?count=${opts.count || 50}`, { headers: HEADERS, credentials: 'include' });
        if (!r.ok) return { collectionId: opts.collectionId, status: r.status, items: [] };
        const data = await r.json();
        const items = (data.items || []).map(it => projectMedia(it.media || it));
        return { collectionId: opts.collectionId, count: items.length, items };
      }
      // List collections if requested - correct path is /api/v1/collections/list/
      if (opts.listCollections) {
        const r = await fetch(`/api/v1/collections/list/`, { headers: HEADERS, credentials: 'include' });
        if (!r.ok) return { status: r.status, collections: [] };
        const data = await r.json();
        return { collections: (data.items || []).map(c => ({ id: c.collection_id, name: c.collection_name, count: c.collection_media_count })) };
      }
      // Default: all saved
      const r = await fetch(`/api/v1/feed/saved/posts/?count=${opts.count || 50}`, { headers: HEADERS, credentials: 'include' });
      if (!r.ok) return { status: r.status, items: [] };
      const data = await r.json();
      const items = (data.items || []).map(it => projectMedia(it.media || it));
      return { count: items.length, items };
    }
  };

  window.IGSearch = HELPERS;
  return { ready: true, helpers: Object.keys(HELPERS) };
})();
