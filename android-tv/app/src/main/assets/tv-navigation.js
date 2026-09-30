(function () {
  if (window.TorrTvNav && window.TorrTvNav.version === 2) {
    window.TorrTvNav.refresh();
    return;
  }

  var style = document.createElement('style');
  style.id = 'torr-tv-focus-style';
  style.textContent =
    '.torr-tv-focused{outline:3px solid #fff!important;outline-offset:4px!important;' +
    'position:relative;z-index:2;}' +
    'video{visibility:hidden!important;}';
  document.head.appendChild(style);

  var selector = 'a[href],button,input,select,textarea,summary,[role="button"],[role="menuitem"],[tabindex="0"]';

  function visible(element) {
    if (!element || element.disabled || element.closest('[aria-hidden="true"],[hidden]')) return false;
    var rect = element.getBoundingClientRect();
    var css = window.getComputedStyle(element);
    return rect.width >= 8 && rect.height >= 8 && css.display !== 'none' &&
      css.visibility !== 'hidden' && Number(css.opacity || 1) > 0.05;
  }

  function activeScope() {
    var dialogs = document.querySelectorAll('[role="dialog"],.MuiDialog-root');
    for (var i = dialogs.length - 1; i >= 0; i--) {
      if (visible(dialogs[i])) return dialogs[i];
    }
    return document;
  }

  function promoteHeaderControls(scope) {
    if (scope !== document) return;
    var limit = Math.max(150, window.innerHeight * 0.14);
    var nodes = document.querySelectorAll('div,span');
    for (var i = 0; i < nodes.length; i++) {
      var element = nodes[i];
      if (element.matches(selector)) continue;
      var rect = element.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > limit || rect.width < 28 || rect.width > 96 ||
          rect.height < 28 || rect.height > 96) continue;
      if (window.getComputedStyle(element).cursor !== 'pointer') continue;
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('data-torr-tv-promoted', 'header');
    }
  }

  function candidates() {
    var scope = activeScope();
    promoteHeaderControls(scope);
    return Array.prototype.filter.call(scope.querySelectorAll(selector), visible);
  }

  function mark(element) {
    var old = document.querySelectorAll('.torr-tv-focused');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('torr-tv-focused');
    if (!element) return false;
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
    element.focus({preventScroll: true});
    element.classList.add('torr-tv-focused');
    element.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'auto'});
    return true;
  }

  function current() {
    var scope = activeScope();
    if (visible(document.activeElement) && document.activeElement.matches(selector) && document.activeElement !== document.body &&
        (scope === document || scope.contains(document.activeElement))) return document.activeElement;
    var list = candidates();
    return list.length ? list[0] : null;
  }

  function move(direction) {
    var from = current();
    if (!from) return false;
    var a = from.getBoundingClientRect();
    var ax = a.left + a.width / 2;
    var ay = a.top + a.height / 2;
    var topBandLimit = Math.max(150, window.innerHeight * 0.14);
    var stayInTopBand = ay < topBandLimit && (direction === 'left' || direction === 'right');
    var best = null;
    var bestScore = Number.MAX_VALUE;
    var list = candidates();
    for (var i = 0; i < list.length; i++) {
      var element = list[i];
      if (element === from) continue;
      var b = element.getBoundingClientRect();
      var bx = b.left + b.width / 2;
      var by = b.top + b.height / 2;
      if (stayInTopBand && by >= topBandLimit) continue;
      var dx = bx - ax;
      var dy = by - ay;
      var primary;
      var secondary;
      if (direction === 'left' && dx < -6) { primary = -dx; secondary = Math.abs(dy); }
      else if (direction === 'right' && dx > 6) { primary = dx; secondary = Math.abs(dy); }
      else if (direction === 'up' && dy < -6) { primary = -dy; secondary = Math.abs(dx); }
      else if (direction === 'down' && dy > 6) { primary = dy; secondary = Math.abs(dx); }
      else continue;
      var score = primary + secondary * 2.4 + (secondary > primary * 1.8 ? 10000 : 0);
      if (score < bestScore) { bestScore = score; best = element; }
    }
    return mark(best || from);
  }

  function enter() {
    var element = current();
    if (!element) return false;
    mark(element);
    element.click();
    return true;
  }

  document.addEventListener('focusin', function (event) {
    if (event.target.matches(selector) && visible(event.target) &&
        !event.target.classList.contains('torr-tv-focused')) mark(event.target);
  });

  function findCloseButton(dialog) {
    if (!dialog) return null;
    var buttons = dialog.querySelectorAll('button,[role="button"]');
    for (var i = buttons.length - 1; i >= 0; i--) {
      var label = ((buttons[i].getAttribute('aria-label') || '') + ' ' +
        (buttons[i].getAttribute('title') || '') + ' ' + (buttons[i].textContent || '')).toLowerCase();
      if (/close|cancel|back|закры|отмен/.test(label)) return buttons[i];
    }
    return null;
  }

  function back() {
    var dialogs = document.querySelectorAll('[role="dialog"],.MuiDialog-root');
    for (var i = dialogs.length - 1; i >= 0; i--) {
      if (!visible(dialogs[i])) continue;
      var close = findCloseButton(dialogs[i]);
      if (close) { close.click(); return true; }
    }
    var pageBack = document.querySelector('[data-cinema-back]');
    if (visible(pageBack)) { pageBack.click(); return true; }
    return false;
  }

  function absoluteUrl(value) {
    try { return new URL(value, window.location.href).toString(); } catch (e) { return ''; }
  }

  function isStream(value) {
    return /\/offline\/stream\//.test(value) || /\/play\//.test(value) ||
      (/\/stream/.test(value) && /[?&]play(?:[=&]|$)/.test(value));
  }

  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node !== document.body && !node.href) node = node.parentElement;
    if (!node || !node.href) return;
    var url = absoluteUrl(node.href);
    if (!isStream(url)) return;
    event.preventDefault();
    event.stopPropagation();
    AndroidTorrServer.play(url, document.title || 'TorrServer');
  }, true);

  function inspectVideos(root) {
    var videos = root.querySelectorAll ? root.querySelectorAll('video') : [];
    for (var i = 0; i < videos.length; i++) {
      var video = videos[i];
      if (video.dataset.torrTvHandled === '1') continue;
      var source = video.currentSrc || video.src;
      if (!source) {
        var child = video.querySelector('source[src]');
        source = child ? child.src : '';
      }
      source = absoluteUrl(source);
      if (!isStream(source)) continue;
      video.dataset.torrTvHandled = '1';
      video.pause();
      AndroidTorrServer.log('intercept video');
      AndroidTorrServer.play(source, document.title || 'TorrServer');
    }
  }

  function suppressTvNoise() {
    var nodes = document.querySelectorAll('.MuiSnackbar-root,[class*="MuiSnackbar"]');
    for (var i = 0; i < nodes.length; i++) {
      var text = (nodes[i].textContent || '').toLowerCase();
      if (/want to donate|support|поддержать/.test(text)) nodes[i].style.display = 'none';
    }
  }

  var observer = new MutationObserver(function (mutations) {
    inspectVideos(document);
    suppressTvNoise();
    var focused = document.querySelector('.torr-tv-focused');
    var scope = activeScope();
    if (!focused || !visible(focused) || (scope !== document && !scope.contains(focused))) mark(current());
  });
  observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'disabled', 'hidden']});

  window.TorrTvNav = {
    version: 2,
    left: function () { return move('left'); },
    right: function () { return move('right'); },
    up: function () { return move('up'); },
    down: function () { return move('down'); },
    enter: enter,
    back: back,
    refresh: function () { suppressTvNoise(); inspectVideos(document); return mark(current()); }
  };
  window.setTimeout(function () { window.TorrTvNav.refresh(); }, 500);
})();
