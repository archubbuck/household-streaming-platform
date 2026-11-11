const image = (id, width = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=78`;

const titles = [
  { id: 'orchard', title: 'The Orchard at Dusk', type: 'Movie', year: 2025, runtime: '1h 48m', genre: 'Drama', image: image('photo-1470252649378-9c29740c9fa8'), description: 'A cartographer returns to a valley that no longer appears on any map, and finds the people there have been waiting for her.' },
  { id: 'northbound', title: 'Northbound', type: 'Show', year: 2024, runtime: '6 episodes', genre: 'Human stories', image: image('photo-1470770841072-f978cf4d019e'), description: 'A winter road, a borrowed car, and a handful of strangers heading toward the same small town.' },
  { id: 'tideglass', title: 'Tideglass', type: 'Movie', year: 2025, runtime: '1h 36m', genre: 'Mystery', image: image('photo-1518837695005-2083093ee35b'), description: 'After a storm changes the shoreline, a marine biologist discovers a lighthouse still sending a signal.' },
  { id: 'wild-index', title: 'The Wild Index', type: 'Show', year: 2023, runtime: '8 episodes', genre: 'Nature', image: image('photo-1441974231531-c6227db76b6e'), description: 'Field notes from the forests, wetlands, and quiet edges where wild places meet home.' },
  { id: 'blue-hour', title: 'Blue Hour, Again', type: 'Movie', year: 2024, runtime: '1h 52m', genre: 'Drama', image: image('photo-1500530855697-b586d89ba3ee'), description: 'Two old friends take the long way back from a wedding and rediscover an unfinished conversation.' },
  { id: 'deep-winter', title: 'Deep Winter', type: 'Show', year: 2025, runtime: '5 episodes', genre: 'Mystery', image: image('photo-1519681393784-d120267933ba'), description: 'When the observatory loses contact with the valley below, its night crew begins to notice a pattern in the snow.' },
  { id: 'small-hours', title: 'Small Hours', type: 'Movie', year: 2022, runtime: '1h 41m', genre: 'Drama', image: image('photo-1497366754035-f200968a6e72'), description: 'The night staff of a neighborhood hotel become the keepers of each other’s small, unfinished plans.' },
  { id: 'long-way-home', title: 'The Long Way Home', type: 'Movie', year: 2023, runtime: '1h 57m', genre: 'Adventure', image: image('photo-1500534623283-312aade485b7'), description: 'A brother and sister follow an old trail across the high country to return something that was never theirs.' },
  { id: 'glass-harbor', title: 'Glass Harbor', type: 'Movie', year: 2024, runtime: '1h 44m', genre: 'Mystery', image: image('photo-1498623116890-37e912163d5d'), description: 'A radio host receives a nightly weather report from a town erased from the coast years ago.' },
  { id: 'last-light', title: 'Last Light on the Pass', type: 'Movie', year: 2023, runtime: '1h 51m', genre: 'Adventure', image: image('photo-1464822759023-fed622ff2c3b'), description: 'Two climbers retrace a missing expedition’s route before the first storm closes the mountain.' },
  { id: 'river-house', title: 'The River House', type: 'Movie', year: 2022, runtime: '1h 39m', genre: 'Drama', image: image('photo-1473448912268-2022ce9509d8'), description: 'Three generations return to a riverside home to decide what should be carried forward.' },
  { id: 'under-canopy', title: 'Under Canopy', type: 'Show', year: 2025, runtime: '7 episodes', genre: 'Nature', image: image('photo-1448375240586-882707db888b'), description: 'A field team follows the changing life of one forest through a year of seasons and storms.' },
  { id: 'after-signal', title: 'After the Signal', type: 'Show', year: 2024, runtime: '6 episodes', genre: 'Mystery', image: image('photo-1519608487953-e999c86e7455'), description: 'A remote listening station hears a transmission that should not exist, then hears it answer back.' },
  { id: 'common-ground', title: 'Common Ground', type: 'Show', year: 2022, runtime: '9 episodes', genre: 'Human stories', image: image('photo-1470252649378-9c29740c9fa8'), description: 'Neighbors on one block find surprising ways to show up for one another.' },
];

const featured = {
  ...titles[0],
  title: 'A Map of the Quiet',
  eyebrow: 'TONIGHT’S FEATURE',
  description: 'Some places disappear for a reason. A patient, beautifully observed story about finding your way back.',
  image: image('photo-1500530855697-b586d89ba3ee', 1600),
};

const navItems = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'movies', label: 'Movies', icon: '▤' },
  { id: 'shows', label: 'Shows', icon: '▧' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'saved', label: 'My List', icon: '♡' },
];

const progress = new Map([['northbound', 68], ['tideglass', 34], ['deep-winter', 82]]);
const favorites = new Set(['wild-index']);
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
      <img class="poster-image" src="${title.image}" alt="" loading="lazy">
      <span class="poster-shade"></span>
      <span class="poster-label">${escapeText(title.genre.toUpperCase())}</span>
      ${percent ? `<span class="progress-track"><span class="progress-fill" style="width:${percent}%"></span></span>` : ''}
    </span>
    <span class="media-title">${escapeText(title.title)}</span>
    <span class="media-subtitle">${title.year} <span aria-hidden="true">·</span> ${escapeText(title.type)}</span>
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
  const watching = titles.filter((title) => progress.has(title.id));
  const picks = titles.filter((title) => title.id !== 'orchard' && title.id !== 'northbound').slice(0, 5);
  contentRoot.innerHTML = `<div class="home-view">
    <section class="hero" aria-label="Featured title">
      <img class="hero-image" src="${featured.image}" alt="Sunlit hills under a broad evening sky">
      <div class="hero-copy">
        <div class="eyebrow"><span class="eyebrow-mark"></span>${featured.eyebrow}</div>
        <h1>${escapeText(featured.title)}</h1>
        <div class="title-meta"><span>${featured.year}</span><span class="meta-dot"></span><span>${featured.runtime}</span><span class="meta-dot"></span><span>4K</span></div>
        <p class="hero-description">${escapeText(featured.description)}</p>
        <div class="hero-actions">
          <button class="action-primary" type="button" data-action="play-feature" data-row="2" data-index="0"><span class="play-glyph" aria-hidden="true">▶</span> PLAY</button>
          <button class="action-secondary" type="button" data-action="details-feature" data-row="2" data-index="1">MORE INFO</button>
          <button class="action-round" type="button" data-action="favorite-feature" data-row="2" data-index="2" aria-label="Add featured title to My List" title="Add to My List">＋</button>
        </div>
      </div>
      <div class="hero-pagination"><b>01</b><span></span>04</div>
    </section>
    ${railMarkup('Continue watching', watching, 3)}
    ${railMarkup('A little more like this', picks, 5)}
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
    const feature = screen === 'movies' ? findTitle('tideglass') : findTitle('northbound');
    const watching = list.filter((item) => progress.has(item.id));
    const recent = [...list].sort((a, b) => b.year - a.year);
    const genres = screen === 'movies' ? ['Drama', 'Mystery', 'Adventure'] : ['Human stories', 'Mystery', 'Nature'];
    contentRoot.innerHTML = `<section class="listing-view catalog-view">
      <div class="catalog-heading"><div class="eyebrow"><span class="eyebrow-mark"></span>THE MORROW COLLECTION</div><h1>${heading}</h1><p>${description}</p></div>
      <section class="catalog-hero" aria-label="Featured ${heading.toLowerCase()}">
        <img src="${feature.image}" alt="" class="catalog-hero-image">
        <div class="catalog-hero-copy"><div class="eyebrow"><span class="eyebrow-mark"></span>FEATURED ${heading.toUpperCase()}</div>
          <h2>${escapeText(feature.title)}</h2><div class="title-meta"><span>${feature.year}</span><span class="meta-dot"></span><span>${escapeText(feature.runtime)}</span><span class="meta-dot"></span><span>${escapeText(feature.genre)}</span></div>
          <p>${escapeText(feature.description)}</p><div class="hero-actions">
            <button class="action-primary" type="button" data-action="play" data-id="${feature.id}" data-row="2" data-index="0"><span class="play-glyph" aria-hidden="true">▶</span> PLAY</button>
            <button class="action-secondary" type="button" data-action="details" data-id="${feature.id}" data-row="2" data-index="1">MORE INFO</button>
          </div>
        </div>
      </section>
      ${railMarkup(`Popular ${heading}`, list, 3, { posterCards: true, screen })}
      ${railMarkup('Continue watching', watching, 5, { posterCards: true, screen })}
      ${railMarkup(`New to Morrow`, recent, 7, { posterCards: true, screen })}
      ${genres.map((genre, index) => railMarkup(`${genre} ${heading.toLowerCase()}`, list.filter((item) => item.genre === genre), 9 + index * 2, { posterCards: true, screen })).join('')}
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
  return titles.find((item) => item.id === id) ?? featured;
}

function openDetails(title) {
  state.focusReturn = document.activeElement;
  state.selectedTitle = title.id;
  const item = title.id === featured.id ? featured : title;
  overlayRoot.innerHTML = `<div class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <button class="close-overlay" type="button" data-action="close" aria-label="Close details">×</button>
    <img class="detail-image" src="${item.image}" alt="">
    <div class="detail-copy"><div class="eyebrow"><span class="eyebrow-mark"></span>${escapeText(item.genre.toUpperCase())}</div>
      <h2 id="detail-title">${escapeText(item.title)}</h2><div class="title-meta"><span>${item.year}</span><span class="meta-dot"></span><span>${item.runtime}</span><span class="meta-dot"></span><span>${escapeText(item.type)}</span></div>
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
    <img class="player-image" src="${title.image}" alt="">
    <button class="close-overlay" type="button" data-action="close" aria-label="Close player">×</button>
    <div class="player-top"><span>MORROW ORIGINAL</span><span>LOCAL PREVIEW</span></div>
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

function handleAction(button) {
  const { action, screen, id } = button.dataset;
  if (action === 'navigate') navigate(screen);
  if (action === 'open-search') navigate('search');
  if (action === 'details') openDetails(findTitle(id));
  if (action === 'details-feature') openDetails(featured);
  if (action === 'play-feature') {
    state.focusReturn = button;
    openPlayer(featured);
  }
  if (action === 'play') {
    if (!overlayRoot.firstElementChild) state.focusReturn = button;
    openPlayer(findTitle(id));
  }
  if (action === 'favorite-feature') {
    favorites.add(featured.id);
    button.textContent = '✓';
    button.setAttribute('aria-label', 'Featured title added to My List');
  }
  if (action === 'favorite') {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    openDetails(findTitle(id));
  }
  if (action === 'toggle-pause') {
    state.isPaused = !state.isPaused;
    button.textContent = state.isPaused ? '▶ RESUME' : 'Ⅱ PAUSE';
    document.querySelector('#player-state').textContent = state.isPaused ? '▶' : 'Ⅱ';
  }
  if (action === 'profile') {
    overlayRoot.innerHTML = `<div class="profile-pop" role="dialog" aria-modal="true"><button class="close-overlay" type="button" data-action="close" aria-label="Close profile">×</button><span class="profile-mark">M</span><h2>Morrow Home</h2><p>One home. One shared watchlist.</p><button class="action-secondary" type="button" data-action="close" data-row="10" data-index="0">DONE</button></div>`;
    overlayRoot.querySelector('[data-action="close"]:not(.close-overlay)').focus();
  }
  if (action === 'close') {
    closeOverlay();
  }
  if (action === 'reset') {
    favorites.clear();
    favorites.add('wild-index');
    state.screen = 'home';
    state.selectedTitle = null;
    renderScreen();
  }
}

function closeOverlay() {
  overlayRoot.innerHTML = '';
  if (state.focusReturn?.isConnected) state.focusReturn.focus();
  else (state.screen === 'home' ? document.querySelector('[data-action="play-feature"]') : document.querySelector('.nav-button.is-active'))?.focus();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button) handleAction(button);
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

renderScreen();