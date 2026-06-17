import type { MediaItem, SceneGroup, SceneGroupsState } from "@/types/project";

const GROUPABLE_TYPES = new Set<MediaItem["type"]>(["video", "audio"]);

function nowIso() {
  return new Date().toISOString();
}

function timestampForMedia(item: MediaItem): number {
  const raw = item.capturedAt ?? item.updatedAt ?? item.createdAt ?? "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function displayTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp === Number.MAX_SAFE_INTEGER) return "未知时间";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function mediaKey(mediaIds: string[]): string {
  return [...mediaIds].sort().join("|");
}

function titleForGroup(items: MediaItem[]): string {
  if (items.length === 0) return "未命名分组";
  const timestamps = items.map(timestampForMedia).filter((time) => time !== Number.MAX_SAFE_INTEGER);
  if (timestamps.length === 0) return "未知时间";
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  const startText = displayTime(start);
  const endText = displayTime(end);
  return startText === endText ? startText : `${startText} - ${endText}`;
}

export function groupableMediaItems(mediaItems: MediaItem[]): MediaItem[] {
  return mediaItems
    .filter((item) => GROUPABLE_TYPES.has(item.type))
    .sort((a, b) => {
      const byTime = timestampForMedia(a) - timestampForMedia(b);
      return byTime !== 0 ? byTime : a.name.localeCompare(b.name, "zh-CN");
    });
}

export function buildAutoSceneGroups(mediaItems: MediaItem[], gapMinutes: number): SceneGroup[] {
  const sorted = groupableMediaItems(mediaItems);
  const gapMs = Math.max(0, gapMinutes) * 60 * 1000;
  const buckets: MediaItem[][] = [];

  for (const item of sorted) {
    const currentTimestamp = timestampForMedia(item);
    const previousBucket = buckets[buckets.length - 1];
    const previousItem = previousBucket?.[previousBucket.length - 1];
    const previousTimestamp = previousItem ? timestampForMedia(previousItem) : null;
    const shouldStartNew =
      !previousBucket ||
      previousTimestamp === null ||
      currentTimestamp - previousTimestamp > gapMs;

    if (shouldStartNew) {
      buckets.push([item]);
    } else {
      previousBucket.push(item);
    }
  }

  const createdAt = nowIso();
  return buckets.map((items, index) => ({
    id: `scene-group-auto-${createdAt}-${index}`,
    title: titleForGroup(items),
    notes: "",
    mediaIds: items.map((item) => item.id),
    source: "auto",
    createdAt,
    updatedAt: createdAt,
  }));
}

export function mergeAutoSceneGroups(
  current: SceneGroupsState,
  mediaItems: MediaItem[],
  gapMinutes: number,
): SceneGroupsState {
  const autoGroups = buildAutoSceneGroups(mediaItems, gapMinutes);
  const existingAutoByMedia = new Map(
    current.groups
      .filter((group) => group.source === "auto")
      .map((group) => [mediaKey(group.mediaIds), group]),
  );
  const updatedAt = nowIso();
  const mergedAuto = autoGroups.map((group) => {
    const existing = existingAutoByMedia.get(mediaKey(group.mediaIds));
    if (!existing) return group;
    return {
      ...group,
      id: existing.id,
      title: existing.title || group.title,
      notes: existing.notes,
      createdAt: existing.createdAt,
      updatedAt,
    };
  });

  return {
    settings: {
      ...current.settings,
      gapMinutes,
    },
    groups: [...mergedAuto, ...current.groups.filter((group) => group.source === "manual")],
  };
}

export function sceneGroupTimeRange(group: SceneGroup, mediaItems: MediaItem[]): string {
  const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
  const timestamps = group.mediaIds
    .map((id) => mediaById.get(id))
    .filter((item): item is MediaItem => !!item)
    .map(timestampForMedia)
    .filter((time) => time !== Number.MAX_SAFE_INTEGER);
  if (timestamps.length === 0) return "未知时间";
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  return start === end ? displayTime(start) : `${displayTime(start)} - ${displayTime(end)}`;
}

export function mediaCaptureLabel(item: MediaItem): string {
  return displayTime(timestampForMedia(item));
}
