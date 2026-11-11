let titles = [];
let featured;
let initialFavorites = [];
let catalogReady = false;
let credential = null;
let deviceId = null;
let sampleTitles = [];
let loadGeneration = 0;

const navItems = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'movies', label: 'Movies', icon: '▤' },
  { id: 'shows', label: 'Shows', icon: '▧' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'saved', label: 'My List', icon: '♡' },
];

const progress = new Map();
const favorites = new Set();
const state = { screen: 'home', selectedTitle: null, isPaused: false, lastScreen: 'home' };
const navRoot = document.querySelector('#primary-nav');
const contentRoot = document.querySelector('#screen-content');
const overlayRoot = document.querySelector('#overlay-root');
const screenKicker = document.querySelector('#screen-kicker');

const escapeText = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function renderNav() {
  navRoot.innerHTML = navItems.map((item, index) => `
    <button class="nav-button${state.screen === item.id ? ' is-active' : ''}" type="button"
      data-action="navigate" data-screen="${item.id}" data-row="0" data-index="${index}"
      aria-current="${state.screen === item.id ? 'page' : 'false'}">
      <span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>
    </button>`).join('');
}

function cardMarkup(title, row, index, { portrait = false } = {}) {
  const percent = progress.get(title.id);
  return `<button class="media-card${portrait ? ' poster-card' : ''}" type="button" data-action="details" data-id="${title.id}" data-row="${row}" data-index="${index}" aria-label="Details for ${escapeText(title.title)}">
    <span class="poster-wrap">
      ${title.image ? `<img class="poster-image" src="${escapeText(title.image)}" alt="" loading="lazy">` : ''}
      <span class="poster-shade"></span>
      <span class="poster-label">${title.source === 'fixture' ? 'SAMPLE · ' : ''}${escapeText(title.genre.toUpperCase())}</span>
      ${percent ? `<span class="progress-track"><span class="progress-fill" style="width:${percent}%"></span></span>` : ''}
    </span>
    <span class="media-title">${escapeText(title.title)}</span>
    <span class="media-subtitle">${escapeText(title.year ?? 'Year unavailable')} <span aria-hidden="true">·</span> ${escapeText(title.type)}</span>
  </button>`;
}

function railMarkup(title, collection, row, { posterCards = false, screen = 'movies' } = {}) {
  if (!collection.length) return '';
  return `<section class="rail" aria-label="${escapeText(title)}">
    <div class="rail-heading"><h2>${escapeText(title)}</h2><button type="button" data-action="navigate" data-screen="${screen}" data-row="${row}" data-index="99">VIEW ALL <span aria-hidden="true">↗</span></button></div>
    <div class="card-row">${collection.map((item, index) => cardMarkup(item, row + 1, index, { portrait: posterCards })).join('')}</div>
  </section>`;
}

function renderHome() {
  const mainTitles = credential ? titles.filter((title) => title.source === 'jellyfin') : sampleTitles;
  const watching = mainTitles.filter((title) => progress.has(title.id));
  const picks = mainTitles.filter((title) => title.id !== featured.id).slice(0, 5);
  contentRoot.innerHTML = `<div class="home-view">
    <section class="hero" aria-label="Featured title">
      ${featured.image ? `<img class="hero-image" src="${escapeText(featured.image)}" alt="">` : ''}
      <div class="hero-copy">
        <div class="eyebrow"><span class="eyebrow-mark"></span>${escapeText(featured.eyebrow)}</div>
        <h1>${escapeText(featured.title)}</h1>
        <div class="title-meta"><span>${escapeText(featured.year ?? 'Year unavailable')}</span><span class="meta-dot"></span><span>${escapeText(featured.runtime)}</span></div>
        <p class="hero-description">${escapeText(featured.description)}</p>
        <div class="hero-actions">
          <button class="action-primary" type="button" data-action="play-feature" data-row="2" data-index="0"><span class="play-glyph" aria-hidden="true">▶</span> PLAY</button>
          <button class="action-secondary" type="button" data-action="details-feature" data-row="2" data-index="1">MORE INFO</button>
          <button class="action-round" type="button" data-action="favorite-feature" data-row="2" data-index="2" aria-label="${favorites.has(featured.id) ? 'Remove featured title from My List' : 'Add featured title to My List'}" title="Toggle My List">${favorites.has(featured.id) ? '✓' : '＋'}</button>
        </div>
      </div>
      <div class="hero-pagination"><b>01</b><span></span>04</div>
    </section>
    ${railMarkup('Continue watching', watching, 3)}
    ${railMarkup('A little more like this', picks, 5)}
    ${credential ? `${mainTitles.length ? '' : '<div class="empty-state">Your Jellyfin library is empty. Sample titles are shown below.</div>'}${railMarkup('Sample titles · simulated', sampleTitles, 7)}` : ''}
  </div>`;
}

