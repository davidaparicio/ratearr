import { getDetector } from '../detectors/registry';
import type { Msg } from '../utils/messages';
import type { TitleQuery } from '../utils/types';

export default defineContentScript({
  matches: [
    '*://*.imdb.com/title/*',
    '*://www.allocine.fr/film/*',
    '*://www.allocine.fr/series/*',
    '*://www.themoviedb.org/movie/*',
    '*://www.themoviedb.org/tv/*',
    '*://www.netflix.com/title/*',
    '*://www.primevideo.com/detail/*',
    '*://www.disneyplus.com/movies/*',
    '*://www.disneyplus.com/series/*',
    '*://letterboxd.com/film/*',
    '*://www.senscritique.com/film/*',
    '*://www.senscritique.com/serie/*',
    '*://en.wikipedia.org/wiki/*',
    '*://fr.wikipedia.org/wiki/*',
    '*://es.wikipedia.org/wiki/*',
    '*://de.wikipedia.org/wiki/*',
    '*://it.wikipedia.org/wiki/*',
  ],
  main() {
    let lastUrl = location.href;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let activePoll: ReturnType<typeof setInterval> | undefined;

    function detect() {
      clearInterval(activePoll);
      activePoll = undefined;

      const url = new URL(location.href);
      const detector = getDetector(url.hostname);
      if (!detector?.matches(url)) {
        // e.g. an in-site navigation from a title to a listing page
        clearDetection();
        return;
      }

      const query = detector.extract(document, url);
      if (query) {
        sendDetection(query);
        return;
      }

      // JSON-LD may mount late on SPAs — poll up to ~3s
      let attempts = 0;
      activePoll = setInterval(() => {
        attempts++;
        const result = detector.extract(document, url);
        if (result) {
          clearInterval(activePoll);
          activePoll = undefined;
          sendDetection(result);
        } else if (attempts >= 10) {
          clearInterval(activePoll);
          activePoll = undefined;
          clearDetection();
        }
      }, 300);
    }

    // Whether the panel currently shows a title this script detected; only then
    // is there anything to clear (and a context-menu lookup is left alone).
    let hasDetection = false;

    function sendDetection(query: TitleQuery) {
      hasDetection = true;
      browser.runtime.sendMessage({ kind: 'title-detected', query } satisfies Msg).catch(() => {});
    }

    function clearDetection() {
      if (!hasDetection) return;
      hasDetection = false;
      browser.runtime.sendMessage({ kind: 'title-cleared' } satisfies Msg).catch(() => {});
    }

    function onLocationChange() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(detect, 300);
    }

    // Initial detection
    detect();

    // SPA navigation: listen for URL changes via multiple signals
    const observer = new MutationObserver(() => onLocationChange());
    observer.observe(document.querySelector('head') || document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('popstate', () => onLocationChange());

    // Also check periodically for SPA pushState (no event fired)
    setInterval(() => onLocationChange(), 1000);
  },
});
