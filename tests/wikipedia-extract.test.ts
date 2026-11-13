import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { wikipediaDetector } from '../detectors/wikipedia';

/** A Wikipedia article reduced to what the detector reads: heading, infobox, categories. */
function page(lang: string, heading: string, categories: string[], infobox = '') {
  const cats = categories.map((c) => `<li><a href="/wiki/Category:x">${c}</a></li>`).join('');
  const { document } = parseHTML(`<html><body>
    <h1 id="firstHeading">${heading}</h1>
    ${infobox ? `<table class="infobox">${infobox}</table>` : ''}
    <div id="mw-normal-catlinks"><ul>${cats}</ul></div>
  </body></html>`);
  const url = new URL(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(heading)}`);
  return wikipediaDetector.extract(document as unknown as Document, url);
}

// Categories below are taken from the live articles.
describe('wikipediaDetector.extract — films and series', () => {
  it.each([
    [
      'en',
      'Inception',
      ['2010 American films', '2010 films', 'Films directed by Christopher Nolan'],
    ],
    ['fr', 'Inception', ['Film américain sorti en 2010', 'Film réalisé par Christopher Nolan']],
    ['de', 'Inception', ['Actionfilm', 'Filmtitel 2010', 'US-amerikanischer Film']],
    ['es', 'Inception', ['Películas de 2010', 'Películas de Estados Unidos']],
    ['it', 'Inception', ['Film statunitensi del 2010', 'Film diretti da Christopher Nolan']],
  ])('detects a %s film with its year', (lang, heading, categories) => {
    expect(page(lang, heading, categories)).toMatchObject({
      title: 'Inception',
      year: 2010,
      mediaType: 'movie',
    });
  });

  it.each([
    ['en', ['2008 American television series debuts', '2013 American television series endings']],
    ['fr', ['Série télévisée américaine créée en 2008', 'Série télévisée dramatique américaine']],
    ['es', ['Series de televisión iniciadas en 2008', 'Series de televisión de Estados Unidos']],
    ['it', ['Serie televisive iniziate nel 2008', 'Serie televisive statunitensi']],
  ])('detects a %s series with its first-air year', (lang, categories) => {
    expect(page(lang, 'Breaking Bad', categories)).toMatchObject({
      title: 'Breaking Bad',
      year: 2008,
      mediaType: 'tv',
    });
  });

  it('detects a German series (categories give only the decade)', () => {
    expect(
      page('de', 'Breaking Bad', [
        'Fernsehserie (Vereinigte Staaten)',
        'Fernsehserie der 2000er Jahre',
      ]),
    ).toMatchObject({ title: 'Breaking Bad', mediaType: 'tv', year: undefined });
  });

  it('uses the heading disambiguator for the year and strips it from the title', () => {
    expect(page('en', 'Dune (2021 film)', [])).toMatchObject({
      title: 'Dune',
      year: 2021,
      mediaType: 'movie',
    });
    expect(page('fr', 'Fargo (série télévisée)', [])).toMatchObject({
      title: 'Fargo',
      mediaType: 'tv',
    });
  });
});

describe('wikipediaDetector.extract — not films', () => {
  it('ignores a person whose categories mention film', () => {
    expect(
      page(
        'en',
        'Taylor Swift',
        ['1989 births', 'American film actresses', 'Film directors from Pennsylvania'],
        '<tr><th>Genres</th><td>Pop</td></tr><tr><th>Starring</th><td>x</td></tr>',
      ),
    ).toBeNull();
  });

  it('ignores a director', () => {
    expect(
      page('fr', 'Christopher Nolan', [
        'Réalisateur américain de cinéma',
        'Naissance en juillet 1970',
      ]),
    ).toBeNull();
  });

  it('ignores a novel adapted into a film', () => {
    expect(
      page('en', 'Dune (novel)', [
        '1965 American novels',
        'Science fiction novels adapted into films',
      ]),
    ).toBeNull();
  });

  it('ignores an album whose infobox has a genre', () => {
    expect(
      page('en', '1989 (album)', ['2014 albums'], '<tr><th>Genre</th><td>Pop</td></tr>'),
    ).toBeNull();
  });
});
