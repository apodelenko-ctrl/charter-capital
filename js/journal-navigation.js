(function () {
  'use strict';
  var bar = document.getElementById('topbar');
  if (!bar) return;
  var nav = bar.querySelector('.topbar-nav');
  var toggle = bar.querySelector('.menu-toggle');
  var dropdowns = Array.prototype.slice.call(bar.querySelectorAll('.nav-dd'));
  function setDropdown(dropdown, open) {
    dropdown.classList.toggle('is-open', open);
    dropdown.querySelector('.nav-dd-btn').setAttribute('aria-expanded', String(open));
  }
  function closeDropdowns(except) {
    dropdowns.forEach(function (dropdown) {
      if (dropdown !== except) setDropdown(dropdown, false);
    });
  }
  function closeMobile() {
    nav.classList.remove('is-mobile-open');
    toggle.setAttribute('aria-expanded', 'false');
    closeDropdowns();
  }
  toggle.addEventListener('click', function () {
    var open = !nav.classList.contains('is-mobile-open');
    nav.classList.toggle('is-mobile-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) closeDropdowns();
  });
  dropdowns.forEach(function (dropdown) {
    var button = dropdown.querySelector('.nav-dd-btn');
    var links = Array.prototype.slice.call(dropdown.querySelectorAll('.nav-dd-menu a'));
    button.addEventListener('click', function () {
      var open = !dropdown.classList.contains('is-open');
      closeDropdowns(dropdown);
      setDropdown(dropdown, open);
    });
    button.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        closeDropdowns(dropdown);
        setDropdown(dropdown, true);
        links[event.key === 'ArrowDown' ? 0 : links.length - 1].focus();
      }
    });
    dropdown.addEventListener('keydown', function (event) {
      var index = links.indexOf(document.activeElement);
      if (event.key === 'Escape' && dropdown.classList.contains('is-open')) {
        event.preventDefault();
        event.stopPropagation();
        setDropdown(dropdown, false);
        button.focus();
      } else if (index >= 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) >= 0) {
        event.preventDefault();
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links[next].focus();
      }
    });
    dropdown.addEventListener('focusout', function (event) {
      if (!dropdown.contains(event.relatedTarget)) setDropdown(dropdown, false);
    });
  });
  document.addEventListener('click', function (event) {
    if (!bar.contains(event.target)) closeMobile();
    else if (event.target.closest('a[href]')) closeMobile();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && nav.classList.contains('is-mobile-open')) {
      closeMobile();
      toggle.focus();
    } else if (event.key === 'Escape') closeDropdowns();
  });
  window.matchMedia('(max-width:1100px)').addEventListener('change', closeMobile);
})();
