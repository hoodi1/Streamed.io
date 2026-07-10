import React, { useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import StreamerScreen from './screens/StreamerScreen.jsx';
import ViewerScreen from './screens/ViewerScreen.jsx';

export default function App() {
  const [screen, setScreen] = useState('home');
  return (
    <div className="app-root">
      <TitleBar />
      <main className="app-content">
        {screen === 'home'     && <HomeScreen    onStreamer={() => setScreen('streamer')} onViewer={() => setScreen('viewer')} />}
        {screen === 'streamer' && <StreamerScreen onBack={() => setScreen('home')} />}
        {screen === 'viewer'   && <ViewerScreen   onBack={() => setScreen('home')} />}
      </main>
    </div>
  );
}
