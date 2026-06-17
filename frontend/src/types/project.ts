export type MediaType = "video" | "audio" | "caption" | "generated-audio";
export type ImportMode = "copied" | "referenced";
export type TrackType = "video" | "audio";
export type TimelineKind = "main" | "compound";
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
  /** ISO 8601 string — real media capture/creation time used for scene grouping */
  capturedAt?: string;
  capturedAtSource?: "xml_sidecar" | "metadata" | "file_birthtime" | "file_mtime" | "import_time";
  notes?: string;
  rating?: number;
}

export interface TimelineClip {
  id: string;
  mediaId: string;
  timelineId?: string;
  title: string;
  startFrame: number;
  durationInFrames: number;
  /** Frame offset into the source media file (in-point). Updated when left-trimming. */
  sourceIn: number;
  color: string;
  sourceType: "imported-video" | "extracted-audio" | "tts" | "recording" | "music" | "compound";
  notes?: string;
  rating?: number;
}

export interface SubtitleSegment {
  id: string;
  mediaId: string;
  startFrame: number;
  endFrame: number;
  text: string;
  speaker?: string;
}

export interface ProjectSubtitles {
  settings: {
    model: string;
    language: string;
    maxWordsPerSegment: number;
  };
  segments: SubtitleSegment[];
  updatedAt?: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  clips: TimelineClip[];
}

