import type {
  AnalysisTaxonomy,
  AnalysisTaxonomyField,
  LegacyVisualAnalysisScene,
  MediaItem,
  ProjectRecord,
} from "@/types/project";

export const FILTER_FIELD_IDS = [
  "shot_type",
  "camera_movement",
  "environment_type",
  "lighting_type",
  "color_tone_type",
  "emotion_tags",
  "edit_role",
];

const PRIMARY_TAG_FIELD_IDS = [
  "shot_type",
  "camera_movement",
  "environment_type",
  "lighting_type",
  "emotion_tags",
  "edit_role",
];

const FIELD_SOURCE_KEYS: Record<string, string[]> = {
  shot_type: ["shot_type"],
  camera_movement: ["camera_movement"],
  subject_category: ["subject_category", "subject"],
  action_type: ["action_type", "action"],
  environment_type: ["environment_type", "environment"],
  lighting_type: ["lighting_type", "lighting"],
  color_tone_type: ["color_tone_type", "color_tone"],
  emotion_tags: ["emotion_tags", "emotion_atmosphere"],
  edit_role: ["edit_role", "edit_suggestion"],
};

export interface SceneAnalysisIndex {
  index?: number;
  start?: number;
  end?: number;
  subject: string;
  action: string;
  environment: string;
  editSuggestion: string;
  keywords: string[];
  filterValues: Record<string, string[]>;
  searchText: string;
}

export interface MediaAnalysisIndex {
  mediaId: string;
  videoName: string;
  scenes: SceneAnalysisIndex[];
  primaryTags: Array<{ fieldId: string; label: string; value: string }>;
  filterValues: Record<string, string[]>;
  searchText: string;
}

