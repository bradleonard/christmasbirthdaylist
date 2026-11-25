// Shared helpers for the public page and the editor.
window.WL = (function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PRIORITY = { high: 0, medium: 1, low: 2 };
  const PRIORITY_LABEL = { high: 'Top pick', medium: '', low: '' };

  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  // First number in the price text: "$27.00" -> 27, "$1,299" -> 1299, "$20-30" -> 20
  function priceNum(p) {
    const m = String(p || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  const PRICE_GROUPS = [
    { label: '$10 & under', max: 10 },
    { label: '$10 – $20', max: 20 },
    { label: '$20 – $30', max: 30 },
    { label: 'Over $30', max: Infinity },
  ];
  // [{label, items}] in price order; empty groups left out
  function groupByPrice(items) {
    const groups = PRICE_GROUPS.map(g => ({ label: g.label, items: [] }));
    const none = { label: 'Price not listed', items: [] };
    for (const it of items) {
      const n = priceNum(it.price);
      if (n === null) { none.items.push(it); continue; }
      groups[PRICE_GROUPS.findIndex(g => n <= g.max)].items.push(it);
    }
    return groups.concat(none).filter(g => g.items.length);
  }

  function sortItems(items, mode) {
    const arr = items.slice();
    if (mode === 'price-asc' || mode === 'price-desc') {
      const dir = mode === 'price-asc' ? 1 : -1;
      arr.sort((a, b) => {
        const pa = priceNum(a.price), pb = priceNum(b.price);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return (pa - pb) * dir;
      });
    } else if (mode === 'newest') {
      arr.sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')));
    } else {
      // keep the manual order from the editor, but bump top picks up
      arr.sort((a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1));
    }
    return arr;
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(u || '') ? u : '';
  }

  function imgSrc(item) {
    const u = item.image || '';
    if (/^https?:\/\//i.test(u) || u.startsWith('images/') || u.startsWith('data:image/')) return u;
    return '';
  }

  function cardHTML(item) {
    const url = safeUrl(item.url);
    const img = imgSrc(item);
    const store = item.store || domainOf(url);
    const label = PRIORITY_LABEL[item.priority] || '';
    const thumb = img
      ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'placeholder',textContent:'🎁'}))">`
      : `<span class="placeholder">🎁</span>`;
    const wrapStart = url ? `<a class="thumb" href="${esc(url)}" target="_blank" rel="noopener">` : `<div class="thumb">`;
    const wrapEnd = url ? `</a>` : `</div>`;
    return `
      <article class="card">
        ${label ? `<span class="badge">${esc(label)}</span>` : ''}
        ${wrapStart}${thumb}${wrapEnd}
        <div class="body">
          ${store ? `<div class="store">${esc(store)}</div>` : ''}
          <h3 title="${esc(item.title || '')}">${esc(item.title || 'Untitled')}</h3>
          ${item.description ? `<p class="desc">${esc(item.description)}</p>` : ''}
          <div class="foot">
            <span class="price">${esc(/^\d+(\.\d+)?$/.test(String(item.price || '').trim()) ? '$' + String(item.price).trim() : (item.price || ''))}</span>
            ${url ? `<a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">View item ↗</a>` : ''}
          </div>
        </div>
      </article>`;
  }

  function niceDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  return { esc, domainOf, priceNum, groupByPrice, sortItems, cardHTML, niceDate, safeUrl };
})();
