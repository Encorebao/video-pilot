import type { LegacyVisualAnalysisScene } from "../../../types/project";

export interface DetailEntry {
  key: string;
  label: string;
  value: unknown;
}

export interface SceneAnalysisDisplay {
  segmentType: string;
  segmentTypeTone: "aroll" | "broll" | "unknown";
  speechRows: DetailEntry[];
  cameraRows: DetailEntry[];
  visualRows: DetailEntry[];
  qualityRows: DetailEntry[];
  extraVisualRows: DetailEntry[];
  qualityMetricRows: DetailEntry[];
}

export const ANALYSIS_FIELD_LABELS: Record<string, string> = {
  action: "动作",
  action_type: "动作类型",
  applied: "已应用",
  analyzed_at: "分析时间",
  analysis_time_seconds: "分析耗时",
  analysis_time_str: "分析耗时",
  bitrate_kbps: "码率",
  blur_score: "模糊分",
  brightness: "亮度",
  camera_make: "相机品牌",
  camera_model: "相机型号",
  camera_movement: "运镜",
  camera_software: "相机软件",
  capture_fps: "采集帧率",
  color_science: "色彩科学",
  color_tone: "色调",
  color_tone_type: "色调类型",
  composite_grade: "综合等级",
  creation_time: "拍摄时间",
  creation_time_ts: "时间戳",
  duration: "时长",
  duration_seconds: "时长",
  edit_role: "剪辑用途",
  edit_suggestion: "剪辑建议",
  emotion_atmosphere: "情绪氛围",
  emotion_tags: "情绪标签",
  end: "结束",
  environment: "环境",
  environment_type: "环境类型",
  evidence: "判断依据",
  exposure: "曝光",
  file_size: "文件大小",
  fps: "帧率",
  frame: "帧文件",
  frame_color_transform: "帧色彩转换",
  gamma: "Gamma",
  gamut: "Gamut",
  grade: "等级",
  has_speech: "有人声",
  image_model: "模型",
  index: "序号",
  is_blurry: "模糊",
  is_noisy: "噪点",
  is_off_composition: "构图偏离",
  is_over_exposed: "过曝",
  is_shaky: "抖动",
  is_too_dark: "过暗",
  is_under_exposed: "欠曝",
  issues: "问题",
  keyframe: "关键帧",
  keyframe_time: "关键帧时间",
  label: "标签",
  lens_model: "镜头",
  lighting: "光线",
  lighting_type: "光线类型",
  log_detected: "Log 检测",
  log_profile: "Log 配置",
  lut_name: "LUT",
  lut_path: "LUT 路径",
  matrix: "Matrix",
  method: "方法",
  model: "模型",
  movement: "运镜",
  movement_confidence: "运镜置信度",
  movement_evidence: "运镜依据",
  noise_score: "噪点分",
  notable_details: "细节",
  output_dir: "输出目录",
  overall_composite_grade: "整体综合",
  overall_quality_grade: "整体质量",
  overall_summary: "整体摘要",
  place_context: "地点判断",
  quality_metrics: "质量指标",
  reason: "原因",
  recording_mode: "录制模式",
  resolution: "分辨率",
  samples: "采样",
  search_keywords: "检索关键词",
  scene_group: "场景组",
  segment_analysis: "片段分析",
  segment_analysis_error: "片段分析错误",
  segment_analysis_source: "判断来源",
  segment_type: "片段类型",
  shake_score: "抖动分",
  shot_type: "景别",
  source_profile: "源配置",
  start: "开始",
  subject: "主体",
  subject_category: "主体类型",
  summary: "摘要",
  target_profile: "目标配置",
  time: "时间",
  time_range: "时间范围",
  time_source: "时间来源",
  total_scenes: "镜头数",
  total_videos: "视频数量",
  transcript: "字幕内容",
  video: "文件名",
  video_codec_detail: "编码详情",
  video_count: "视频数",
  video_path: "原始路径",
  visual_description: "画面描述",
  scene_keywords: "场景关键词",
  subject_keywords: "主体关键词",
  videos: "视频",
  vl_analysis: "视觉分析",
  xml_sidecar: "XML",
};

const VISUAL_KEYS = [
  "visual_description",
  "shot_type",
  "subject",
  "subject_category",
  "subject_keywords",
  "action",
  "action_type",
  "place_context",
  "environment",
  "environment_type",
  "scene_keywords",
  "lighting",
  "lighting_type",
  "color_tone",
  "color_tone_type",
  "emotion_atmosphere",
  "emotion_tags",
  "search_keywords",
  "notable_details",
];

const DUPLICATE_VL_KEYS = new Set([
  "segment_type",
  "visual_description",
  "shot_type",
  "camera_movement",
  "movement_confidence",
  "movement_evidence",
  "subject",
  "subject_category",
  "subject_keywords",
  "action",
  "action_type",
  "place_context",
  "environment",
  "environment_type",
  "scene_keywords",
  "lighting",
  "lighting_type",
  "color_tone",
  "color_tone_type",
  "emotion_atmosphere",
  "emotion_tags",
  "edit_role",
  "search_keywords",
  "edit_suggestion",
  "notable_details",
]);

const DUPLICATE_QUALITY_KEYS = new Set(["grade", "issues"]);

export function analysisFieldLabel(key: string): string {
  return ANALYSIS_FIELD_LABELS[key] ?? key.replaceAll("_", " ");
}

export function segmentTypeLabel(value: unknown): string {
  if (value === "aroll") return "主叙事片段";
  if (value === "broll") return "补充画面";
  return "未分类片段";
}

export function segmentTypeTone(value: unknown): SceneAnalysisDisplay["segmentTypeTone"] {
  if (value === "aroll" || value === "broll") return value;
  return "unknown";
}

