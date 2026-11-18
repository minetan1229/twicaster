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
  CONTENT_READY: "CONTENT_READY"
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
  let isLive = false;
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
function buildRequestHeaders(stream, url) {
  const urlObj = new URL(url);
  const isTwitCasting = urlObj.hostname.endsWith("twitcasting.tv");
  const isDownloadDomain = urlObj.hostname.startsWith("dl") && urlObj.hostname.endsWith("twitcasting.tv");
  const headers = {
    ...DEFAULT_HEADERS,
    "Origin": "https://twitcasting.tv",
    "Referer": "https://twitcasting.tv/",
    "User-Agent": navigator.userAgent
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
async function initFFmpeg() {
  if (ffmpegLoaded && ffmpeg) return;
  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", (progress) => {
    reportProgress({
      stage: "processing",
      progress: Math.round(progress.progress * 100),
      message: `FFmpeg processing: ${Math.round(progress.progress * 100)}%`
    });
  });
  await ffmpeg.load({
    coreURL: "ffmpeg-core/ffmpeg-core.js"
  });
  ffmpegLoaded = true;
}
function reportProgress(progress) {
  chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_PROGRESS, payload: progress });
}
async function fetchWithHeaders(url, headers) {
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    requestHeaders.set(key, value);
  }
  return fetch(url, {
    method: "GET",
    headers: requestHeaders,
    credentials: "include"
  });
}
async function downloadPlaylist(url, headers) {
  const response = await fetchWithHeaders(url, headers);
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
  }
  return response.text();
}
async function downloadSegment(url, headers) {
  const response = await fetchWithHeaders(url, headers);
  if (!response.ok) {
    throw new Error(`Failed to fetch segment: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
async function clipVideo(masterUrl, headers, startTime, endTime, outputFilename) {
  await initFFmpeg();
  if (!ffmpeg) throw new Error("FFmpeg not initialized");
  reportProgress({ stage: "fetching", progress: 10, message: "Fetching master playlist..." });
  const masterPlaylistText = await downloadPlaylist(masterUrl, headers);
  const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
  const variants = parseMasterPlaylist(masterPlaylistText, baseUrl);
  if (variants.length === 0) {
    throw new Error("No variants found in master playlist");
  }
  const selectedVariant = selectHighestQuality(variants);
  if (!selectedVariant) {
    throw new Error("Failed to select quality variant");
  }
  reportProgress({ stage: "fetching", progress: 30, message: "Fetching media playlist..." });
  const mediaPlaylistText = await downloadPlaylist(selectedVariant.uri, headers);
  const mediaBaseUrl = selectedVariant.uri.substring(0, selectedVariant.uri.lastIndexOf("/") + 1);
  const mediaPlaylist = parseMediaPlaylist(mediaPlaylistText, mediaBaseUrl);
  const segmentsInRange = selectSegmentsInRange(mediaPlaylist, startTime, endTime);
  if (segmentsInRange.length === 0) {
    throw new Error("No segments found in specified time range");
  }
  reportProgress({ stage: "downloading", progress: 40, message: `Downloading ${segmentsInRange.length} segments...` });
  const segmentFiles = [];
  for (let i = 0; i < segmentsInRange.length; i++) {
    const segment = segmentsInRange[i];
    const segmentFilename = `segment_${i}.ts`;
    const segmentData = await downloadSegment(segment.uri, headers);
    await ffmpeg.writeFile(segmentFilename, segmentData);
    segmentFiles.push(segmentFilename);
    const progress = 40 + Math.round(i / segmentsInRange.length * 40);
    reportProgress({ stage: "downloading", progress, message: `Downloaded ${i + 1}/${segmentsInRange.length} segments` });
  }
  reportProgress({ stage: "processing", progress: 80, message: "Concatenating segments..." });
  const concatList = segmentFiles.map((f) => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("concat.list", concatList);
  await ffmpeg.exec([
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
  reportProgress({ stage: "processing", progress: 95, message: "Finalizing..." });
  const outputData = await ffmpeg.readFile(outputFilename);
  const blob = new Blob([outputData], { type: "video/mp4" });
  for (const file of segmentFiles) {
    await ffmpeg.deleteFile?.(file) || ffmpeg.writeFile(file, new Uint8Array(0));
  }
  await ffmpeg.deleteFile?.("concat.list") || ffmpeg.writeFile("concat.list", new Uint8Array(0));
  await ffmpeg.deleteFile?.(outputFilename) || ffmpeg.writeFile(outputFilename, new Uint8Array(0));
  reportProgress({ stage: "complete", progress: 100, message: "Download complete!" });
  return blob;
}
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === MessageType.DOWNLOAD_STREAM) {
    const payload = message.payload;
    try {
      const requestHeaders = buildRequestHeaders(
        { masterUrl: payload.masterUrl, headers: payload.headers },
        payload.masterUrl
      );
      const blob = await clipVideo(
        payload.masterUrl,
        requestHeaders,
        payload.startTime,
        payload.endTime,
        payload.outputFilename
      );
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url,
        filename: payload.outputFilename,
        saveAs: true
      });
      URL.revokeObjectURL(url);
      chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_COMPLETE, payload: { streamId: payload.streamId } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      reportProgress({ stage: "error", progress: 0, message: "Download failed", error: errorMessage });
      chrome.runtime.sendMessage({ type: MessageType.DOWNLOAD_ERROR, payload: { error: errorMessage } });
    }
  }
});
console.log("Offscreen document loaded");
//# sourceMappingURL=offscreen.js.map
