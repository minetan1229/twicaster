// node_modules/@ffmpeg/ffmpeg/dist/esm/const.js
var CORE_VERSION = "0.12.9";
var CORE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`;
var FFMessageType;
(function(FFMessageType2) {
  FFMessageType2["LOAD"] = "LOAD";
  FFMessageType2["EXEC"] = "EXEC";
  FFMessageType2["FFPROBE"] = "FFPROBE";
  FFMessageType2["WRITE_FILE"] = "WRITE_FILE";
  FFMessageType2["READ_FILE"] = "READ_FILE";
  FFMessageType2["DELETE_FILE"] = "DELETE_FILE";
  FFMessageType2["RENAME"] = "RENAME";
  FFMessageType2["CREATE_DIR"] = "CREATE_DIR";
  FFMessageType2["LIST_DIR"] = "LIST_DIR";
  FFMessageType2["DELETE_DIR"] = "DELETE_DIR";
  FFMessageType2["ERROR"] = "ERROR";
  FFMessageType2["DOWNLOAD"] = "DOWNLOAD";
  FFMessageType2["PROGRESS"] = "PROGRESS";
  FFMessageType2["LOG"] = "LOG";
  FFMessageType2["MOUNT"] = "MOUNT";
  FFMessageType2["UNMOUNT"] = "UNMOUNT";
})(FFMessageType || (FFMessageType = {}));

// node_modules/@ffmpeg/ffmpeg/dist/esm/utils.js
var getMessageID = /* @__PURE__ */ (() => {
  let messageID = 0;
  return () => messageID++;
})();

// node_modules/@ffmpeg/ffmpeg/dist/esm/errors.js
var ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
var ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
var ERROR_TERMINATED = new Error("called FFmpeg.terminate()");
var ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

// node_modules/@ffmpeg/ffmpeg/dist/esm/classes.js
var FFmpeg = class {
  #worker = null;
  /**
   * #resolves and #rejects tracks Promise resolves and rejects to
   * be called when we receive message from web worker.
   */
  #resolves = {};
  #rejects = {};
  #logEventCallbacks = [];
  #progressEventCallbacks = [];
  loaded = false;
  /**
   * register worker message event handlers.
   */
  #registerHandlers = () => {
    if (this.#worker) {
      this.#worker.onmessage = ({ data: { id, type, data } }) => {
        switch (type) {
          case FFMessageType.LOAD:
            this.loaded = true;
            this.#resolves[id](data);
            break;
          case FFMessageType.MOUNT:
          case FFMessageType.UNMOUNT:
          case FFMessageType.EXEC:
          case FFMessageType.FFPROBE:
          case FFMessageType.WRITE_FILE:
          case FFMessageType.READ_FILE:
          case FFMessageType.DELETE_FILE:
          case FFMessageType.RENAME:
          case FFMessageType.CREATE_DIR:
          case FFMessageType.LIST_DIR:
          case FFMessageType.DELETE_DIR:
            this.#resolves[id](data);
            break;
          case FFMessageType.LOG:
            this.#logEventCallbacks.forEach((f) => f(data));
            break;
          case FFMessageType.PROGRESS:
            this.#progressEventCallbacks.forEach((f) => f(data));
            break;
          case FFMessageType.ERROR:
            this.#rejects[id](data);
            break;
        }
        delete this.#resolves[id];
        delete this.#rejects[id];
      };
    }
  };
  /**
   * Generic function to send messages to web worker.
   */
  #send = ({ type, data }, trans = [], signal) => {
    if (!this.#worker) {
      return Promise.reject(ERROR_NOT_LOADED);
    }
    return new Promise((resolve, reject) => {
      const id = getMessageID();
      this.#worker && this.#worker.postMessage({ id, type, data }, trans);
      this.#resolves[id] = resolve;
      this.#rejects[id] = reject;
      signal?.addEventListener("abort", () => {
        reject(new DOMException(`Message # ${id} was aborted`, "AbortError"));
      }, { once: true });
    });
  };
  on(event, callback) {
    if (event === "log") {
      this.#logEventCallbacks.push(callback);
    } else if (event === "progress") {
      this.#progressEventCallbacks.push(callback);
    }
  }
  off(event, callback) {
    if (event === "log") {
      this.#logEventCallbacks = this.#logEventCallbacks.filter((f) => f !== callback);
    } else if (event === "progress") {
      this.#progressEventCallbacks = this.#progressEventCallbacks.filter((f) => f !== callback);
    }
  }
  /**
   * Loads ffmpeg-core inside web worker. It is required to call this method first
   * as it initializes WebAssembly and other essential variables.
   *
   * @category FFmpeg
   * @returns `true` if ffmpeg core is loaded for the first time.
   */
  load = ({ classWorkerURL, ...config } = {}, { signal } = {}) => {
    if (!this.#worker) {
      this.#worker = classWorkerURL ? new Worker(new URL(classWorkerURL, import.meta.url), {
        type: "module"
      }) : (
        // We need to duplicated the code here to enable webpack
        // to bundle worekr.js here.
        new Worker(new URL("./worker.js", import.meta.url), {
          type: "module"
        })
      );
      this.#registerHandlers();
    }
    return this.#send({
      type: FFMessageType.LOAD,
      data: config
    }, void 0, signal);
  };
  /**
   * Execute ffmpeg command.
   *
   * @remarks
   * To avoid common I/O issues, ["-nostdin", "-y"] are prepended to the args
   * by default.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * await ffmpeg.writeFile("video.avi", ...);
   * // ffmpeg -i video.avi video.mp4
   * await ffmpeg.exec(["-i", "video.avi", "video.mp4"]);
   * const data = ffmpeg.readFile("video.mp4");
   * ```
   *
   * @returns `0` if no error, `!= 0` if timeout (1) or error.
   * @category FFmpeg
   */
  exec = (args, timeout = -1, { signal } = {}) => this.#send({
    type: FFMessageType.EXEC,
    data: { args, timeout }
  }, void 0, signal);
  /**
   * Execute ffprobe command.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * await ffmpeg.writeFile("video.avi", ...);
   * // Getting duration of a video in seconds: ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 video.avi -o output.txt
   * await ffmpeg.ffprobe(["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "video.avi", "-o", "output.txt"]);
   * const data = ffmpeg.readFile("output.txt");
   * ```
   *
   * @returns `0` if no error, `!= 0` if timeout (1) or error.
   * @category FFmpeg
   */
  ffprobe = (args, timeout = -1, { signal } = {}) => this.#send({
    type: FFMessageType.FFPROBE,
    data: { args, timeout }
  }, void 0, signal);
  /**
   * Terminate all ongoing API calls and terminate web worker.
   * `FFmpeg.load()` must be called again before calling any other APIs.
   *
   * @category FFmpeg
   */
  terminate = () => {
    const ids = Object.keys(this.#rejects);
    for (const id of ids) {
      this.#rejects[id](ERROR_TERMINATED);
      delete this.#rejects[id];
      delete this.#resolves[id];
    }
    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
      this.loaded = false;
    }
  };
  /**
   * Write data to ffmpeg.wasm.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * await ffmpeg.writeFile("video.avi", await fetchFile("../video.avi"));
   * await ffmpeg.writeFile("text.txt", "hello world");
   * ```
   *
   * @category File System
   */
  writeFile = (path, data, { signal } = {}) => {
    const trans = [];
    if (data instanceof Uint8Array) {
      trans.push(data.buffer);
    }
    return this.#send({
      type: FFMessageType.WRITE_FILE,
      data: { path, data }
    }, trans, signal);
  };
  mount = (fsType, options, mountPoint) => {
    const trans = [];
    return this.#send({
      type: FFMessageType.MOUNT,
      data: { fsType, options, mountPoint }
    }, trans);
  };
  unmount = (mountPoint) => {
    const trans = [];
    return this.#send({
      type: FFMessageType.UNMOUNT,
      data: { mountPoint }
    }, trans);
  };
  /**
   * Read data from ffmpeg.wasm.
   *
   * @example
   * ```ts
   * const ffmpeg = new FFmpeg();
   * await ffmpeg.load();
   * const data = await ffmpeg.readFile("video.mp4");
   * ```
   *
   * @category File System
   */
  readFile = (path, encoding = "binary", { signal } = {}) => this.#send({
    type: FFMessageType.READ_FILE,
    data: { path, encoding }
  }, void 0, signal);
  /**
   * Delete a file.
   *
   * @category File System
   */
  deleteFile = (path, { signal } = {}) => this.#send({
    type: FFMessageType.DELETE_FILE,
    data: { path }
  }, void 0, signal);
  /**
   * Rename a file or directory.
   *
   * @category File System
   */
  rename = (oldPath, newPath, { signal } = {}) => this.#send({
    type: FFMessageType.RENAME,
    data: { oldPath, newPath }
  }, void 0, signal);
  /**
   * Create a directory.
   *
   * @category File System
   */
  createDir = (path, { signal } = {}) => this.#send({
    type: FFMessageType.CREATE_DIR,
    data: { path }
  }, void 0, signal);
  /**
   * List directory contents.
   *
   * @category File System
   */
  listDir = (path, { signal } = {}) => this.#send({
    type: FFMessageType.LIST_DIR,
    data: { path }
  }, void 0, signal);
  /**
   * Delete an empty directory.
   *
   * @category File System
   */
  deleteDir = (path, { signal } = {}) => this.#send({
    type: FFMessageType.DELETE_DIR,
    data: { path }
  }, void 0, signal);
};

// node_modules/@ffmpeg/ffmpeg/dist/esm/types.js
var FFFSType;
(function(FFFSType2) {
  FFFSType2["MEMFS"] = "MEMFS";
  FFFSType2["NODEFS"] = "NODEFS";
  FFFSType2["NODERAWFS"] = "NODERAWFS";
  FFFSType2["IDBFS"] = "IDBFS";
  FFFSType2["WORKERFS"] = "WORKERFS";
  FFFSType2["PROXYFS"] = "PROXYFS";
})(FFFSType || (FFFSType = {}));

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
function selectSegmentsInRange(playlist, startTime, endTime) {
  let currentTime = 0;
  const selectedSegments = [];
  for (const segment of playlist.segments) {
    const segmentStart = currentTime;
    const segmentEnd = currentTime + segment.duration;
    if (segmentEnd > startTime && segmentStart < endTime) {
      selectedSegments.push(segment);
    }
    currentTime = segmentEnd;
    if (currentTime >= endTime) break;
  }
  return selectedSegments;
}

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

// src/offscreen/offscreen.ts
var ffmpeg = null;
var ffmpegLoaded = false;
function logDebug(level, message, details) {
  console[level](`[Offscreen] ${message}`, details !== void 0 ? details : "");
  chrome.runtime.sendMessage({
    type: MessageType.DEBUG_LOG,
    payload: {
      timestamp: Date.now(),
      source: "offscreen",
      level,
      message,
      details: details instanceof Error ? details.message : details
    }
  }).catch(() => {
  });
}
chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY }).catch(() => {
});
logDebug("info", "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u521D\u671F\u5316\u4E2D");
var activeDownloads = /* @__PURE__ */ new Map();
var MAX_PARALLEL_DOWNLOADS = 3;
var MAX_RETRIES = 3;
var RETRY_BASE_DELAY = 1e3;
async function initFFmpeg() {
  if (ffmpegLoaded && ffmpeg) return;
  logDebug("info", "FFmpeg.wasm \u306E\u521D\u671F\u5316\u958B\u59CB");
  reportProgress({
    stage: "fetching",
    progress: 2,
    message: "FFmpeg\u30A8\u30F3\u30B8\u30F3\u3092\u521D\u671F\u5316\u4E2D..."
  });
  try {
    ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => {
      logDebug("info", `FFmpeg Core: ${message}`);
    });
    ffmpeg.on("progress", (progress) => {
      const p = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
      reportProgress({
        stage: "processing",
        progress: p,
        message: `FFmpeg\u51E6\u7406\u4E2D: ${p}%`
      });
    });
    await ffmpeg.load({
      coreURL: chrome.runtime.getURL("ffmpeg-core/ffmpeg-core.js"),
      wasmURL: chrome.runtime.getURL("ffmpeg-core/ffmpeg-core.wasm")
    });
    ffmpegLoaded = true;
    logDebug("info", "FFmpeg.wasm \u306E\u30ED\u30FC\u30C9\u5B8C\u4E86");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logDebug("error", "FFmpeg\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F", msg);
    throw new Error(`FFmpeg\u521D\u671F\u5316\u30A8\u30E9\u30FC: ${msg}`, { cause: error });
  }
}
function reportProgress(progress) {
  logDebug("info", `Progress [${progress.stage}]: ${progress.progress}% - ${progress.message}`);
  chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_PROGRESS, payload: progress }).catch(() => {
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchWithRetry(url, headers, signal, retries = MAX_RETRIES) {
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value);
  }
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: requestHeaders,
        credentials: "include",
        signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (signal.aborted || error instanceof DOMException && error.name === "AbortError") {
        throw lastError;
      }
      if (attempt < retries) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        reportProgress({
          stage: "downloading",
          progress: 0,
          message: `\u30EA\u30C8\u30E9\u30A4 ${attempt + 1}/${retries} (${delay}ms\u5F8C): ${lastError.message}`
        });
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
async function downloadPlaylist(url, headers, signal) {
  const response = await fetchWithRetry(url, headers, signal);
  return response.text();
}
async function downloadSegment(url, headers, signal) {
  const response = await fetchWithRetry(url, headers, signal);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
async function downloadSegmentsParallel(segments, headers, signal, onProgress) {
  const results = new Array(segments.length);
  let completed = 0;
  const startTime = Date.now();
  let totalBytes = 0;
  const queue = [...segments];
  async function worker() {
    while (queue.length > 0 && !signal.aborted) {
      const item = queue.shift();
      try {
        const data = await downloadSegment(item.uri, headers, signal);
        results[item.index] = data;
        totalBytes += data.length;
      } catch (error) {
        results[item.index] = error instanceof Error ? error : new Error(String(error));
      }
      completed++;
      const elapsed = (Date.now() - startTime) / 1e3;
      const speed = elapsed > 0 ? totalBytes / elapsed : 0;
      const remaining = segments.length - completed;
      const avgSegmentSize = completed > 0 ? totalBytes / completed : 0;
      const eta = speed > 0 && avgSegmentSize > 0 ? remaining * avgSegmentSize / speed : 0;
      onProgress(completed, segments.length, speed, eta);
    }
  }
  const workers = Array.from({ length: Math.min(MAX_PARALLEL_DOWNLOADS, segments.length) }, () => worker());
  await Promise.all(workers);
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const errors = results.filter((r) => r instanceof Error);
  if (errors.length > 0) {
    throw new Error(`\u30BB\u30B0\u30E1\u30F3\u30C8\u306E\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306B\u5931\u6557: ${errors.length}/${segments.length} - ${errors[0].message}`);
  }
  return results;
}
async function clipVideo(masterUrl, headers, startTime, endTime, outputFilename, signal, mediaUrl, mediaVariants) {
  await initFFmpeg();
  const ffmpegInstance = ffmpeg;
  if (!ffmpegInstance) throw new Error("FFmpeg\u304C\u521D\u671F\u5316\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
  const abortSignal = signal || new AbortSignal();
  reportProgress({ stage: "fetching", progress: 5, message: "\u30D7\u30EC\u30A4\u30EA\u30B9\u30C8\u3092\u53D6\u5F97\u4E2D..." });
  let mediaPlaylistText;
  let mediaBaseUrl;
  if (mediaUrl) {
    mediaPlaylistText = await downloadPlaylist(mediaUrl, headers, abortSignal);
    mediaBaseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf("/") + 1);
  } else {
    reportProgress({ stage: "fetching", progress: 5, message: "\u30DE\u30B9\u30BF\u30FC\u30D7\u30EC\u30A4\u30EA\u30B9\u30C8\u3092\u53D6\u5F97\u4E2D..." });
    const masterPlaylistText = await downloadPlaylist(masterUrl, headers, abortSignal);
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
    const variants = mediaVariants || parseMasterPlaylist(masterPlaylistText, baseUrl);
    if (variants.length === 0) {
      throw new Error("\u30DE\u30B9\u30BF\u30FC\u30D7\u30EC\u30A4\u30EA\u30B9\u30C8\u306B\u30D0\u30EA\u30A2\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    }
    const selectedVariant = selectHighestQuality(variants);
    if (!selectedVariant) {
      throw new Error("\u753B\u8CEA\u30D0\u30EA\u30A2\u30F3\u30C8\u306E\u9078\u629E\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    }
    reportProgress({ stage: "fetching", progress: 15, message: "\u30E1\u30C7\u30A3\u30A2\u30D7\u30EC\u30A4\u30EA\u30B9\u30C8\u3092\u53D6\u5F97\u4E2D..." });
    mediaPlaylistText = await downloadPlaylist(selectedVariant.uri, headers, abortSignal);
    mediaBaseUrl = selectedVariant.uri.substring(0, selectedVariant.uri.lastIndexOf("/") + 1);
  }
  const mediaPlaylist = parseMediaPlaylist(mediaPlaylistText, mediaBaseUrl);
  const segmentsInRange = selectSegmentsInRange(mediaPlaylist, startTime, endTime);
  if (segmentsInRange.length === 0) {
    throw new Error("\u6307\u5B9A\u3055\u308C\u305F\u6642\u9593\u7BC4\u56F2\u306B\u30BB\u30B0\u30E1\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
  }
  reportProgress({ stage: "downloading", progress: 20, message: `${segmentsInRange.length}\u500B\u306E\u30BB\u30B0\u30E1\u30F3\u30C8\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u4E2D...` });
  const segmentFiles = [];
  const segmentsWithIndex = segmentsInRange.map((segment, index) => ({ uri: segment.uri, index }));
  const segmentDataArray = await downloadSegmentsParallel(
    segmentsWithIndex,
    headers,
    abortSignal,
    (completed, total, speed, eta) => {
      const progress = 20 + Math.round(completed / total * 50);
      reportProgress({
        stage: "downloading",
        progress,
        message: `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u6E08\u307F: ${completed}/${total} \u30BB\u30B0\u30E1\u30F3\u30C8`,
        speed,
        eta,
        segmentsDownloaded: completed,
        segmentsTotal: total
      });
    }
  );
  if (abortSignal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  for (let i = 0; i < segmentDataArray.length; i++) {
    if (abortSignal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const segmentFilename = `segment_${i}.ts`;
    await ffmpegInstance.writeFile(segmentFilename, segmentDataArray[i]);
    segmentFiles.push(segmentFilename);
  }
  if (abortSignal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  reportProgress({ stage: "processing", progress: 75, message: "\u30BB\u30B0\u30E1\u30F3\u30C8\u3092\u7D50\u5408\u4E2D..." });
  const concatList = segmentFiles.map((f) => `file '${f}'`).join("\n");
  await ffmpegInstance.writeFile("concat.list", concatList);
  await ffmpegInstance.exec([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "concat.list",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputFilename
  ]);
  reportProgress({ stage: "processing", progress: 95, message: "\u30D5\u30A1\u30A4\u30EB\u3092\u6700\u7D42\u51E6\u7406\u4E2D..." });
  const outputData = await ffmpegInstance.readFile(outputFilename);
  const blob = new Blob([outputData], { type: "video/mp4" });
  for (const file of segmentFiles) {
    void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
  }
  void (await ffmpegInstance.deleteFile?.("concat.list") || ffmpegInstance.writeFile("concat.list", new Uint8Array(0)));
  void (await ffmpegInstance.deleteFile?.(outputFilename) || ffmpegInstance.writeFile(outputFilename, new Uint8Array(0)));
  reportProgress({ stage: "complete", progress: 100, message: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5B8C\u4E86\uFF01" });
  return blob;
}
var LIVE_POLL_INTERVAL = 15e3;
var FLUSH_INTERVAL = 3e4;
async function recordLiveStream(mediaUrl, headers, startTime, endTime, outputFilename, signal) {
  await initFFmpeg();
  const ffmpegInstance = ffmpeg;
  if (!ffmpegInstance) throw new Error("FFmpeg\u304C\u521D\u671F\u5316\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
  const abortSignal = signal || new AbortSignal();
  const segmentFiles = [];
  let segmentIndex = 0;
  let lastMediaSequence = -1;
  let concatListContent = "";
  let lastFlushTime = Date.now();
  reportProgress({ stage: "fetching", progress: 5, message: "\u30E9\u30A4\u30D6\u9332\u753B\u3092\u958B\u59CB\u4E2D..." });
  const flushSegments = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFlushTime < FLUSH_INTERVAL && segmentFiles.length < 100) {
      return;
    }
    if (segmentFiles.length === 0) return;
    reportProgress({ stage: "processing", progress: 70, message: `${segmentFiles.length}\u500B\u306E\u30BB\u30B0\u30E1\u30F3\u30C8\u3092\u30D5\u30E9\u30C3\u30B7\u30E5\u4E2D...` });
    concatListContent = segmentFiles.map((f) => `file '${f}'`).join("\n");
    await ffmpegInstance.writeFile("concat.list", concatListContent);
    const tempOutput = `temp_${Date.now()}.mp4`;
    await ffmpegInstance.exec([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.list",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      tempOutput
    ]);
    for (const file of segmentFiles) {
      void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
    }
    segmentFiles.length = 0;
    void (await ffmpegInstance.deleteFile?.("concat.list") || ffmpegInstance.writeFile("concat.list", new Uint8Array(0)));
    segmentFiles.push(tempOutput);
    lastFlushTime = now;
  };
  const pollAndDownload = async () => {
    while (!abortSignal.aborted) {
      try {
        reportProgress({ stage: "fetching", progress: 10, message: "\u30E9\u30A4\u30D6\u30D7\u30EC\u30A4\u30EA\u30B9\u30C8\u3092\u53D6\u5F97\u4E2D..." });
        const mediaPlaylistText = await downloadPlaylist(mediaUrl, headers, abortSignal);
        const mediaBaseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf("/") + 1);
        const mediaPlaylist = parseMediaPlaylist(mediaPlaylistText, mediaBaseUrl);
        if (lastMediaSequence === -1) {
          lastMediaSequence = mediaPlaylist.mediaSequence;
        }
        const startIndex = lastMediaSequence - mediaPlaylist.mediaSequence + 1;
        const newSegments = mediaPlaylist.segments.slice(Math.max(0, startIndex));
        for (const segment of newSegments) {
          if (abortSignal.aborted) break;
          const segmentFilename = `segment_${segmentIndex}.ts`;
          reportProgress({
            stage: "downloading",
            progress: 20 + Math.min(50, segmentIndex * 2),
            message: `\u30BB\u30B0\u30E1\u30F3\u30C8 ${segmentIndex + 1} \u3092\u9332\u753B\u4E2D...`
          });
          const segmentData = await downloadSegment(segment.uri, headers, abortSignal);
          await ffmpegInstance.writeFile(segmentFilename, segmentData);
          segmentFiles.push(segmentFilename);
          segmentIndex++;
        }
        lastMediaSequence = mediaPlaylist.mediaSequence + mediaPlaylist.segments.length - 1;
        await flushSegments();
        if (abortSignal.aborted) break;
        await new Promise((resolve) => setTimeout(resolve, LIVE_POLL_INTERVAL));
      } catch (error) {
        if (abortSignal.aborted) break;
        reportProgress({
          stage: "error",
          progress: 0,
          message: `\u30DD\u30FC\u30EA\u30F3\u30B0\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`,
          error: error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"
        });
        await new Promise((resolve) => setTimeout(resolve, 5e3));
      }
    }
    await flushSegments(true);
    if (segmentFiles.length === 0) {
      throw new Error("\u9332\u753B\u3055\u308C\u305F\u30BB\u30B0\u30E1\u30F3\u30C8\u304C\u3042\u308A\u307E\u305B\u3093");
    }
    reportProgress({ stage: "processing", progress: 90, message: "\u9332\u753B\u3092\u6700\u7D42\u51E6\u7406\u4E2D..." });
    concatListContent = segmentFiles.map((f) => `file '${f}'`).join("\n");
    await ffmpegInstance.writeFile("concat.list", concatListContent);
    await ffmpegInstance.exec([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.list",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputFilename
    ]);
    for (const file of segmentFiles) {
      void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
    }
    void (await ffmpegInstance.deleteFile?.("concat.list") || ffmpegInstance.writeFile("concat.list", new Uint8Array(0)));
    for (const file of segmentFiles) {
      if (file.startsWith("temp_")) {
        void (await ffmpegInstance.deleteFile?.(file) || ffmpegInstance.writeFile(file, new Uint8Array(0)));
      }
    }
    reportProgress({ stage: "processing", progress: 95, message: "\u30D5\u30A1\u30A4\u30EB\u3092\u6700\u7D42\u51E6\u7406\u4E2D..." });
    const outputData = await ffmpegInstance.readFile(outputFilename);
    const blob = new Blob([outputData], { type: "video/mp4" });
    void (await ffmpegInstance.deleteFile?.(outputFilename) || ffmpegInstance.writeFile(outputFilename, new Uint8Array(0)));
    reportProgress({ stage: "complete", progress: 100, message: "\u30E9\u30A4\u30D6\u9332\u753B\u5B8C\u4E86\uFF01" });
    return blob;
  };
  return pollAndDownload();
}
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === MessageType.DOWNLOAD_STREAM) {
    const payload = message.payload;
    const controller = new AbortController();
    activeDownloads.set(payload.streamId, controller);
    try {
      const requestHeaders = buildRequestHeaders(
        { masterUrl: payload.masterUrl, headers: payload.headers },
        payload.masterUrl
      );
      let blob;
      if (payload.isLive) {
        blob = await recordLiveStream(
          payload.masterUrl,
          requestHeaders,
          payload.startTime,
          payload.endTime,
          payload.outputFilename,
          controller.signal
        );
      } else {
        blob = await clipVideo(
          payload.masterUrl,
          requestHeaders,
          payload.startTime,
          payload.endTime,
          payload.outputFilename,
          controller.signal,
          void 0,
          payload.variants
        );
      }
      const url = URL.createObjectURL(blob);
      logDebug("info", `Blob \u751F\u6210\u5B8C\u4E86: ${blob.size} bytes, \u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u30C0\u30A4\u30A2\u30ED\u30B0\u547C\u3073\u51FA\u3057\u4E2D...`);
      const downloadId = await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url,
          filename: payload.outputFilename,
          saveAs: true
        }, (dId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`chrome.downloads: ${chrome.runtime.lastError.message}`));
          } else if (dId === void 0) {
            reject(new Error("\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9ID\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F"));
          } else {
            resolve(dId);
          }
        });
      });
      logDebug("info", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u958B\u59CB (ID: ${downloadId})`);
      await new Promise((resolve, reject) => {
        const listener = (delta) => {
          if (delta.id === downloadId) {
            if (delta.state && delta.state.current === "complete") {
              chrome.downloads.onChanged.removeListener(listener);
              URL.revokeObjectURL(url);
              resolve();
            } else if (delta.state && delta.state.current === "interrupted") {
              chrome.downloads.onChanged.removeListener(listener);
              URL.revokeObjectURL(url);
              reject(new Error(`\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u4E2D\u65AD: ${delta.error?.current || "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`));
            }
          }
        };
        chrome.downloads.onChanged.addListener(listener);
      });
      logDebug("info", "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u6B63\u5E38\u5B8C\u4E86");
      chrome.runtime.sendMessage({
        type: MessageType.DOWNLOAD_COMPLETE,
        payload: { streamId: payload.streamId, historyId: payload.historyId, fileSize: blob.size }
      }).catch(() => {
      });
    } catch (error) {
      const isAborted = error instanceof DOMException && error.name === "AbortError" || error instanceof Error && error.message.toLowerCase().includes("aborted");
      const errorMessage = isAborted ? "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306F\u505C\u6B62\u3055\u308C\u307E\u3057\u305F" : error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC";
      logDebug(isAborted ? "info" : "error", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u51E6\u7406\u7D50\u679C: ${errorMessage}`, error);
      reportProgress({ stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      chrome.runtime.sendMessage({
        type: MessageType.DOWNLOAD_ERROR,
        payload: { streamId: payload.streamId, historyId: payload.historyId, error: errorMessage }
      }).catch(() => {
      });
    } finally {
      activeDownloads.delete(payload.streamId);
    }
  }
  if (message.type === MessageType.STOP_DOWNLOAD) {
    const { streamId } = message.payload;
    const controller = activeDownloads.get(streamId);
    if (controller) {
      controller.abort();
      activeDownloads.delete(streamId);
      logDebug("info", `\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u505C\u6B62: streamId=${streamId}`);
    }
  }
  if (message.type === MessageType.CHECK_OFFSCREEN) {
    logDebug("info", "CHECK_OFFSCREEN \u53D7\u4FE1\u3001OFFSCREEN_READY \u3092\u5FDC\u7B54");
    chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_READY }).catch(() => {
    });
  }
});
logDebug("info", "\u30AA\u30D5\u30B9\u30AF\u30EA\u30FC\u30F3\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u306E\u521D\u671F\u5316\u5B8C\u4E86");
//# sourceMappingURL=offscreen.js.map
