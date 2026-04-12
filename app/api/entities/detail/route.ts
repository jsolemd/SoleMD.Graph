import {
  fetchGraphEntityDetail,
} from "@/lib/engine/entities";
import type { GraphEntityDetailRequestPayload } from "@/features/graph/types/entity-service";
import { handleEntityPost } from "../_lib";

export async function POST(request: Request) {
  return handleEntityPost<GraphEntityDetailRequestPayload, Awaited<ReturnType<typeof fetchGraphEntityDetail>>>(
    request,
    (payload) => fetchGraphEntityDetail(payload, {
      signal: request.signal,
    }),
  );
}
