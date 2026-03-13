import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, MessageSquare, ChevronDown, ChevronRight, Check, CornerDownRight, Plus, Loader2, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ReportComment } from "@shared/schema";

export interface CommentAnchor {
  id: string;
  label: string;
}

const AUTHOR_KEY = "smarteo_comment_author";

function timeAgo(dateStr: string | Date): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

interface AddCommentFormProps {
  anchors: CommentAnchor[];
  onSubmit: (data: { anchorId: string; anchorLabel: string; authorName: string; body: string; parentId?: number }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  defaultAnchorId?: string;
  parentId?: number;
  compact?: boolean;
}

function AddCommentForm({ anchors, onSubmit, onCancel, isSubmitting, defaultAnchorId, parentId, compact }: AddCommentFormProps) {
  const [anchorId, setAnchorId] = useState(defaultAnchorId ?? "report");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState(() => localStorage.getItem(AUTHOR_KEY) ?? "");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  function handleSubmit() {
    if (!body.trim() || !authorName.trim()) return;
    localStorage.setItem(AUTHOR_KEY, authorName.trim());
    const anchor = anchors.find((a) => a.id === anchorId) ?? { id: "report", label: "General" };
    onSubmit({ anchorId: anchor.id, anchorLabel: anchor.label, authorName: authorName.trim(), body: body.trim(), parentId });
    setBody("");
  }

  return (
    <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
      {!compact && !parentId && (
        <Select value={anchorId} onValueChange={setAnchorId}>
          <SelectTrigger data-testid="comment-anchor-select" className="h-8 text-xs">
            <SelectValue placeholder="Section…" />
          </SelectTrigger>
          <SelectContent>
            {anchors.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input
        data-testid="comment-author-input"
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        placeholder="Your name"
        className="h-8 text-xs"
      />
      <Textarea
        data-testid="comment-body-input"
        ref={textRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Write a reply…" : "Write a comment…"}
        className="text-xs min-h-[72px] resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <div className="flex gap-2 justify-end">
        <Button
          data-testid="comment-cancel-btn"
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          data-testid="comment-submit-btn"
          size="sm"
          className="h-7 text-xs px-3 bg-[#1B3A6B] hover:bg-[#15306a]"
          onClick={handleSubmit}
          disabled={isSubmitting || !body.trim() || !authorName.trim()}
        >
          {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : parentId ? "Reply" : "Post"}
        </Button>
      </div>
    </div>
  );
}

interface CommentItemProps {
  comment: ReportComment;
  replies: ReportComment[];
  anchors: CommentAnchor[];
  onResolve: (id: number, resolved: boolean) => void;
  onDelete: (id: number) => void;
  onAddReply: (parentId: number, data: { authorName: string; body: string }) => void;
  isActing: boolean;
}

function CommentItem({ comment, replies, anchors, onResolve, onDelete, onAddReply, isActing }: CommentItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [replying, setReplying] = useState(false);

  const anchorLabel = anchors.find((a) => a.id === comment.anchorId)?.label ?? comment.anchorLabel ?? "General";

  return (
    <div
      data-testid={`comment-item-${comment.id}`}
      className={`border rounded-md overflow-hidden ${comment.resolved ? "opacity-50" : ""}`}
    >
      <div className="p-3 space-y-1">
        <div className="flex items-start gap-2">
          <div
            className="h-7 w-7 rounded-full bg-[#1B3A6B] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
            title={comment.authorName}
          >
            {initials(comment.authorName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold text-gray-900 truncate">{comment.authorName}</span>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(comment.createdAt)}</span>
            </div>
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1.5 font-normal text-gray-500 border-gray-300 mt-0.5"
            >
              {anchorLabel}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap pl-9">{comment.body}</p>

        <div className="flex items-center gap-1 pl-9">
          <Button
            data-testid={`comment-resolve-btn-${comment.id}`}
            variant="ghost"
            size="sm"
            className={`h-6 text-[10px] px-1.5 gap-1 ${comment.resolved ? "text-green-600 hover:text-green-700" : "text-gray-400 hover:text-gray-600"}`}
            onClick={() => onResolve(comment.id, !comment.resolved)}
            disabled={isActing}
          >
            <Check className="h-3 w-3" />
            {comment.resolved ? "Resolved" : "Resolve"}
          </Button>
          <Button
            data-testid={`comment-reply-btn-${comment.id}`}
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-1.5 gap-1 text-gray-400 hover:text-gray-600"
            onClick={() => setReplying(!replying)}
          >
            <CornerDownRight className="h-3 w-3" />
            Reply
          </Button>
          <Button
            data-testid={`comment-delete-btn-${comment.id}`}
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-1.5 gap-1 text-gray-300 hover:text-[#C0392B]"
            onClick={() => onDelete(comment.id)}
            disabled={isActing}
            title="Delete comment and its replies"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          {replies.length > 0 && (
            <Button
              data-testid={`comment-toggle-replies-${comment.id}`}
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-1.5 gap-1 text-gray-400 hover:text-gray-600 ml-auto"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </Button>
          )}
        </div>
      </div>

      {replying && (
        <div className="border-t p-3">
          <AddCommentForm
            anchors={[]}
            defaultAnchorId={comment.anchorId}
            parentId={comment.id}
            compact
            isSubmitting={isActing}
            onCancel={() => setReplying(false)}
            onSubmit={(data) => {
              onAddReply(comment.id, { authorName: data.authorName, body: data.body });
              setReplying(false);
            }}
          />
        </div>
      )}

      {expanded && replies.length > 0 && (
        <div className="border-t bg-gray-50 divide-y divide-gray-100">
          {replies.map((reply) => (
            <div key={reply.id} data-testid={`comment-reply-${reply.id}`} className="px-3 py-2 flex gap-2">
              <div className="h-5 w-5 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                {initials(reply.authorName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[10px] font-semibold text-gray-800">{reply.authorName}</span>
                  <span className="text-[9px] text-gray-400">{timeAgo(reply.createdAt)}</span>
                </div>
                <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">{reply.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CommentPanelProps {
  reportType: string;
  clientId: string | null;
  savedReportId: number | null;
  anchors: CommentAnchor[];
  onClose: () => void;
  className?: string;
}

export function CommentPanel({ reportType, clientId, savedReportId, anchors, onClose, className }: CommentPanelProps) {
  const [showResolved, setShowResolved] = useState(false);
  const [composing, setComposing] = useState(false);

  const allAnchors: CommentAnchor[] = [
    { id: "report", label: "General (whole report)" },
    ...anchors,
  ];

  // When savedReportId is available, scope the query and cache key by it alone —
  // the backend ignores reportType/clientId when savedReportId is supplied.
  // When null, the panel is locked (disabled) so this path is never fetched.
  const qKey = savedReportId !== null
    ? `/api/comments?savedReportId=${savedReportId}`
    : `/api/comments?reportType=${reportType}&clientId=${clientId ?? "null"}`;

  const { data: comments = [], isLoading } = useQuery<ReportComment[]>({
    queryKey: [qKey],
    enabled: savedReportId !== null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [qKey] });

  const createMut = useMutation({
    mutationFn: async (data: {
      reportType: string;
      clientId: number | null;
      savedReportId?: number | null;
      anchorId: string;
      anchorLabel: string | null;
      authorName: string;
      body: string;
      parentId?: number | null;
    }) => {
      const res = await apiRequest("POST", "/api/comments", data);
      return res.json();
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; body?: string; resolved?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/comments/${id}`, data);
      return res.json();
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/comments/${id}`);
      return res.json();
    },
    onSuccess: invalidate,
  });

  const isActing = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const rootComments = comments.filter((c) => !c.parentId);
  const repliesMap = new Map<number, ReportComment[]>();
  comments
    .filter((c) => c.parentId)
    .forEach((c) => {
      const arr = repliesMap.get(c.parentId!) ?? [];
      arr.push(c);
      repliesMap.set(c.parentId!, arr);
    });

  const openCount = rootComments.filter((c) => !c.resolved).length;
  const visibleRoots = showResolved ? rootComments : rootComments.filter((c) => !c.resolved);

  function handleAddComment(data: { anchorId: string; anchorLabel: string; authorName: string; body: string; parentId?: number }) {
    createMut.mutate({
      reportType,
      clientId: clientId ? Number(clientId) : null,
      savedReportId,
      anchorId: data.anchorId,
      anchorLabel: data.anchorLabel,
      authorName: data.authorName,
      body: data.body,
      parentId: data.parentId ?? null,
    });
    setComposing(false);
  }

  function handleReply(parentId: number, data: { authorName: string; body: string }) {
    const parent = comments.find((c) => c.id === parentId);
    createMut.mutate({
      reportType,
      clientId: clientId ? Number(clientId) : null,
      savedReportId,
      anchorId: parent?.anchorId ?? "report",
      anchorLabel: parent?.anchorLabel ?? null,
      authorName: data.authorName,
      body: data.body,
      parentId,
    });
  }

  return (
    <aside
      data-testid="comment-panel"
      className={`flex flex-col w-80 shrink-0 border-l border-gray-200 bg-white ${className ?? ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#1B3A6B]" />
          <span className="text-sm font-semibold text-gray-900">Comments</span>
          {openCount > 0 && (
            <Badge
              data-testid="comment-open-count"
              className="text-[10px] h-4 px-1.5 bg-[#C0392B] hover:bg-[#C0392B] text-white border-0"
            >
              {openCount}
            </Badge>
          )}
        </div>
        <Button
          data-testid="comment-panel-close"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <Button
          data-testid="comment-add-btn"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 border-[#1B3A6B] text-[#1B3A6B] hover:bg-[#1B3A6B]/5 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => setComposing(!composing)}
          disabled={savedReportId === null}
          title={savedReportId === null ? "Save the report first to add comments" : undefined}
        >
          <Plus className="h-3 w-3" />
          Add comment
        </Button>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            data-testid="comment-show-resolved"
            type="checkbox"
            className="h-3 w-3 rounded accent-[#1B3A6B]"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          <span className="text-[10px] text-gray-500">Show resolved</span>
        </label>
      </div>

      {/* Compose form — only when saved */}
      {composing && savedReportId !== null && (
        <div className="px-3 pt-3">
          <AddCommentForm
            anchors={allAnchors}
            isSubmitting={createMut.isPending}
            onCancel={() => setComposing(false)}
            onSubmit={handleAddComment}
          />
        </div>
      )}

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {savedReportId === null ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 px-4">
            <Lock className="h-7 w-7 text-gray-300" />
            <p className="text-xs text-center text-gray-500 leading-relaxed">
              Comments are tied to saved report instances. Generate and save a report first, then return here to review and annotate.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : visibleRoots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-xs text-center">
              {showResolved || openCount === 0
                ? "No comments yet.\nClick \"Add comment\" to start."
                : "All comments resolved."}
            </p>
          </div>
        ) : (
          visibleRoots.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesMap.get(comment.id) ?? []}
              anchors={allAnchors}
              onResolve={(id, resolved) => updateMut.mutate({ id, resolved })}
              onDelete={(id) => deleteMut.mutate(id)}
              onAddReply={handleReply}
              isActing={isActing}
            />
          ))
        )}
      </div>
    </aside>
  );
}
