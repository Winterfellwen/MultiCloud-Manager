(function () {
  var params = new URLSearchParams(location.search);
  window.IS_EMBEDDED =
    params.get('embedded') === '1' || window.__wxjs_environment === 'miniprogram';

  function isMobileLayout() {
    return window.IS_EMBEDDED || (window.innerWidth > 0 && window.innerWidth <= 767);
  }

  function applyLayout() {
    document.documentElement.classList.toggle('embedded', window.IS_EMBEDDED);
    document.documentElement.classList.toggle('mobile-layout', isMobileLayout());
  }

  window.embeddedHref = function (u) {
    if (!window.IS_EMBEDDED) return u;
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'embedded=1';
  };

  applyLayout();
  window.addEventListener('resize', applyLayout);
})();
