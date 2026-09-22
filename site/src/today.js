/* Small page behaviours: open status and today's bread on the bakery's local
   time, and the contact form. Classic script on purpose: it has to mark
   today's column as a perch before the bird (a deferred module) goes looking. */
(function () {
  var OPEN = 8, CLOSE = 15;   // 8am to 3pm, every day

  /* Days the bakery is shut, as 'YYYY-MM-DD': 'why'. The top bar and today's
     column in the bread schedule both say so. Add holidays here. */
  var CLOSED = {
    // '2026-12-25': 'Christmas',
  };

  // The bakery's clock, not the visitor's.
  var day = null, hour = null, date = null;
  try {
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', weekday: 'long', hour: 'numeric', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    day = parts.weekday;
    hour = Number(parts.hour) % 24;
    date = parts.year + '-' + parts.month + '-' + parts.day;
  } catch (e) { /* leave the static text in place */ }

  var closedToday = date && CLOSED[date];

  var status = document.getElementById('openStatus');
  if (status && hour !== null) {
    if (closedToday) status.textContent = 'Closed today for ' + closedToday;
    else if (hour < OPEN) status.textContent = 'Opens today at 8';
    else if (hour < CLOSE) status.textContent = 'Open now until 3';
    else status.textContent = 'Opens tomorrow at 8';
  }

  var today = day && document.querySelector('.week [data-day="' + day + '"]');
  if (today) {
    today.classList.add('today');
    today.setAttribute('aria-current', 'date');
    today.querySelector('.label').textContent = 'Today, ' + day;
    if (closedToday) {
      var breads = today.querySelector('p:last-child');
      breads.className = 'quiet';
      breads.textContent = 'Closed for ' + closedToday;
    }
    today.setAttribute('data-perch', '');
    today.setAttribute('data-perch-at', '0.5');   // the gap between day and breads
    today.setAttribute('data-perch-face', 'left');
  }

  /* ---- contact form ----
     Stays hidden, with the call-us fallback in its place, until the markup gives
     it a data-endpoint to post to. */
  var form = document.getElementById('contactForm');
  var endpoint = form && form.getAttribute('data-endpoint');
  if (!form || !endpoint) return;

  form.hidden = false;
  document.getElementById('contactFallback').hidden = true;

  var note = document.getElementById('formNote');
  var button = form.querySelector('button[type="submit"]');
  var fields = ['name', 'email', 'message'].map(function (n) { return form.elements[n]; });
  var sending = false;

  function problemWith(field) {
    var value = field.value.trim();
    if (!value) return true;
    return field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function mark(field, bad) {
    var error = document.getElementById(field.id + '-err');
    field.setAttribute('aria-invalid', bad ? 'true' : 'false');
    error.hidden = !bad;
    if (bad && field.type === 'email') {
      error.textContent = field.value.trim()
        ? "That email doesn't look right. Check it for a typo."
        : 'Add your email so we can reply.';
    }
  }

  // Errors clear as soon as the field is fixed, but only appear on submit.
  fields.forEach(function (field) {
    field.addEventListener('input', function () {
      if (field.getAttribute('aria-invalid') === 'true' && !problemWith(field)) mark(field, false);
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    var firstBad = null;
    fields.forEach(function (field) {
      var bad = problemWith(field);
      mark(field, bad);
      if (bad && !firstBad) firstBad = field;
    });
    if (firstBad) { firstBad.focus(); return; }

    if (form.elements.website.value) { form.reset(); return; }   // honeypot tripped

    var data = {};
    fields.forEach(function (field) { data[field.name] = field.value.trim(); });

    sending = true;
    button.disabled = true;
    button.textContent = 'Sending';
    note.textContent = '';

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    }).then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      note.textContent = "Sent. We'll reply by email, so check your junk folder too.";
    }).catch(function () {
      // Keep what they typed so they can try again.
      note.textContent = "That didn't send. Try again, or call (208) 265-8730.";
    }).then(function () {
      sending = false;
      button.disabled = false;
      button.textContent = 'Send message';
    });
  });
})();
