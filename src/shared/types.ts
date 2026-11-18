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
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType];