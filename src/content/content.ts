function extractVideoId(): string | null {
  const path = window.location.pathname;
  const match = path.match(/\/([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1] : null;
}

function isVodPage(): boolean {
  return window.location.pathname.includes('/') && !window.location.pathname.endsWith('/');
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

if (isVodPage()) {
  signalContentReady();
  
  const observer = new MutationObserver(() => {
    if (isVodPage()) {
      signalContentReady();
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

console.log('Twicaster content script loaded');