/**
 * @jest-environment node
 */
import { readEntityRequestJson, ENTITY_ROUTE_MAX_BODY_BYTES } from "../_lib";

describe("readEntityRequestJson", () => {
  it("rejects oversized entity request bodies before JSON parsing", async () => {
    const oversizedText = "x".repeat(ENTITY_ROUTE_MAX_BODY_BYTES);
    const rawBody = JSON.stringify({ text: oversizedText });
    const request = new Request("http://localhost/api/entities/match", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(rawBody)),
      },
      body: rawBody,
    });

    const response = await readEntityRequestJson(request);

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected oversized request to return a response");
    }

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        errorCode: "bad_request",
        status: 413,
      }),
    );
  });
});
