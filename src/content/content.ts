import { Message, MessageType } from '../shared/types';

export function extractVideoId(urlOrPath: string = window.location.pathname): string | null {
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
        type: MessageType.CURRENT_TIME_UPDATE,
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

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message && message.type === MessageType.GET_CURRENT_TIME) {
    const timeInfo = getCurrentTime();
    if (timeInfo) {
      sendResponse({
        type: MessageType.CURRENT_TIME_RESPONSE,
        payload: {
          currentTime: timeInfo.currentTime,
          duration: timeInfo.duration,
          updatedAt: Date.now(),
        },
      });
    } else {
      sendResponse({
        type: MessageType.CURRENT_TIME_RESPONSE,
        payload: null,
      });
    }
    return true;
  }
  return false;
});


signalContentReady();
startCurrentTimeReporting();

window.addEventListener('beforeunload', () => {
  stopCurrentTimeReporting();
});

const observer = new MutationObserver(() => {
  signalContentReady();
  startCurrentTimeReporting();
});

observer.observe(document.body, { childList: true, subtree: true });

console.log('Twicaster content script loaded');