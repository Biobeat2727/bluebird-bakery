/* Small page behaviours that depend on the bakery's local time, plus the
   not-yet-connected contact form. Classic script on purpose: it has to mark
   today's column as a perch before the bird (a deferred module) goes looking. */
(function () {
  var OPEN = 8, CLOSE = 15;   // 8am to 3pm, every day

  // The bakery's clock, not the visitor's.
  var day = null, hour = null;
  try {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', weekday: 'long', hour: 'numeric', hour12: false,
    }).formatToParts(new Date());
    parts.forEach(function (p) {
      if (p.type === 'weekday') day = p.value;
      if (p.type === 'hour') hour = Number(p.value) % 24;
    });
  } catch (e) { /* leave the static text in place */ }

  var status = document.getElementById('openStatus');
  if (status && hour !== null) {
    status.textContent = hour >= OPEN && hour < CLOSE
      ? 'Open now until 3'
      : 'Closed now. Open daily 8 to 3';
  }

  var today = day && document.querySelector('.week [data-day="' + day + '"]');
  if (today) {
    today.classList.add('today');
    today.setAttribute('aria-current', 'date');
    today.querySelector('.label').textContent = 'Today, ' + day;
    today.setAttribute('data-perch', '');
    today.setAttribute('data-perch-at', '0.72');
    today.setAttribute('data-perch-face', 'left');
  }

  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      document.getElementById('formNote').textContent =
        "This form isn't connected yet. For now, call (208) 265-8730.";
    });
  }
})();
