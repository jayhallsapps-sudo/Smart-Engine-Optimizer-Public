import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import {
  Globe,
  BarChart3,
  Phone,
  Clock,
  Search,
  MessageSquare,
} from "lucide-react";
import type { Client, QueryLog } from "@shared/schema";
import { motion } from "framer-motion";

function getCommandIcon(command: string) {
  if (command.startsWith("gsc")) return <Globe className="w-3.5 h-3.5" />;
  if (command.startsWith("ga4")) return <BarChart3 className="w-3.5 h-3.5" />;
  if (command.startsWith("callrail")) return <Phone className="w-3.5 h-3.5" />;
  return <Search className="w-3.5 h-3.5" />;
}

function getCommandLabel(command: string) {
  const labels: Record<string, string> = {
    gsc_qoq_queries: "GSC Queries",
    gsc_qoq_pages: "GSC Pages",
    ga4_qoq_organic_funnel: "GA4 Funnel",
    ga4_qoq_organic_landing_pages: "GA4 Landing Pages",
    callrail_qoq_organic_calls: "CallRail Calls",
    callrail_qoq_top_landing_pages: "CallRail Landing Pages",
  };
  return labels[command] || command;
}

function getSourceColor(command: string) {
  if (command.startsWith("gsc")) return "default";
  if (command.startsWith("ga4")) return "secondary";
  if (command.startsWith("callrail")) return "secondary";
  return "secondary" as const;
}

export default function HistoryPage() {
  const [filterClientId, setFilterClientId] = useState<string>("");

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: logs = [], isLoading } = useQuery<QueryLog[]>({
    queryKey: ["/api/query-logs", filterClientId],
  });

  const filteredLogs = filterClientId && filterClientId !== "all"
    ? logs.filter(l => l.clientId === Number(filterClientId))
    : logs;

  const getClientName = (clientId: number) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || `Client #${clientId}`;
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-history-title">Query Log</h1>
          <p className="text-sm text-muted-foreground">Review past queries and their results.</p>
        </div>
        <div className="w-48">
          <Select value={filterClientId} onValueChange={setFilterClientId}>
            <SelectTrigger data-testid="select-filter-client">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-1">No queries yet</h3>
          <p className="text-sm text-muted-foreground">
            Your query history will appear here after you run some queries.
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          {filteredLogs.map((log) => (
            <Card key={log.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getCommandIcon(log.command)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-medium truncate" data-testid={`text-query-${log.id}`}>
                      {log.naturalQuery}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getSourceColor(log.command) as any} className="text-[10px]">
                      {getCommandLabel(log.command)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{getClientName(log.clientId)}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {log.resultSummary && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {log.resultSummary}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </motion.div>
      )}
    </div>
    </div>
  );
}