function renderListing(screen) {
  let list = titles;
  let heading = 'Movies';
  let description = 'Stories worth staying in for.';
  if (screen === 'shows') {
    list = titles.filter((item) => item.type === 'Show');
    heading = 'Shows';
    description = 'Good company, one episode at a time.';
  } else if (screen === 'movies') {
    list = titles.filter((item) => item.type === 'Movie');
    description = 'Stories worth staying in for.';
  } else if (screen === 'saved') {
    list = titles.filter((item) => favorites.has(item.id));
    heading = 'My List';
    description = 'A few things set aside for later.';
  }
  screenKicker.textContent = screen === 'saved' ? 'SAVED FOR A QUIETER MOMENT' : `BROWSE ${heading.toUpperCase()}`;

  if (screen === 'movies' || screen === 'shows') {
    const mainList = credential ? list.filter((item) => item.source === 'jellyfin') : list;
    const feature = mainList[0];
    if (!feature) {
      contentRoot.innerHTML = `<section class="listing-view"><div class="screen-heading"><h1>${heading}</h1></div><div class="empty-state">No Jellyfin ${heading.toLowerCase()} available.</div>${railMarkup('Sample titles · simulated', list.filter((item) => item.source === 'fixture'), 3, { posterCards: true, screen })}</section>`;
      return;
    }
    const watching = mainList.filter((item) => progress.has(item.id));
    const recent = [...mainList].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    const genres = screen === 'movies' ? ['Drama', 'Mystery', 'Adventure'] : ['Human stories', 'Mystery', 'Nature'];
    contentRoot.innerHTML = `<section class="listing-view catalog-view">
      <div class="catalog-heading"><div class="eyebrow"><span class="eyebrow-mark"></span>THE MORROW COLLECTION</div><h1>${heading}</h1><p>${description}</p></div>
      <section class="catalog-hero" aria-label="Featured ${heading.toLowerCase()}">
        ${feature.image ? `<img src="${escapeText(feature.image)}" alt="" class="catalog-hero-image">` : ''}
        <div class="catalog-hero-copy"><div class="eyebrow"><span class="eyebrow-mark"></span>FEATURED ${heading.toUpperCase()}</div>
          <h2>${escapeText(feature.title)}</h2><div class="title-meta"><span>${escapeText(feature.year ?? 'Year unavailable')}</span><span class="meta-dot"></span><span>${escapeText(feature.runtime)}</span><span class="meta-dot"></span><span>${escapeText(feature.genre)}</span></div>
          <p>${escapeText(feature.description)}</p><div class="hero-actions">
            <button class="action-primary" type="button" data-action="play" data-id="${feature.id}" data-row="2" data-index="0"><span class="play-glyph" aria-hidden="true">▶</span> PLAY</button>
            <button class="action-secondary" type="button" data-action="details" data-id="${feature.id}" data-row="2" data-index="1">MORE INFO</button>
          </div>
        </div>
      </section>
      ${railMarkup(`Popular ${heading}`, mainList, 3, { posterCards: true, screen })}
      ${railMarkup('Continue watching', watching, 5, { posterCards: true, screen })}
      ${railMarkup(`New to Morrow`, recent, 7, { posterCards: true, screen })}
      ${genres.map((genre, index) => railMarkup(`${genre} ${heading.toLowerCase()}`, mainList.filter((item) => item.genre === genre), 9 + index * 2, { posterCards: true, screen })).join('')}
      ${credential ? railMarkup('Sample titles · simulated', list.filter((item) => item.source === 'fixture'), 15, { posterCards: true, screen }) : ''}
    </section>`;
    return;
  }

  contentRoot.innerHTML = `<section class="listing-view">
    <div class="screen-heading"><div><div class="eyebrow"><span class="eyebrow-mark"></span>THE MORROW COLLECTION</div><h1>${heading}</h1></div><p>${description}</p></div>
    ${list.length ? `<div class="media-grid">${list.map((item, index) => cardMarkup(item, 3 + Math.floor(index / 4), index % 4)).join('')}</div>` : '<div class="empty-state">Nothing here just yet.</div>'}
  </section>`;
}

