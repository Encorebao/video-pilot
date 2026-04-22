import { Audio, Sequence, Video } from "remotion";

import type { MediaItem, ProjectRecord } from "@/types/project";

interface EditorCompositionProps {
  project: ProjectRecord;
}

function getMediaSrc(mediaItems: MediaItem[], mediaId: string): string | null {
  const item = mediaItems.find((m) => m.id === mediaId);
  if (!item?.projectPath) return null;
  return `/${item.projectPath}`;
}

export function EditorComposition({ project }: EditorCompositionProps) {
  const { mediaItems, timeline } = project;

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#000", position: "relative" }}>
      {timeline.videoTracks.map((track) =>
        track.clips.map((clip) => {
          const src = getMediaSrc(mediaItems, clip.mediaId);
          if (!src) return null;
          return (
            <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationInFrames}>
              <Video
                src={src}
                startFrom={clip.sourceIn ?? 0}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Sequence>
          );
        }),
      )}
      {timeline.audioTracks.map((track) =>
        track.clips.map((clip) => {
          const src = getMediaSrc(mediaItems, clip.mediaId);
          if (!src) return null;
          return (
            <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationInFrames}>
              <Audio src={src} startFrom={clip.sourceIn ?? 0} />
            </Sequence>
          );
        }),
      )}
    </div>
  );
}
