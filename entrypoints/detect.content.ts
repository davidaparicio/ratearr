import { getDetector } from '../detectors/registry';
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
      if (!detector?.matches(url)) return;

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
        }
      }, 300);
    }

    function sendDetection(query: TitleQuery) {
      browser.runtime.sendMessage({ kind: 'title-detected', query }).catch(() => {});
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
