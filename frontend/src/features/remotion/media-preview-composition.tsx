import { Audio, Video } from "remotion";

import type { MediaType } from "@/types/project";

interface MediaPreviewCompositionProps {
  src: string;
  type: MediaType;
}

export function MediaPreviewComposition({ src, type }: MediaPreviewCompositionProps) {
  if (type === "video") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Video
          src={src}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }

  // audio / generated-audio: show waveform placeholder + play audio
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#0c0c0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Audio src={src} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          color: "rgba(255,255,255,0.25)",
          fontFamily: "sans-serif",
          fontSize: 13,
        }}
      >
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="16" width="4" height="16" rx="2" fill="currentColor" />
          <rect x="12" y="10" width="4" height="28" rx="2" fill="currentColor" />
          <rect x="20" y="6" width="4" height="36" rx="2" fill="currentColor" />
          <rect x="28" y="10" width="4" height="28" rx="2" fill="currentColor" />
          <rect x="36" y="16" width="4" height="16" rx="2" fill="currentColor" />
        </svg>
        <span>音频预览</span>
      </div>
    </div>
  );
}
