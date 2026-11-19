// src/content/content.ts
function extractVideoId() {
  const path = window.location.pathname;
  const match = path.match(/\/([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1] : null;
}
function signalContentReady() {
  chrome.runtime.sendMessage({
    type: "CONTENT_READY",
    payload: {
      videoId: extractVideoId(),
      url: window.location.href,
      title: document.title
    }
  });
}
function findVideoElement() {
  return document.querySelector("video");
}
function getCurrentTime() {
  const video = findVideoElement();
  if (!video) return null;
  return {
    currentTime: video.currentTime,
    duration: video.duration || 0
  };
}
var currentTimeInterval = null;
function startCurrentTimeReporting() {
  if (currentTimeInterval) return;
  currentTimeInterval = window.setInterval(() => {
    const timeInfo = getCurrentTime();
    if (timeInfo) {
      const videoId = extractVideoId();
      chrome.runtime.sendMessage({
        type: "CURRENT_TIME_UPDATE",
        payload: {
          streamId: videoId || "unknown",
          currentTime: timeInfo.currentTime,
          duration: timeInfo.duration
        }
      });
    }
  }, 1e3);
}
signalContentReady();
startCurrentTimeReporting();
var observer = new MutationObserver(() => {
  signalContentReady();
  startCurrentTimeReporting();
});
observer.observe(document.body, { childList: true, subtree: true });
console.log("Twicaster content script loaded");
//# sourceMappingURL=content.js.map
