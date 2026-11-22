"use client";

import * as React from "react";

import { Loader2Icon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { t } from "@/i18n";
import { api } from "@/lib/api";
import type { LLMProfile } from "@/lib/types";

type ProfileFormat = "anthropic" | "openai" | "openai-responses" | "ollama";

// Bulk counterpart to the per-profile model picker: one provider scan yields every
// model, and each ticked model becomes a profile. Frontend-only — it drives the same
// /llm/models and /llm/profiles endpoints the editor already uses.
export function ProviderScanSheet({
  open,
  onOpenChange,
  existing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: LLMProfile[];
  onDone: () => void | Promise<void>;
}) {
  const [format, setFormat] = React.useState<ProfileFormat>("openai");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [proxy, setProxy] = React.useState("");
  const [models, setModels] = React.useState<string[]>([]);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);

  // A closed sheet starts clean: the provider fields are kept, the scan result is not.
  React.useEffect(() => {
    if (open) return;
    setModels([]);
    setPicked([]);
    setQuery("");
    setProgress(null);
  }, [open]);

  // Models that already have a profile stay visible but cannot be picked twice.
  const have = React.useMemo(() => new Set(existing.map((p) => p.model)), [existing]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => m.toLowerCase().includes(q)) : models;
  }, [models, query]);
  const fresh = picked.filter((m) => !have.has(m));
  const creating = progress !== null;

  function toggle(model: string, on: boolean) {
    setPicked((prev) => (on ? [...prev, model] : prev.filter((m) => m !== model)));
  }

  async function scan() {
    if (scanning || creating) return;
    setScanning(true);
    setModels([]);
    setPicked([]);
    try {
      const r = await api.fetchLLMModels(format, baseUrl, apiKey, proxy);
      if (r.ok && r.models && r.models.length > 0) {
        setModels(r.models);
        toast.success(t("Loaded {count} models", { count: r.models.length }));
      } else {
        toast.error(t("Failed to load models: {error}", { error: r.error ?? t("no models returned") }));
      }
    } catch (e) {
      toast.error(t("Error loading models: {error}", { error: (e as Error).message }));
    } finally {
      setScanning(false);
    }
  }

  async function create() {
    if (fresh.length === 0 || creating) return;
    let ok = 0;
    let failed = 0;
    setProgress({ done: 0, total: fresh.length });
    // Sequential on purpose: a bulk import must not hammer the provider or the server.
    for (const model of fresh) {
      try {
        await api.saveLLMProfile({ name: model, format, model, base_url: baseUrl, proxy, api_key: apiKey });
        ok++;
      } catch {
        failed++;
      }
      setProgress({ done: ok + failed, total: fresh.length });
    }
    setProgress(null);
    if (failed > 0) toast.error(t("Created {count} profiles, {failed} failed", { count: ok, failed }));
    else toast.success(t("Created {count} profiles", { count: ok }));
    await onDone();
    if (failed === 0) onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 data-[side=right]:min-w-[420px] data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="px-4">
          <SheetTitle>{t("Scan provider")}</SheetTitle>
          <SheetDescription>
            {t(
              "Scan a provider once, then create a model profile for every model you tick — instead of adding them one by one.",
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="grid gap-2">
            <Label>{t("Format")}</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ProfileFormat)}>
              <SelectTrigger>
                <SelectValue placeholder={t("Select a format")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="openai">OpenAI (Chat Completions)</SelectItem>
                <SelectItem value="openai-responses">OpenAI (Responses API)</SelectItem>
                <SelectItem value="ollama">{t("Ollama (local, no key needed)")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="scan-base-url">{t("Base URL (optional)")}</Label>
            <Input
              id="scan-base-url"
              className="font-mono"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="scan-api-key">{format === "ollama" ? t("API Key (optional for Ollama)") : "API Key"}</Label>
            <Input
              id="scan-api-key"
              type="password"
              placeholder="sk-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="scan-proxy">{t("Proxy (optional)")}</Label>
            <Input
              id="scan-proxy"
              className="font-mono"
              placeholder={t("Proxy URL (empty = direct)")}
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              spellCheck={false}
            />
          </div>

          <Button type="button" variant="outline" onClick={scan} disabled={scanning || creating}>
            {scanning ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            {scanning ? t("Scanning…") : t("Scan models")}
          </Button>

          {models.length > 0 && (
            <div className="flex min-h-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Input
                  className="h-8"
                  placeholder={t("Search {count} models…", { count: models.length })}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  spellCheck={false}
                  aria-label={t("Search models")}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => {
                    const all = filtered.filter((m) => !have.has(m));
                    const everyPicked = all.every((m) => picked.includes(m));
                    setPicked(everyPicked ? picked.filter((m) => !all.includes(m)) : [...new Set([...picked, ...all])]);
                  }}
                >
                  {t("Select all")}
                </Button>
              </div>

              <div className="max-h-96 overflow-y-auto overscroll-contain rounded-md border p-2">
                {filtered.length === 0 ? (
                  <p className="px-2 py-6 text-center text-muted-foreground text-xs">
                    {t("No model matches “{query}”", { query: query.trim() })}
                  </p>
                ) : (
                  filtered.map((m) => (
                    // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox component renders its own control inside this label
                    <label
                      key={m}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                        have.has(m) ? "opacity-50" : "cursor-pointer hover:bg-accent"
                      }`}
                    >
                      <Checkbox
                        checked={have.has(m) || picked.includes(m)}
                        disabled={have.has(m) || creating}
                        onCheckedChange={(on) => toggle(m, !!on)}
                      />
                      <span className="font-mono">{m}</span>
                      {have.has(m) && <span className="ml-auto">{t("already added")}</span>}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <span className="text-muted-foreground text-xs">
            {progress ? t("Creating {done}/{total}…", progress) : t("{count} selected", { count: fresh.length })}
          </span>
          <Button type="button" onClick={create} disabled={fresh.length === 0 || creating || scanning}>
            {creating ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {t("Create {count} profiles", { count: fresh.length })}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
