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
  CHECK_OFFSCREEN: "CHECK_OFFSCREEN"
};

// src/shared/headers.ts
var DEFAULT_HEADERS = {
  "Accept": "*/*",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
  "Priority": "u=1, i"
};
var DEFAULT_USER_AGENT = typeof navigator !== "undefined" ? navigator.userAgent : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
function buildRequestHeaders(stream, url) {
  const urlObj = new URL(url);
  const isTwitCasting = urlObj.hostname.endsWith("twitcasting.tv");
  const isDownloadDomain = urlObj.hostname.startsWith("dl") && urlObj.hostname.endsWith("twitcasting.tv");
  const headers = {
    ...DEFAULT_HEADERS,
    "Origin": "https://twitcasting.tv",
    "Referer": "https://twitcasting.tv/",
    "User-Agent": DEFAULT_USER_AGENT
  };
  if (stream.headers.Cookie) {
    headers["Cookie"] = stream.headers.Cookie;
  }
  if (isDownloadDomain) {
    headers["Referer"] = "https://twitcasting.tv/";
    headers["Origin"] = "https://twitcasting.tv";
  }
  return headers;
}

// src/shared/hls.ts
function parseResolution(resolution) {
  const match = resolution.match(/(\d+)x(\d+)/);
  if (!match) return null;
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}
function parseCodecs(codecs) {
  return codecs;
}
function parseBandwidth(bandwidth) {
  return parseInt(bandwidth, 10);
}
function parseAttributes(line) {
  const attrs = {};
  const regex = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    attrs[match[1]] = value;
  }
  return attrs;
}
function parseMasterPlaylist(text, baseUrl) {
  const lines = text.split("\n");
  const variants = [];
  let currentVariant = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseAttributes(line.slice("#EXT-X-STREAM-INF:".length));
      currentVariant = {
        bandwidth: attrs.BANDWIDTH ? parseBandwidth(attrs.BANDWIDTH) : 0,
        codecs: attrs.CODECS ? parseCodecs(attrs.CODECS) : void 0
      };
      if (attrs.RESOLUTION) {
        const res = parseResolution(attrs.RESOLUTION);
        if (res) {
          currentVariant.width = res.width;
          currentVariant.height = res.height;
          currentVariant.resolution = attrs.RESOLUTION;
        }
      }
    } else if (line && !line.startsWith("#")) {
      if (currentVariant.bandwidth !== void 0) {
        const uri = new URL(line, baseUrl).href;
        variants.push({
          uri,
          bandwidth: currentVariant.bandwidth,
          resolution: currentVariant.resolution,
          codecs: currentVariant.codecs,
          height: currentVariant.height,
          width: currentVariant.width
        });
        currentVariant = {};
      }
    }
  }
  return variants;
}
function selectHighestQuality(variants) {
  if (variants.length === 0) return null;
  return variants.filter((v) => v.height !== void 0 && v.width !== void 0).sort((a, b) => {
    const heightDiff = (b.height || 0) - (a.height || 0);
    if (heightDiff !== 0) return heightDiff;
    const widthDiff = (b.width || 0) - (a.width || 0);
    if (widthDiff !== 0) return widthDiff;
    return (b.bandwidth || 0) - (a.bandwidth || 0);
  })[0] || variants.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
}
function parseMediaPlaylist(text, baseUrl) {
  const lines = text.split("\n");
  const segments = [];
  let targetDuration = 0;
  let mediaSequence = 0;
  let isLive = true;
  let totalDuration = 0;
  let currentKey = null;
  let currentMap = null;
  let currentSegmentDuration = 0;
  let currentSegmentTitle;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      targetDuration = parseInt(line.split(":")[1], 10);
    } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      mediaSequence = parseInt(line.split(":")[1], 10);
    } else if (line === "#EXT-X-ENDLIST") {
      isLive = false;
    } else if (line.startsWith("#EXT-X-KEY:")) {
      const attrs = parseAttributes(line.slice("#EXT-X-KEY:".length));
      currentKey = {
        method: attrs.METHOD || "NONE",
        uri: attrs.URI ? new URL(attrs.URI, baseUrl).href : void 0,
        iv: attrs.IV
      };
    } else if (line.startsWith("#EXT-X-MAP:")) {
      const attrs = parseAttributes(line.slice("#EXT-X-MAP:".length));
      currentMap = {
        uri: attrs.URI ? new URL(attrs.URI, baseUrl).href : "",
        byterange: attrs.BYTERANGE
      };
    } else if (line.startsWith("#EXTINF:")) {
      const parts = line.slice("#EXTINF:".length).split(",");
      currentSegmentDuration = parseFloat(parts[0]);
      currentSegmentTitle = parts[1]?.trim();
      totalDuration += currentSegmentDuration;
    } else if (line && !line.startsWith("#")) {
      const uri = new URL(line, baseUrl).href;
      segments.push({
        uri,
        duration: currentSegmentDuration,
        title: currentSegmentTitle,
        key: currentKey || void 0,
        map: currentMap || void 0
      });
      currentSegmentDuration = 0;
      currentSegmentTitle = void 0;
      currentKey = null;
      currentMap = null;
    }
  }
  return {
    segments,
    targetDuration,
    mediaSequence,
    isLive,
    totalDuration
  };
}
function extractLiveInfo(playlist) {
  const info = { isLive: playlist.isLive };
  if (playlist.programDateTime) {
    info.programDateTime = playlist.programDateTime;
  }
  if (playlist.canSkipUntil !== void 0) {
    info.canSkipUntil = playlist.canSkipUntil;
  }
  info.serverTime = Date.now() / 1e3;
  return info;
}

