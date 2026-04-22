"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { ArrowRight, FolderOpen, Sparkles, Clapperboard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useProjectStore } from "@/stores/project-store";

export function ProjectLauncher() {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const createProjectSession = useProjectStore((state) => state.createProjectSession);
  const openRecentProject = useProjectStore((state) => state.openRecentProject);
  const recentProjects = useProjectStore((state) => state.recentProjects);

  const goToEditor = (action: () => void, pendingKey: string) => {
    setPendingAction(pendingKey);

    startTransition(() => {
      action();
      router.push("/editor");
    });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.12),_transparent_32%),linear-gradient(180deg,_var(--background),_var(--background-alt))]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-6 py-10 lg:px-10">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-[color:var(--border-strong)]">
            <CardHeader className="gap-4 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>Next.js 16</Badge>
                <Badge>Remotion Core</Badge>
                <Badge>Zustand Stores</Badge>
              </div>
              <CardTitle className="max-w-3xl text-4xl leading-tight md:text-5xl">
                面向 AI 剪辑流程的桌面视频编辑前端基线
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                当前版本先把项目入口、编辑器壳层、Remotion 预览和多轨时间轴视图做稳。
                模型接入暂按 API 地址 + key + 帮助文档处理。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                <Button
                  size="lg"
                  className="justify-between"
                  onClick={() => goToEditor(createProjectSession, "create")}
                  disabled={pendingAction !== null}
                >
                  新建项目
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="justify-between"
                  onClick={() => goToEditor(createProjectSession, "open")}
                  disabled={pendingAction !== null}
                >
                  打开项目文件夹
                  <FolderOpen className="size-4" />
                </Button>
              </div>

              <div className="grid gap-4 rounded-[24px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--panel-elevated)] p-5 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    编辑基线
                  </p>
                  <p className="text-sm text-[color:var(--foreground)]">
                    多视频片段、多音轨片段、导入后自动拆分轨道。
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    交互参考
                  </p>
                  <p className="text-sm text-[color:var(--foreground)]">
                    未明确的视频编辑细节默认参考 Final Cut Pro。
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    当前策略
                  </p>
                  <p className="text-sm text-[color:var(--foreground)]">
                    先稳定前端视图模型，再映射到后续 `project.json`。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">最近项目</CardTitle>
              <CardDescription>
                当前先用 mock 数据承载入口流程，后续接真实项目目录读取。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => goToEditor(() => openRecentProject(project.id), project.id)}
                  className="flex w-full flex-col gap-2 rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4 text-left transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--panel-elevated)]"
                  disabled={pendingAction !== null}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-[color:var(--foreground)]">
                      {project.name}
                    </span>
                    <ArrowRight className="size-4 text-[color:var(--muted-foreground)]" />
                  </div>
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    {project.summary}
                  </p>
                  <p className="text-xs text-[color:var(--muted-foreground)]">
                    {project.location}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[color:var(--accent-soft)] p-3 text-[color:var(--accent-strong)]">
                  <Clapperboard className="size-5" />
                </div>
                <CardTitle className="text-xl">编辑器壳层</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                左侧素材与模块导航、中部预览、下方时间轴、右侧属性区已经作为第一轮目标固定。
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[color:var(--accent-soft)] p-3 text-[color:var(--accent-strong)]">
                  <Sparkles className="size-5" />
                </div>
                <CardTitle className="text-xl">AI 入口收敛</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                视频分析、字幕、音色、TTS、模型配置先以可消费界面和交互入口为主，不提前绑定后端实现细节。
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[color:var(--accent-soft)] p-3 text-[color:var(--accent-strong)]">
                  <FolderOpen className="size-5" />
                </div>
                <CardTitle className="text-xl">项目存储适配</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                `project.json` 结构还未最终定稿，所以当前前端统一围绕稳定视图模型推进，减少后续返工。
              </CardDescription>
            </CardContent>
          </Card>
        </section>

        <div className="flex items-center justify-between border-t border-[color:var(--border)] pt-4 text-sm text-[color:var(--muted-foreground)]">
          <span>当前范围：前端第一轮基础工程 + 编辑器骨架</span>
          <Link href="/editor" className="underline underline-offset-4">
            直接进入编辑器样例
          </Link>
        </div>
      </div>
    </main>
  );
}
