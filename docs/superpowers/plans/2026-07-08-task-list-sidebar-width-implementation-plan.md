# 任务列表左栏宽度修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加宽桌面端左侧任务栏并修正任务列表滚动区边缘留白，让任务卡片在首页和详情页都能完整显示。

**Architecture:** 继续复用现有 Next + Electron 壳层，不改任务卡片结构和任务列表逻辑。通过 `AppShell` 调整桌面栅格列宽，通过 `TaskListPanel` 调整滚动区右侧安全空间，只做容器级布局修复。

**Tech Stack:** Next.js App Router、React 19、Tailwind CSS、Electron 37、现有 `npm run smoke`

## Global Constraints

- 增加左侧任务栏在桌面布局下的可用宽度
- 避免任务卡片贴着滚动条边缘，产生被遮挡的视觉效果
- 保持现有任务卡片结构、交互和信息层级不变
- 不影响首页与任务详情页共用的壳层布局
- 不重做任务卡片内容排版
- 不修改任务列表筛选、导入、重命名、删除交互
- 不改变移动端或小屏下的堆叠布局逻辑
- 不调整右侧详情页内部组件宽度策略

---

## File Structure

- Modify: `E:\ai-list\radio-to-text\app\desktop\web\components\app-shell.tsx`
  - 调整桌面栅格列宽，让左栏从固定 `320px` 改为更宽的响应式列
- Modify: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-list-panel.tsx`
  - 调整任务列表 `ScrollArea` 和内部列表容器的右侧安全空间，避免卡片贴边

### Task 1: 调整桌面壳层左栏列宽

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\web\components\app-shell.tsx`

**Interfaces:**
- Consumes: `AppShell({ eyebrow, title, description, sidebar, children })`
- Produces: 首页和任务详情页共用的桌面两栏布局，左栏列宽改为 `minmax(360px, 400px)`，右侧保持 `minmax(0, 1fr)`

- [ ] **Step 1: 写出列宽调整代码**

```tsx
export function AppShell({ eyebrow, title, description, sidebar, children }: AppShellProps) {
  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(360px,400px)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/80 bg-white/70 shadow-[0_24px_80px_rgba(82,54,17,0.14)] backdrop-blur">
          <CardContent className="flex h-full flex-col gap-6 p-5">
            <div className="min-h-0 flex-1">{sidebar}</div>
          </CardContent>
        </Card>
        <main className="space-y-5">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 做一次语法检查**

Run: `npm --prefix app/desktop/web run lint`
Expected: 如果项目未配置 `lint` 脚本则记录跳过，否则退出码 `0`

### Task 2: 调整任务列表滚动区右侧安全空间

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-list-panel.tsx`

**Interfaces:**
- Consumes: `TaskListPanel()` 当前返回的 `ScrollArea` 与 `TaskListItem`
- Produces: 保持原有任务列表渲染逻辑不变，但为滚动条和卡片之间增加额外可见间距

- [ ] **Step 1: 收紧滚动区与列表容器的边缘关系**

```tsx
        <ScrollArea className="min-h-0 flex-1 pr-1">
          <div className="space-y-3 pr-4">
            {visibleTasks.map((task) => (
              <TaskListItem
                isActive={selectedTaskId === task.task_id}
                key={task.task_id}
                onDelete={(taskId) => void handleDeleteTask(taskId)}
                onOpen={handleOpenTask}
                onRename={(taskId) => void handleRenameTask(taskId)}
                task={task}
              />
            ))}
          </div>
        </ScrollArea>
```

- [ ] **Step 2: 手动确认空状态容器也在相同留白范围内**

```tsx
            {!isLoading && !visibleTasks.length ? (
              <div className="rounded-[1.3rem] border border-dashed border-border/80 bg-white/60 px-5 py-8 text-center">
                ...
              </div>
            ) : null}
```

- [ ] **Step 3: 做一次 TypeScript 构建验证**

Run: `npm --prefix app/desktop/web run build`
Expected: 退出码 `0`

### Task 3: 运行冒烟验证并检查差异范围

**Files:**
- Verify: `E:\ai-list\radio-to-text\app\desktop\web\components\app-shell.tsx`
- Verify: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-list-panel.tsx`

**Interfaces:**
- Consumes: `npm run smoke`, `git diff --stat`
- Produces: 本轮改动只覆盖左栏列宽和列表滚动区边缘留白

- [ ] **Step 1: 运行桌面冒烟脚本**

Run: `npm run smoke`
Expected: 退出码 `0`

- [ ] **Step 2: 检查最终差异范围**

Run: `git diff --stat -- app/desktop/web/components/app-shell.tsx app/desktop/web/components/tasks/task-list-panel.tsx`
Expected: 仅包含布局类名调整
