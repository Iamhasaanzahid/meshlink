/* T LINK theme boot: runs before the stylesheet to avoid a flash of the
 * wrong theme. Kept external (not inline) so the strict `script-src 'self'`
 * Content-Security-Policy still applies. Default is the original dark theme. */
(function () {
  try {
    var stored = localStorage.getItem('meshlink-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f7f4ff' : '#0d0818');
  } catch (_) {
    // Private mode / blocked storage: the markup already defaults to dark.
  }
})();
