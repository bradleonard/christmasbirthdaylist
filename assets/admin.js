// Wish list editor. Saves straight to data.json in your GitHub repo via the GitHub API.
(function () {
  const $ = (id) => document.getElementById(id);
  const CFG_KEY = 'wishlist-config';

  let cfg = loadCfg();
  let data = null;            // current data.json contents
  let currentList = null;     // list id being edited
  let editingId = null;       // item id in the dialog (null = new)
  let pendingPhoto = null;    // { dataUrl, base64 } waiting to upload
  const previewCache = {};    // images/xxx.jpg -> dataUrl (before Pages rebuilds)

  // ---------- small utilities ----------
  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { return {}; }
  }
  function saveCfg(c) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* private mode */ }
  }
  const connected = () => !!(cfg.owner && cfg.repo && cfg.token);

  let toastTimer;
  function toast(msg, isError, sticky) {
    const el = $('status');
    // Pop-up windows sit on top of everything, so put the message inside the open one
    const dlgs = document.querySelectorAll('dialog[open]');
    const host = dlgs.length ? dlgs[dlgs.length - 1] : document.body;
    if (el.parentNode !== host) host.appendChild(el);
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => el.classList.add('hidden'), isError ? 7000 : 3500);
  }

  const b64ToText = (b64) =>
    new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
  function bytesToB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const textToB64 = (s) => bytesToB64(new TextEncoder().encode(s));

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => new Date().toISOString().slice(0, 10);
  const slug = (s) => (s || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'list';

  // ---------- GitHub API ----------
  async function gh(path, opts = {}) {
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/${path}`, {
      cache: 'no-store',
      ...opts,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch { }
      if (res.status === 401) msg = 'GitHub rejected the token. It may be wrong or expired. Check Settings.';
      if (res.status === 404) msg = 'Repository or data.json not found. Check the username, repo name, and token access.';
      if (res.status === 409) msg = 'Someone saved at the same moment. Please try again.';
      throw new Error(msg);
    }
    return res.json();
  }

  async function fetchRemote() {
    const f = await gh(`contents/data.json?ref=${encodeURIComponent(cfg.branch || 'main')}`);
    return { json: JSON.parse(b64ToText(f.content)), sha: f.sha };
  }

  // Re-read the latest data.json, apply a change, and commit it.
  // Reading fresh each time means edits from your phone and computer never clobber each other.
  async function commit(change, message) {
    if (!connected()) { toast('Connect to GitHub first (see the box at the top).', true); return false; }
    toast('Saving…', false, true);
    try {
      const { json, sha } = await fetchRemote();
      change(json);
      await gh('contents/data.json', {
        method: 'PUT',
        body: JSON.stringify({
          message,
          content: textToB64(JSON.stringify(json, null, 2) + '\n'),
          sha,
          branch: cfg.branch || 'main',
        }),
      });
      data = json;
      render();
      toast('Saved ✓ Family will see it in about a minute.');
      return true;
    } catch (e) {
      toast('Save failed: ' + e.message, true);
      return false;
    }
  }

  async function uploadImage(path, base64) {
    await gh(`contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message: 'Add photo', content: base64, branch: cfg.branch || 'main' }),
    });
  }

  // ---------- loading ----------
  async function load() {
    try {
      if (connected()) {
        data = (await fetchRemote()).json;
        $('setup').classList.add('hidden');
      } else {
        const res = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' });
        data = await res.json();
        showSetup();
      }
    } catch (e) {
      toast('Could not load your list: ' + e.message, true);
      showSetup();
      try { data = await (await fetch('data.json', { cache: 'no-store' })).json(); } catch { return; }
    }
    if (!currentList || !data.lists.some(l => l.id === currentList)) {
      currentList = data.activeList || data.lists[0].id;
    }
    render();
  }

  function showSetup() {
    $('setup').classList.remove('hidden');
    // Guess owner/repo when hosted at https://owner.github.io/repo/
    const host = location.hostname;
    let owner = cfg.owner, repo = cfg.repo;
    if (!owner && host.endsWith('.github.io')) {
      owner = host.split('.')[0];
      const seg = location.pathname.split('/').filter(Boolean)[0];
      repo = seg && !seg.endsWith('.html') ? seg : host;
    }
    $('cfgOwner').value = owner || '';
    $('cfgRepo').value = repo || '';
    $('cfgBranch').value = cfg.branch || 'main';
    $('cfgToken').value = cfg.token || '';
  }

  $('connectBtn').addEventListener('click', async () => {
    cfg = {
      owner: $('cfgOwner').value.trim(),
      repo: $('cfgRepo').value.trim(),
      branch: $('cfgBranch').value.trim() || 'main',
      token: $('cfgToken').value.trim(),
    };
    if (!connected()) { toast('Please fill in all four boxes.', true); return; }
    try {
      await fetchRemote();
      saveCfg(cfg);
      toast('Connected ✓ You can edit your list now.');
      await load();
    } catch (e) {
      toast('Could not connect: ' + e.message, true);
    }
  });

  // ---------- rendering ----------
  function imgFor(item) {
    return previewCache[item.image] || item.image || '';
  }

  function render() {
    if (!data) return;
    const list = data.lists.find(l => l.id === currentList) || data.lists[0];
    document.body.dataset.theme = list.theme || 'plain';

    $('listSel').innerHTML = data.lists.map(l => {
      const n = data.items.filter(i => i.list === l.id).length;
      return `<option value="${WL.esc(l.id)}" ${l.id === list.id ? 'selected' : ''}>${WL.esc(l.title)} (${n})${l.id === data.activeList ? ' ★ shown first' : ''}</option>`;
    }).join('');

    const items = data.items.filter(i => i.list === list.id);
    $('empty').classList.toggle('hidden', items.length > 0);
    const pLabel = { high: '★ Top pick', medium: '', low: 'Nice to have' };
    $('items').innerHTML = items.map((it, idx) => {
      const img = imgFor(it);
      const meta = [it.price, it.store || WL.domainOf(it.url), pLabel[it.priority]].filter(Boolean).map(WL.esc).join(' · ');
      return `
        <div class="admin-item" data-id="${WL.esc(it.id)}">
          ${img ? `<img src="${WL.esc(img)}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;noimg&quot;>🎁</div>'">` : `<div class="noimg">🎁</div>`}
          <div><div class="t">${WL.esc(it.title || 'Untitled')}</div><div class="m">${meta}</div></div>
          <div class="ctl">
            <button class="btn secondary" data-act="up" ${idx === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button class="btn secondary" data-act="down" ${idx === items.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            <button class="btn secondary" data-act="edit">Edit</button>
          </div>
        </div>`;
    }).join('');
  }

  $('listSel').addEventListener('change', (e) => { currentList = e.target.value; render(); });

  $('items').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.admin-item').dataset.id;
    const act = btn.dataset.act;
    if (act === 'edit') openItem(id);
    else move(id, act === 'up' ? -1 : 1);
  });

  function move(id, dir) {
    commit(d => {
      const idxs = d.items.map((it, i) => (it.list === currentList ? i : -1)).filter(i => i >= 0);
      const pos = idxs.findIndex(i => d.items[i].id === id);
      const other = idxs[pos + dir];
      if (pos < 0 || other === undefined) return;
      const a = idxs[pos];
      [d.items[a], d.items[other]] = [d.items[other], d.items[a]];
    }, 'Reorder list');
  }

  // ---------- item dialog ----------
  const itemDlg = $('itemDlg');

  function fillListSelect(sel, value) {
    sel.innerHTML = data.lists.map(l => `<option value="${WL.esc(l.id)}">${WL.esc(l.title)}</option>`).join('');
    sel.value = value;
  }

  function setImage(src) {
    $('fImgPreview').src = src || '';
    $('fImgPreview').classList.toggle('hidden', !src);
    $('clearImgBtn').classList.toggle('hidden', !src);
  }

  function openItem(id) {
    if (!data) return;
    editingId = id || null;
    pendingPhoto = null;
    const it = (id && data.items.find(i => i.id === id)) || {};
    $('itemDlgTitle').textContent = id ? 'Edit item' : 'Add item';
    $('fUrl').value = it.url || '';
    $('fTitle').value = it.title || '';
    $('fPrice').value = it.price || '';
    $('fPriority').value = it.priority || 'medium';
    $('fDesc').value = it.description || '';
    $('fImage').value = (it.image || '').startsWith('images/') ? '' : (it.image || '');
    $('fImage').dataset.repoPath = (it.image || '').startsWith('images/') ? it.image : '';
    $('fStore').value = it.store || '';
    fillListSelect($('fList'), it.list || currentList);
    setImage(imgFor(it));
    $('deleteBtn').classList.toggle('hidden', !id);
    if (!itemDlg.open) itemDlg.showModal();
  }

  $('addBtn').addEventListener('click', () => openItem(null));
  $('qLink').addEventListener('click', async () => {
    openItem(null);
    // Try to grab a link that's already on the clipboard
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\//i.test(t)) { $('fUrl').value = t; fetchDetails(); return; }
    } catch { }
    $('fUrl').focus();
  });
  $('qPhoto').addEventListener('click', () => { openItem(null); $('photoInput').click(); });
  $('qScan').addEventListener('click', () => { openItem(null); openScanner(); });

  itemDlg.querySelectorAll('button[value="cancel"]').forEach(b => {
    b.type = 'button';
    b.addEventListener('click', () => b.closest('dialog').close());
  });

  $('fUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fetchDetails(); } });
  $('fUrl').addEventListener('paste', () => setTimeout(() => { if (!$('fTitle').value) fetchDetails(); }, 50));
  $('fetchBtn').addEventListener('click', () => fetchDetails(true));
  $('fImage').addEventListener('input', () => {
    pendingPhoto = null;
    $('fImage').dataset.repoPath = '';
    setImage($('fImage').value.trim());
  });
  $('clearImgBtn').addEventListener('click', () => {
    pendingPhoto = null;
    $('fImage').value = '';
    $('fImage').dataset.repoPath = '';
    setImage('');
  });

  function cleanTitle(t) {
    return String(t || '')
      .replace(/^Amazon\.com\s*:\s*/i, '')
      .replace(/\s*:\s*[^:]{2,40}$/, m => (/amazon/i.test(t) ? '' : m)) // drop Amazon's " : Category" tail
      .replace(/\s+\|\s+[^|]{2,30}$/, '') // "Product | Store"
      .replace(/\s*[–-]\s*(Target|Walmart\.com|Best Buy|Etsy|REI Co-op|The Home Depot|Home Depot|Lowe's|Lowes\.com|Costco|Kohl's|Macy's)\s*$/i, '')
      .trim();
  }

  // Amazon's site graphics (logos, Prime badges) live under /images/G/; product photos are under /images/I/
  const isJunkImage = (u) => !u || /\/images\/G\/|prime_logo|amazon[-_ ]?logo|sprite|favicon|1x1|pixel\.gif/i.test(u);

  function amazonAsin(u) {
    const m = String(u || '').match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : '';
  }

  // Resolves to the URL if it loads as a real picture (not a 1x1 placeholder), else ''
  function checkImage(u) {
    return new Promise((ok) => {
      if (!u) return ok('');
      const i = new Image();
      const t = setTimeout(() => ok(''), 8000);
      i.onload = () => { clearTimeout(t); ok(i.naturalWidth >= 50 ? u : ''); };
      i.onerror = () => { clearTimeout(t); ok(''); };
      i.referrerPolicy = 'no-referrer';
      i.src = u;
    });
  }

  function biggestDynamicImage(json) {
    // Amazon's data-a-dynamic-image is {"url": [w, h], ...}
    try {
      const entries = Object.entries(JSON.parse(json));
      entries.sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
      return entries.length ? entries[0][0] : '';
    } catch { return ''; }
  }

  function formatPrice(p, currency) {
    const n = parseFloat(String(p || '').replace(/[^0-9.]/g, ''));
    if (isNaN(n)) return '';
    return (!currency || currency === 'USD' ? '$' : currency + ' ') + n.toFixed(2).replace(/\.00$/, '');
  }

  // Many store links contain the product name, e.g. homedepot.com/p/DEWALT-20V-Drill-DCD771C2/204279858
  function titleFromUrl(u) {
    let path;
    try { path = new URL(u).pathname; } catch { return ''; }
    const pats = [
      /\/p\/([^/]+)\/\d+/,            // Home Depot, Target (/p/slug/-/A-123)
      /\/pd\/([^/]+)\/\d+/,           // Lowe's
      /\/ip\/([^/]+)\/\d+/,           // Walmart
      /\/site\/([^/]+)\/\d+\.p/,      // Best Buy
      /\/listing\/\d+\/([^/]+)/,      // Etsy
      /\/([^/]+)\/dp\/[A-Z0-9]{10}/i, // Amazon
      /\/product\/([^/]+)/,           // many shops
      /\/products\/([^/]+)/,          // Shopify stores
    ];
    for (const re of pats) {
      const m = path.match(re);
      if (m && /[a-z]/i.test(m[1]) && m[1] !== '-') {
        return decodeURIComponent(m[1]).replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    return '';
  }

  const looksBlocked = (t) => /robot|captcha|access denied|denied|forbidden|page not found|sign in|just a moment|attention required|are you a human|^amazon\.com$|^error/i.test(t || '');

  // Source 1: microlink.io (free, ~50 lookups/day)
  async function fromMicrolink(url) {
    const q = new URLSearchParams({
      url,
      'data.price.selector': 'meta[property="product:price:amount"],meta[property="og:price:amount"],meta[itemprop="price"]',
      'data.price.attr': 'content',
      'data.currency.selector': 'meta[property="product:price:currency"],meta[property="og:price:currency"],meta[itemprop="priceCurrency"]',
      'data.currency.attr': 'content',
      // Amazon product pages
      'data.amzTitle.selector': '#productTitle',
      'data.amzHires.selector': '#landingImage,#imgBlkFront,#ebooksImgBlkFront,#main-image,img[data-a-image-name="landingImage"],#imgTagWrapperId img',
      'data.amzHires.attr': 'data-old-hires',
      'data.amzDynamic.selector': '#landingImage,#imgBlkFront,#ebooksImgBlkFront,img[data-a-image-name="landingImage"],#imgTagWrapperId img',
      'data.amzDynamic.attr': 'data-a-dynamic-image',
      'data.amzSrc.selector': '#landingImage,#imgBlkFront,#ebooksImgBlkFront,#main-image,img[data-a-image-name="landingImage"],#imgTagWrapperId img,#main-image-container img',
      'data.amzSrc.attr': 'src',
      'data.amzPrice.selector': '#corePrice_feature_div .a-offscreen,#corePriceDisplay_desktop_feature_div .a-offscreen,.a-price .a-offscreen',
    });
    const res = await fetch('https://api.microlink.io/?' + q);
    const j = await res.json();
    if (j.status !== 'success') throw new Error(j.message || 'lookup failed');
    const d = j.data || {};
    const finalUrl = d.url || url;
    const isAmazon = /(^|\.)amazon\.|(^|\/\/)(www\.)?a\.co\//i.test(finalUrl) || /(^|\/\/)(www\.)?a\.co\//i.test(url);
    const title = cleanTitle(d.amzTitle || d.title);
    let desc = d.description || '';
    if (isAmazon || /^amazon\.com\s*:/i.test(desc) || cleanTitle(desc) === title) desc = '';
    const asin = amazonAsin(finalUrl) || amazonAsin(url);
    return {
      blocked: looksBlocked(title) || looksBlocked(desc),
      finalUrl, isAmazon, title, desc,
      images: [
        d.amzHires,
        biggestDynamicImage(d.amzDynamic),
        d.amzSrc,
        d.image && d.image.url,
        asin && `https://ws-na.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${asin}&Format=_SL500_&ID=AsinImage&MarketPlace=US&ServiceVersion=20070822&WS=1`,
      ],
      price: formatPrice(d.amzPrice || d.price, d.amzPrice ? '' : d.currency),
      store: isAmazon ? 'Amazon' : ((d.publisher && d.publisher.length < 30 ? d.publisher : '') || ''),
    };
  }

  // Source 2: Jina Reader (free, opens the page in a real browser, which gets past some store blocks)
  async function fromJina(url) {
    const res = await fetch('https://r.jina.ai/' + url, {
      headers: { Accept: 'application/json', 'X-With-Images-Summary': 'true', 'X-Retain-Images': 'all' },
    });
    if (!res.ok) throw new Error('reader failed');
    const d = (await res.json()).data || {};
    const content = String(d.content || '');
    const imgs = [];
    if (d.images && typeof d.images === 'object') imgs.push(...Object.values(d.images));
    for (const m of content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)/g)) imgs.push(m[1]);
    // Prefer pictures that look like product photos
    const good = imgs.filter(u => !/\.svg(\?|$)|logo|icon|sprite|badge|banner|placeholder|rating|star/i.test(u));
    good.sort((a, b) => (/product|images\/I\/|productImages|\/media\/|_\d{3,4}\./i.test(b) ? 1 : 0) - (/product|images\/I\/|productImages|\/media\/|_\d{3,4}\./i.test(a) ? 1 : 0));
    const title = cleanTitle(d.title);
    const desc = d.description || '';
    return { blocked: looksBlocked(title) || looksBlocked(content.slice(0, 300)), title, desc, images: good.slice(0, 6), price: '', store: '' };
  }

  // Look up a product page's name, picture, description and price.
  // force = the Fetch button was tapped, so replace the picture even if there is one.
  async function fetchDetails(force) {
    const url = $('fUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) { toast('Paste a full link starting with https://', true); return; }
    $('fetchBtn').disabled = true;
    $('fetchBtn').textContent = '…';
    toast('Looking up that link…', false, true);
    try {
      const results = [];
      try { results.push(await fromMicrolink(url)); } catch { }
      const good = results.filter(r => !r.blocked && r.title);
      const needImage = !good.some(r => r.images.some(u => u && !isJunkImage(u)));
      if (!good.length || needImage) {
        try { results.push(await fromJina(url)); } catch { }
      }
      const ok = results.filter(r => !r.blocked && r.title);
      const first = (k) => (ok.find(r => r[k]) || {})[k] || '';
      const finalUrl = (results[0] && results[0].finalUrl) || url;

      const title = first('title') || titleFromUrl(finalUrl) || titleFromUrl(url);
      if (title && !$('fTitle').value) $('fTitle').value = title;
      const desc = first('desc');
      if (desc && !$('fDesc').value) $('fDesc').value = desc.slice(0, 280);
      if (!$('fPrice').value) $('fPrice').value = first('price');
      if (!$('fStore').value) {
        $('fStore').value = (results[0] && results[0].isAmazon) ? 'Amazon' : (first('store') || WL.domainOf(finalUrl));
      }

      // Picture: try each candidate until one actually loads
      const candidates = [...new Set(ok.flatMap(r => r.images))]
        .filter(u => u && /^https?:\/\//i.test(u) && !isJunkImage(u));
      const currentImg = $('fImgPreview').getAttribute('src') || '';
      let gotImage = false;
      if (force || !currentImg || isJunkImage(currentImg)) {
        let img = '';
        for (const c of candidates) { img = await checkImage(c); if (img) break; }
        if (img) {
          pendingPhoto = null;
          $('fImage').value = img;
          $('fImage').dataset.repoPath = '';
          setImage(img);
          gotImage = true;
        } else if (isJunkImage(currentImg)) {
          $('fImage').value = '';
          setImage('');
        }
      }
      const hasImage = gotImage || !!$('fImgPreview').getAttribute('src');

      if (!ok.length && !title) toast("That store blocks automatic lookups. Type a name, then use 🔍 Find picture or 📷 to add one.", true);
      else if (!ok.length) toast('That store blocks lookups, so I used the name from the link. Use 🔍 Find picture to add a picture.', true);
      else if (!hasImage) toast('Got the details ✓ No picture found, so use 🔍 Find picture or 📷.');
      else toast('Got the details ✓ Check them over, then tap Save.');
    } catch (e) {
      console.error('fetchDetails', e);
      if (!$('fStore').value) $('fStore').value = WL.domainOf(url);
      toast("Couldn't read that page automatically. Just type a name (and add a photo if you like).", true);
    } finally {
      $('fetchBtn').disabled = false;
      $('fetchBtn').textContent = 'Fetch';
    }
  }

  // Opens an image search for the item in a new tab. Long-press / right-click a picture there,
  // "Copy image address", and paste it into the image link box.
  $('findImgBtn').addEventListener('click', () => {
    const q = $('fTitle').value.trim() || titleFromUrl($('fUrl').value.trim());
    if (!q) { toast('Type a name first, then tap Find picture.', true); return; }
    window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q), '_blank', 'noopener');
    toast('Long-press (or right-click) a picture → Copy image address, then paste it in the image link box.', false);
  });

  // ---------- photos ----------
  $('photoBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file, 1000);
      pendingPhoto = { dataUrl, base64: dataUrl.split(',')[1] };
      $('fImage').value = '';
      $('fImage').dataset.repoPath = '';
      setImage(dataUrl);
    } catch {
      toast("Couldn't read that photo. Try a different one.", true);
    }
  });

  async function resizeImage(file, max) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, fail) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = fail;
        i.src = url;
      });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- save / delete ----------
  $('itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('fTitle').value.trim();
    if (!title) { toast('Give it a name first.', true); return; }
    const saveBtn = $('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const old = editingId ? data.items.find(i => i.id === editingId) || {} : {};
      const id = editingId || newId();
      let image = $('fImage').dataset.repoPath || $('fImage').value.trim();
      if (pendingPhoto) {
        if (!connected()) { toast('Connect to GitHub first (see the box at the top).', true); return; }
        image = `images/${id}-${Date.now().toString(36)}.jpg`;
        toast('Uploading photo…', false, true);
        await uploadImage(image, pendingPhoto.base64);
        previewCache[image] = pendingPhoto.dataUrl;
      }
      const url = $('fUrl').value.trim();
      const item = {
        id,
        list: $('fList').value,
        title,
        url,
        image,
        store: $('fStore').value.trim() || WL.domainOf(url),
        price: /^\d+(\.\d+)?$/.test($('fPrice').value.trim()) ? formatPrice($('fPrice').value) : $('fPrice').value.trim(),
        description: $('fDesc').value.trim(),
        priority: $('fPriority').value,
        added: old.added || today(),
      };
      const ok = await commit(d => {
        const i = d.items.findIndex(x => x.id === id);
        if (i >= 0) d.items[i] = item; else d.items.unshift(item);
      }, (editingId ? 'Update: ' : 'Add: ') + title);
      if (ok) {
        currentList = item.list;
        render();
        itemDlg.close();
      }
    } catch (err) {
      toast('Save failed: ' + err.message, true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  $('deleteBtn').addEventListener('click', async () => {
    const it = data.items.find(i => i.id === editingId);
    if (!it || !confirm(`Delete "${it.title}" from your list?`)) return;
    const ok = await commit(d => { d.items = d.items.filter(x => x.id !== editingId); }, 'Remove: ' + it.title);
    if (ok) itemDlg.close();
  });

  // ---------- barcode scanning ----------
  const scanDlg = $('scanDlg');
  let scanner = null;
  const scanMsg = (t) => { $('scanMsg').textContent = t; };

  function scannerConfig() {
    const F = window.Html5QrcodeSupportedFormats;
    return {
      verbose: false,
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };
  }

  async function openScanner() {
    $('manualCode').value = '';
    scanDlg.showModal();
    if (!window.Html5Qrcode) {
      scanMsg("The scanner couldn't load. You can still type the numbers below.");
      return;
    }
    scanMsg('Point your camera at the barcode on the box.');
    try {
      scanner = new Html5Qrcode('scanner', scannerConfig());
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w * 0.9, 340)), height: Math.floor(Math.min(h * 0.6, 170)) }) },
        (text) => gotCode(text)
      );
    } catch (e) {
      scanMsg("Couldn't open the camera. Allow camera access, or use a photo of the barcode instead.");
    }
  }

  async function stopScanner() {
    if (!scanner) return;
    const s = scanner;
    scanner = null;
    try { if (s.isScanning) await s.stop(); s.clear(); } catch { }
  }

  scanDlg.addEventListener('close', stopScanner);
  $('scanClose').addEventListener('click', () => scanDlg.close());
  $('scanBtn2').addEventListener('click', openScanner);
  $('scanFileBtn').addEventListener('click', () => $('barcodeFileInput').click());
  $('barcodeFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !window.Html5Qrcode) return;
    await stopScanner();
    scanMsg('Reading the photo…');
    const s = new Html5Qrcode('scanner', scannerConfig());
    try {
      const code = await s.scanFile(file, false);
      gotCode(code);
    } catch {
      scanMsg("Couldn't find a barcode in that photo. Try a closer, sharper shot or type the numbers.");
    } finally {
      try { s.clear(); } catch { }
    }
  });
  $('manualGo').addEventListener('click', () => {
    const c = $('manualCode').value.replace(/\D/g, '');
    if (c.length >= 6) gotCode(c); else toast('Type all the digits under the barcode.', true);
  });

  let lastCode = '';
  async function gotCode(text) {
    text = String(text).trim();
    if (text === lastCode && scanner) return; // ignore repeat reads while camera runs
    lastCode = text;
    await stopScanner();
    scanDlg.close();
    setTimeout(() => { lastCode = ''; }, 2000);
    if (/^https?:\/\//i.test(text)) { // QR code with a link
      $('fUrl').value = text;
      fetchDetails(true);
      return;
    }
    lookupBarcode(text.replace(/\D/g, ''));
  }

  async function lookupBarcode(code) {
    if (!code) return;
    toast('Looking up barcode ' + code + '…', false, true);
    let found = null;
    try {
      const r = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + code);
      if (r.ok) {
        const it = ((await r.json()).items || [])[0];
        if (it && it.title) found = { title: it.title, desc: it.description, image: (it.images || [])[0], brand: it.brand };
      }
    } catch { }
    if (!found) {
      try {
        const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,image_front_url`);
        const j = await r.json();
        if (j.status === 1 && j.product && j.product.product_name) {
          found = { title: [j.product.brands, j.product.product_name].filter(Boolean).join(' '), image: j.product.image_front_url };
        }
      } catch { }
    }

    if (found) {
      $('fTitle').value = found.title;
      if (found.desc && !$('fDesc').value) $('fDesc').value = found.desc.slice(0, 280);
      if (found.image && !pendingPhoto) {
        $('fImage').value = found.image;
        $('fImage').dataset.repoPath = '';
        setImage(found.image);
      }
    }
    // Give family a way to shop for it anywhere, plus the exact code to match
    const note = 'Barcode/UPC: ' + code;
    if (!$('fDesc').value.includes(note)) $('fDesc').value = ($('fDesc').value ? $('fDesc').value + '\n' : '') + note;
    if (!$('fUrl').value) {
      $('fUrl').value = 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(found ? found.title : code);
      if (!$('fStore').value) $('fStore').value = 'Any store';
    }
    if (found) toast('Found it ✓ Check the details, then tap Save.');
    else toast("Couldn't find that barcode in the free database. Type a name and snap a photo.", true);
    if (!found) $('fTitle').focus();
  }

  // ---------- settings ----------
  const settingsDlg = $('settingsDlg');
  let draftLists = [];

  settingsDlg.querySelectorAll('button[value="cancel"]').forEach(b => {
    b.type = 'button';
    b.addEventListener('click', () => settingsDlg.close());
  });

  $('settingsBtn').addEventListener('click', () => {
    if (!data) return;
    $('sName').value = data.name || '';
    draftLists = data.lists.map(l => ({ ...l }));
    renderListsEdit();
    settingsDlg.showModal();
  });

  function renderListsEdit() {
    const themes = [['christmas', 'Christmas'], ['birthday', 'Birthday'], ['plain', 'Simple']];
    $('listsEdit').innerHTML = draftLists.map((l, i) => `
      <div style="border:1px solid var(--line); border-radius:10px; padding:10px; margin-bottom:10px" data-i="${i}">
        <div class="list-row">
          <input data-k="title" value="${WL.esc(l.title)}" placeholder="List title" aria-label="List title">
          <select data-k="theme" aria-label="Theme">${themes.map(([v, n]) => `<option value="${v}" ${l.theme === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <button type="button" class="btn danger small" data-del="${i}">Remove</button>
        </div>
        <input data-k="note" value="${WL.esc(l.note || '')}" placeholder="Message for family (optional)" aria-label="Message"
          style="font:inherit; font-size:16px; padding:8px 10px; border-radius:8px; border:1px solid var(--line); width:100%">
      </div>`).join('');
    $('sActive').innerHTML = draftLists.map(l =>
      `<option value="${WL.esc(l.id)}" ${l.id === data.activeList ? 'selected' : ''}>${WL.esc(l.title)}</option>`).join('');
  }

  $('listsEdit').addEventListener('input', (e) => {
    const box = e.target.closest('[data-i]');
    if (!box || !e.target.dataset.k) return;
    draftLists[+box.dataset.i][e.target.dataset.k] = e.target.value;
    if (e.target.dataset.k === 'title') {
      const keep = $('sActive').value;
      renderListsEditActiveOnly(keep);
    }
  });
  function renderListsEditActiveOnly(keep) {
    $('sActive').innerHTML = draftLists.map(l =>
      `<option value="${WL.esc(l.id)}">${WL.esc(l.title)}</option>`).join('');
    $('sActive').value = keep;
  }
  $('listsEdit').addEventListener('click', (e) => {
    const i = e.target.dataset.del;
    if (i === undefined) return;
    const l = draftLists[+i];
    if (data.items.some(it => it.list === l.id)) {
      toast(`"${l.title}" still has items. Move or delete them first.`, true);
      return;
    }
    if (draftLists.length === 1) { toast('You need at least one list.', true); return; }
    draftLists.splice(+i, 1);
    renderListsEdit();
  });
  $('addListBtn').addEventListener('click', () => {
    let id = slug('new list'), n = 2;
    while (draftLists.some(l => l.id === id)) id = slug('new list ' + n++);
    draftLists.push({ id, title: 'New list', theme: 'plain', note: '' });
    renderListsEdit();
  });

  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('sName').value.trim();
    const active = $('sActive').value;
    const lists = draftLists.map(l => ({ ...l, title: l.title.trim() || 'Untitled list' }));
    const ok = await commit(d => {
      d.name = name;
      d.lists = lists;
      d.activeList = active;
    }, 'Update settings');
    if (ok) settingsDlg.close();
  });

  $('disconnectBtn').addEventListener('click', () => {
    if (!confirm('Remove the GitHub token from this device? (Your list stays as it is.)')) return;
    try { localStorage.removeItem(CFG_KEY); } catch { }
    cfg = {};
    settingsDlg.close();
    showSetup();
    toast('Disconnected this device.');
  });

  // ---------- share ----------
  $('shareBtn').addEventListener('click', async () => {
    const url = new URL('./', location.href).href;
    const title = data ? `${data.name ? data.name + "'s " : ''}wish list` : 'My wish list';
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch { return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied ✓ ' + url);
    } catch {
      prompt('Copy this link:', url);
    }
  });

  // When a pop-up closes, bring any message back out so it stays readable
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', () => {
    const el = $('status');
    if (el.parentNode === d) document.body.appendChild(el);
  }));

  load();
})();
