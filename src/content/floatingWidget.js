// Floating Widget - Always visible on all pages
// Guard against multiple injections
if (!window.meetSyncWidgetInjected) {
  window.meetSyncWidgetInjected = true;

  // State
  let isRecording = false;
  let isDragging = false;
  let currentX, currentY, initialX, initialY;
  let xOffset = 0;
  let yOffset = 0;

  // Create Widget Elements
  function createWidget() {
    // Main container
    const widget = document.createElement('div');
    widget.id = 'meetsync-floating-widget';
    widget.innerHTML = `
      <style>
        #meetsync-floating-widget {
          position: fixed;
          z-index: 999999;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          padding: 12px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          user-select: none;
          transition: box-shadow 0.2s ease;
          min-width: 140px;
        }

        #meetsync-floating-widget:hover {
          box-shadow: 0 12px 32px rgba(102, 126, 234, 0.4);
        }

        #meetsync-floating-widget.dragging {
          cursor: grabbing;
          opacity: 0.8;
        }

        .meetsync-widget-content {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .meetsync-record-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          cursor: pointer !important;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          pointer-events: auto;
        }

        .meetsync-record-btn.idle {
          background: white;
          color: #667eea;
        }

        .meetsync-record-btn.idle:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }

        .meetsync-record-btn.recording {
          background: #ef4444;
          color: white;
          animation: meetsync-pulse 2s infinite;
        }

        .meetsync-record-btn.recording:hover {
          transform: scale(1.1);
        }

        @keyframes meetsync-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .meetsync-status {
          color: white;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }

        .meetsync-timer {
          color: rgba(255, 255, 255, 0.9);
          font-size: 11px;
          margin-top: 2px;
        }

        /* Name Input Modal */
        #meetsync-name-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          z-index: 1000000;
          display: none;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }

        #meetsync-name-modal.active {
          display: flex;
        }

        .meetsync-modal-content {
          background: white;
          border-radius: 16px;
          padding: 24px;
          width: 90%;
          max-width: 400px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }

        .meetsync-modal-title {
          font-size: 18px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .meetsync-modal-input {
          width: 100%;
          padding: 12px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
          transition: border-color 0.2s ease;
          box-sizing: border-box;
        }

        .meetsync-modal-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .meetsync-modal-hint {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 20px;
        }

        .meetsync-modal-buttons {
          display: flex;
          gap: 8px;
        }

        .meetsync-modal-btn {
          flex: 1;
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .meetsync-modal-btn.primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .meetsync-modal-btn.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
        }

        .meetsync-modal-btn.secondary {
          background: #f1f5f9;
          color: #64748b;
        }

        .meetsync-modal-btn.secondary:hover {
          background: #e2e8f0;
        }

        .meetsync-modal-btn.danger {
          background: #fee2e2;
          color: #dc2626;
          border: 1px solid #fca5a5;
        }

        .meetsync-modal-btn.danger:hover {
          background: #fca5a5;
          color: white;
          transform: translateY(-2px);
        }
      </style>

      <div class="meetsync-widget-content">
        <button class="meetsync-record-btn idle" id="meetsync-record-btn">
          <span id="meetsync-btn-icon">●</span>
        </button>
        <div>
          <div class="meetsync-status" id="meetsync-status">Ready</div>
          <div class="meetsync-timer" id="meetsync-timer" style="display: none;">00:00</div>
        </div>
      </div>

      <!-- Name Input Modal -->
      <div id="meetsync-name-modal">
        <div class="meetsync-modal-content">
          <div class="meetsync-modal-title">Name Your Meeting</div>
          <input
            type="text"
            id="meetsync-meeting-name"
            class="meetsync-modal-input"
            placeholder="Enter meeting name..."
          />
          <div class="meetsync-modal-hint">Leave blank for default: Meeting - [Date Time]</div>
          <div class="meetsync-modal-buttons">
            <button class="meetsync-modal-btn danger" id="meetsync-discard-btn">Discard</button>
            <button class="meetsync-modal-btn secondary" id="meetsync-cancel-btn">Cancel</button>
            <button class="meetsync-modal-btn primary" id="meetsync-save-btn">Save & Upload</button>
          </div>
        </div>
      </div>
    `;

    // Load saved position or default to bottom-right
    chrome.storage.local.get(['widgetPosition'], (result) => {
      if (result.widgetPosition) {
        widget.style.left = result.widgetPosition.x + 'px';
        widget.style.top = result.widgetPosition.y + 'px';
      } else {
        // Default position: bottom-right corner
        widget.style.right = '20px';
        widget.style.bottom = '20px';
      }
    });

    document.body.appendChild(widget);

    // Setup event listeners
    setupEventListeners(widget);

    // Check if already recording
    chrome.storage.local.get(['recording', 'recordingStartTime'], (result) => {
      if (result.recording) {
        isRecording = true;
        updateRecordingUI(true, result.recordingStartTime);
      }
    });
  }

  // Setup Event Listeners
  function setupEventListeners(widget) {
    const recordBtn = widget.querySelector('#meetsync-record-btn');
    const nameModal = widget.querySelector('#meetsync-name-modal');
    const nameInput = widget.querySelector('#meetsync-meeting-name');
    const saveBtn = widget.querySelector('#meetsync-save-btn');
    const cancelBtn = widget.querySelector('#meetsync-cancel-btn');
    const discardBtn = widget.querySelector('#meetsync-discard-btn');

    // Record button click - prevent any drag interference
    recordBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation(); // Stop drag from starting
    });

    recordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isRecording) {
        // Stop recording - show name modal
        showNameModal();
      } else {
        // Start recording
        startRecording();
      }
    });

    // Save name and upload
    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || getDefaultMeetingName();
      hideNameModal();
      stopRecording(name);
      nameInput.value = ''; // Clear for next time
    });

    // Cancel
    cancelBtn.addEventListener('click', () => {
      hideNameModal();
      // Resume recording
      updateRecordingUI(true);
    });

    // Discard with double confirmation
    discardBtn.addEventListener('click', () => {
      if (confirm('⚠️ Are you sure you want to discard this recording? This action cannot be undone.')) {
        if (confirm('⚠️ Final confirmation: Delete this recording permanently?')) {
          hideNameModal();
          discardRecording();
        }
      }
    });

    // Dragging - only from the text/status area, not the button
    const statusArea = widget.querySelector('.meetsync-widget-content > div');
    if (statusArea) {
      statusArea.addEventListener('mousedown', dragStart);
      statusArea.addEventListener('touchstart', dragStart);
      statusArea.style.cursor = 'move';
    }

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', dragEnd);
  }

  // Start Recording
  function startRecording() {
    const startTime = Date.now();
    const tempId = `temp_${startTime}`;

    chrome.storage.local.set({
      recording: true,
      recordingStartTime: startTime,
      currentMeetingId: tempId  // Store the temp ID
    });

    chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      meetingName: tempId
    }, (response) => {
      if (response && response.success) {
        isRecording = true;
        updateRecordingUI(true, startTime);
      } else {
        console.error('[FloatingWidget] Failed to start recording:', response?.error);
        chrome.storage.local.set({ recording: false });

        // Show error message to user
        const status = document.getElementById('meetsync-status');
        if (status) {
          const errorMsg = response?.error || 'Failed to start recording';
          status.textContent = 'Click Extension Icon!';
          status.style.color = '#fbbf24';
          status.style.fontSize = '11px';

          // Show notification
          if (response?.error && response.error.includes('extension icon')) {
            // User needs to click extension icon first
            setTimeout(() => {
              status.textContent = 'Ready';
              status.style.color = '';
              status.style.fontSize = '';
            }, 5000);
          } else {
            setTimeout(() => {
              status.textContent = 'Ready';
              status.style.color = '';
              status.style.fontSize = '';
            }, 3000);
          }
        }
      }
    });
  }

  // Stop Recording
  function stopRecording(meetingName) {
    // Get the original temp ID
    chrome.storage.local.get(['currentMeetingId'], (result) => {
      const tempId = result.currentMeetingId;

      chrome.storage.local.set({ recording: false });

      chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
        meetingId: meetingName,
        tempMeetingId: tempId  // Pass both IDs
      });

      isRecording = false;
      updateRecordingUI(false);
    });
  }

  // Discard Recording
  function discardRecording() {
    chrome.storage.local.set({ recording: false });

    chrome.runtime.sendMessage({
      type: 'DISCARD_RECORDING'
    });

    isRecording = false;
    updateRecordingUI(false);

    // Show notification
    const status = document.getElementById('meetsync-status');
    const originalText = status.textContent;
    status.textContent = 'Discarded';
    status.style.color = '#dc2626';
    setTimeout(() => {
      status.textContent = originalText;
      status.style.color = '';
    }, 2000);
  }

  // Show/Hide Name Modal
  function showNameModal() {
    const modal = document.getElementById('meetsync-name-modal');
    modal.classList.add('active');
    document.getElementById('meetsync-meeting-name').focus();
  }

  function hideNameModal() {
    const modal = document.getElementById('meetsync-name-modal');
    modal.classList.remove('active');
  }

  // Update UI
  function updateRecordingUI(recording, startTime = null) {
    const btn = document.getElementById('meetsync-record-btn');
    const icon = document.getElementById('meetsync-btn-icon');
    const status = document.getElementById('meetsync-status');
    const timer = document.getElementById('meetsync-timer');

    if (recording) {
      btn.classList.remove('idle');
      btn.classList.add('recording');
      icon.textContent = '■';
      status.textContent = 'Recording';
      timer.style.display = 'block';

      // Start timer
      if (startTime) {
        updateTimer(startTime);
      }
    } else {
      btn.classList.remove('recording');
      btn.classList.add('idle');
      icon.textContent = '●';
      status.textContent = 'Ready';
      timer.style.display = 'none';

      // Stop timer
      if (window.meetSyncTimerInterval) {
        clearInterval(window.meetSyncTimerInterval);
      }
    }
  }

  // Timer
  function updateTimer(startTime) {
    const timerEl = document.getElementById('meetsync-timer');

    function tick() {
      const elapsed = Date.now() - startTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    tick();
    window.meetSyncTimerInterval = setInterval(tick, 1000);
  }

  // Default meeting name
  function getDefaultMeetingName() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `Meeting ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  }

  // Dragging Functions
  function dragStart(e) {
    const widget = document.getElementById('meetsync-floating-widget');

    // Explicitly prevent dragging from button
    if (e.target.closest('.meetsync-record-btn') || e.target.closest('button')) {
      return;
    }

    if (e.type === 'touchstart') {
      initialX = e.touches[0].clientX - xOffset;
      initialY = e.touches[0].clientY - yOffset;
    } else {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
    }

    isDragging = true;
    widget.classList.add('dragging');
  }

  function drag(e) {
    if (!isDragging) return;

    e.preventDefault();
    const widget = document.getElementById('meetsync-floating-widget');

    if (e.type === 'touchmove') {
      currentX = e.touches[0].clientX - initialX;
      currentY = e.touches[0].clientY - initialY;
    } else {
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
    }

    xOffset = currentX;
    yOffset = currentY;

    setTranslate(currentX, currentY, widget);
  }

  function dragEnd() {
    if (!isDragging) return;

    const widget = document.getElementById('meetsync-floating-widget');
    widget.classList.remove('dragging');

    // Save position
    const rect = widget.getBoundingClientRect();
    chrome.storage.local.set({
      widgetPosition: {
        x: rect.left,
        y: rect.top
      }
    });

    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate(${xPos}px, ${yPos}px)`;
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
}
