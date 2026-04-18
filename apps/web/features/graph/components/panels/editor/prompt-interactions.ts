import type { Editor } from "@/features/graph/tiptap";

export type PromptInteractionTriggerAction = "menu" | "submit";

export interface PromptInteractionCommand {
  id: string;
  label: string;
  description: string;
}

export type PromptInteractionCommandList<
  TCommand extends PromptInteractionCommand = PromptInteractionCommand,
> = readonly [TCommand, ...TCommand[]];

export interface PromptInteractionTrigger {
  pattern: string;
  action: PromptInteractionTriggerAction;
  label: string;
  description: string;
  defaultCommandId: string;
}

export interface PromptInteractionProvider<
  TRequest extends PromptInteractionRequest = PromptInteractionRequest,
> {
  id: string;
  commands: PromptInteractionCommandList;
  triggers: readonly PromptInteractionTrigger[];
  buildRequest: (editor: Editor, commandId: string) => TRequest | null;
}

export interface PromptInteractionRequest {
  providerId: string;
  commandId: string;
}

export interface PromptInteractionTriggerMatch<
  TRequest extends PromptInteractionRequest = PromptInteractionRequest,
> {
  provider: PromptInteractionProvider<TRequest>;
  trigger: PromptInteractionTrigger;
  deletePrefixChars: number;
}

export function getPromptInteractionDefaultCommandIndex<
  TRequest extends PromptInteractionRequest = PromptInteractionRequest,
>(
  provider: PromptInteractionProvider<TRequest>,
  commandId: string,
): number {
  const index = provider.commands.findIndex((command) => command.id === commandId);
  return index >= 0 ? index : 0;
}

export function resolvePromptInteractionTriggerMatch<
  TRequest extends PromptInteractionRequest = PromptInteractionRequest,
>({
  providers,
  textBeforeCursor,
  insertedText,
}: {
  providers: readonly PromptInteractionProvider<TRequest>[];
  textBeforeCursor: string;
  insertedText: string;
}): PromptInteractionTriggerMatch<TRequest> | null {
  const candidateText = `${textBeforeCursor}${insertedText}`;
  if (!candidateText.trim()) {
    return null;
  }

  const candidates = providers
    .flatMap((provider) =>
      provider.triggers.map((trigger) => ({
        provider,
        trigger,
      })),
    )
    .sort((left, right) => right.trigger.pattern.length - left.trigger.pattern.length);

  for (const candidate of candidates) {
    if (!candidateText.endsWith(candidate.trigger.pattern)) {
      continue;
    }

    const boundaryIndex = candidateText.length - candidate.trigger.pattern.length - 1;
    const boundaryCharacter =
      boundaryIndex >= 0 ? candidateText.slice(boundaryIndex, boundaryIndex + 1) : null;
    if (boundaryCharacter && !/[\s([{'"“‘-]/.test(boundaryCharacter)) {
      continue;
    }

    return {
      provider: candidate.provider,
      trigger: candidate.trigger,
      deletePrefixChars: Math.max(
        0,
        candidate.trigger.pattern.length - insertedText.length,
      ),
    };
  }

  return null;
}
