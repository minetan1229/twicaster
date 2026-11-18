// src/shared/types.ts
var MessageType = {
  GET_STREAMS: "GET_STREAMS",
  STREAMS_LIST: "STREAMS_LIST",
  STREAM_CAPTURED: "STREAM_CAPTURED",
  DOWNLOAD_STREAM: "DOWNLOAD_STREAM",
  DOWNLOAD_PROGRESS: "DOWNLOAD_PROGRESS",
  DOWNLOAD_COMPLETE: "DOWNLOAD_COMPLETE",
  DOWNLOAD_ERROR: "DOWNLOAD_ERROR",
  CONTENT_READY: "CONTENT_READY"
};

// src/background/background.ts
var capturedStreams = /* @__PURE__ */ new Map();
var debuggerTabs = /* @__PURE__ */ new Set();
function generateStreamId() {
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function isMasterM3U8(url) {
  return url.includes("master.m3u8");
}
async function attachDebugger(tabId) {
  if (debuggerTabs.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    await chrome.debugger.sendCommand({ tabId }, "Network.setCacheDisabled", { cacheDisabled: true });
    debuggerTabs.add(tabId);
    console.log(`Debugger attached to tab ${tabId}`);
  } catch (error) {
    console.error("Failed to attach debugger:", error);
    throw error;
  }
}
async function detachDebugger(tabId) {
  if (!debuggerTabs.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
    debuggerTabs.delete(tabId);
    console.log(`Debugger detached from tab ${tabId}`);
  } catch (error) {
    console.error("Failed to detach debugger:", error);
  }
}
async function extractCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: "twitcasting.tv" });
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch (error) {
    console.error("Failed to extract cookies:", error);
    return "";
  }
}
async function getTabInfo(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return { title: tab.title || "", url: tab.url || "" };
  } catch {
    return null;
  }
}
function extractVideoId(url) {
  const match = url.match(/\/([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1] : void 0;
}
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  if (!params || tabId === void 0) return;
  const p = params;
  if (method === "Network.requestWillBeSent") {
    const request = p.request;
    const documentURL = p.documentURL;
    if (isMasterM3U8(request.url)) {
      console.log("Captured master.m3u8:", request.url);
      const tabInfo = await getTabInfo(tabId);
      const cookieHeader = await extractCookies();
      const headers = {
        ...request.headers,
        Cookie: cookieHeader || request.headers.Cookie || request.headers.cookie || ""
      };
      const streamId = generateStreamId();
      const stream = {
        id: streamId,
        masterUrl: request.url,
        headers,
        timestamp: Date.now(),
        tabId,
        tabTitle: tabInfo?.title || "Unknown",
        videoId: extractVideoId(documentURL || "")
      };
      capturedStreams.set(streamId, stream);
      const message = {
        type: MessageType.STREAM_CAPTURED,
        payload: stream
      };
      chrome.runtime.sendMessage(message).catch(() => {
      });
    }
  }
  if (method === "Network.responseReceived") {
    const requestId = p.requestId;
    const response = p.response;
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MessageType.GET_STREAMS) {
    const streams = Array.from(capturedStreams.values());
    sendResponse({ type: MessageType.STREAMS_LIST, payload: streams });
    return true;
  }
  if (message.type === MessageType.DOWNLOAD_STREAM) {
    const { streamId, startTime, endTime, quality, outputFilename } = message.payload;
    const stream = capturedStreams.get(streamId);
    if (!stream) {
      sendResponse({ type: MessageType.DOWNLOAD_ERROR, payload: { error: "Stream not found" } });
      return true;
    }
    chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK", "CLIPBOARD"],
      justification: "Required for FFmpeg.wasm video processing"
    }).then(() => {
      chrome.runtime.sendMessage({
        type: MessageType.DOWNLOAD_STREAM,
        payload: {
          streamId,
          masterUrl: stream.masterUrl,
          headers: stream.headers,
          startTime,
          endTime,
          quality,
          outputFilename
        }
      });
    }).catch((error) => {
      sendResponse({ type: MessageType.DOWNLOAD_ERROR, payload: { error: error.message } });
    });
    return true;
  }
  return false;
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.includes("twitcasting.tv")) {
    try {
      await attachDebugger(tabId);
    } catch (error) {
      console.error("Failed to auto-attach debugger:", error);
    }
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
});
chrome.runtime.onInstalled.addListener(() => {
  console.log("Twicaster extension installed");
});
console.log("Background service worker started");
//# sourceMappingURL=background.js.map
