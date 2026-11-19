function extractVideoId(): string | null {
  const path = window.location.pathname;
  const match = path.match(/\/([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1] : null;
}

function signalContentReady(): void {
  chrome.runtime.sendMessage({
    type: 'CONTENT_READY',
    payload: {
      videoId: extractVideoId(),
      url: window.location.href,
      title: document.title,
    },
  });
}

function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector('video') as HTMLVideoElement | null;
}

function getCurrentTime(): { currentTime: number; duration: number } | null {
  const video = findVideoElement();
  if (!video) return null;
  
  return {
    currentTime: video.currentTime,
    duration: video.duration || 0,
  };
}

let currentTimeInterval: number | null = null;

function startCurrentTimeReporting(): void {
  if (currentTimeInterval) return;
  
  currentTimeInterval = window.setInterval(() => {
    const timeInfo = getCurrentTime();
    if (timeInfo) {
      const videoId = extractVideoId();
      chrome.runtime.sendMessage({
        type: 'CURRENT_TIME_UPDATE',
        payload: {
          streamId: videoId || 'unknown',
          currentTime: timeInfo.currentTime,
          duration: timeInfo.duration,
        },
      });
    }
  }, 1000);
}

function stopCurrentTimeReporting(): void {
  if (currentTimeInterval) {
    clearInterval(currentTimeInterval);
    currentTimeInterval = null;
  }
}

signalContentReady();
startCurrentTimeReporting();

const observer = new MutationObserver(() => {
  signalContentReady();
  startCurrentTimeReporting();
});

observer.observe(document.body, { childList: true, subtree: true });

console.log('Twicaster content script loaded');