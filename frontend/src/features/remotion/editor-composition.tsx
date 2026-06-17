import { Audio, Sequence, Video } from "remotion";

import { getMediaStreamUrl } from "@/services/media-api";
import type { MediaItem, ProjectRecord } from "@/types/project";
import { subtitlesForTimelineClip } from "@/features/subtitles/lib/subtitle-timeline";
import {
  flattenTimelineForPlayback,
  sortFlattenedVideoEntriesForRender,
} from "@/features/timeline/lib/timeline-model";

interface EditorCompositionProps {
  project: ProjectRecord;
}

function getMediaSrc(project: ProjectRecord, mediaItems: MediaItem[], mediaId: string): string | null {
  const item = mediaItems.find((m) => m.id === mediaId);
  if (!item) return null;
  return getMediaStreamUrl(project.location, item.id);
}

function TimelineVideo({
  src,
  startFrom,
}: {
  src: string;
  startFrom: number;
}) {
  return (
    <Video
      src={src}
      startFrom={startFrom}
      onError={() => undefined}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function TimelineAudio({ src, startFrom }: { src: string; startFrom: number }) {
  return <Audio src={src} startFrom={startFrom} onError={() => undefined} />;
}

export function EditorComposition({ project }: EditorCompositionProps) {
  const { mediaItems } = project;
  const subtitleSegments = project.subtitles?.segments ?? [];
  const flattenedEntries = flattenTimelineForPlayback(project);
  const videoEntries = flattenedEntries
    .filter((entry) => entry.trackType === "video")
    .sort(sortFlattenedVideoEntriesForRender);
  const audioEntries = flattenedEntries.filter((entry) => entry.trackType === "audio");

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#000", position: "relative" }}>
      {videoEntries.map((entry) => {
        const clip = entry.clip;
        const src = getMediaSrc(project, mediaItems, clip.mediaId);
        if (!src) return null;
        return (
          <Sequence
            key={`${clip.id}-${entry.startFrame}-video`}
            from={entry.startFrame}
            durationInFrames={entry.durationInFrames}
          >
            <TimelineVideo src={src} startFrom={entry.sourceIn} />
          </Sequence>
        );
      })}
      {audioEntries.map((entry) => {
        const clip = entry.clip;
        const src = getMediaSrc(project, mediaItems, clip.mediaId);
        if (!src) return null;
        return (
          <Sequence
            key={`${clip.id}-${entry.startFrame}-audio`}
            from={entry.startFrame}
            durationInFrames={entry.durationInFrames}
          >
            <TimelineAudio src={src} startFrom={entry.sourceIn} />
          </Sequence>
        );
      })}
      {videoEntries.flatMap((entry) => {
        const timelineClip = {
          ...entry.clip,
          startFrame: entry.startFrame,
          durationInFrames: entry.durationInFrames,
          sourceIn: entry.sourceIn,
        };
        return subtitlesForTimelineClip(timelineClip, subtitleSegments).map((subtitle) => (
          <Sequence
            key={`${entry.clip.id}-${entry.startFrame}-${subtitle.id}`}
            from={subtitle.timelineStartFrame}
            durationInFrames={subtitle.durationInFrames}
          >
            <div
              style={{
                position: "absolute",
                left: "8%",
                right: "8%",
                bottom: "8%",
                textAlign: "center",
                color: "white",
                fontSize: 42,
                lineHeight: 1.35,
                fontWeight: 700,
                textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
                fontFamily: "sans-serif",
              }}
            >
              {subtitle.text}
            </div>
          </Sequence>
        ));
      })}
    </div>
  );
}