// src/background/background.ts
var capturedStreams = /* @__PURE__ */ new Map();
var debuggerTabs = /* @__PURE__ */ new Set();
var currentTimes = /* @__PURE__ */ new Map();
var recordingStates = /* @__PURE__ */ new Map();
var videoIdToStreamId = /* @__PURE__ */ new Map();
var MAX_HISTORY_ENTRIES = 100;
var HISTORY_STORAGE_KEY = "downloadHistory";
function generateStreamId() {
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function generateHistoryId() {
  return `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function isMasterM3U8(url) {
  return url.includes("master.m3u8");
}
function isLiveM3U8(url) {
  return url.includes("tc.livehls") && url.includes("media.m3u8");
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
async function fetchLivePlaylist(masterUrl, headers) {
  try {
    const response = await fetch(masterUrl, {
      method: "GET",
      headers: new Headers(headers),
      credentials: "include"
    });
    if (!response.ok) return null;
    const text = await response.text();
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
    const playlist = parseMediaPlaylist(text, baseUrl);
    return extractLiveInfo(playlist);
  } catch {
    return null;
  }
}
async function fetchDurationAndVariants(stream) {
  try {
    const headers = buildRequestHeaders(stream, stream.masterUrl);
    if (stream.type === "live") {
      const response = await fetch(stream.masterUrl, {
        method: "GET",
        headers: new Headers(headers),
        credentials: "include"
      });
      if (!response.ok) return {};
      const text = await response.text();
      const baseUrl = stream.masterUrl.substring(0, stream.masterUrl.lastIndexOf("/") + 1);
      const mediaPlaylist = parseMediaPlaylist(text, baseUrl);
      return { duration: mediaPlaylist.totalDuration || void 0 };
    } else {
      const masterResponse = await fetch(stream.masterUrl, {
        method: "GET",
        headers: new Headers(headers),
        credentials: "include"
      });
      if (!masterResponse.ok) return {};
      const masterText = await masterResponse.text();
      const baseUrl = stream.masterUrl.substring(0, stream.masterUrl.lastIndexOf("/") + 1);
      const variants = parseMasterPlaylist(masterText, baseUrl);
      if (variants.length === 0) return { variants };
      const selectedVariant = selectHighestQuality(variants);
      if (!selectedVariant) return { variants };
      const mediaResponse = await fetch(selectedVariant.uri, {
        method: "GET",
        headers: new Headers(headers),
        credentials: "include"
      });
      if (!mediaResponse.ok) return { variants };
      const mediaText = await mediaResponse.text();
      const mediaBaseUrl = selectedVariant.uri.substring(0, selectedVariant.uri.lastIndexOf("/") + 1);
      const mediaPlaylist = parseMediaPlaylist(mediaText, mediaBaseUrl);
      return { duration: mediaPlaylist.totalDuration || void 0, variants };
    }
  } catch (error) {
    console.error("Failed to fetch duration/variants:", error);
    return {};
  }
}
async function loadHistory() {
  try {
    const result = await chrome.storage.local.get(HISTORY_STORAGE_KEY);
    return result[HISTORY_STORAGE_KEY] || [];
  } catch {
    return [];
  }
}
async function saveHistory(history) {
  try {
    await chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: history });
  } catch (error) {
    console.error("Failed to save history:", error);
  }
}
async function addHistoryEntry(entry) {
  const history = await loadHistory();
  const newEntry = {
    ...entry,
    id: generateHistoryId(),
    timestamp: Date.now(),
    status: "pending"
  };
  history.unshift(newEntry);
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.splice(MAX_HISTORY_ENTRIES);
  }
  await saveHistory(history);
  return newEntry;
}
async function updateHistoryEntry(id, updates) {
  const history = await loadHistory();
  const index = history.findIndex((h) => h.id === id);
  if (index >= 0) {
    history[index] = { ...history[index], ...updates };
    await saveHistory(history);
  }
}
async function deleteHistoryEntry(id) {
  const history = await loadHistory();
  const filtered = history.filter((h) => h.id !== id);
  await saveHistory(filtered);
}
var creatingOffscreenPromise = null;
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });
  if (existingContexts.length > 0) {
    return;
  }
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }
  creatingOffscreenPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(readyListener);
      reject(new Error("Offscreen document ready timeout"));
    }, 15e3);
    const readyListener = (msg) => {
      if (msg.type === MessageType.OFFSCREEN_READY) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(readyListener);
        resolve();
      }
    };
    chrome.runtime.onMessage.addListener(readyListener);
    chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK", "CLIPBOARD"],
      justification: "Required for FFmpeg.wasm video processing"
    }).catch((err) => {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(readyListener);
      if (err.message && err.message.includes("Only a single offscreen document may be created")) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).finally(() => {
    creatingOffscreenPromise = null;
  });
  await creatingOffscreenPromise;
}
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  if (!params || tabId === void 0) return;
  const p = params;
  if (method === "Network.requestWillBeSent") {
    const request = p.request;
    const documentURL = p.documentURL;
    if (isMasterM3U8(request.url) || isLiveM3U8(request.url)) {
      console.log("Captured m3u8:", request.url);
      const tabInfo = await getTabInfo(tabId);
      const cookieHeader = await extractCookies();
      const headers = {
        ...request.headers,
        Cookie: cookieHeader || request.headers.Cookie || request.headers.cookie || ""
      };
      const streamId = generateStreamId();
      const isLive = isLiveM3U8(request.url);
      let liveInfo;
      if (isLive) {
        liveInfo = await fetchLivePlaylist(request.url, headers) || { isLive: true };
      }
      const stream = {
        id: streamId,
        masterUrl: request.url,
        headers,
        timestamp: Date.now(),
        tabId,
        tabTitle: tabInfo?.title || "Unknown",
        videoId: extractVideoId(documentURL || ""),
        type: isLive ? "live" : "vod",
        liveInfo
      };
      capturedStreams.set(streamId, stream);
      if (stream.videoId) {
        videoIdToStreamId.set(stream.videoId, streamId);
      }
      const initialMessage = {
        type: MessageType.STREAM_CAPTURED,
        payload: stream
      };
      chrome.runtime.sendMessage(initialMessage).catch(() => {
      });
      fetchDurationAndVariants(stream).then(({ duration, variants }) => {
        const updatedStream = capturedStreams.get(streamId);
        if (updatedStream) {
          if (duration !== void 0) updatedStream.duration = duration;
          if (variants !== void 0) updatedStream.variants = variants;
          capturedStreams.set(streamId, updatedStream);
          chrome.runtime.sendMessage({
            type: MessageType.STREAM_CAPTURED,
            payload: updatedStream
          }).catch(() => {
          });
        }
      });
    }
  }
  if (method === "Network.responseReceived") {
    const _requestId = p.requestId;
    const _response = p.response;
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MessageType.GET_STREAMS) {
    const streams = Array.from(capturedStreams.values());
    sendResponse({ type: MessageType.STREAMS_LIST, payload: streams });
    return true;
  }
  if (message.type === MessageType.GET_CURRENT_TIME) {
    const { streamId } = message.payload;
    const timeInfo = currentTimes.get(streamId);
    if (timeInfo) {
      sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: timeInfo });
      return true;
    }
    const stream = capturedStreams.get(streamId);
    if (stream?.liveInfo?.programDateTime && stream.liveInfo.serverTime) {
      const now = Date.now();
      const serverTimeMs = stream.liveInfo.serverTime * 1e3;
      const programStartMs = stream.liveInfo.programDateTime.getTime();
      const elapsedSinceServerTime = now - serverTimeMs;
      const currentTime = Math.floor((serverTimeMs - programStartMs + elapsedSinceServerTime) / 1e3);
      const fallbackInfo = {
        streamId,
        currentTime: Math.max(0, currentTime),
        updatedAt: now,
        duration: stream.duration
      };
      sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: fallbackInfo });
      return true;
    }
    sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: null });
    return true;
  }
  if (message.type === MessageType.CURRENT_TIME_UPDATE) {
    const { streamId, currentTime, duration } = message.payload;
    let actualStreamId = streamId;
    if (videoIdToStreamId.has(streamId)) {
      actualStreamId = videoIdToStreamId.get(streamId);
    }
    currentTimes.set(actualStreamId, {
      streamId: actualStreamId,
      currentTime,
      updatedAt: Date.now(),
      duration
    });
    return false;
  }
  if (message.type === MessageType.DOWNLOAD_STREAM) {
    const { streamId, startTime, endTime, quality, outputFilename } = message.payload;
    const stream = capturedStreams.get(streamId);
    if (!stream) {
      sendResponse({ type: MessageType.DOWNLOAD_ERROR, payload: { error: "Stream not found" } });
      return true;
    }
    const controller = new AbortController();
    if (stream.type === "live") {
      recordingStates.set(streamId, { controller, startTime: Date.now() });
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: "recording" }
      });
    }
    (async () => {
      try {
        await ensureOffscreenDocument();
        const historyEntry = await addHistoryEntry({
          streamId,
          filename: outputFilename,
          startTime,
          endTime,
          fileSize: 0
        });
        chrome.runtime.sendMessage({
          type: MessageType.DOWNLOAD_STREAM,
          payload: {
            streamId,
            masterUrl: stream.masterUrl,
            headers: stream.headers,
            startTime,
            endTime,
            quality,
            outputFilename,
            isLive: stream.type === "live",
            variants: stream.variants,
            historyId: historyEntry.id
          }
        });
      } catch (error) {
        recordingStates.delete(streamId);
        const errMsg = error instanceof Error ? error.message : "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u306E\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        chrome.runtime.sendMessage({
          type: MessageType.DOWNLOAD_ERROR,
          payload: { streamId, error: errMsg }
        });
      }
    })();
    return true;
  }
  if (message.type === MessageType.DOWNLOAD_COMPLETE) {
    const { streamId, historyId, fileSize } = message.payload;
    if (historyId) {
      updateHistoryEntry(historyId, {
        status: "success",
        fileSize: fileSize || 0
      });
    }
    const stream = capturedStreams.get(streamId);
    if (stream?.type === "live") {
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: "stopped" }
      });
    }
    return true;
  }
  if (message.type === MessageType.DOWNLOAD_ERROR) {
    const { streamId, historyId, error } = message.payload;
    if (historyId) {
      updateHistoryEntry(historyId, {
        status: "failed",
        error
      });
    }
    const errorStream = capturedStreams.get(streamId);
    if (errorStream?.type === "live") {
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: "stopped" }
      });
    }
    return true;
  }
  if (message.type === MessageType.STOP_DOWNLOAD) {
    const { streamId } = message.payload;
    const recording = recordingStates.get(streamId);
    if (recording) {
      recording.controller.abort();
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: "stopped" }
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "No active download" });
    }
    return true;
  }
  if (message.type === MessageType.STOP_RECORDING) {
    const { streamId } = message.payload;
    const recording = recordingStates.get(streamId);
    if (recording) {
      recording.controller.abort();
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: "stopped" }
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "No active recording" });
    }
    return true;
  }
  if (message.type === MessageType.DELETE_STREAM) {
    const { streamId } = message.payload;
    const stream = capturedStreams.get(streamId);
    if (stream?.videoId) {
      videoIdToStreamId.delete(stream.videoId);
    }
    capturedStreams.delete(streamId);
    currentTimes.delete(streamId);
    sendResponse({ success: true });
    return true;
  }
  if (message.type === MessageType.CLEAR_ALL_STREAMS) {
    capturedStreams.clear();
    currentTimes.clear();
    videoIdToStreamId.clear();
    sendResponse({ success: true });
    return true;
  }
  if (message.type === MessageType.GET_HISTORY) {
    loadHistory().then((history) => {
      sendResponse({ type: MessageType.HISTORY_LIST, payload: history });
    });
    return true;
  }
  if (message.type === MessageType.DELETE_HISTORY) {
    const { id } = message.payload;
    deleteHistoryEntry(id).then(() => {
      sendResponse({ success: true });
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
