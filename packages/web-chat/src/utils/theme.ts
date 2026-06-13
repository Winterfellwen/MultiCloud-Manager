export function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark'
  document.documentElement.className = saved === 'light' ? 'light' : ''
  return saved
}

export function toggleTheme(): string {
  const isLight = document.documentElement.classList.toggle('light')
  const theme = isLight ? 'light' : 'dark'
  localStorage.setItem('theme', theme)
  return theme
}

export function getTheme(): string {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}
