import type {
  PromptInteractionProvider,
  PromptInteractionRequest,
} from "../../editor/prompt-interactions";
import {
  createPromptInteractionHandler,
  dispatchPromptInteraction,
  getPromptInteractionProviders,
} from "../prompt-interaction-runtime";

interface TestRequest extends PromptInteractionRequest {
  providerId: "test-provider";
  commandId: "support";
  queryText: string;
}

describe("prompt-interaction-runtime", () => {
  const provider: PromptInteractionProvider<TestRequest> = {
    id: "test-provider",
    commands: [
      {
        id: "support",
        label: "Support",
        description: "Find supporting evidence",
      },
    ],
    triggers: [],
    buildRequest: () => null,
  };

  const handle = jest.fn();
  const handler = createPromptInteractionHandler<TestRequest>({
    provider,
    matches: (request): request is TestRequest =>
      request.providerId === "test-provider" && request.commandId === "support",
    handle,
  });

  beforeEach(() => {
    handle.mockClear();
  });

  it("derives providers from handlers once for the editor surface", () => {
    expect(getPromptInteractionProviders([handler])).toEqual([provider]);
  });

  it("dispatches matching requests to the owning handler", () => {
    expect(
      dispatchPromptInteraction([handler], {
        providerId: "test-provider",
        commandId: "support",
        queryText: "dopamine",
      }),
    ).toBe(true);

    expect(handle).toHaveBeenCalledWith({
      providerId: "test-provider",
      commandId: "support",
      queryText: "dopamine",
    });
  });

  it("ignores requests that no registered handler owns", () => {
    expect(
      dispatchPromptInteraction([handler], {
        providerId: "other-provider",
        commandId: "support",
      }),
    ).toBe(false);

    expect(handle).not.toHaveBeenCalled();
  });
});
