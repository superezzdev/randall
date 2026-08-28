import { useState, useEffect, Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/Home";
const About = lazy(() => import("./pages/About"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Safety = lazy(() => import("./pages/Safety"));
const Contact = lazy(() => import("./pages/Contact"));
const VideoChat = lazy(() => import("./components/VideoChat"));

function App() {
  const [isChatting, setIsChatting] = useState(false);
  const [interests, setInterests] = useState([]);
  const [mode, setMode] = useState('video');
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (isChatting) return;

    const wsUrl = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'userCount') {
          setOnlineCount(data.count);
        }
      } catch (e) {
        console.error("Error parsing websocket message", e);
      }
    };

    return () => {
      ws.close();
    };
  }, [isChatting]);

  const handleStart = ({ interests: tags, mode: selectedMode }) => {
    setInterests(tags);
    setMode(selectedMode);
    setIsChatting(true);
  };

  return (
    <div className="w-full min-h-screen bg-xblack font-sans">
      {isChatting ? (
        <Suspense fallback={<div className="w-full min-h-screen flex items-center justify-center text-white bg-xblack">Loading...</div>}>
          <VideoChat interests={interests} mode={mode} onQuit={() => setIsChatting(false)} />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="w-full min-h-screen flex items-center justify-center text-white bg-xblack">Loading...</div>}>
          <Routes>
            <Route path="/" element={<Home onlineCount={onlineCount} onStart={handleStart} />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/safety" element={<Safety />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </Suspense>
      )}
    </div>
  );
}

export default App;
