"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Chamfer, HexAvatar, PerspectiveGrid, ScanBar, StreamCursor } from "@/components/tron";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Gauge } from "@/components/ui/gauge";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Led } from "@/components/ui/led";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-tron-line pt-4">
      <h2 className="font-hud text-[10px] uppercase tracking-[0.16em] text-tron-cyan">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export function Gallery() {
  const [checked, setChecked] = useState(true);
  return (
    <main className="h-full overflow-y-auto bg-bg p-6 text-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <h1 className="font-hud text-sm uppercase tracking-[0.2em] text-white">Tron UI — primitives</h1>

        <Section title="Buttons">
          <Button variant="primary">Send</Button>
          <Button>Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button size="sm">Small</Button>
          <Button size="icon" aria-label="Add"><Plus /></Button>
          <Button disabled>Disabled</Button>
        </Section>

        <Section title="Fields">
          <Input placeholder="Search sessions…" className="max-w-xs" />
          <Input aria-invalid placeholder="Invalid" className="max-w-xs" />
          <Textarea placeholder="Message…" className="max-w-md" />
        </Section>

        <Section title="Status">
          <Led status="running" label="Running" /> <Led status="done" label="Done" />
          <Led status="idle" label="Idle" /> <Led status="error" label="Error" />
          <Badge tone="orange">running</Badge><Badge tone="cyan">done</Badge><Badge tone="red">failed</Badge><Badge>idle</Badge>
          <Gauge value={42} label="Context" /><Gauge value={80} label="Context" /><Gauge value={97} label="Context" />
          <Kbd>⌘K</Kbd>
        </Section>

        <Section title="Overlays">
          <Dialog>
            <DialogTrigger asChild><Button>Dialog</Button></DialogTrigger>
            <DialogContent closeLabel="Close">
              <DialogHeader><DialogTitle>New session</DialogTitle><DialogDescription>Pick a working directory.</DialogDescription></DialogHeader>
              <Input placeholder="/home/ubuntu/Workspace" />
              <DialogFooter><Button variant="ghost">Cancel</Button><Button variant="primary">Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild><Button>Sheet (right)</Button></DialogTrigger>
            <DialogContent side="right" closeLabel="Close">
              <DialogHeader><DialogTitle>Agents</DialogTitle><DialogDescription>Side sheet variant.</DialogDescription></DialogHeader>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Session</DropdownMenuLabel>
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuItem>Fork</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-tron-red">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild><Button>Popover</Button></PopoverTrigger>
            <PopoverContent>Model: claude-opus-5-5 · high</PopoverContent>
          </Popover>
          <Tooltip content="New session (Ctrl+Alt+N)"><Button size="icon" aria-label="New session"><Plus /></Button></Tooltip>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Switch checked={checked} onCheckedChange={setChecked} aria-label="Expand thinking" /> Expand thinking
          </label>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="file" className="w-full max-w-md">
            <TabsList><TabsTrigger value="file">models.ts</TabsTrigger><TabsTrigger value="term">terminal</TabsTrigger></TabsList>
            <TabsContent value="file" className="p-3 font-mono text-xs text-text-muted">export async function fetchModels() {"{…}"}</TabsContent>
            <TabsContent value="term" className="p-3 font-mono text-xs text-text-muted">$ npm test</TabsContent>
          </Tabs>
        </Section>

        <Section title="Identity">
          <HexAvatar label="pi" active /><HexAvatar label="ops" /><HexAvatar label="🤖bot" />
          <div className="w-64"><ScanBar /></div>
          <span className="text-sm">Streaming<StreamCursor /></span>
          <Chamfer tone="orange" glow className="max-w-sm" innerClassName="px-3 py-2 text-sm">User message, chamfered</Chamfer>
          <Chamfer glow className="w-full max-w-xl" innerClassName="px-3 py-3 text-sm text-text-muted">Composer shell — Message…</Chamfer>
          <div className="relative h-40 w-full overflow-hidden border border-tron-line"><PerspectiveGrid /></div>
        </Section>
      </div>
    </main>
  );
}