export interface ProjectTimeline {
  id: string;
  name: string;
  kind: TimelineKind;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  videoTracks: TimelineTrack[];
  audioTracks: TimelineTrack[];
  sourceDraftId?: string;
  createdAt?: string;
  updatedAt?: string;
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

export interface LegacySceneGroup {
  scene_group?: number;
  video_count?: number;
  videos?: string[];
  time_range?: {
    start?: string;
    end?: string;
  };
}

export interface LegacyShootingInfo {
  time_source?: string;
  creation_time?: string;
  creation_time_ts?: number;
  camera_software?: string;
  bitrate_kbps?: number;
  xml_sidecar?: string;
  camera_make?: string;
  camera_model?: string;
  lens_model?: string;
  capture_fps?: string;
  video_codec_detail?: string;
  resolution?: string;
  recording_mode?: string;
  color_science?: {
    gamma?: string;
    gamut?: string;
    matrix?: string;
  };
  log_detected?: boolean;
  log_profile?: string;
}

export interface LegacyFrameColorTransform {
  applied?: boolean;
  source_profile?: string;
  target_profile?: string;
  lut_name?: string;
  lut_path?: string;
  reason?: string;
}

export interface LegacySegmentSpeech {
  has_speech?: boolean;
  transcript?: string;
  summary?: string;
}

export interface LegacySegmentVisual {
  shot_type?: string;
  subject?: string;
  subject_category?: string;
  action?: string;
  action_type?: string;
  environment?: string;
  environment_type?: string;
  lighting?: string;
  lighting_type?: string;
  color_tone?: string;
  color_tone_type?: string;
  emotion_atmosphere?: string;
  emotion_tags?: string[];
  search_keywords?: string[];
  notable_details?: string | null;
}

export interface LegacySegmentCamera {
  movement?: string;
  movement_confidence?: number | string | null;
  evidence?: string;
}

export interface LegacySegmentQuality {
  grade?: string;
  issues?: string[];
  [key: string]: string | number | boolean | string[] | null | undefined;
}

export interface LegacySegmentAnalysis {
  segment_type?: "aroll" | "broll" | string;
  speech?: LegacySegmentSpeech;
  visual?: LegacySegmentVisual;
  camera?: LegacySegmentCamera;
  quality?: LegacySegmentQuality;
  edit_role?: string;
  edit_suggestion?: string;
}

export interface LegacyVisualAnalysisScene {
  index?: number;
  start?: number;
  end?: number;
  duration?: number;
  keyframe?: string;
  keyframe_time?: number;
  segment_type?: "aroll" | "broll" | string;
  speech?: LegacySegmentSpeech;
  segment_analysis?: LegacySegmentAnalysis;
  segment_analysis_error?: string;
  vl_analysis?: Record<
    string,
    string | number | boolean | string[] | number[] | null | undefined
  >;
  movement_probe?: {
    method?: string;
    samples?: Array<{
      label?: string;
      time?: number;
      frame?: string;
      camera_movement?: string;
    }>;
  };
  quality_metrics?: Record<string, string | number | boolean | string[] | null | undefined>;
  composite_grade?: string;
}

export interface LegacyVideoAnalysis {
  video?: string;
  video_path?: string;
  output_dir?: string;
  video_meta?: {
    duration_seconds?: number;
    resolution?: string;
    fps?: number;
  };
  shooting_info?: LegacyShootingInfo;
  frame_color_transform?: LegacyFrameColorTransform;
  analyzed_at?: string;
  image_model?: string;
  visual_analysis?: {
    model?: string;
    total_scenes?: number;
    scenes?: LegacyVisualAnalysisScene[];
  };
  overall_summary?: string;
  overall_quality_grade?: string;
  overall_composite_grade?: string;
  analysis_time_seconds?: number;
  analysis_time_str?: string;
}

export interface LegacyAnalysisSummary {
  taxonomy_version?: string;
  total_videos?: number;
  image_model?: string;
  scene_groups?: LegacySceneGroup[];
  videos?: LegacyVideoAnalysis[];
}

export interface AnalysisTaxonomyValue {
  value: string;
  label: string;
  aliases: string[];
}

export interface AnalysisTaxonomyField {
  id: string;
  label: string;
  values: AnalysisTaxonomyValue[];
}

export interface AnalysisTaxonomy {
  version: string;
  displayOrder: string[];
  fields: AnalysisTaxonomyField[];
}

export interface AnalysisResults {
  overallSummary: string;
  sceneCount: number;
  transcriptCount: number;
  detectedFillerWordCount: number;
  keyframes: KeyframeMarker[];
  transcriptSegments: TranscriptSegment[];
  editSuggestions: EditSuggestion[];
  legacySummary?: LegacyAnalysisSummary | null;
}

export interface SceneGroup {
  id: string;
  title: string;
  notes: string;
  mediaIds: string[];
  source: "auto" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface SceneGroupsState {
  settings: {
    gapMinutes: number;
  };
  groups: SceneGroup[];
}

export type ScriptEditMessageRole = "user" | "assistant";

export interface ScriptEditMessage {
  id: string;
  role: ScriptEditMessageRole;
  content: string;
  quickStart?: string | null;
  draftId?: string;
  createdAt: string;
}

export interface ScriptEditBeat {
  id: string;
  title: string;
  purpose: string;
  storyText: string;
  targetDurationSeconds: number;
}

export interface ScriptEditTrackItem {
  beatId: string;
  candidateId: string;
  mediaId: string;
  mediaName: string;
  timelineStartFrame: number;
  startOffsetFrames: number;
  sourceInFrames: number;
  durationInFrames: number;
  reason: string;
  title?: string;
}

export interface ScriptEditDraft {
  id: string;
  sessionId: string;
  version: "script_cut_v1";
  mode?: "rough_cut" | "broll_sort";
  title: string;
  targetDurationSeconds: number;
  summary: string;
  scriptBeats: ScriptEditBeat[];
  tracks: {
    main: ScriptEditTrackItem[];
    broll: ScriptEditTrackItem[];
  };
  excludedCandidates: Array<{ candidateId: string; reason: string }>;
  warnings: string[];
  promptStats: {
    rawPromptBytes: number;
    compressedPromptBytes: number;
    excludedMediaCount: number;
  };
  applied: boolean;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
}

export interface ScriptEditSession {
  id: string;
  title: string;
  messages: ScriptEditMessage[];
  latestDraftId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptEditsState {
  sessions: ScriptEditSession[];
  drafts: ScriptEditDraft[];
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
  timelines: ProjectTimeline[];
  activeTimelineId: string;
  importTasks: ImportTask[];
  analysis: AnalysisResults;
  sceneGroups: SceneGroupsState;
  subtitles: ProjectSubtitles;
  scriptEdits: ScriptEditsState;
  voiceProfiles: VoiceProfile[];
  ttsJobs: TtsJob[];
}
