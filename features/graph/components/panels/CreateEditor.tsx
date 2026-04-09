"use client";

import {
  forwardRef,
  memo,
  type ReactNode,
  useImperativeHandle,
} from "react";
import type { CreateEditorControllerProps } from "./editor/use-create-editor-controller";
import {
  useCreateEditorController,
} from "./editor/use-create-editor-controller";
import { CreateEditorSurface } from "./editor/CreateEditorSurface";

export interface CreateEditorHandle {
  focus: () => void;
  flush: () => string;
  getText: () => string;
}

interface CreateEditorProps extends CreateEditorControllerProps {
  compact?: boolean;
  showToolbar?: boolean;
  placeholder?: ReactNode;
}

const CreateEditorComponent = forwardRef<CreateEditorHandle, CreateEditorProps>(
  function CreateEditor(
    {
      compact = false,
      showToolbar = false,
      placeholder,
      ...controllerProps
    },
    ref,
  ) {
    const controller = useCreateEditorController({
      ...controllerProps,
      showToolbar,
    });

    useImperativeHandle(
      ref,
      () => ({
        focus: () => controller.editor?.commands.focus(),
        flush: controller.flush,
        getText: controller.getText,
      }),
      [controller.editor, controller.flush, controller.getText],
    );

    return (
      <CreateEditorSurface
        {...controller}
        ariaLabel={controllerProps.ariaLabel}
        compact={compact}
        showToolbar={showToolbar}
        placeholder={placeholder}
      />
    );
  },
);

CreateEditorComponent.displayName = "CreateEditor";

export const CreateEditor = memo(CreateEditorComponent);
CreateEditor.displayName = "CreateEditor";
