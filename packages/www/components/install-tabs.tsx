"use client";

import { Command } from "@/components/command";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/8bit/tabs";
import { installCommand } from "@/lib/install-script";

const installOptions = [
  {
    command: installCommand,
    id: "curl",
    label: "curl",
  },
  {
    command: "npm install -g @montekkundan/opendungeon",
    id: "npm",
    label: "npm",
  },
  {
    command: "bun add -g @montekkundan/opendungeon",
    id: "bun",
    label: "bun",
  },
  {
    command:
      "opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737",
    id: "host",
    label: "host",
  },
] as const;

export function InstallTabs() {
  return (
    <Tabs
      aria-label="Install command options"
      data-component="install-tabs"
      defaultValue="curl"
    >
      <TabsList data-slot="install-tab-list">
        {installOptions.map((option) => (
          <TabsTrigger key={option.id} value={option.id}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {installOptions.map((option) => (
        <TabsContent
          data-slot="install-tab-panel"
          key={option.id}
          value={option.id}
        >
          <Command value={option.command} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
