import React, { useState, useEffect } from 'react';

import History from './History';
import Login from './Login';

export default function Popup() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [recording, setRecording] = useState(false);
  const [meetingName, setMeetingName] = useState('');
  const [pendingUploads, setPendingUploads] = useState(false);
  const [view, setView] = useState('record'); // 'record' | 'history'
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [errorMessage, setErrorMessage] = useState(''); // Error message to display

  useEffect(() => {
    // Check authentication status first
    chrome.storage.local.get(['isAuthenticated'], (result) => {
      setIsAuthenticated(!!result.isAuthenticated);
      setAuthChecked(true);
    });

    // Listener for live updates
    const messageListener = (msg) => {
        if (msg.type === 'UPLOAD_STATUS') {
            setUploadStatus(msg.status);
            if(msg.status === 'success') {
                setTimeout(() => setUploadStatus('idle'), 3000); // Reset after 3s
            }
        }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    chrome.storage.local.get(['recording', 'meetingName', 'pending_uploads'], (result) => {
      if (result.recording) {
        setRecording(true);
        setMeetingName(result.meetingName || '');
      }
      if (result.pending_uploads && result.pending_uploads.length > 0) {
        setPendingUploads(true);
      }
    });

    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    chrome.storage.local.set({ isAuthenticated: false }, () => {
      setIsAuthenticated(false);
    });
  };

  const toggleRecording = async () => {
    if (recording) {
      setRecording(false);
      setErrorMessage(''); // Clear any errors
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING', meetingId: meetingName }); // Pass ID/Name
      chrome.storage.local.set({ recording: false });
    } else {
      const name = meetingName || `Meeting_${new Date().toISOString()}`;
      setRecording(true);
      setErrorMessage(''); // Clear any previous errors
      chrome.storage.local.set({ recording: true, meetingName: name });

      chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        meetingName: name
      }, (response) => {
          if (!response || !response.success) {
              setRecording(false);
              chrome.storage.local.set({ recording: false });

              // Show error message to user
              const error = response?.error || "Failed to start recording. Make sure you're on a Google Meet call!";
              setErrorMessage(error);
              console.error("[Popup] Recording failed:", error);

              // Clear error after 10 seconds
              setTimeout(() => setErrorMessage(''), 10000);
          }
      });
    }
  };


  const forceUpload = () => {
      // Use the current name in input, or fallback to storage
      chrome.storage.local.get(['meetingName'], (result) => {
          const name = result.meetingName || meetingName;
          if(!name) {
              alert("No meeting name found to upload.");
              return;
          }
          setUploadStatus('uploading');
          chrome.runtime.sendMessage({ type: 'STOP_RECORDING', meetingId: name }); 
          // Re-triggering STOP usually performs the upload logic in background
      });
  };

  // Show loading or login screen while checking auth
  if (!authChecked) {
    return (
      <div className="w-[320px] bg-slate-900 text-white min-h-[450px] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Main app UI (only shown if authenticated)
  return (
    <div className="w-[320px] bg-slate-900 text-white min-h-[450px] flex flex-col shadow-xl font-sans">
      {/* Header with logout */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="text-xs text-slate-400">MeetSync AI</div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          title="Logout"
        >
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
          <button
           onClick={() => setView('record')}
           className={`flex-1 py-3 text-sm font-medium ${view === 'record' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>
           Recorder
          </button>
          <button
           onClick={() => setView('history')}
           className={`flex-1 py-3 text-sm font-medium ${view === 'history' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>
           History
          </button>
      </div>

      {view === 'record' ? (
        <div className="flex-1 flex flex-col items-center p-5">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-6">
                MeetSync AI
            </h1>

            {/* Status Feedback */}
            {errorMessage && (
                <div className="w-full mb-4 bg-red-500/20 text-red-300 text-xs px-3 py-2 rounded border border-red-500/40">
                    <div className="font-semibold mb-1">❌ Error</div>
                    <div>{errorMessage}</div>
                </div>
            )}
            {uploadStatus === 'uploading' && (
                <div className="w-full mb-4 bg-blue-500/20 text-blue-300 text-xs px-3 py-2 rounded flex items-center justify-center animate-pulse border border-blue-500/40">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Uploading & Processing...
                </div>
            )}
            {uploadStatus === 'success' && (
                <div className="w-full mb-4 bg-green-500/20 text-green-300 text-xs px-3 py-2 rounded flex items-center justify-center border border-green-500/40">
                    ✅ Upload Complete!
                </div>
            )}
            
            <div className="w-full mb-6">
                <label className="text-xs text-slate-400 mb-1 block ml-1 uppercase tracking-wide">Meeting Name</label>
                <input
                type="text"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-slate-500 transition-all"
                placeholder="Ex: Q4 Roadmap Review"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                disabled={recording}
                />
            </div>

            <button
                onClick={toggleRecording}
                className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all transform hover:scale-105 active:scale-95 ${
                recording
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                    : 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 shadow-blue-500/30'
                }`}
            >
                {recording ? '■' : '●'}
            </button>
            
            <div className="mt-6 text-center">
                <p className={`text-sm font-medium ${recording ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>
                    {recording ? 'Recording active...' : 'Ready to capture'}
                </p>
                {recording && <p className="text-xs text-slate-500 mt-1">Click Stop to Upload</p>}
            </div>

             {/* Manual Actions Area - ALWAYS VISIBLE FOR DEBUGGING */}
             <div className="mt-auto w-full pt-4 space-y-2 border-t border-slate-800">
                 <p className="text-[10px] text-slate-600 text-center">Debug Controls</p>
                 <button 
                    onClick={forceUpload}
                    className="w-full py-2 bg-slate-800 text-slate-300 text-xs rounded border border-slate-700 hover:bg-slate-700 transition-colors">
                    ☁ Force Sync Last Recording
                </button>
                {pendingUploads && (
                    <button onClick={retryUploads} className="w-full py-2 bg-yellow-600/20 text-yellow-500 text-xs rounded border border-yellow-600/50">
                        ⚠ Retry Pending Uploads
                    </button>
                )}
            </div>
        </div>
      ) : (
          <History />
      )}
    </div>
  );
}
