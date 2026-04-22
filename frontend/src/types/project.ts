export type MediaType = "video" | "audio" | "caption" | "generated-audio";
export type ImportMode = "copied" | "referenced";
export type TrackType = "video" | "audio";
export type ImportStatus = "queued" | "processing" | "completed";
export type SuggestionAction = "remove" | "trim" | "highlight" | "insert-broll";
export type SuggestionSource =
  | "ai-tags"
  | "transcript"
  | "filler-word"
  | "duplicate-check";
export type VoiceSource = "uploaded" | "recorded" | "timeline-clip";
export type TtsJobStatus = "preview-ready" | "inserted";

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  importMode: ImportMode;
  originalPath: string;
  projectPath?: string;
  durationInFrames: number;
  sourceLabel: string;
  /** ISO 8601 string, e.g. "2026-04-22T10:30:00" */
  createdAt?: string;
  /** ISO 8601 string — last modified time of the source file */
  updatedAt?: string;
  /** File size in bytes */
  fileSize?: number;
}

export interface TimelineClip {
  id: string;
  mediaId: string;
  title: string;
  startFrame: number;
  durationInFrames: number;
  /** Frame offset into the source media file (in-point). Updated when left-trimming. */
  sourceIn: number;
  color: string;
  sourceType: "imported-video" | "extracted-audio" | "tts" | "recording" | "music";
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  clips: TimelineClip[];
}

export interface ProjectTimeline {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  videoTracks: TimelineTrack[];
  audioTracks: TimelineTrack[];
}

export interface ImportTask {
  id: string;
  sourceName: string;
  mode: ImportMode;
  status: ImportStatus;
  importedAt: string;
  notes: string;
  output: {
    videoClips: number;
    audioClips: number;
    captions: number;
  };
}

export interface KeyframeMarker {
  id: string;
  label: string;
  description: string;
  startFrame: number;
  endFrame: number;
  color: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  startFrame: number;
  endFrame: number;
  text: string;
  fillerWords: string[];
}

export interface EditSuggestion {
  id: string;
  title: string;
  source: SuggestionSource;
  action: SuggestionAction;
  confidence: number;
  affectedClipIds: string[];
  description: string;
}

export interface AnalysisResults {
  overallSummary: string;
  sceneCount: number;
  transcriptCount: number;
  detectedFillerWordCount: number;
  keyframes: KeyframeMarker[];
  transcriptSegments: TranscriptSegment[];
  editSuggestions: EditSuggestion[];
}

export interface VoiceProfile {
  id: string;
  name: string;
  source: VoiceSource;
  description: string;
  previewLabel: string;
  isDefault: boolean;
  sampleClipId?: string;
}

export interface TtsJob {
  id: string;
  status: TtsJobStatus;
  voiceId: string;
  voiceName: string;
  text: string;
  emotion: string;
  speed: number;
  leadSilenceMs: number;
  tailSilenceMs: number;
  insertionTrackId: string;
  insertAfterClipId?: string;
  durationInFrames: number;
  generatedMediaId: string;
  generatedClipId: string;
  createdAt: string;
  sampleSource: VoiceSource;
  sampleClipId?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  location: string;
  version: string;
  notes: string;
  mediaItems: MediaItem[];
  timeline: ProjectTimeline;
  importTasks: ImportTask[];
  analysis: AnalysisResults;
  voiceProfiles: VoiceProfile[];
  ttsJobs: TtsJob[];
}
