import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTitle } from '../providers/tmdb';
import type { Settings } from '../utils/settings';
import type { TitleQuery } from '../utils/types';
import externalIdsFixture from './fixtures/tmdb-external-ids-397567.json';
import searchEnFixture from './fixtures/tmdb-search-agent-secret-en.json';
import searchFrFixture from './fixtures/tmdb-search-agent-secret-fr.json';

const settings: Settings = {
  enabledSources: {
    tmdb: true,
    imdb: true,
    rottentomatoes: true,
    metacritic: true,
    'allocine-presse': true,
    'allocine-spectateurs': true,
    senscritique: true,
    letterboxd: true,
    telerama: false,
    'telerama-abonnes': false,
  },
  sourceWeights: {},
  theme: 'auto',
  badgeGreenMin: 7,
  badgeYellowMin: 5,
  tmdbApiKey: 'test-key',
  omdbApiKey: '',
  cacheTtlHours: 24,
};

function mockFetch(url: string | URL | Request) {
  const u = new URL(typeof url === 'string' ? url : url.toString());
  const path = u.pathname;

  if (path.includes('/search/movie') || path.includes('/search/multi')) {
    const lang = u.searchParams.get('language');
    const fixture = lang === 'fr-FR' ? searchFrFixture : searchEnFixture;
    // /search/multi tags each hit with its media type
    const body = path.includes('/search/multi')
      ? { ...fixture, results: fixture.results.map((r) => ({ ...r, media_type: 'movie' })) }
      : fixture;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }

  if (path.includes('/external_ids')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(externalIdsFixture) });
  }

  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}

describe('resolveTitle — "L\'Agent secret" disambiguation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(mockFetch));
  });

  it('resolves to the best title match from bilingual search', async () => {
    const query: TitleQuery = {
      title: "L'Agent secret",
      ids: {},
      sourceSite: 'context-menu',
    };

    const result = await resolveTitle(query, settings);
    expect(result).not.toBeNull();
    // The FR search surfaces "L'Agent secret" (2025, id 1050505) which has
    // a higher titleSimilarity score → it becomes the resolved title
    expect(result?.resolved.tmdbId).toBe(1050505);
    expect(result?.resolved.year).toBe(2025);
  });

  it('includes other results as alternatives', async () => {
    const query: TitleQuery = {
      title: "L'Agent secret",
      ids: {},
      sourceSite: 'context-menu',
    };

    const result = await resolveTitle(query, settings);
    expect(result).not.toBeNull();
    expect(result?.alternatives.length).toBeGreaterThanOrEqual(2);

    // The Age of Shadows (2016) should appear as an alternative
    const ageOfShadows = result?.alternatives.find((a) => a.tmdbId === 397567);
    expect(ageOfShadows).toBeDefined();
    expect(ageOfShadows?.year).toBe(2016);
  });

  it('deduplicates results from EN and FR searches', async () => {
    const query: TitleQuery = {
      title: "L'Agent secret",
      ids: {},
      sourceSite: 'context-menu',
    };

    const result = await resolveTitle(query, settings);
    expect(result).not.toBeNull();

    const allIds = [result!.resolved.tmdbId, ...result!.alternatives.map((a) => a.tmdbId)];
    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);
  });

  it('skips search when TMDB id is provided directly (selecting an alternative)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        const u = new URL(typeof url === 'string' ? url : url.toString());
        if (u.pathname === '/3/movie/1050505') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 1050505,
                title: "L'Agent secret",
                original_title: 'O Agente Secreto',
                release_date: '2025-05-21',
                poster_path: '/agent-secret-2025.jpg',
                vote_average: 7.5,
                vote_count: 45,
              }),
          });
        }
        if (u.pathname === '/3/movie/1050505/external_ids') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ imdb_id: 'tt12345678' }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );

    const query: TitleQuery = {
      title: '',
      ids: { tmdb: 1050505 },
      mediaType: 'movie',
      sourceSite: 'alternative',
    };

    const result = await resolveTitle(query, settings);
    expect(result).not.toBeNull();
    expect(result?.resolved.tmdbId).toBe(1050505);
    expect(result?.resolved.imdbId).toBe('tt12345678');
    expect(result?.resolved.year).toBe(2025);
    expect(result?.alternatives).toHaveLength(0);
  });
});

describe('resolveTitle — accepting a title-search result', () => {
  function stubSearch(results: { id: number; title: string; release_date?: string }[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        const u = new URL(typeof url === 'string' ? url : url.toString());
        const tagged = results.map((r) => ({ ...r, media_type: 'movie' }));
        const body = u.pathname.startsWith('/3/search/') ? { results: tagged } : {};
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      }),
    );
  }

  it('rejects unrelated titles even when TMDB returns them for the queried year', async () => {
    // TMDB filters by `year`, so every result "matches" the year.
    stubSearch([
      { id: 1, title: 'Cast Away', release_date: '2000-12-22' },
      { id: 2, title: 'Gladiator', release_date: '2000-05-01' },
    ]);
    const query: TitleQuery = { title: 'Tom Hanks', year: 2000, ids: {}, sourceSite: 'wiki' };
    expect(await resolveTitle(query, settings)).toBeNull();
  });

  it('accepts a lone result whose title only matches a translation TMDB knows', async () => {
    stubSearch([{ id: 278, title: 'The Shawshank Redemption', release_date: '1994-09-23' }]);
    const query: TitleQuery = { title: 'Die Verurteilten', ids: {}, sourceSite: 'netflix' };
    expect((await resolveTitle(query, settings))?.resolved.tmdbId).toBe(278);
  });

  it('prefers the matching title over an unrelated one from the exact year', async () => {
    stubSearch([
      { id: 1, title: 'Something Else', release_date: '2021-03-01' },
      { id: 2, title: 'Dune', release_date: '2022-01-01' },
    ]);
    const query: TitleQuery = { title: 'Dune', year: 2021, ids: {}, sourceSite: 'test' };
    expect((await resolveTitle(query, settings))?.resolved.tmdbId).toBe(2);
  });
});

describe('resolveTitle — unknown media type (Netflix, Prime Video, context menu)', () => {
  const multiResults = [
    { id: 66732, media_type: 'tv', name: 'Stranger Things', first_air_date: '2016-07-15' },
    { id: 66732, media_type: 'movie', title: 'Stranger Things Movie', release_date: '2001-01-01' },
    { id: 5, media_type: 'person', name: 'Stranger Things Fan' },
  ];

  function stubMulti() {
    const fetchMock = vi.fn((url: string | URL | Request) => {
      const u = new URL(typeof url === 'string' ? url : url.toString());
      const body = u.pathname === '/3/search/multi' ? { results: multiResults } : {};
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const query: TitleQuery = { title: 'Stranger Things', ids: {}, sourceSite: 'www.netflix.com' };

  it('finds series as well as movies', async () => {
    stubMulti();
    const result = await resolveTitle(query, settings);
    expect(result?.resolved).toMatchObject({ tmdbId: 66732, mediaType: 'tv' });
  });

  it('looks up external ids under the media type of the chosen result', async () => {
    const fetchMock = stubMulti();
    await resolveTitle(query, settings);
    const paths = fetchMock.mock.calls.map(([u]) => new URL(String(u)).pathname);
    expect(paths).toContain('/3/tv/66732/external_ids');
  });

  it('ignores people and keeps a movie and series that share an id', async () => {
    stubMulti();
    const result = await resolveTitle(query, settings);
    expect(result?.alternatives).toEqual([
      expect.objectContaining({ tmdbId: 66732, mediaType: 'movie' }),
    ]);
  });
});

describe('resolveTitle — French title on a French site', () => {
  const en = [
    {
      id: 238,
      title: 'The Godfather',
      original_title: 'The Godfather',
      release_date: '1972-03-14',
    },
    { id: 240, title: 'The Godfather Part II', release_date: '1974-12-20' },
  ];
  const fr = [
    { id: 238, title: 'Le Parrain', original_title: 'The Godfather', release_date: '1972-03-14' },
    { id: 240, title: 'Le Parrain, 2e partie', release_date: '1974-12-20' },
  ];

  it('matches against the French title TMDB returned for the same id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        const u = new URL(typeof url === 'string' ? url : url.toString());
        const results = u.searchParams.get('language') === 'fr-FR' ? fr : en;
        const body = u.pathname.startsWith('/3/search/') ? { results } : {};
        return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      }),
    );
    const query: TitleQuery = {
      title: 'Le Parrain',
      year: 1972,
      mediaType: 'movie',
      ids: {},
      sourceSite: 'www.allocine.fr',
    };

    const result = await resolveTitle(query, settings);
    expect(result?.resolved.tmdbId).toBe(238);
    // The English record is still the one displayed
    expect(result?.resolved.title).toBe('The Godfather');
  });
});
