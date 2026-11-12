"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/query";
import type { LinkType } from "@/lib/complaints/link-types";

const CHUNK = 200;

/** id → live complaint about it, for client-rendered lists (design D9). Disabled without `complaint.view`. */
export function useQuestioned(type: LinkType, ids: readonly string[], enabled: boolean): Record<string, string> {
  const q = useQuery({
    queryKey: ["complaints", "questioned", type, ids],
    enabled: enabled && ids.length > 0,
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      const parts = await Promise.all(chunks.map((c) => apiGet<{ items: Record<string, string> }>(`/complaints/questioned?type=${type}&ids=${c.join(",")}`)));
      return Object.assign({}, ...parts.map((p) => p.items)) as Record<string, string>;
    },
  });
  return q.data ?? {};
}
