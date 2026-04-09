import type {
  PromptInteractionProvider,
  PromptInteractionRequest,
} from "../editor/prompt-interactions";

export interface PromptInteractionHandler<
  TRequest extends PromptInteractionRequest = PromptInteractionRequest,
> {
  provider: PromptInteractionProvider<TRequest>;
  dispatch: (request: PromptInteractionRequest) => boolean;
}

export function createPromptInteractionHandler<
  TRequest extends PromptInteractionRequest,
>(
  {
    provider,
    matches,
    handle,
  }: {
  provider: PromptInteractionProvider<TRequest>;
  matches: (request: PromptInteractionRequest) => request is TRequest;
  handle: (request: TRequest) => void;
  },
): PromptInteractionHandler<TRequest> {
  return {
    provider,
    dispatch(request) {
      if (!matches(request)) {
        return false;
      }

      handle(request);
      return true;
    },
  };
}

export function getPromptInteractionProviders(
  handlers: readonly PromptInteractionHandler[],
): readonly PromptInteractionProvider[] {
  return handlers.map((handler) => handler.provider);
}

export function dispatchPromptInteraction(
  handlers: readonly PromptInteractionHandler[],
  request: PromptInteractionRequest,
): boolean {
  for (const handler of handlers) {
    if (handler.dispatch(request)) {
      return true;
    }
  }

  return false;
}
