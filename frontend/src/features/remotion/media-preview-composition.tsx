import { useState } from "react";
import { Audio, Sequence, Video } from "remotion";

import type { MediaType, SubtitleSegment } from "@/types/project";

interface MediaPreviewCompositionProps {
  src: string;
  type: MediaType;
  subtitles?: SubtitleSegment[];
}

function UnsupportedMediaFallback({ type }: { type: MediaType }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: type === "video" ? "#000" : "#0c0c0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 8,
        color: "rgba(255,255,255,0.34)",
        fontFamily: "sans-serif",
        fontSize: 13,
        textAlign: "center",
        padding: 24,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>无法预览此媒体</div>
      <div style={{ maxWidth: 320, lineHeight: 1.6, color: "rgba(255,255,255,0.26)" }}>
        文件可能已移动、链接失效，或当前浏览器不支持此编码格式。
      </div>
    </div>
  );
}

function SubtitleOverlay({ segment }: { segment: SubtitleSegment }) {
  return (
    <Sequence from={segment.startFrame} durationInFrames={Math.max(1, segment.endFrame - segment.startFrame)}>
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
        {segment.text}
      </div>
    </Sequence>
  );
}

export function MediaPreviewComposition({ src, type, subtitles = [] }: MediaPreviewCompositionProps) {
  const [playbackError, setPlaybackError] = useState(false);

  if (playbackError) {
    return <UnsupportedMediaFallback type={type} />;
  }

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
          onError={() => setPlaybackError(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
        {subtitles.map((segment) => (
          <SubtitleOverlay key={segment.id} segment={segment} />
        ))}
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
      <Audio src={src} onError={() => setPlaybackError(true)} />
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
