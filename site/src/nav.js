/* Getting round a long one-page site.
   Desktop: a slim bar that slides down whenever you scroll back up, once the
   header is out of view, and slides away again as you read on.
   Phones: the menu button at the bottom right opens a list to jump to.
   Both mark the section you're in. */
(function () {
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- which section is on screen ----
     The last section whose top has passed 35% of the way down the screen.
     Partners belongs to the story; special orders only has a phone-list entry. */
  var SECTIONS = ['bake', 'kitchen', 'coffee', 'story', 'partners', 'order', 'visit'];
  var OWNER = { partners: 'story' };
  var marked = [].slice.call(document.querySelectorAll('[data-section]'));
  var current = null;

  function currentSection() {
    var line = innerHeight * 0.35, found = null;
    SECTIONS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < line) found = OWNER[id] || id;
    });
    return found;
  }

  function markCurrent() {
    var now = currentSection();
    if (now === current) return;
    current = now;
    marked.forEach(function (a) {
      if (a.dataset.section === now) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }

  /* ---- desktop bar ---- */
  var bar = document.querySelector('.stickybar');
  var header = document.querySelector('.header');
  var lastY = scrollY, shown = false;

  function showBar(on) {
    if (on === shown) return;
    shown = on;
    bar.classList.toggle('is-shown', on);
    if (on) bar.removeAttribute('inert'); else bar.setAttribute('inert', '');
  }

  function onScroll() {
    var y = scrollY, dy = y - lastY;
    var pastHeader = header.getBoundingClientRect().bottom < 0;
    if (!pastHeader) showBar(false);
    else if (dy < -6) showBar(true);        // heading back up: they're looking for something
    else if (dy > 6) showBar(false);        // reading on: get out of the way
    if (Math.abs(dy) > 6 || !pastHeader) lastY = y;
    markCurrent();
  }

  var ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; onScroll(); });
  }, { passive: true });
  addEventListener('resize', markCurrent);
  markCurrent();

  // A click in the bar scrolls down to the section; keep the bar out of the way.
  bar.addEventListener('click', function (e) {
    if (e.target.closest('a[href^="#"]')) showBar(false);
  });

  /* ---- phone sections sheet ---- */
  var sheet = document.getElementById('sectionSheet');
  var toggle = document.querySelector('.quickbar-menu');
  var panel = sheet.querySelector('.sheet-panel');

  function focusables() {
    return [].slice.call(panel.querySelectorAll('a[href], button'));
  }

  function openSheet() {
    sheet.hidden = false;
    document.documentElement.classList.add('sheet-open');
    toggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { sheet.classList.add('is-open'); });
    });
    var here = panel.querySelector('[aria-current]') || focusables()[0];
    here.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey);
  }

  function closeSheet(returnFocus) {
    if (sheet.hidden) return;
    sheet.classList.remove('is-open');
    document.documentElement.classList.remove('sheet-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey);
    if (returnFocus) toggle.focus({ preventScroll: true });
    var done = function () { if (!sheet.classList.contains('is-open')) sheet.hidden = true; };
    if (reduced.matches) done();
    else setTimeout(done, 280);
  }

  function onKey(e) {
    if (e.key === 'Escape') { closeSheet(true); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  toggle.addEventListener('click', function () {
    if (sheet.hidden) openSheet(); else closeSheet(true);
  });
  sheet.addEventListener('click', function (e) {
    if (e.target.closest('[data-sheet-close]')) closeSheet(true);
    else if (e.target.closest('a[href^="#"]')) closeSheet(false);   // the link does the jump
  });
  // Rotating to landscape or widening past the phone layout closes it.
  matchMedia('(max-width: 800px)').addEventListener('change', function (m) {
    if (!m.matches) closeSheet(false);
  });
})();
