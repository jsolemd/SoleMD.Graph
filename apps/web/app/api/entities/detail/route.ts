import {
  fetchGraphEntityDetail,
} from "@solemd/api-client/server/entities";
import type { GraphEntityDetailRequestPayload } from "@solemd/api-client/shared/graph-entity";
import { handleEntityPost } from "../_lib";

export async function POST(request: Request) {
  return handleEntityPost<GraphEntityDetailRequestPayload, Awaited<ReturnType<typeof fetchGraphEntityDetail>>>(
    request,
    (payload) => fetchGraphEntityDetail(payload, {
      signal: request.signal,
    }),
  );
}
