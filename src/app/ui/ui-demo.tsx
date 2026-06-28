"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Shield, Wifi, StickyNote, Plus, Search, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CopyButton } from "@/components/shared/copy-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function UIDemo() {
  const [searchValue, setSearchValue] = useState("");

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-6 py-12">
      {/* Header */}
      <PageHeader
        heading="UI Components"
        subheading="KeyCrypt design system — all primitives visible here"
      >
        <ThemeToggle />
      </PageHeader>

      {/* Color tokens */}
      <Section title="Color Tokens">
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["primary", "bg-primary"],
              ["accent", "bg-accent"],
              ["background", "bg-background border"],
              ["surface", "bg-surface border"],
              ["success", "bg-success"],
              ["danger", "bg-danger"],
              ["warning", "bg-warning"],
              ["muted", "bg-muted"],
            ] as const
          ).map(([label, classes]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className={`size-10 rounded-lg ${classes}`} />
              <span className="text-muted-foreground text-[10px]">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button size="icon" aria-label="Add item">
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => toast.success("Vault item saved")}>Toast success</Button>
          <Button variant="destructive" onClick={() => toast.error("Failed to decrypt vault")}>
            Toast error
          </Button>
          <Button variant="outline" onClick={() => toast.info("Session expires in 5 minutes")}>
            Toast info
          </Button>
          <Button variant="secondary" onClick={() => toast.warning("Weak password detected")}>
            Toast warning
          </Button>
        </div>
      </Section>

      {/* Inputs */}
      <Section title="Inputs">
        <div className="grid max-w-md gap-3">
          <Input placeholder="Search vault…" aria-label="Search vault" />
          <Input type="password" placeholder="Master password" aria-label="Master password" />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Type something…"
            aria-label="Demo input"
          />
          <Input disabled placeholder="Disabled input" aria-label="Disabled" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Input
            className="max-w-xs font-mono text-sm"
            readOnly
            value="sk_live_abc123xyz789"
            aria-label="API key"
          />
          <CopyButton value="sk_live_abc123xyz789" />
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges">
        <div className="flex flex-wrap gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge className="bg-success text-white">Strong</Badge>
          <Badge className="bg-warning text-white">Medium</Badge>
          <Badge variant="destructive">Weak</Badge>
          <Badge variant="outline" className="gap-1">
            <Star className="size-3" aria-hidden="true" />
            Favorite
          </Badge>
        </div>
      </Section>

      {/* Cards */}
      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Vault item card preview */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-primary/10 flex size-8 items-center justify-center rounded-lg">
                    <KeyRound className="text-primary size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">GitHub</CardTitle>
                    <CardDescription className="text-xs">kanishk@example.com</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  Login
                </Badge>
              </div>
            </CardHeader>
            <CardFooter className="text-muted-foreground pt-2 text-xs">
              Updated 2 days ago
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="bg-accent/10 flex size-8 items-center justify-center rounded-lg">
                  <Shield className="text-accent size-4" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-sm">Server SSH Key</CardTitle>
                  <CardDescription className="text-xs">Production access</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <p className="text-muted-foreground line-clamp-2 text-xs">
                Encrypted note content — decrypted only in the browser after vault unlock.
              </p>
            </CardContent>
            <CardFooter className="text-muted-foreground pt-0 text-xs">
              Updated 5 hours ago
            </CardFooter>
          </Card>
        </div>
      </Section>

      {/* Dialog */}
      <Section title="Dialog">
        <Dialog>
          <DialogTrigger className="border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none">
            Open Dialog
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete vault item?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. The encrypted item will be permanently removed from
                your vault.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button variant="destructive">Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      {/* Dropdown */}
      <Section title="Dropdown Menu">
        <DropdownMenu>
          <DropdownMenuTrigger className="border-input bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none">
            Open Dropdown
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Item Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Star className="mr-2 size-4" aria-hidden="true" />
              Favorite
            </DropdownMenuItem>
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Copy password</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      {/* Command palette shell */}
      <Section title="Command Palette (shell)">
        <div className="max-w-md rounded-xl border shadow-sm">
          <Command>
            <CommandInput placeholder="Search vault items…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Logins">
                <CommandItem>
                  <KeyRound className="mr-2 size-4" aria-hidden="true" />
                  GitHub — kanishk@example.com
                </CommandItem>
                <CommandItem>
                  <KeyRound className="mr-2 size-4" aria-hidden="true" />
                  Vercel — kanishk@example.com
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Secure Notes">
                <CommandItem>
                  <StickyNote className="mr-2 size-4" aria-hidden="true" />
                  Server Setup Notes
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="WiFi Passwords">
                <CommandItem>
                  <Wifi className="mr-2 size-4" aria-hidden="true" />
                  HomeNetwork_5G
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Section>

      {/* Skeleton */}
      <Section title="Skeleton (Loading State)">
        <div className="max-w-sm space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      </Section>

      {/* Empty state */}
      <Section title="Empty State">
        <EmptyState
          icon={Search}
          heading="No vault items yet"
          description="Add your first login, note, or API key to get started."
          className="max-w-sm"
        >
          <Button size="sm">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Add item
          </Button>
        </EmptyState>
      </Section>
    </div>
  );
}
