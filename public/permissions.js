document.getElementById("requestBtn").addEventListener("click", async () => {
  const statusDiv = document.getElementById("status");
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    statusDiv.textContent = "✅ Permission Granted! You can close this tab.";
    statusDiv.className = "success";
    // Optional: Notify background script or close tab after delay
    setTimeout(() => window.close(), 2000);
  } catch (err) {
    console.error(err);
    statusDiv.textContent =
      "❌ Permission Denied. Please try again and click 'Allow'.";
    statusDiv.className = "error";
  }
});
