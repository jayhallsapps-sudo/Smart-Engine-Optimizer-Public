import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Play, AlertTriangle } from "lucide-react";
import type { Client } from "@shared/schema";

interface ClientPickerProps {
  selectedClientId: string;
  onSelectClientId: (id: string) => void;
  onRunScan: () => void;
  isScanning: boolean;
}

export function ClientPicker({ selectedClientId, onSelectClientId, onRunScan, isScanning }: ClientPickerProps) {
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: config } = useQuery<{ asanaSectionIds?: Record<string, string>; lastScanAt?: string | null }>({
    queryKey: ["/api/qcr/config", selectedClientId],
    enabled: !!selectedClientId,
  });

  const selectedClient = clients.find((c) => String(c.id) === selectedClientId);
  const sectionIds = config?.asanaSectionIds ?? {};
  const hasAllSections = ["technical_seo", "seo_content", "local_seo", "seo_strategy"].every(
    (k) => sectionIds[k] && String(sectionIds[k]).trim().length > 0,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Client</Label>
        <Select value={selectedClientId} onValueChange={onSelectClientId}>
          <SelectTrigger className="h-8 text-xs" data-testid="select-qcr-client">
            <SelectValue placeholder="Select client…" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={String(c.id)} data-testid={`option-client-${c.id}`}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config?.lastScanAt && (
        <p className="text-[10px] text-muted-foreground">
          Last scan: {new Date(config.lastScanAt).toLocaleString()}
        </p>
      )}

      {!hasAllSections && selectedClientId && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Asana sections not configured — findings can be saved but not pushed to Asana.
            Configure in Client Integrations.
          </span>
        </div>
      )}

      <Button
        className="w-full h-8 text-xs"
        onClick={onRunScan}
        disabled={!selectedClientId || isScanning || !selectedClient?.website}
        data-testid="button-run-scan"
      >
        {isScanning ? (
          <>
            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            Starting…
          </>
        ) : (
          <>
            <Play className="w-3 h-3 mr-1.5" />
            Run Scan
          </>
        )}
      </Button>
    </div>
  );
}
