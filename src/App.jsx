import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import ITSMAgentPlatform from './components/itsm-agent-platform.jsx'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <ITSMAgentPlatform />
    </>
  )
}

export default App
