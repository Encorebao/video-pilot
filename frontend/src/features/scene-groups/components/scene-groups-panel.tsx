"use client";

import { ChevronDown, FolderPlus, RefreshCw, X } from "lucide-react";
import { useMemo, useState } from "react";

import { mediaTypeLabel } from "@/features/media/components/media-side-panel";
import {
  groupableMediaItems,
  mediaCaptureLabel,
  sceneGroupTimeRange,
} from "@/features/scene-groups/lib/scene-grouping";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useDragStore } from "@/stores/drag-store";
import { DRAG_MIME, type DragPayload } from "@/types/drag";
import type { MediaItem, SceneGroup } from "@/types/project";

const gapOptions = [
  { value: 5, label: "5分钟" },
  { value: 10, label: "10分钟" },
  { value: 60, label: "1小时" },
  { value: 1440, label: "24小时" },
];

function GroupMediaItem({
  item,
  group,
}: {
  item: MediaItem;
  group: SceneGroup;
}) {
  const removeMediaFromSceneGroup = useProjectStore((s) => s.removeMediaFromSceneGroup);
  const previewMediaId = useTimelineStore((s) => s.previewMediaId);
  const setPreviewMediaId = useTimelineStore((s) => s.setPreviewMediaId);
  const isActive = previewMediaId === item.id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setPreviewMediaId(isActive ? null : item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setPreviewMediaId(isActive ? null : item.id);
        }
      }}
      className={`w-full rounded-[7px] border px-2 py-2 text-left transition-colors ${
        isActive
          ? "border-white/[0.14] bg-white/[0.08]"
          : "border-white/[0.06] bg-white/[0.025] hover:border-white/[0.11] hover:bg-white/[0.045]"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-white/70">{item.name}</div>
          <div className="mt-0.5 text-[10px] text-white/28">
            {mediaTypeLabel[item.type] ?? item.type} · {mediaCaptureLabel(item)}
          </div>
        </div>
        <button
          type="button"
          title="移出分组"
          onClick={(event) => {
            event.stopPropagation();
            removeMediaFromSceneGroup(group.id, item.id);
          }}
          className="rounded p-1 text-white/24 transition-colors hover:bg-white/[0.07] hover:text-white/60"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}

function SceneGroupCard({
  group,
  mediaItems,
  allGroupableMedia,
  collapsed,
  dragActive,
  onToggleCollapsed,
  onDragEnterGroup,
  onDragLeaveGroup,
  onDropMedia,
}: {
  group: SceneGroup;
  mediaItems: MediaItem[];
  allGroupableMedia: MediaItem[];
  collapsed: boolean;
  dragActive: boolean;
  onToggleCollapsed: () => void;
  onDragEnterGroup: () => void;
  onDragLeaveGroup: () => void;
  onDropMedia: (mediaId: string) => void;
}) {
  const updateSceneGroup = useProjectStore((s) => s.updateSceneGroup);
  const addMediaToSceneGroup = useProjectStore((s) => s.addMediaToSceneGroup);
  const dragPayload = useDragStore((s) => s.payload);
  const mediaById = useMemo(() => new Map(mediaItems.map((item) => [item.id, item])), [mediaItems]);
  const groupItems = group.mediaIds
    .map((id) => mediaById.get(id))
    .filter((item): item is MediaItem => !!item);
  const addableItems = allGroupableMedia.filter((item) => !group.mediaIds.includes(item.id));
  const groupableIds = useMemo(
    () => new Set(allGroupableMedia.map((item) => item.id)),
    [allGroupableMedia],
  );

  function readDropPayload(event: React.DragEvent): DragPayload | null {
    const transferPayload = event.dataTransfer.getData(DRAG_MIME);
    if (transferPayload) {
      try {
        return JSON.parse(transferPayload) as DragPayload;
      } catch {
        return null;
      }
    }
    return dragPayload;
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    onDragLeaveGroup();
    const payload = readDropPayload(event);
    if (payload?.kind !== "media" || !groupableIds.has(payload.mediaId)) return;
    onDropMedia(payload.mediaId);
  }

  return (
    <section
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnterGroup();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDragLeaveGroup();
        }
      }}
      onDrop={handleDrop}
      className={`rounded-[8px] border p-2.5 transition-colors ${
        dragActive
          ? "border-cyan-300/35 bg-cyan-300/[0.07]"
          : "border-white/[0.07] bg-white/[0.025]"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          title={collapsed ? "展开分组" : "收起分组"}
          onClick={onToggleCollapsed}
          className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/65"
        >
          <ChevronDown className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        <input
          value={group.title}
          onChange={(event) => updateSceneGroup(group.id, { title: event.target.value })}
          className="h-7 min-w-0 flex-1 rounded-[6px] border border-white/[0.06] bg-black/15 px-2 text-[12px] font-medium text-white/75 outline-none focus:border-white/[0.14]"
        />
        <span
          className={`shrink-0 rounded-[5px] border px-1.5 py-0.5 text-[10px] ${
            group.source === "auto"
              ? "border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-100/45"
              : "border-amber-300/15 bg-amber-300/[0.06] text-amber-100/50"
          }`}
        >
          {group.source === "auto" ? "自动" : "手动"}
        </span>
      </div>
      <div className="mt-1.5 text-[10px] leading-4 text-white/28">
        {sceneGroupTimeRange(group, mediaItems)} · {groupItems.length} 个素材
      </div>
      {collapsed ? null : (
        <>
          <textarea
            value={group.notes}
            onChange={(event) => updateSceneGroup(group.id, { notes: event.target.value })}
            placeholder="描述这个集中拍摄时段，例如地点、任务、人物或可用镜头。"
            className="mt-2 min-h-16 w-full resize-none rounded-[7px] border border-white/[0.06] bg-black/15 px-2 py-1.5 text-[11px] leading-4 text-white/62 outline-none placeholder:text-white/18 focus:border-white/[0.14]"
          />
          <div className="mt-2 space-y-1.5">
            {groupItems.length === 0 ? (
              <div className="rounded-[7px] border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-[11px] text-white/25">
                拖入素材，或从下方菜单添加。
              </div>
            ) : (
              groupItems.map((item) => <GroupMediaItem key={item.id} item={item} group={group} />)
            )}
          </div>
          {addableItems.length > 0 ? (
            <select
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                addMediaToSceneGroup(group.id, event.target.value);
              }}
              className="mt-2 h-7 w-full rounded-[6px] border border-white/[0.06] bg-[#171717] px-2 text-[11px] text-white/50 outline-none focus:border-white/[0.14]"
            >
              <option value="">添加素材到此分组</option>
              {addableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : null}
        </>
      )}
    </section>
  );
}

