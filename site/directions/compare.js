// Comparison chrome for the direction studies: a switcher and a labels toggle.
const pages = [
  ['a.html', 'A · Morning case'],
  ['b.html', 'B · Formal shopfront'],
  ['c.html', "C · Baker's hand"],
];
const here = location.pathname.split('/').pop() || 'a.html';

function readTags() {
  try { return localStorage.getItem('bb-tags') !== 'off'; } catch { return true; }
}
function writeTags(on) {
  try { localStorage.setItem('bb-tags', on ? 'on' : 'off'); } catch { /* private mode */ }
}

const bar = document.createElement('div');
bar.className = 'compare';
bar.innerHTML = pages.map(([href, label]) =>
  `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`).join('')
  + '<span class="sep"></span><button type="button" id="tagBtn"></button>';
document.body.appendChild(bar);

const btn = bar.querySelector('#tagBtn');
function apply(on) {
  document.body.classList.toggle('show-tags', on);
  btn.textContent = on ? 'Labels: on' : 'Labels: off';
}
apply(readTags());
btn.onclick = () => {
  const on = !document.body.classList.contains('show-tags');
  apply(on);
  writeTags(on);
};
