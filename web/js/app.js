import state from './state.js';
import { api } from './api.js';
import { Toast } from './components/toast.js';
import { accountsPage } from './pages/accounts.js';

const pages = {
  dashboard: null,
  accounts: accountsPage,
  resources: null,
  sync: null,
  cost: null,
  terminal: null,
  chat: null,
  profile: null,
};

let currentPage = null;

function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) {
    targetPage.classList.remove('hidden');
  }

  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  if (currentPage && currentPage.destroy) {
    currentPage.destroy();
  }

  const pageModule = pages[pageId];
  if (pageModule) {
    pageModule.init();
    currentPage = pageModule;
  }

  state.set('currentPage', pageId);
}

function initApp() {
  const token = localStorage.getItem('token');
  if (!token && !window.location.pathname.includes('login')) {
    window.location.href = '/login.html';
    return;
  }

  api.setToken(token);

  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = item.dataset.page;
      if (pageId) {
        navigateTo(pageId);
      }
    });
  });

  const theme = state.get('theme');
  document.documentElement.setAttribute('data-theme', theme);

  navigateTo('dashboard');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  Toast.error('发生错误，请刷新页面重试');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
});
