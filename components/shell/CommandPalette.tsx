"use client";

import { Command } from "cmdk";
import { useRef } from "react";
import { focusIfLost } from "@/lib/stacked-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useI18n } from "@/hooks/useI18n";

export type PaletteGroup = "actions" | "settings" | "sessions";
export type PaletteCommand = { id: string; group: PaletteGroup; label: string; hint?: string; disabled?: boolean; run: () => void };

const GROUPS: { group: PaletteGroup; labelKey: string }[] = [
  { group: "actions", labelKey: "palette.groupActions" },
  { group: "settings", labelKey: "palette.groupSettings" },
  { group: "sessions", labelKey: "palette.groupSessions" },
];

export function CommandPalette({ open, onOpenChange, commands }: { open: boolean; onOpenChange: (open: boolean) => void; commands: PaletteCommand[] }) {
  const { t } = useI18n();
  const openerRef = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-command-palette=""
        closeLabel={t("chat.close")}
        aria-describedby={undefined}
        className="top-[15vh] w-[min(92vw,36rem)] translate-y-0 gap-0 p-0"
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement as HTMLElement | null;
        }}
        onEscapeKeyDown={(event) => {
          if (event.isComposing || event.keyCode === 229) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusIfLost(document, openerRef.current);
        }}
      >
        <DialogTitle className="sr-only">{t("palette.title")}</DialogTitle>
        <Command label={t("palette.title")} loop vimBindings={false} className="flex flex-col">
          <Command.Input
            placeholder={t("palette.placeholder")}
            className="h-12 border-b border-tron-line bg-transparent pl-4 pr-12 font-mono text-sm text-white outline-none placeholder:text-text-dim"
          />
          <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-text-dim">{t("palette.empty")}</Command.Empty>
            {GROUPS.map(({ group, labelKey }) => {
              const items = commands.filter((command) => command.group === group);
              if (items.length === 0) return null;
              return (
                <Command.Group key={group} heading={t(labelKey)} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-hud [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-tron-cyan/70">
                  {items.map((command) => (
                    <Command.Item
                      key={command.id}
                      value={`${command.label} ${command.id}`}
                      disabled={command.disabled}
                      onSelect={() => {
                        onOpenChange(false);
                        command.run();
                      }}
                      className="flex min-h-9 cursor-pointer items-center justify-between gap-3 px-3 text-sm text-text-muted data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40 data-[selected=true]:bg-[linear-gradient(90deg,rgb(0_216_255/0.15),transparent)] data-[selected=true]:text-white data-[selected=true]:shadow-[inset_2px_0_0_var(--color-tron-cyan)] pointer-coarse:min-h-11"
                    >
                      <span className="truncate">{command.label}</span>
                      {command.hint && <Kbd>{command.hint}</Kbd>}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
