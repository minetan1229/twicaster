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
var debugLogs = [];
var currentDownloadProgress = null;
var currentDownloadStreamId = null;
var MAX_HISTORY_ENTRIES = 100;
var HISTORY_STORAGE_KEY = "downloadHistory";
var STREAMS_STORAGE_KEY = "savedStreams";
var MAX_DEBUG_LOGS = 200;
function logDebug(level, message, details) {
  const entry = {
    timestamp: Date.now(),
    source: "background",
    level,
    message,
    details: details instanceof Error ? details.message : details
  };
  debugLogs.push(entry);
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.shift();
  }
  console[level](`[Background] ${message}`, details !== void 0 ? details : "");
  chrome.runtime.sendMessage({
    type: MessageType.DEBUG_LOG,
    payload: entry
  }).catch(() => {
  });
}
async function persistStreams() {
  try {
    const list = Array.from(capturedStreams.values());
    await chrome.storage.local.set({ [STREAMS_STORAGE_KEY]: list });
  } catch (e) {
    logDebug("warn", "Failed to persist streams to storage", e);
  }
}
async function restoreStreams() {
  try {
    const result = await chrome.storage.local.get(STREAMS_STORAGE_KEY);
    const saved = result[STREAMS_STORAGE_KEY];
    if (saved && Array.isArray(saved)) {
      for (const s of saved) {
        if (!capturedStreams.has(s.id)) {
          capturedStreams.set(s.id, s);
          if (s.videoId) {
            videoIdToStreamId.set(s.videoId, s.id);
          }
        }
      }
      logDebug("info", `\u30B9\u30C8\u30EC\u30FC\u30B8\u304B\u3089 ${saved.length} \u4EF6\u306E\u30B9\u30C8\u30EA\u30FC\u30E0\u3092\u5FA9\u5143\u3057\u307E\u3057\u305F`);
    }
  } catch (e) {
    logDebug("warn", "Failed to restore streams from storage", e);
  }
}
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
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("Another debugger is already attached")) {
      debuggerTabs.add(tabId);
      console.log(`Debugger was already attached to tab ${tabId}`);
      return;
    }
    console.warn(`Failed to attach debugger to tab ${tabId}:`, errorMsg);
  }
}
async function detachDebugger(tabId) {
  debuggerTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
    console.log(`Debugger detached from tab ${tabId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes("No tab with given id") && !errorMsg.includes("Not attached")) {
      console.warn(`Failed to detach debugger from tab ${tabId}:`, errorMsg);
    }
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
  const movieMatch = url.match(/\/movie\/(\d+)/i);
  if (movieMatch) {
    return movieMatch[1];
  }
  const userMatch = url.match(/twitcasting\.tv\/([a-zA-Z0-9_:]+)(?:\/|$|\?)/i) || url.match(/^\/([a-zA-Z0-9_:]+)(?:\/|$|\?)/);
  if (userMatch) {
    return userMatch[1];
  }
  const match = url.match(/\/([a-zA-Z0-9_:]+)(?:\?|$)/);
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
    logDebug("info", "\u65E2\u5B58\u306E\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u304C\u691C\u51FA\u3055\u308C\u307E\u3057\u305F");
    return;
  }
  if (creatingOffscreenPromise) {
    return creatingOffscreenPromise;
  }
  creatingOffscreenPromise = (async () => {
    logDebug("info", "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u306E\u751F\u6210\u958B\u59CB");
    return new Promise((resolve, reject) => {
      let resolved = false;
      let pingInterval = null;
      const cleanup = () => {
        if (pingInterval) clearInterval(pingInterval);
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(readyListener);
      };
      const finishResolve = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          logDebug("info", "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u306E\u6E96\u5099\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F");
          resolve();
        }
      };
      const timeout = setTimeout(() => {
        cleanup();
        logDebug("error", "Offscreen document ready timeout (15s)");
        reject(new Error("Offscreen document ready timeout"));
      }, 15e3);
      const readyListener = (msg) => {
        if (msg.type === MessageType.OFFSCREEN_READY) {
          finishResolve();
        }
      };
      chrome.runtime.onMessage.addListener(readyListener);
      chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK", "CLIPBOARD"],
        justification: "Required for FFmpeg.wasm video processing"
      }).then(() => {
        logDebug("info", "chrome.offscreen.createDocument \u547C\u3073\u51FA\u3057\u6210\u529F");
        pingInterval = setInterval(() => {
          if (resolved) return;
          chrome.runtime.sendMessage({ type: MessageType.CHECK_OFFSCREEN }).catch(() => {
          });
        }, 300);
      }).catch((err) => {
        if (err.message && err.message.includes("Only a single offscreen document may be created")) {
          logDebug("info", "\u65E2\u306B\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u304C\u5B58\u5728\u3057\u3066\u3044\u308B\u305F\u3081\u89E3\u6C7A\u3068\u307F\u306A\u3057\u307E\u3059");
          finishResolve();
        } else {
          cleanup();
          logDebug("error", `chrome.offscreen.createDocument \u30A8\u30E9\u30FC: ${err.message}`);
          reject(err);
        }
      });
    });
  })().finally(() => {
    creatingOffscreenPromise = null;
  });
  return creatingOffscreenPromise;
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
      persistStreams();
      logDebug("info", `\u30B9\u30C8\u30EA\u30FC\u30E0\u3092\u30AD\u30E3\u30D7\u30C1\u30E3\u3057\u307E\u3057\u305F: ${stream.tabTitle} (${stream.masterUrl})`);
      ensureOffscreenDocument().catch((err) => {
        logDebug("warn", "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u5148\u884C\u8D77\u52D5\u30A8\u30E9\u30FC", err);
      });
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
          persistStreams();
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
    ensureOffscreenDocument().catch(() => {
    });
    const streams = Array.from(capturedStreams.values());
    sendResponse({ type: MessageType.STREAMS_LIST, payload: streams });
    return true;
  }
  if (message.type === MessageType.GET_CURRENT_TIME) {
    const { streamId } = message.payload;
    const stream = capturedStreams.get(streamId);
    const respondWithFallback = () => {
      let timeInfo = currentTimes.get(streamId);
      if (!timeInfo && stream?.videoId) {
        timeInfo = currentTimes.get(stream.videoId);
      }
      if (timeInfo) {
        sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: { ...timeInfo, streamId } });
        return;
      }
      if (stream?.liveInfo?.programDateTime) {
        const now = Date.now();
        const serverTimeMs = (stream.liveInfo.serverTime || Math.floor(now / 1e3)) * 1e3;
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
        return;
      }
      sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: null });
    };
    if (stream?.tabId !== void 0) {
      chrome.tabs.sendMessage(stream.tabId, { type: MessageType.GET_CURRENT_TIME }, (response) => {
        if (!chrome.runtime.lastError && response?.type === MessageType.CURRENT_TIME_RESPONSE && response.payload) {
          const tabTimeInfo = response.payload;
          const updatedInfo = {
            ...tabTimeInfo,
            streamId
          };
          currentTimes.set(streamId, updatedInfo);
          if (stream.videoId) {
            currentTimes.set(stream.videoId, updatedInfo);
          }
          sendResponse({ type: MessageType.CURRENT_TIME_RESPONSE, payload: updatedInfo });
        } else {
          respondWithFallback();
        }
      });
      return true;
    }
    respondWithFallback();
    return true;
  }
  if (message.type === MessageType.CURRENT_TIME_UPDATE) {
    const { streamId, currentTime, duration } = message.payload;
    let actualStreamId = streamId;
    if (videoIdToStreamId.has(streamId)) {
      actualStreamId = videoIdToStreamId.get(streamId);
    }
    const info = {
      streamId: actualStreamId,
      currentTime,
      updatedAt: Date.now(),
      duration
    };
    currentTimes.set(actualStreamId, info);
    currentTimes.set(streamId, info);
    sendResponse({ success: true });
    return true;
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
        logDebug("info", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u958B\u59CB\u51E6\u7406: streamId=${streamId}, file=${outputFilename}, range=${startTime}-${endTime}`);
        currentDownloadStreamId = streamId;
        currentDownloadProgress = {
          stage: "fetching",
          progress: 0,
          message: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u6E96\u5099\u4E2D..."
        };
        await ensureOffscreenDocument();
        const historyEntry = await addHistoryEntry({
          streamId,
          filename: outputFilename,
          startTime,
          endTime,
          fileSize: 0
        });
        logDebug("info", `\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u306B DOWNLOAD_STREAM \u3092\u8EE2\u9001\u3057\u307E\u3059: historyId=${historyEntry.id}`);
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
        }).catch((err) => {
          logDebug("warn", "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u3078\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u9001\u4FE1\u5931\u6557", err);
        });
        sendResponse({ success: true });
      } catch (error) {
        currentDownloadProgress = null;
        currentDownloadStreamId = null;
        recordingStates.delete(streamId);
        const errMsg = error instanceof Error ? error.message : "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u306E\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F";
        logDebug("error", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u6E96\u5099\u30A8\u30E9\u30FC: ${errMsg}`, error);
        chrome.runtime.sendMessage({
          type: MessageType.DOWNLOAD_ERROR,
          payload: { streamId, error: errMsg }
        }).catch(() => {
        });
        sendResponse({ success: false, error: errMsg });
      }
    })();
    return true;
  }
  if (message.type === MessageType.DOWNLOAD_PROGRESS) {
    currentDownloadProgress = message.payload;
    return false;
  }
  if (message.type === MessageType.DOWNLOAD_COMPLETE) {
    const { streamId, historyId, fileSize } = message.payload;
    logDebug("info", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5B8C\u4E86\u3092\u53D7\u4FE1: streamId=${streamId}, fileSize=${fileSize}`);
    currentDownloadProgress = { stage: "complete", progress: 100, message: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5B8C\u4E86\uFF01" };
    currentDownloadStreamId = null;
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
      }).catch(() => {
      });
    }
    return true;
  }
  if (message.type === MessageType.DOWNLOAD_ERROR) {
    const { streamId, historyId, error } = message.payload;
    logDebug("error", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5931\u6557\u3092\u53D7\u4FE1: streamId=${streamId}, error=${error}`);
    currentDownloadProgress = null;
    currentDownloadStreamId = null;
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
    logDebug("info", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u505C\u6B62\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u53D7\u4FE1: streamId=${streamId}`);
    const recording = recordingStates.get(streamId);
    if (recording) {
      recording.controller.abort();
      recordingStates.delete(streamId);
      chrome.runtime.sendMessage({
        type: MessageType.RECORDING_STATE_CHANGE,
        payload: { streamId, state: "stopped" }
      }).catch(() => {
      });
    }
    chrome.runtime.sendMessage({
      type: MessageType.STOP_DOWNLOAD,
      payload: { streamId }
    }).catch(() => {
    });
    if (currentDownloadStreamId === streamId) {
      currentDownloadStreamId = null;
      currentDownloadProgress = null;
    }
    sendResponse({ success: true });
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
    persistStreams();
    logDebug("info", `\u30B9\u30C8\u30EA\u30FC\u30E0\u524A\u9664: streamId=${streamId}`);
    sendResponse({ success: true });
    return true;
  }
  if (message.type === MessageType.CLEAR_ALL_STREAMS) {
    capturedStreams.clear();
    currentTimes.clear();
    videoIdToStreamId.clear();
    persistStreams();
    logDebug("info", "\u5168\u30B9\u30C8\u30EA\u30FC\u30E0\u524A\u9664");
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
  if (message.type === MessageType.DEBUG_LOG) {
    const entry = message.payload;
    debugLogs.push(entry);
    if (debugLogs.length > MAX_DEBUG_LOGS) {
      debugLogs.shift();
    }
    return false;
  }
  if (message.type === MessageType.GET_DEBUG_LOGS) {
    sendResponse({ type: MessageType.DEBUG_LOGS_RESPONSE, payload: debugLogs });
    return true;
  }
  if (message.type === MessageType.CLEAR_DEBUG_LOGS) {
    debugLogs.length = 0;
    sendResponse({ success: true });
    return true;
  }
  if (message.type === MessageType.GET_DOWNLOAD_STATUS) {
    sendResponse({
      type: MessageType.DOWNLOAD_STATUS_RESPONSE,
      payload: {
        streamId: currentDownloadStreamId,
        progress: currentDownloadProgress
      }
    });
    return true;
  }
  return false;
});
restoreStreams();
async function attachExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.twitcasting.tv/*" });
    for (const tab of tabs) {
      if (tab.id !== void 0) {
        attachDebugger(tab.id).catch((err) => {
          console.warn(`Could not attach debugger to tab ${tab.id}:`, err);
        });
      }
    }
  } catch (error) {
    console.error("Failed to query existing tabs:", error);
  }
}
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
  attachExistingTabs();
});
attachExistingTabs();
console.log("Background service worker started");
//# sourceMappingURL=background.js.map