function renderSearch() {
  screenKicker.textContent = 'FIND YOUR NEXT STORY';
  contentRoot.innerHTML = `<section class="search-view">
    <label class="search-box"><span aria-hidden="true">⌕</span><input id="catalog-search" type="search" placeholder="Search movies and shows" autocomplete="off" aria-label="Search movies and shows"></label>
    <div class="search-results" id="search-results"><div class="eyebrow"><span class="eyebrow-mark"></span>ALL STORIES</div><div class="media-grid">${titles.slice(0, 4).map((item, index) => cardMarkup(item, 2, index)).join('')}</div></div>
  </section>`;
  const input = document.querySelector('#catalog-search');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    const results = titles.filter((item) => `${item.title} ${item.genre} ${item.type}`.toLowerCase().includes(query));
    document.querySelector('#search-results').innerHTML = results.length
      ? `<div class="eyebrow"><span class="eyebrow-mark"></span>${query ? `${results.length} STORIES` : 'ALL STORIES'}</div><div class="media-grid">${results.map((item, index) => cardMarkup(item, 2, index % 4)).join('')}</div>`
      : '<div class="empty-state">No stories found.</div>';
  });
}

function renderScreen({ focus = true } = {}) {
  renderNav();
  overlayRoot.innerHTML = '';
  if (state.screen === 'home') {
    screenKicker.textContent = 'A GOOD EVENING FOR A STORY';
    renderHome();
  } else if (state.screen === 'search') renderSearch();
  else renderListing(state.screen);
  if (focus) {
    const initial = state.screen === 'home' ? '[data-action="play-feature"]' : '.nav-button.is-active';
    requestAnimationFrame(() => document.querySelector(initial)?.focus());
  }
}

function findTitle(id) {
  return titles.find((item) => item.id === id);
}

function openDetails(title) {
  state.focusReturn = document.activeElement;
  state.selectedTitle = title.id;
  const item = title.id === featured.id ? featured : title;
  overlayRoot.innerHTML = `<div class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <button class="close-overlay" type="button" data-action="close" aria-label="Close details">×</button>
    ${item.image ? `<img class="detail-image" src="${escapeText(item.image)}" alt="">` : ''}
    <div class="detail-copy"><div class="eyebrow"><span class="eyebrow-mark"></span>${item.source === 'fixture' ? 'SAMPLE · ' : ''}${escapeText(item.genre.toUpperCase())}</div>
      <h2 id="detail-title">${escapeText(item.title)}</h2><div class="title-meta"><span>${escapeText(item.year ?? 'Year unavailable')}</span><span class="meta-dot"></span><span>${escapeText(item.runtime)}</span><span class="meta-dot"></span><span>${escapeText(item.type)}</span></div>
      <p>${escapeText(item.description)}</p><div class="detail-actions">
        <button class="action-primary" type="button" data-action="play" data-id="${item.id}" data-row="10" data-index="0"><span class="play-glyph" aria-hidden="true">▶</span> PLAY</button>
        <button class="action-secondary" type="button" data-action="favorite" data-id="${item.id}" data-row="10" data-index="1">${favorites.has(item.id) ? '✓ IN MY LIST' : '＋ MY LIST'}</button>
      </div>
    </div>
  </div>`;
  requestAnimationFrame(() => overlayRoot.querySelector('[data-action="play"]')?.focus());
}

function openPlayer(title) {
  state.selectedTitle = title.id;
  state.isPaused = false;
  overlayRoot.innerHTML = `<div class="player-panel" role="dialog" aria-modal="true" aria-label="Mock playback">
    ${title.image ? `<img class="player-image" src="${escapeText(title.image)}" alt="">` : ''}
    <button class="close-overlay" type="button" data-action="close" aria-label="Close player">×</button>
    <div class="player-top"><span>SIMULATED PLAYBACK</span><span>NO VIDEO PLAYING</span></div>
    <div class="player-center" aria-hidden="true"><span id="player-state">Ⅱ</span></div>
    <div class="player-controls"><h2 class="player-title">${escapeText(title.title)}</h2><div class="player-progress"><span></span></div>
      <div class="player-foot"><span>00:42 <span aria-hidden="true">/</span> ${escapeText(title.runtime)}</span><button type="button" data-action="toggle-pause" data-row="10" data-index="0">Ⅱ PAUSE</button><span>CC&nbsp;&nbsp; AUDIO</span></div>
    </div>
  </div>`;
  overlayRoot.querySelector('[data-action="toggle-pause"]').focus();
}

