export interface HLSVariant {
  uri: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
  height?: number;
  width?: number;
}

export interface HLSSegment {
  uri: string;
  duration: number;
  title?: string;
  key?: HLSKey;
  map?: HLSMap;
}

export interface HLSKey {
  method: string;
  uri?: string;
  iv?: string;
}

export interface HLSMap {
  uri: string;
  byterange?: string;
}

export interface MediaPlaylist {
  segments: HLSSegment[];
  targetDuration: number;
  mediaSequence: number;
  isLive: boolean;
  totalDuration: number;
  programDateTime?: Date;
  canSkipUntil?: number;
  playlistType?: 'VOD' | 'EVENT';
}

export interface LiveStreamInfo {
  programDateTime?: Date;
  canSkipUntil?: number;
  serverTime?: number;
  isLive: boolean;
}

export interface CapturedStream {
  id: string;
  masterUrl: string;
  headers: Record<string, string>;
  timestamp: number;
  tabId: number;
  tabTitle: string;
  videoId?: string;
  duration?: number;
  variants?: HLSVariant[];
  type: 'vod' | 'live';
  liveInfo?: LiveStreamInfo;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface DownloadOptions {
  streamId: string;
  startTime: number;
  endTime: number;
  quality: 'auto' | string;
  outputFilename: string;
}

export interface DownloadProgress {
  stage: 'fetching' | 'parsing' | 'downloading' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
  speed?: number;
  eta?: number;
  segmentsDownloaded?: number;
  segmentsTotal?: number;
}

export interface CurrentTimeInfo {
  streamId: string;
  currentTime: number;
  updatedAt: number;
  duration?: number;
}

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped' | 'error';

export interface RecordingInfo {
  streamId: string;
  state: RecordingState;
  startTime: number;
  endTime?: number;
  recordedDuration: number;
  estimatedSize: number;
  error?: string;
}

export interface DownloadHistoryItem {
  id: string;
  streamId: string;
  filename: string;
  startTime: number;
  endTime: number;
  fileSize: number;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

export interface Message {
  type: string;
  payload?: unknown;
}

export const MessageType = {
  GET_STREAMS: 'GET_STREAMS',
  STREAMS_LIST: 'STREAMS_LIST',
  STREAM_CAPTURED: 'STREAM_CAPTURED',
  DOWNLOAD_STREAM: 'DOWNLOAD_STREAM',
  DOWNLOAD_PROGRESS: 'DOWNLOAD_PROGRESS',
  DOWNLOAD_COMPLETE: 'DOWNLOAD_COMPLETE',
  DOWNLOAD_ERROR: 'DOWNLOAD_ERROR',
  CONTENT_READY: 'CONTENT_READY',
  CURRENT_TIME_UPDATE: 'CURRENT_TIME_UPDATE',
  GET_CURRENT_TIME: 'GET_CURRENT_TIME',
  CURRENT_TIME_RESPONSE: 'CURRENT_TIME_RESPONSE',
  STOP_RECORDING: 'STOP_RECORDING',
  STOP_DOWNLOAD: 'STOP_DOWNLOAD',
  RECORDING_STATE_CHANGE: 'RECORDING_STATE_CHANGE',
  DELETE_STREAM: 'DELETE_STREAM',
  CLEAR_ALL_STREAMS: 'CLEAR_ALL_STREAMS',
  GET_HISTORY: 'GET_HISTORY',
  HISTORY_LIST: 'HISTORY_LIST',
  DELETE_HISTORY: 'DELETE_HISTORY',
  OFFSCREEN_READY: 'OFFSCREEN_READY',
  CHECK_OFFSCREEN: 'CHECK_OFFSCREEN',
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType];