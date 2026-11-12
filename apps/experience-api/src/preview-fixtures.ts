const image = (id: string, width = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=78`;

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

export function fixtureCatalog() {
  return {
    titles,
    featured,
    progress: [['northbound', 68], ['tideglass', 34], ['deep-winter', 82]],
    favorites: ['wild-index'],
  };
}
