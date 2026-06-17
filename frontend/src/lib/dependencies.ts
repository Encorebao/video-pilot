import type { DependencyItem } from "@/types/settings";

export const dependencyItems: DependencyItem[] = [
  {
    id: "dep-ffmpeg",
    name: "ffmpeg",
    type: "system",
    status: "installed",
    version: "7.1",
    installHint: "brew install ffmpeg",
    notes: "用于媒体转码、抽帧、抽音频和最终导出。",
  },
  {
    id: "dep-ffprobe",
    name: "ffprobe",
    type: "system",
    status: "installed",
    version: "7.1",
    installHint: "随 ffmpeg 一起安装",
    notes: "用于读取视频时长和媒体元信息。",
  },
  {
    id: "dep-python-backend",
    name: "Backend Python Runtime",
    type: "python-runtime",
    status: "installed",
    version: "3.9+",
    installHint: "backend/.venv/bin/python",
    notes: "Video Pilot 后端独立运行环境，不依赖旧项目虚拟环境。",
  },
  {
    id: "dep-remotion",
    name: "Remotion Player",
    type: "python-package",
    status: "installed",
    version: "project dependency",
    installHint: "npm install",
    notes: "用于编辑器预览播放。",
  },
];