export function SceneGroupsPanel() {
  const project = useProjectStore((s) => s.currentProject);
  const updateSceneGroupingSettings = useProjectStore((s) => s.updateSceneGroupingSettings);
  const autoOrganizeSceneGroups = useProjectStore((s) => s.autoOrganizeSceneGroups);
  const createManualSceneGroup = useProjectStore((s) => s.createManualSceneGroup);
  const addMediaToSceneGroup = useProjectStore((s) => s.addMediaToSceneGroup);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);

  const allGroupableMedia = useMemo(
    () => groupableMediaItems(project?.mediaItems ?? []),
    [project?.mediaItems],
  );

  if (!project) return null;

  function toggleCollapsed(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm">
      <div className="shrink-0 border-b border-white/[0.06] px-2 py-2">
        <div className="flex items-center gap-1.5">
          <select
            value={project.sceneGroups.settings.gapMinutes}
            onChange={(event) => updateSceneGroupingSettings(Number(event.target.value))}
            className="h-7 min-w-0 flex-1 rounded-[7px] border border-white/[0.08] bg-white/[0.035] px-2 text-[11px] text-white/60 outline-none focus:border-white/[0.16]"
          >
            {gapOptions.map((option) => (
              <option key={option.value} value={option.value}>
                间距 {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="按创建时间自动整理"
            onClick={autoOrganizeSceneGroups}
            className="flex h-7 shrink-0 items-center gap-1 rounded-[7px] px-2 text-[11px] text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/65"
          >
            <RefreshCw className="size-3.5" />
            自动整理
          </button>
          <button
            type="button"
            title="新建手动分组"
            onClick={createManualSceneGroup}
            className="flex h-7 shrink-0 items-center rounded-[7px] px-2 text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/65"
          >
            <FolderPlus className="size-3.5" />
          </button>
        </div>
        <div className="mt-1.5 text-[10px] leading-4 text-white/25">
          按素材拍摄/创建时间组织视频和音频；生成音频与字幕不参与自动分组。
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {project.sceneGroups.groups.length === 0 ? (
          <div className="rounded-[8px] border border-white/[0.06] bg-white/[0.025] px-3 py-6 text-center text-[11px] leading-5 text-white/25">
            当前还没有场景分组。导入素材后会自动整理，也可以手动新建分组。
          </div>
        ) : (
          project.sceneGroups.groups.map((group) => (
            <SceneGroupCard
              key={group.id}
              group={group}
              mediaItems={project.mediaItems}
              allGroupableMedia={allGroupableMedia}
              collapsed={collapsedGroupIds.has(group.id)}
              dragActive={dragOverGroupId === group.id}
              onToggleCollapsed={() => toggleCollapsed(group.id)}
              onDragEnterGroup={() => setDragOverGroupId(group.id)}
              onDragLeaveGroup={() => setDragOverGroupId(null)}
              onDropMedia={(mediaId) => addMediaToSceneGroup(group.id, mediaId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
