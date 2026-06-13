import { useEffect } from 'react'
import { ChatPage } from './components/Chat/ChatPage'
import { initTheme, toggleTheme } from './utils/theme'
import { Sun, Moon } from 'lucide-react'

export default function App() {
  useEffect(() => {
    initTheme()
  }, [])

  return (
    <div className="app">
      <ChatPage />
      <button className="theme-toggle-fixed" onClick={toggleTheme} title="Toggle theme">
        {document.documentElement.classList.contains('light') ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </div>
  )
}
