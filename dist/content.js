// src/shared/types.ts
var MessageType = {
  GET_STREAMS: "GET_STREAMS",
  STREAMS_LIST: "STREAMS_LIST",
  STREAM_CAPTURED: "STREAM_CAPTURED",
  DOWNLOAD_STREAM: "DOWNLOAD_STREAM",
  DOWNLOAD_PROGRESS: "DOWNLOAD_PROGRESS",
  DOWNLOAD_COMPLETE: "DOWNLOAD_COMPLETE",
  DOWNLOAD_ERROR: "DOWNLOAD_ERROR",
  CONTENT_READY: "CONTENT_READY",
  CURRENT_TIME_UPDATE: "CURRENT_TIME_UPDATE",
  GET_CURRENT_TIME: "GET_CURRENT_TIME",
  CURRENT_TIME_RESPONSE: "CURRENT_TIME_RESPONSE",
  STOP_RECORDING: "STOP_RECORDING",
  STOP_DOWNLOAD: "STOP_DOWNLOAD",
  RECORDING_STATE_CHANGE: "RECORDING_STATE_CHANGE",
  DELETE_STREAM: "DELETE_STREAM",
  CLEAR_ALL_STREAMS: "CLEAR_ALL_STREAMS",
  GET_HISTORY: "GET_HISTORY",
  HISTORY_LIST: "HISTORY_LIST",
  DELETE_HISTORY: "DELETE_HISTORY",
  OFFSCREEN_READY: "OFFSCREEN_READY",
  CHECK_OFFSCREEN: "CHECK_OFFSCREEN",
  DEBUG_LOG: "DEBUG_LOG",
  GET_DEBUG_LOGS: "GET_DEBUG_LOGS",
  DEBUG_LOGS_RESPONSE: "DEBUG_LOGS_RESPONSE",
  CLEAR_DEBUG_LOGS: "CLEAR_DEBUG_LOGS",
  GET_DOWNLOAD_STATUS: "GET_DOWNLOAD_STATUS",
  DOWNLOAD_STATUS_RESPONSE: "DOWNLOAD_STATUS_RESPONSE"
};

// src/content/content.ts
function extractVideoId(urlOrPath = window.location.pathname) {
  const movieMatch = urlOrPath.match(/\/movie\/(\d+)/i);
  if (movieMatch) {
    return movieMatch[1];
  }
  const userMatch = urlOrPath.match(/twitcasting\.tv\/([a-zA-Z0-9_:]+)(?:\/|$|\?)/i) || urlOrPath.match(/^\/([a-zA-Z0-9_:]+)(?:\/|$|\?)/);
  if (userMatch) {
    return userMatch[1];
  }
  const match = urlOrPath.match(/\/([a-zA-Z0-9_:]+)(?:\?|$)/);
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
  const videos = Array.from(document.querySelectorAll("video"));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];
  const playing = videos.find((v) => !v.paused && !v.ended && v.readyState > 2);
  if (playing) return playing;
  const withTime = videos.filter((v) => v.currentTime > 0);
  if (withTime.length > 0) {
    return withTime.reduce((max, v) => v.currentTime > max.currentTime ? v : max, withTime[0]);
  }
  const visible = videos.find((v) => v.offsetWidth > 0 && v.offsetHeight > 0);
  return visible || videos[0];
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
        type: MessageType.CURRENT_TIME_UPDATE,
        payload: {
          streamId: videoId || "unknown",
          currentTime: timeInfo.currentTime,
          duration: timeInfo.duration
        }
      });
    }
  }, 1e3);
}
function stopCurrentTimeReporting() {
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval);
    currentTimeInterval = null;
  }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === MessageType.GET_CURRENT_TIME) {
    const timeInfo = getCurrentTime();
    if (timeInfo) {
      sendResponse({
        type: MessageType.CURRENT_TIME_RESPONSE,
        payload: {
          currentTime: timeInfo.currentTime,
          duration: timeInfo.duration,
          updatedAt: Date.now()
        }
      });
    } else {
      sendResponse({
        type: MessageType.CURRENT_TIME_RESPONSE,
        payload: null
      });
    }
    return true;
  }
  return false;
});
signalContentReady();
startCurrentTimeReporting();
window.addEventListener("beforeunload", () => {
  stopCurrentTimeReporting();
});
var observer = new MutationObserver(() => {
  signalContentReady();
  startCurrentTimeReporting();
});
observer.observe(document.body, { childList: true, subtree: true });
console.log("Twicaster content script loaded");
export {
  extractVideoId
};
//# sourceMappingURL=content.js.map
