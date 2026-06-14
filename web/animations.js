(function() {
  'use strict';
  if (typeof anime === 'undefined') return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var EASE = 'easeOutCubic';
  var EASE_BOUNCE = 'easeOutBack';

  // Animate a set of elements with stagger
  function staggerIn(selector, opts) {
    var els = document.querySelectorAll(selector);
    if (!els.length) return;
    anime(Object.assign({
      targets: els,
      opacity: [0, 1],
      translateY: [24, 0],
      scale: [0.97, 1],
      duration: 400,
      delay: anime.stagger(60),
      easing: EASE
    }, opts || {}));
  }

  // Animate a single element entrance
  function fadeIn(el, opts) {
    if (!el) return;
    anime(Object.assign({
      targets: el,
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 350,
      easing: EASE
    }, opts || {}));
  }

  // ====== Page transitions ======
  var _origShowPage;
  if (window.showPage) {
    _origShowPage = window.showPage;
    window.showPage = function(page) {
      _origShowPage(page);
      var id = '#page-' + page;
      var pg = document.querySelector(id);
      if (pg) {
        pg.style.opacity = '0';
        pg.style.transform = 'translateY(12px)';
        anime({
          targets: pg,
          opacity: [0, 1],
          translateY: [12, 0],
          duration: 300,
          easing: EASE,
          complete: function() {
            pg.style.opacity = '';
            pg.style.transform = '';
          }
        });
      }
      // Stagger cards inside the page
      setTimeout(function() {
        staggerIn('' + id + ' .stat-card', { delay: anime.stagger(80) });
        staggerIn('' + id + ' .quick-card', { delay: anime.stagger(60) });
        staggerIn('' + id + ' .resource-card', { delay: anime.stagger(50) });
        staggerIn('' + id + ' .account-card', { delay: anime.stagger(60) });
        staggerIn('' + id + ' .member-card', { delay: anime.stagger(70) });
        staggerIn('' + id + ' .template-card', { delay: anime.stagger(60) });
      }, 100);
    };
  }

  // ====== Toast ======
  var _origShowToast;
  if (window.showToast) {
    _origShowToast = window.showToast;
    window.showToast = function(msg) {
      _origShowToast(msg);
      var el = document.getElementById('toast');
      if (el && el.classList.contains('show')) {
        anime.remove(el);
        el.style.opacity = '';
        el.style.transform = '';
        anime({
          targets: el,
          opacity: [0, 1],
          translateX: [80, 0],
          scale: [0.9, 1],
          duration: 350,
          easing: EASE_BOUNCE
        });
      }
    };
  }

  // ====== Theme toggle ======
  var _origToggleTheme;
  if (window.toggleTheme) {
    _origToggleTheme = window.toggleTheme;
    window.toggleTheme = function() {
      _origToggleTheme();
      var btns = document.querySelectorAll('.theme-btn, .topbar-action-btn');
      btns.forEach(function(btn) {
        anime({
          targets: btn,
          rotate: [0, 360],
          scale: [1, 1.15, 1],
          duration: 500,
          easing: EASE_BOUNCE
        });
      });
    };
  }

  // ====== Modal hooks ======
  // Wrap all modal openers to add animation
  var modalFns = ['openAIConfig','openPasswordModal','openInviteModal','openResetPwModal','openEditMemberModal','openUploadModal'];
  modalFns.forEach(function(fnName) {
    if (window[fnName]) {
      var orig = window[fnName];
      window[fnName] = function() {
        orig.apply(this, arguments);
        // The modal overlay will be .active after the original call
        requestAnimationFrame(function() {
          var overlays = document.querySelectorAll('.modal-overlay.active');
          overlays.forEach(function(ov) {
            var box = ov.querySelector('[class*="modal"], .modal-box, .modal-content, .modal');
            if (box) {
              box.style.opacity = '0';
              box.style.transform = 'scale(0.92) translateY(20px)';
              anime({
                targets: box,
                opacity: [0, 1],
                scale: [0.92, 1],
                translateY: [20, 0],
                duration: 350,
                easing: EASE_BOUNCE
              });
            }
          });
        });
      };
    }
  });

  // ====== Chat message animation ======
  // Only animate on initial page load, not during streaming
  var _initialChatAnimated = false;
  var chatObserver = new MutationObserver(function(mutations) {
    if (_initialChatAnimated) return; // Skip after initial load
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(n) {
        if (n.nodeType === 1) {
          var msg = n.closest ? n.closest('.msg') : null;
          if (!msg) msg = n.classList && n.classList.contains('msg') ? n : null;
          if (!msg) return;
          if (msg.classList.contains('user')) {
            fadeIn(msg, { translateX: [40, 0] });
          } else if (msg.classList.contains('agent')) {
            fadeIn(msg, { translateX: [-40, 0] });
          } else {
            fadeIn(msg);
          }
        }
      });
    });
    _initialChatAnimated = true;
  });
  var chatEl = document.getElementById('chatMessages');
  if (chatEl) {
    chatObserver.observe(chatEl, { childList: true, subtree: true });
  }

  // ====== Hover effects ======
  function initHover() {
    // Nav items
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('mouseenter', function() {
        anime({
          targets: item,
          translateX: [0, 6],
          backgroundColor: 'rgba(255,255,255,0.06)',
          duration: 200,
          easing: EASE
        });
      });
      item.addEventListener('mouseleave', function() {
        anime({
          targets: item,
          translateX: [6, 0],
          backgroundColor: 'rgba(255,255,255,0)',
          duration: 200,
          easing: EASE
        });
      });
    });

    // Buttons
    document.querySelectorAll('button, .btn, [role="button"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        anime({
          targets: btn,
          scale: [1, 0.95, 1],
          duration: 250,
          easing: EASE_BOUNCE
        });
      });
    });

    // Quick cards
    document.querySelectorAll('.quick-card').forEach(function(card) {
      card.addEventListener('mouseenter', function() {
        anime({
          targets: card,
          scale: 1.03,
          translateY: -4,
          boxShadow: ['0 2px 8px rgba(0,0,0,0.15)', '0 8px 25px rgba(0,0,0,0.25)'],
          duration: 200,
          easing: EASE
        });
      });
      card.addEventListener('mouseleave', function() {
        anime({
          targets: card,
          scale: 1,
          translateY: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          duration: 200,
          easing: EASE
        });
      });
    });
  }

  // ====== Theme helper: animate theme transition ======
  var htmlEl = document.documentElement;
  var themeObserver = new MutationObserver(function() {
    var isLight = htmlEl.classList.contains('light');
    var bg = isLight ? '#ffffff' : '#0c0c0e';
    anime({
      targets: htmlEl,
      backgroundColor: bg,
      duration: 300,
      easing: EASE
    });
  });
  themeObserver.observe(htmlEl, { attributeFilter: ['class'] });

  // ====== Nav active indicator ======
  var navObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var item = m.target;
        if (item.classList.contains('nav-item') && item.classList.contains('active')) {
          anime({
            targets: item,
            translateX: [0, 6],
            duration: 250,
            easing: EASE
          });
        }
      }
    });
  });
  document.querySelectorAll('.nav-item').forEach(function(item) {
    navObserver.observe(item, { attributes: true, attributeFilter: ['class'] });
  });

  // ====== Init ======
  function init() {
    // Entrance animations for initial visible page
    var activePage = document.querySelector('.page.active');
    if (activePage) {
      staggerIn('#' + activePage.id + ' .stat-card');
      staggerIn('#' + activePage.id + ' .quick-card');
    }
    // Sidebar nav entrance
    staggerIn('.nav-item', {
      translateX: [-20, 0],
      delay: anime.stagger(40)
    });

    initHover();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
