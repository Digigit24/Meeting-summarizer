import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Popup from './popup/Popup.jsx'

// Mock Chrome API for development in standard browser
if (!window.chrome || !window.chrome.storage) {
  window.chrome = {
    ...window.chrome,
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: (msg, cb) => { 
        console.log("Mock sendMessage:", msg); 
        if(cb) cb({success: true}); 
        return true; 
      },
      id: 'mock-id',
      getManifest: () => ({ version: '1.0.0' })
    },
    storage: {
      local: {
        get: (keys, cb) => {
            console.log("Mock storage get:", keys);
            cb({});
        },
        set: (data, cb) => { 
            console.log("Mock storage set:", data); 
            if(cb) cb(); 
        }
      }
    }
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="flex justify-center items-center min-h-screen bg-gray-800">
        <Popup />
    </div>
  </StrictMode>,
)