function filenameFromPath(path?: string): string {
  if (!path) return "";
  return path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(" ");
  if (value == null) return "";
  return String(value).toLowerCase();
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[、,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function taxonomyField(taxonomy: AnalysisTaxonomy | null, fieldId: string) {
  return taxonomy?.fields.find((field) => field.id === fieldId) ?? null;
}

function matchAlias(text: string, field: AnalysisTaxonomyField): string[] {
  const normalized = text.toLowerCase();
  const matches: string[] = [];
  for (const value of field.values) {
    const candidates = [value.value, ...value.aliases].map((item) => item.toLowerCase());
    if (candidates.some((candidate) => candidate && normalized.includes(candidate))) {
      matches.push(value.value);
    }
  }
  return Array.from(new Set(matches));
}

function taxonomyValuesForScene(
  scene: LegacyVisualAnalysisScene,
  taxonomy: AnalysisTaxonomy | null,
): Record<string, string[]> {
  const vl = scene.vl_analysis ?? {};
  const result: Record<string, string[]> = {};

  for (const fieldId of taxonomy?.displayOrder ?? FILTER_FIELD_IDS) {
    const field = taxonomyField(taxonomy, fieldId);
    const sourceKeys = FIELD_SOURCE_KEYS[fieldId] ?? [fieldId];
    const directValues = stringList(vl[fieldId]);
    const allowed = new Set(field?.values.map((value) => value.value) ?? []);
    const validDirect = directValues.filter((value) => allowed.size === 0 || allowed.has(value));

    if (validDirect.length > 0) {
      result[fieldId] = fieldId === "emotion_tags" ? validDirect.slice(0, 3) : [validDirect[0]];
      continue;
    }

    if (!field) {
      result[fieldId] = [];
      continue;
    }

    const sourceText = sourceKeys.map((key) => normalizeText(vl[key])).join(" ");
    const aliasMatches = matchAlias(sourceText, field).filter((value) => value !== "不确定");
    result[fieldId] = fieldId === "emotion_tags" ? aliasMatches.slice(0, 3) : aliasMatches.slice(0, 1);
  }

  return result;
}

function findLegacyVideo(project: ProjectRecord, media: MediaItem) {
  const videos = project.analysis.legacySummary?.videos ?? [];
  const mediaName = media.name.toLowerCase();
  const sourceName = filenameFromPath(media.originalPath);
  const projectName = filenameFromPath(media.projectPath);

  return (
    videos.find((video) => {
      const videoName = filenameFromPath(video.video ?? video.video_path);
      const videoPath = video.video_path?.toLowerCase() ?? "";
      return (
        videoName === mediaName ||
        videoName === sourceName ||
        videoName === projectName ||
        videoPath.endsWith(mediaName) ||
        (sourceName !== "" && videoPath.endsWith(sourceName))
      );
    }) ?? null
  );
}

function sceneIndex(
  scene: LegacyVisualAnalysisScene,
  taxonomy: AnalysisTaxonomy | null,
): SceneAnalysisIndex {
  const vl = scene.vl_analysis ?? {};
  const keywords = stringList(vl.search_keywords);
  const filterValues = taxonomyValuesForScene(scene, taxonomy);
  const textParts = [
    vl.subject,
    vl.action,
    vl.environment,
    vl.lighting,
    vl.color_tone,
    vl.emotion_atmosphere,
    vl.edit_suggestion,
    vl.notable_details,
    keywords.join(" "),
    ...Object.values(filterValues).flat(),
  ];

  return {
    index: scene.index,
    start: scene.start,
    end: scene.end,
    subject: String(vl.subject ?? ""),
    action: String(vl.action ?? ""),
    environment: String(vl.environment ?? ""),
    editSuggestion: String(vl.edit_suggestion ?? ""),
    keywords,
    filterValues,
    searchText: textParts.map(normalizeText).filter(Boolean).join(" "),
  };
}

export function buildMediaAnalysisIndex(
  project: ProjectRecord,
  media: MediaItem,
  taxonomy: AnalysisTaxonomy | null,
): MediaAnalysisIndex | null {
  const video = findLegacyVideo(project, media);
  if (!video) return null;

  const scenes = (video.visual_analysis?.scenes ?? []).map((scene) => sceneIndex(scene, taxonomy));
  const filterValues: Record<string, string[]> = {};
  for (const scene of scenes) {
    for (const [fieldId, values] of Object.entries(scene.filterValues)) {
      filterValues[fieldId] = Array.from(new Set([...(filterValues[fieldId] ?? []), ...values]));
    }
  }

  const primaryTags = PRIMARY_TAG_FIELD_IDS.map((fieldId) => {
    const field = taxonomyField(taxonomy, fieldId);
    const value = filterValues[fieldId]?.[0] ?? "未分类";
    return { fieldId, label: field?.label ?? fieldId, value };
  });

  return {
    mediaId: media.id,
    videoName: video.video ?? media.name,
    scenes,
    primaryTags,
    filterValues,
    searchText: [media.name, media.originalPath, video.overall_summary, ...scenes.map((scene) => scene.searchText)]
      .map(normalizeText)
      .filter(Boolean)
      .join(" "),
  };
}

export function matchesQuery(index: MediaAnalysisIndex | null, media: MediaItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${media.name} ${media.originalPath} ${index?.searchText ?? ""}`
    .toLowerCase()
    .includes(normalized);
}

export function matchesFilters(
  index: MediaAnalysisIndex | null,
  selectedFilters: Record<string, string[]>,
) {
  return Object.entries(selectedFilters).every(([, selected]) => selected.length === 0) ||
    Object.entries(selectedFilters).every(([fieldId, selected]) => {
      if (selected.length === 0) return true;
      const values = index?.filterValues[fieldId] ?? [];
      return selected.some((value) => values.includes(value));
    });
}

export function matchingScenes(
  index: MediaAnalysisIndex,
  selectedFilters: Record<string, string[]>,
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  return index.scenes.filter((scene) => {
    const textOk = !normalized || scene.searchText.includes(normalized);
    const filtersOk = Object.entries(selectedFilters).every(([fieldId, selected]) => {
      if (selected.length === 0) return true;
      const values = scene.filterValues[fieldId] ?? [];
      return selected.some((value) => values.includes(value));
    });
    return textOk && filtersOk;
  });
}