function navigate(screen) {
  state.screen = screen;
  renderScreen();
}

async function setFavorite(item, favorite) {
  if (item.source === 'jellyfin') {
    const response = await fetch('/v1/household/favorites', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
      body: JSON.stringify({ id: item.apiId, favorite }),
    });
    if (!response.ok) throw new Error(`Favorite request failed (${response.status})`);
  }
  if (favorite) favorites.add(item.id);
  else favorites.delete(item.id);
}

async function handleAction(button) {
  const { action, screen, id } = button.dataset;
  const item = ['details', 'play', 'favorite'].includes(action) ? findTitle(id) : null;
  if (['details', 'play', 'favorite'].includes(action) && !item) {
    console.error('Selected title is no longer available');
    window.alert('This title is no longer available. Reload the catalog.');
    return;
  }
  if (action === 'navigate') navigate(screen);
  if (action === 'open-search') navigate('search');
  if (action === 'details') openDetails(item);
  if (action === 'details-feature') openDetails(featured);
  if (action === 'play-feature') {
    state.focusReturn = button;
    openPlayer(featured);
  }
  if (action === 'play') {
    if (!overlayRoot.firstElementChild) state.focusReturn = button;
    openPlayer(item);
  }
  if (action === 'favorite-feature') {
    try {
      const favorite = !favorites.has(featured.id);
      await setFavorite(featured, favorite);
      button.textContent = favorite ? '✓' : '＋';
      button.setAttribute('aria-label', favorite ? 'Remove featured title from My List' : 'Add featured title to My List');
    } catch (error) {
      console.error('Unable to update favorite:', error);
      window.alert('Unable to update My List. Please retry.');
    }
  }
  if (action === 'favorite') {
    try {
      await setFavorite(item, !favorites.has(id));
      openDetails(item);
    } catch (error) {
      console.error('Unable to update favorite:', error);
      window.alert('Unable to update My List. Please retry.');
    }
  }
  if (action === 'toggle-pause') {
    state.isPaused = !state.isPaused;
    button.textContent = state.isPaused ? '▶ RESUME' : 'Ⅱ PAUSE';
    document.querySelector('#player-state').textContent = state.isPaused ? '▶' : 'Ⅱ';
  }
  if (action === 'profile') {
    overlayRoot.innerHTML = `<div class="profile-pop" role="dialog" aria-modal="true"><button class="close-overlay" type="button" data-action="close" aria-label="Close profile">×</button><span class="profile-mark">M</span><h2>Morrow Home</h2><p>${deviceId ? `Connected device: ${escapeText(deviceId)}. Sample favorites are temporary.` : 'Sample favorites are temporary.'}</p><button class="action-secondary" type="button" data-action="close" data-row="10" data-index="0">DONE</button></div>`;
    overlayRoot.querySelector('[data-action="close"]:not(.close-overlay)').focus();
  }
  if (action === 'close') {
    closeOverlay();
  }
  if (action === 'reset') {
    for (const item of sampleTitles) favorites.delete(item.id);
    initialFavorites.forEach((id) => favorites.add(id));
    state.screen = 'home';
    state.selectedTitle = null;
    renderScreen();
  }
}

