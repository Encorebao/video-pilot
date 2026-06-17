"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Clapperboard, FolderOpen, Loader2, Plus, Sparkles } from "lucide-react";

import { useProjectStore } from "@/stores/project-store";
import { useElectronCapability } from "@/hooks/use-electron-capability";

type ProjectAction = "new" | "open";

function inferProjectName(folderPath: string): string {
  const normalized = folderPath.replace(/\/+$/, "");
  const name = normalized.split(/[\\/]/).filter(Boolean).at(-1);
  return name || "Untitled Project";
}

export function ProjectLauncher() {
  const router = useRouter();
  const loadRecentProjects = useProjectStore((state) => state.loadRecentProjects);
  const initFolderProject = useProjectStore((state) => state.initFolderProject);
  const openFolderProject = useProjectStore((state) => state.openFolderProject);
  const openRecentFolderProject = useProjectStore((state) => state.openRecentFolderProject);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const isLoadingProject = useProjectStore((state) => state.isLoadingProject);
  const projectError = useProjectStore((state) => state.projectError);
  const [activeAction, setActiveAction] = useState<ProjectAction>("new");
  const [folderPath, setFolderPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const hasElectronFolderPicker = useElectronCapability("selectProjectFolder");

  useEffect(() => {
    void loadRecentProjects();
  }, [loadRecentProjects]);

  const actionTitle = activeAction === "new" ? "新建项目" : "打开项目文件夹";
  const canSubmit = folderPath.trim().length > 0 && (activeAction === "open" || projectName.trim().length > 0);

  const actionHint = useMemo(() => {
    if (hasElectronFolderPicker) {
      return "选择一个本地文件夹作为项目根目录。";
    }

    return "浏览器开发模式无法读取系统文件夹，请输入本机上的绝对路径。";
  }, [hasElectronFolderPicker]);

  async function chooseFolder(nextAction: ProjectAction) {
    setActiveAction(nextAction);

    if (!window.electronAPI) {
      return;
    }

    const selectedPath = await window.electronAPI.selectProjectFolder();
    if (!selectedPath) return;

    setFolderPath(selectedPath);
    if (nextAction === "new") {
      setProjectName((name) => name || inferProjectName(selectedPath));
    } else {
      const opened = await openFolderProject(selectedPath);
      if (opened) {
        router.push("/editor");
      }
    }
  }

  async function submitProjectAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = folderPath.trim();
    if (!path) return;

    const opened =
      activeAction === "new"
        ? await initFolderProject(path, projectName.trim() || inferProjectName(path))
        : await openFolderProject(path);

    if (opened) {
      router.push("/editor");
    }
  }

  async function openRecent(folderPathToOpen: string) {
    const opened = await openRecentFolderProject(folderPathToOpen);
    if (opened) {
      router.push("/editor");
    }
  }

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 md:px-8">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.08] text-[12px] text-white/35">
          <div className="flex items-center gap-2">
            <Clapperboard className="size-4 text-white/45" />
            <span className="font-semibold tracking-wide text-white/75">Video Pilot</span>
          </div>
          <Link
            href="/settings"
            className="rounded-[6px] px-2 py-1 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          >
            设置
          </Link>
        </header>

        <section className="grid flex-1 content-center gap-5 py-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="flex min-h-[360px] flex-col justify-between rounded-[14px] border border-white/[0.08] bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
            <div>
              <div className="mb-8 inline-flex items-center gap-2 rounded-[7px] bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/40">
                <Sparkles className="size-3.5" />
                本地 AI 剪辑工作台
              </div>
              <h1 className="max-w-[420px] text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-white md:text-[46px]">
                打开项目，进入剪辑。
              </h1>
            </div>

            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => void chooseFolder("new")}
                className="group flex h-11 items-center justify-between rounded-[8px] bg-white px-3.5 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
              >
                <span className="flex items-center gap-2">
                  <Plus className="size-4" />
                  新建项目
                </span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={() => void chooseFolder("open")}
                className="group flex h-11 items-center justify-between rounded-[8px] border border-white/[0.08] bg-white/[0.06] px-3.5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <FolderOpen className="size-4" />
                  打开项目文件夹
                </span>
                <ArrowRight className="size-4 text-white/35 transition-transform group-hover:translate-x-0.5 group-hover:text-white/55" />
              </button>
            </div>
          </div>

          <div className="rounded-[14px] border border-white/[0.08] bg-[#151515] p-3 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between px-2 py-2">
              <h2 className="text-[13px] font-semibold text-white/75">最近项目</h2>
              <span className="text-[11px] text-white/25">{recentProjects.length} 个项目</span>
            </div>
            <div className="mt-1 grid gap-2">
              {recentProjects.length === 0 ? (
                <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] px-3.5 py-5 text-[12px] text-white/30">
                  暂无最近项目
                </div>
              ) : null}
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => void openRecent(project.location)}
                  className="group grid gap-1 rounded-[10px] border border-white/[0.07] bg-white/[0.035] px-3.5 py-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.07]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13px] font-medium text-white/78">
                      {project.name}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/55" />
                  </div>
                  <span className="truncate text-[11px] text-white/30">{project.location}</span>
                  <span className="truncate text-[10px] text-white/22">{project.summary}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <form
          onSubmit={(event) => void submitProjectAction(event)}
          className="mb-3 grid gap-3 border-t border-white/[0.08] pt-4 lg:grid-cols-[160px_minmax(0,1fr)_minmax(180px,260px)_120px]"
        >
          <div>
            <div className="text-[12px] font-medium text-white/70">{actionTitle}</div>
            <div className="mt-1 text-[11px] leading-4 text-white/30">{actionHint}</div>
          </div>
          <input
            value={folderPath}
            onChange={(event) => {
              const value = event.target.value;
              setFolderPath(value);
              if (activeAction === "new") {
                setProjectName((name) => name || inferProjectName(value));
              }
            }}
            placeholder="/Users/you/Projects/my-video-project"
            className="h-10 min-w-0 rounded-[7px] border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/70 outline-none transition-colors placeholder:text-white/18 focus:border-white/[0.18] focus:bg-white/[0.06]"
          />
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            disabled={activeAction === "open"}
            placeholder="项目名称"
            className="h-10 min-w-0 rounded-[7px] border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white/70 outline-none transition-colors placeholder:text-white/18 focus:border-white/[0.18] focus:bg-white/[0.06] disabled:opacity-35"
          />
          <button
            type="submit"
            disabled={!canSubmit || isLoadingProject}
            className="flex h-10 items-center justify-center gap-2 rounded-[7px] bg-white/[0.1] px-3 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.14] hover:text-white disabled:pointer-events-none disabled:opacity-35"
          >
            {isLoadingProject ? <Loader2 className="size-3.5 animate-spin" /> : null}
            进入
          </button>
        </form>

        {projectError ? (
          <div className="mb-5 rounded-[8px] border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[12px] text-amber-100/60">
            {projectError}
          </div>
        ) : null}
      </div>
    </main>
  );
}