export function mediaTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    audio: "音频",
    caption: "字幕",
    "generated-audio": "生成音频",
    video: "视频",
  };
  return labels[value] ?? value;
}

export function sourceTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    "extracted-audio": "提取音频",
    "generated-audio": "生成音频",
    "imported-video": "导入视频",
    music: "音乐",
    recording: "录音",
    tts: "语音合成",
  };
  return labels[value] ?? value;
}

export function movementSampleLabel(value?: string, fallback = "采样"): string {
  const labels: Record<string, string> = {
    first: "首帧",
    last: "尾帧",
    middle: "中间帧",
  };
  const match = value?.match(/^sample_(\d+)$/);
  if (match) return `采样 ${Number(match[1])}`;
  return value ? labels[value] ?? value : fallback;
}

export function movementMethodLabel(value?: string): string {
  const labels: Record<string, string> = {
    first_middle_last: "首帧/中间帧/尾帧",
    adaptive_temporal_samples: "时序抽帧",
  };
  return value ? labels[value] ?? value : "";
}

function hasDisplayValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function entry(key: string, value: unknown): DetailEntry | null {
  if (!hasDisplayValue(value)) return null;
  return { key, label: analysisFieldLabel(key), value };
}

function comparisonValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(comparisonValues);
  }
  if (value == null) return [];
  return String(value)
    .split(/[、,，]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function sameDisplayValue(left: unknown, right: unknown): boolean {
  const leftValues = comparisonValues(left);
  const rightValues = comparisonValues(right);
  if (leftValues.length === 0 || rightValues.length === 0) return false;
  if (leftValues.length !== rightValues.length) return false;
  return leftValues.every((value, index) => value === rightValues[index]);
}

function entriesFromRecord(
  record: Record<string, unknown> | null | undefined,
  keys?: string[],
  omit?: Set<string>,
): DetailEntry[] {
  if (!record) return [];
  const sourceKeys = keys ?? Object.keys(record);
  return sourceKeys
    .filter((key) => !omit?.has(key))
    .map((key) => entry(key, record[key]))
    .filter((item): item is DetailEntry => item !== null);
}

function dedupeVisualRows(rows: DetailEntry[], qualityIssues: unknown): DetailEntry[] {
  const rowValue = new Map(rows.map((row) => [row.key, row.value]));
  const hiddenKeys = new Set<string>();
  const pairedKeys: Array<[string, string]> = [
    ["subject", "subject_category"],
    ["action", "action_type"],
    ["environment", "environment_type"],
    ["lighting", "lighting_type"],
    ["color_tone", "color_tone_type"],
    ["emotion_atmosphere", "emotion_tags"],
  ];

  for (const [readableKey, classifierKey] of pairedKeys) {
    if (sameDisplayValue(rowValue.get(readableKey), rowValue.get(classifierKey))) {
      hiddenKeys.add(classifierKey);
    }
  }
  if (sameDisplayValue(rowValue.get("notable_details"), qualityIssues)) {
    hiddenKeys.add("notable_details");
  }

  return rows.filter((row) => !hiddenKeys.has(row.key));
}

export function sceneAnalysisDisplay(scene: LegacyVisualAnalysisScene): SceneAnalysisDisplay {
  const segment = scene.segment_analysis;
  const vl = scene.vl_analysis ?? {};
  const segmentType = segment?.segment_type ?? scene.segment_type ?? vl.segment_type;
  const speech = segment?.speech ?? scene.speech;
  const visual = segment?.visual;
  const camera = segment?.camera;
  const quality = segment?.quality;

  const speechRows = [
    entry("has_speech", speech?.has_speech),
    entry("transcript", speech?.transcript),
    entry("summary", speech?.summary),
  ].filter((item): item is DetailEntry => item !== null);

  const cameraRows = [
    entry("movement", camera?.movement ?? vl.camera_movement),
    entry("movement_confidence", camera?.movement_confidence ?? vl.movement_confidence),
    entry("evidence", camera?.evidence ?? vl.movement_evidence),
  ].filter((item): item is DetailEntry => item !== null);

  const qualityRows = [
    entry("grade", quality?.grade ?? scene.quality_metrics?.grade),
    entry("issues", quality?.issues ?? scene.quality_metrics?.issues),
  ].filter((item): item is DetailEntry => item !== null);

  const visualRows = dedupeVisualRows(
    VISUAL_KEYS.map((key) => entry(key, visual?.[key as keyof typeof visual] ?? vl[key]))
      .filter((item): item is DetailEntry => item !== null),
    quality?.issues ?? scene.quality_metrics?.issues,
  );

  if (segment?.edit_role || vl.edit_role) {
    visualRows.push({
      key: "edit_role",
      label: analysisFieldLabel("edit_role"),
      value: segment?.edit_role ?? vl.edit_role,
    });
  }
  if (segment?.edit_suggestion || vl.edit_suggestion) {
    visualRows.push({
      key: "edit_suggestion",
      label: analysisFieldLabel("edit_suggestion"),
      value: segment?.edit_suggestion ?? vl.edit_suggestion,
    });
  }

  return {
    segmentType: segmentTypeLabel(segmentType),
    segmentTypeTone: segmentTypeTone(segmentType),
    speechRows,
    cameraRows,
    visualRows,
    qualityRows,
    extraVisualRows: entriesFromRecord(vl, undefined, segment ? DUPLICATE_VL_KEYS : undefined),
    qualityMetricRows: entriesFromRecord(
      scene.quality_metrics as Record<string, unknown> | undefined,
      undefined,
      quality ? DUPLICATE_QUALITY_KEYS : undefined,
    ),
  };
}