function validateCatalog(catalog) {
  const validItem = (item) => {
    if (!item || typeof item !== 'object' ||
        typeof item.id !== 'string' || !/^[a-z0-9-]+$/.test(item.id) ||
        !['Movie', 'Show'].includes(item.type) || !Number.isInteger(item.year) ||
        !['title', 'runtime', 'genre', 'description', 'image'].every((key) => typeof item[key] === 'string' && item[key].length > 0)) return false;
    try {
      const url = new URL(item.image);
      return url.protocol === 'https:' && url.hostname === 'images.unsplash.com' && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  if (!catalog || catalog.source !== 'fixture' || !Array.isArray(catalog.titles) || !catalog.titles.every(validItem) ||
      !validItem(catalog.featured) || typeof catalog.featured.eyebrow !== 'string' ||
      !Array.isArray(catalog.progress) || !Array.isArray(catalog.favorites)) return false;
  const ids = new Set(catalog.titles.map((item) => item.id));
  return ids.size === catalog.titles.length && ids.has(catalog.featured.id) &&
    catalog.progress.every((entry) => Array.isArray(entry) && entry.length === 2 &&
      ids.has(entry[0]) && Number.isFinite(entry[1]) && entry[1] >= 0 && entry[1] <= 100) &&
    catalog.favorites.every((id) => ids.has(id));
}

function realItem(item, source) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(item.id) ||
      typeof item.title !== 'string' || !item.title || !['movie', 'series'].includes(item.type) ||
      typeof item.isFavorite !== 'boolean' || typeof item.isPlayable !== 'boolean' ||
      (item.year !== undefined && !Number.isInteger(item.year)) ||
      (item.overview !== undefined && typeof item.overview !== 'string') ||
      (item.progressPercent !== undefined && (!Number.isFinite(item.progressPercent) || item.progressPercent < 0 || item.progressPercent > 100))) {
    throw new Error('Invalid Jellyfin catalog response');
  }
  return {
    id: `real-${item.id}`, apiId: item.id, source: 'jellyfin', title: item.title,
    type: item.type === 'movie' ? 'Movie' : 'Show', year: item.year,
    runtime: 'Runtime unavailable', genre: source === 'mock' ? 'Mock Jellyfin' : 'Jellyfin', image: '',
    description: item.overview || 'Description unavailable.', eyebrow: source === 'mock' ? 'MOCK JELLYFIN · SIMULATED' : 'JELLYFIN LIBRARY',
    isFavorite: item.isFavorite, progressPercent: item.progressPercent,
  };
}

async function apiJson(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`Experience API request failed (${response.status})`);
  return response.json();
}

async function loadCatalog() {
  const generation = ++loadGeneration;
  const activeCredential = credential;
  catalogReady = false;
  contentRoot.innerHTML = '<div class="empty-state" role="status">Loading preview catalog...</div>';
  try {
    const catalog = await apiJson('/v1/preview/catalog');
    if (!validateCatalog(catalog)) throw new Error('Invalid preview catalog response');
    const samples = catalog.titles.map((item) => ({ ...item, id: `sample-${item.id}`, source: 'fixture' }));
    const sampleFeatured = { ...catalog.featured, id: `sample-${catalog.featured.id}`, source: 'fixture', eyebrow: 'SAMPLE · SIMULATED' };
    let realTitles = [];
    let source = 'live';
    if (activeCredential) {
      const options = { headers: { authorization: `Bearer ${activeCredential}` } };
      const [movies, series, health] = await Promise.all([
        apiJson('/v1/catalog/movies', options), apiJson('/v1/catalog/series', options), apiJson('/v1/health'),
      ]);
      if (!health || !['live', 'mock'].includes(health.catalogSource)) throw new Error('Invalid API catalog source');
      source = health.catalogSource;
      if (!Array.isArray(movies) || !Array.isArray(series)) throw new Error('Invalid Jellyfin catalog response');
      if (movies.some((item) => item?.type !== 'movie') || series.some((item) => item?.type !== 'series')) throw new Error('Invalid Jellyfin catalog type');
      realTitles = [...movies, ...series].map((item) => realItem(item, source));
      if (new Set(realTitles.map((item) => item.id)).size !== realTitles.length) throw new Error('Duplicate Jellyfin catalog item');
    }
    if (generation !== loadGeneration) return;
    sampleTitles = samples;
    titles = [...realTitles, ...samples];
    featured = realTitles[0] ?? sampleFeatured;
    initialFavorites = catalog.favorites.map((id) => `sample-${id}`);
    progress.clear();
    catalog.progress.forEach(([id, percent]) => progress.set(`sample-${id}`, percent));
    realTitles.forEach((item) => { if (item.progressPercent !== undefined) progress.set(item.id, item.progressPercent); });
    favorites.clear();
    initialFavorites.forEach((id) => favorites.add(id));
    realTitles.forEach((item) => { if (item.isFavorite) favorites.add(item.id); });
    document.querySelector('#source-status').textContent = credential ? (source === 'mock' ? 'MOCK JELLYFIN + API SAMPLES' : 'JELLYFIN + API SAMPLES') : 'API SAMPLES';
    catalogReady = true;
    renderScreen();
  } catch (error) {
    if (generation !== loadGeneration) return;
    catalogReady = false;
    console.error('Unable to load preview catalog:', error);
    contentRoot.innerHTML = '<div class="empty-state" role="alert">Unable to load the preview catalog from the Experience API. Check the API and pairing, then <button type="button" data-action="retry-catalog">retry</button>.</div>';
  }
}

