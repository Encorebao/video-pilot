export interface ClipPlacementInput {
  id: string;
  startFrame: number;
  durationInFrames: number;
}

function overlaps(start: number, duration: number, clip: ClipPlacementInput): boolean {
  const end = start + duration;
  const clipEnd = clip.startFrame + clip.durationInFrames;
  return start < clipEnd && end > clip.startFrame;
}

export function resolveNonOverlappingStart(
  clips: ClipPlacementInput[],
  requestedStartFrame: number,
  durationInFrames: number,
  excludeClipId?: string,
): number {
  const duration = Math.max(1, durationInFrames);
  const sorted = clips
    .filter((clip) => clip.id !== excludeClipId)
    .slice()
    .sort((a, b) => a.startFrame - b.startFrame);
  let start = Math.max(0, requestedStartFrame);

  for (;;) {
    const overlap = sorted.find((clip) => overlaps(start, duration, clip));
    if (!overlap) return start;
    start = overlap.startFrame + overlap.durationInFrames;
  }
}

export function resolveRippleInsertStart(
  clips: ClipPlacementInput[],
  requestedStartFrame: number,
): number {
  const sorted = clips.slice().sort((a, b) => a.startFrame - b.startFrame);
  let start = Math.max(0, requestedStartFrame);

  for (const clip of sorted) {
    const clipEnd = clip.startFrame + Math.max(1, clip.durationInFrames);
    if (clip.startFrame < start && clipEnd > start) {
      start = clipEnd;
    }
  }

  return start;
}

export function shiftClipsForRippleInsert<T extends ClipPlacementInput>(
  clips: T[],
  insertStartFrame: number,
  insertDurationInFrames: number,
): T[] {
  const duration = Math.max(1, insertDurationInFrames);
  return clips.map((clip) =>
    clip.startFrame >= insertStartFrame
      ? { ...clip, startFrame: clip.startFrame + duration }
      : clip,
  );
}
