import { CosmographSearch as CosmographSearchWidget } from "@cosmograph/cosmograph";

let searchRemovePatched = false;

/**
 * CosmographSearch.remove() assumes its UI component always initialized.
 * Under Next.js 16 / Turbopack we can unmount during startup, so guard cleanup.
 */
export function ensureCosmographSearchSafeRemove() {
  if (searchRemovePatched) {
    return;
  }

  const prototype = CosmographSearchWidget.prototype as {
    remove?: () => void;
  };
  const originalRemove = prototype.remove;

  prototype.remove = function safeRemove(this: unknown) {
    const search = this as {
      _abortController?: AbortController;
      _accessorButton?: { onclick: null | (() => void) };
      _accessorsMenu?: unknown;
      _clickOutsideHandler?: EventListener;
      _client?: { resetFilter?: () => void };
      _config?: { preserveSelectionOnUnmount?: boolean };
      _currentSearchResults?: unknown[];
      _dataFilteredHandler?: EventListener;
      _dataUpdatedHandler?: EventListener;
      _internalApi?: {
        removeEventListener?: (type: string, listener?: EventListener) => void;
      };
      _isInitialLoad?: boolean;
      _placeholderElement?: unknown;
      _resetSelectionsHandler?: EventListener;
      _resultsCounter?: unknown;
      _totalResultsCount?: number;
      _uiComponent?: { destroy?: () => void };
    };

    if (search._uiComponent?.destroy) {
      originalRemove?.call(this);
      return;
    }

    if (typeof document !== "undefined" && search._clickOutsideHandler) {
      document.removeEventListener("click", search._clickOutsideHandler);
    }

    if (search._accessorButton) {
      search._accessorButton.onclick = null;
    }

    search._abortController?.abort();

    if (!search._config?.preserveSelectionOnUnmount) {
      search._client?.resetFilter?.();
    }

    search._internalApi?.removeEventListener?.(
      "dataUploaded",
      search._dataUpdatedHandler
    );
    search._internalApi?.removeEventListener?.(
      "dataFiltered",
      search._dataFilteredHandler
    );
    search._internalApi?.removeEventListener?.(
      "resetSelections",
      search._resetSelectionsHandler
    );

    search._accessorsMenu = null;
    search._placeholderElement = null;
    search._accessorButton = undefined;
    search._resultsCounter = null;
    search._currentSearchResults = [];
    search._totalResultsCount = 0;
    search._isInitialLoad = true;
  };

  searchRemovePatched = true;
}