function closeOverlay() {
  overlayRoot.innerHTML = '';
  if (state.focusReturn?.isConnected) state.focusReturn.focus();
  else (state.screen === 'home' ? document.querySelector('[data-action="play-feature"]') : document.querySelector('.nav-button.is-active'))?.focus();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'pair-dialog') {
    overlayRoot.innerHTML = `<div class="profile-pop" role="dialog" aria-modal="true"><button class="close-overlay" type="button" data-action="close" aria-label="Close">×</button><h2>Connect Jellyfin</h2><p>Enter an owner-generated pairing code. The credential stays in this tab's memory and is lost on reload.</p>${deviceId ? `<p>Connected device: ${escapeText(deviceId)}</p>` : ''}<label>Pairing code <input id="pairing-code" type="password" autocomplete="off"></label><p id="pairing-error" role="alert"></p><button class="action-secondary" type="button" data-action="pair-submit">CONNECT</button>${credential ? '<button class="action-secondary" type="button" data-action="disconnect">USE SAMPLES ONLY</button>' : ''}</div>`;
  } else if (button.dataset.action === 'pair-submit') {
    const input = document.querySelector('#pairing-code');
    const errorElement = document.querySelector('#pairing-error');
    const code = input.value.trim();
    input.value = '';
    button.disabled = true;
    apiJson('/v1/devices/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
      .then((pair) => {
        if (!pair || typeof pair.credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(pair.credential) ||
            typeof pair.deviceId !== 'string' || !/^[a-f0-9-]{36}$/.test(pair.deviceId)) throw new Error('Invalid pairing response');
        credential = pair.credential;
        deviceId = pair.deviceId;
        overlayRoot.innerHTML = '';
        loadCatalog();
      })
      .catch((error) => {
        console.error('Pairing failed:', error);
        errorElement.textContent = 'Pairing failed. Check the code and try again.';
        button.disabled = false;
      });
  } else if (button.dataset.action === 'disconnect') {
    credential = null;
    deviceId = null;
    overlayRoot.innerHTML = '';
    loadCatalog();
  } else if (button.dataset.action === 'close') {
    closeOverlay();
  } else if (button.dataset.action === 'retry-catalog') {
    loadCatalog();
  } else if (catalogReady) {
    handleAction(button);
  }
});

function moveFocus(direction) {
  const focused = document.activeElement.closest('[data-row]');
  if (!focused) return;
  const currentRow = Number(focused.dataset.row);
  const currentIndex = Number(focused.dataset.index);
  const all = [...document.querySelectorAll('button[data-row], input[data-row]')];
  const sameRow = all.filter((element) => Number(element.dataset.row) === currentRow);
  const currentPosition = sameRow.indexOf(focused);
  if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
    const delta = direction === 'ArrowLeft' ? -1 : 1;
    sameRow[Math.max(0, Math.min(sameRow.length - 1, currentPosition + delta))]?.focus();
    return;
  }
  const rows = [...new Set(all.map((element) => Number(element.dataset.row)))].sort((a, b) => a - b);
  const nextRow = direction === 'ArrowUp'
    ? [...rows].reverse().find((row) => row < currentRow)
    : rows.find((row) => row > currentRow);
  if (nextRow === undefined) return;
  const candidates = all.filter((element) => Number(element.dataset.row) === nextRow);
  candidates.reduce((nearest, candidate) => Math.abs(Number(candidate.dataset.index) - currentIndex) < Math.abs(Number(nearest.dataset.index) - currentIndex) ? candidate : nearest).focus();
}

document.addEventListener('keydown', (event) => {
  if (!catalogReady) return;
  if (event.key.startsWith('Arrow') && !(document.activeElement instanceof HTMLInputElement)) {
    event.preventDefault();
    moveFocus(event.key);
  }
  if (event.key === 'Escape' || event.key === 'Backspace') {
    if (overlayRoot.firstElementChild) closeOverlay();
    else if (state.screen !== 'home') navigate('home');
  }
  if (event.key === '/' && state.screen !== 'search' && !(document.activeElement instanceof HTMLInputElement)) {
    event.preventDefault();
    navigate('search');
    requestAnimationFrame(() => document.querySelector('#catalog-search')?.focus());
  }
});

loadCatalog();