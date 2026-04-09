import {
  getPromptInteractionDefaultCommandIndex,
  resolvePromptInteractionTriggerMatch,
  type PromptInteractionRequest,
  type PromptInteractionProvider,
} from "../prompt-interactions";

describe("prompt-interactions", () => {
  interface TestRequest extends PromptInteractionRequest {
    providerId: "test-provider";
    commandId: "support" | "refute";
    ok: true;
  }

  const provider: PromptInteractionProvider<TestRequest> = {
    id: "test-provider",
    commands: [
      { id: "support", label: "Support", description: "Find supporting evidence" },
      { id: "refute", label: "Refute", description: "Find challenging evidence" },
    ],
    triggers: [
      {
        pattern: "@",
        action: "menu",
        label: "@ Evidence",
        description: "Open the interaction menu",
        defaultCommandId: "support",
      },
    ],
    buildRequest: (_editor, commandId) => ({
      providerId: "test-provider",
      commandId: commandId === "refute" ? "refute" : "support",
      ok: true,
    }),
  };

  it("matches triggers at valid boundaries and returns the owning provider", () => {
    expect(
      resolvePromptInteractionTriggerMatch({
        providers: [provider],
        textBeforeCursor: "This claim suggests ",
        insertedText: "@",
      }),
    ).toMatchObject({
      provider,
      trigger: {
        pattern: "@",
        defaultCommandId: "support",
      },
      deletePrefixChars: 0,
    });
  });

  it("does not fire inside words", () => {
    expect(
      resolvePromptInteractionTriggerMatch({
        providers: [provider],
        textBeforeCursor: "email",
        insertedText: "@",
      }),
    ).toBeNull();
  });

  it("maps default commands to the correct menu selection index", () => {
    expect(getPromptInteractionDefaultCommandIndex(provider, "support")).toBe(0);
    expect(getPromptInteractionDefaultCommandIndex(provider, "refute")).toBe(1);
    expect(getPromptInteractionDefaultCommandIndex(provider, "missing")).toBe(0);
  });
});
