import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  Download,
  Search,
  BarChart3,
  Phone,
  Globe,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import type { Client, CommandResult } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";

interface QueryResponse {
  success: boolean;
  error?: string;
  suggestions?: string[];
  commandDescription?: string;
  dateRangeLabel?: string;
  result?: CommandResult;
}

interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "error";
  content: string;
  response?: QueryResponse;
  timestamp: Date;
}

const EXAMPLE_QUERIES = [
  "Show me QoQ query performance for Acme Digital Marketing",
  "What are the organic landing pages for Summit Law Group?",
  "Show me call volume trends for GreenLeaf Landscaping",
  "GA4 organic funnel for Bright Smile Dental",
  "Non-branded keyword winners for Acme Digital Marketing",
  "CallRail landing pages for Summit Law Group QoQ",
];

function getCommandIcon(command?: string) {
  if (!command) return <Search className="w-4 h-4" />;
  if (command.startsWith("gsc")) return <Globe className="w-4 h-4" />;
  if (command.startsWith("ga4")) return <BarChart3 className="w-4 h-4" />;
  if (command.startsWith("callrail")) return <Phone className="w-4 h-4" />;
  return <Search className="w-4 h-4" />;
}

function MetricCard({ metric }: { metric: CommandResult["summary"][0] }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-md bg-muted/50">
      <span className="text-xs text-muted-foreground font-medium">{metric.label}</span>
      <span className="text-xl font-semibold tabular-nums" data-testid={`text-metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}>
        {metric.current}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground">vs {metric.previous}</span>
        <Badge
          variant={metric.isPositive ? "default" : "destructive"}
          className="text-[10px] px-1.5 py-0"
        >
          {metric.isPositive ? (
            <ArrowUpRight className="w-3 h-3 mr-0.5" />
          ) : (
            <ArrowDownRight className="w-3 h-3 mr-0.5" />
          )}
          {metric.deltaPercent}
        </Badge>
      </div>
    </div>
  );
}

function ResultDisplay({ response }: { response: QueryResponse }) {
  if (!response.result) return null;
  const { result, commandDescription, dateRangeLabel } = response;

  const downloadCSV = (table: CommandResult["tables"][0]) => {
    const csvContent = [
      table.headers.join(","),
      ...table.rows.map(row => row.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.title.toLowerCase().replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {getCommandIcon(result.command)}
        <span className="text-sm font-medium">{commandDescription}</span>
        <Minus className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{dateRangeLabel}</span>
      </div>

      {result.summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {result.summary.map((metric, idx) => (
            <MetricCard key={idx} metric={metric} />
          ))}
        </div>
      )}

      {result.tables.map((table, idx) => (
        <div key={idx} className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-medium">{table.title}</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(table)}
              data-testid={`button-download-csv-${idx}`}
            >
              <Download className="w-3 h-3 mr-1.5" />
              CSV
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {table.headers.map((header, hIdx) => (
                    <TableHead key={hIdx} className="text-xs whitespace-nowrap">{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.slice(0, 20).map((row, rIdx) => (
                  <TableRow key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <TableCell key={cIdx} className="text-xs tabular-nums whitespace-nowrap">
                        {typeof cell === "string" && cell.startsWith("+") ? (
                          <span className="text-green-600 dark:text-green-400">{cell}</span>
                        ) : typeof cell === "string" && cell.startsWith("-") ? (
                          <span className="text-red-600 dark:text-red-400">{cell}</span>
                        ) : typeof cell === "number" ? (
                          cell.toLocaleString()
                        ) : (
                          cell
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function QueryPage() {
  const [inputValue, setInputValue] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      const cid = selectedClientId && selectedClientId !== "all" ? Number(selectedClientId) : undefined;
      const res = await apiRequest("POST", "/api/query", {
        query,
        clientId: cid,
      });
      return res.json() as Promise<QueryResponse>;
    },
    onSuccess: (data, query) => {
      if (data.success) {
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "assistant",
            content: data.commandDescription || "Results",
            response: data,
            timestamp: new Date(),
          },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "error",
            content: data.error || "Something went wrong",
            response: data,
            timestamp: new Date(),
          },
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/query-logs"] });
    },
  });

  const handleSubmit = () => {
    const query = inputValue.trim();
    if (!query || queryMutation.isPending) return;

    setMessages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "user",
        content: query,
        timestamp: new Date(),
      },
    ]);
    setInputValue("");
    queryMutation.mutate(query);
  };

  const handleExampleClick = (example: string) => {
    setInputValue(example);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center max-w-2xl"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2" data-testid="text-welcome-title">
                Ask SmartEO anything
              </h2>
              <p className="text-muted-foreground mb-8 text-sm">
                Get QBR-ready data from Google Search Console, GA4, and CallRail using natural language.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {EXAMPLE_QUERIES.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleExampleClick(example)}
                    className="text-left p-3 rounded-md bg-muted/50 text-sm text-muted-foreground hover-elevate active-elevate-2 transition-colors"
                    data-testid={`button-example-${idx}`}
                  >
                    <Search className="w-3 h-3 inline-block mr-2 opacity-50" />
                    {example}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-4 space-y-4">
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {msg.type === "user" ? (
                    <div className="flex justify-end">
                      <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ) : msg.type === "error" ? (
                    <Card className="p-4 border-destructive/30 bg-destructive/5">
                      <p className="text-sm text-destructive">{msg.content}</p>
                      {msg.response?.suggestions && msg.response.suggestions.length > 0 && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Did you mean:</span>
                          {msg.response.suggestions.map((s, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="cursor-pointer"
                              onClick={() => handleExampleClick(`Show me QoQ queries for ${s}`)}
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Card>
                  ) : (
                    <Card className="p-4">
                      {msg.response && <ResultDisplay response={msg.response} />}
                    </Card>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {queryMutation.isPending && (
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm text-muted-foreground">Analyzing your query...</span>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              </Card>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-2">
            <div className="w-48">
              {clientsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger data-testid="select-client">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={String(client.id)} data-testid={`select-client-${client.id}`}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about queries, pages, conversions, calls..."
                className="w-full min-h-[40px] max-h-[120px] resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pr-12"
                rows={1}
                data-testid="input-query"
              />
              <Button
                size="icon"
                className="absolute right-1.5 bottom-1.5"
                onClick={handleSubmit}
                disabled={!inputValue.trim() || queryMutation.isPending}
                data-testid="button-submit-query"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            SmartEO routes your query to the right data source. Currently using demo data.
          </p>
        </div>
      </div>
    </div>
  );
}
