import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Home, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";

type NavigationItem = {
  href?: Route;
  label: string;
  icon: ReactNode;
  active?: boolean;
};

type AppShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  sidebar: ReactNode;
  children: ReactNode;
};

function NavigationLink({ href, label, icon, active }: NavigationItem) {
  const content = (
    <>
      <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/10">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[0.72rem] uppercase tracking-[0.24em] opacity-60">Workspace</span>
        <span className="text-sm font-medium">{label}</span>
      </span>
    </>
  );

  if (!href) {
    return (
      <div
        className={cn(
          "inline-flex h-auto items-center justify-start rounded-2xl border border-dashed border-border/70 bg-background/45 px-4 py-3 text-left text-muted-foreground opacity-80",
          active && "border-primary/35 bg-primary/10 text-foreground"
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <Button
      asChild
      className={cn(
        "h-auto justify-start rounded-2xl px-4 py-3 text-left shadow-none",
        active
          ? "bg-primary text-primary-foreground hover:opacity-95"
          : "border border-border/70 bg-background/60 text-foreground hover:bg-accent"
      )}
      variant={active ? "default" : "ghost"}
    >
      <Link href={href}>{content}</Link>
    </Button>
  );
}

export function AppShell({ eyebrow, title, description, sidebar, children }: AppShellProps) {
  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(360px,400px)_minmax(0,1fr)]">
        <Card className="overflow-hidden border-border/80 bg-white/70 shadow-[0_24px_80px_rgba(82,54,17,0.14)] backdrop-blur">
          <CardContent className="flex h-full flex-col gap-6 p-5">
            <div className="rounded-[1.6rem] border border-border/70 bg-[linear-gradient(160deg,rgba(247,241,229,0.94),rgba(233,220,198,0.82))] p-5">
              <Badge
                className="mb-3 rounded-full bg-black/80 px-3 py-1 text-[0.68rem] uppercase tracking-[0.28em] text-white"
                variant="secondary"
              >
                Studio Deck
              </Badge>
              <p
                className="text-3xl font-semibold leading-tight text-foreground"
                style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
              >
                {title}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>

            <div className="space-y-3">
              <p className="text-[0.72rem] uppercase tracking-[0.32em] text-muted-foreground">
                Navigation
              </p>
              <div className="grid gap-2">
                <NavigationLink
                  active
                  href="/"
                  icon={<Home className="h-4 w-4" />}
                  label="任务列表"
                />
                <NavigationLink
                  icon={<Settings2 className="h-4 w-4" />}
                  label="设置"
                />
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-dashed border-border/80 bg-background/70 p-4">
              <p className="text-[0.72rem] uppercase tracking-[0.3em] text-muted-foreground">
                Workspace Note
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                当前阶段只迁移列表页壳层与状态模块，处理、播放器、审校和导出仍留到后续任务。
              </p>
            </div>

            <div className="min-h-0 flex-1">{sidebar}</div>
          </CardContent>
        </Card>

        <main className="space-y-5">
          <section className="rounded-[2rem] border border-border/70 bg-[linear-gradient(155deg,rgba(255,255,255,0.85),rgba(243,233,216,0.74))] p-6 shadow-[0_18px_60px_rgba(75,48,16,0.12)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[0.74rem] uppercase tracking-[0.34em] text-muted-foreground">
                  {eyebrow}
                </p>
                <h1
                  className="mt-3 max-w-3xl text-4xl leading-tight text-foreground sm:text-5xl"
                  style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
                >
                  本地任务像编辑部版面一样排开，导入后直接进入详情审校。
                </h1>
              </div>
              <Badge className="rounded-full px-4 py-2 text-xs tracking-[0.22em]" variant="outline">
                Electron + Next
              </Badge>
            </div>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
