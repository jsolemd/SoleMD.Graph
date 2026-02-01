/**
 * Utility functions for integrating Mantine forms with React Hook Form and Zod validation
 */

import { UseFormReturn } from "react-hook-form";
import { ZodSchema } from "zod";

/**
 * Props mapping interface for converting shadcn Input props to Mantine TextInput props
 */
export interface InputPropMapping {
  shadcn: {
    className?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
  };
  mantine: {
    className?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    withAsterisk?: boolean;
    label?: string;
    description?: string;
    error?: string | boolean;
  };
}

/**
 * Convert shadcn Input props to Mantine TextInput props
 */
export function mapInputProps(
  shadcnProps: InputPropMapping["shadcn"],
  additionalProps?: Partial<InputPropMapping["mantine"]>
): InputPropMapping["mantine"] {
  return {
    className: shadcnProps.className,
    type: shadcnProps.type,
    placeholder: shadcnProps.placeholder,
    disabled: shadcnProps.disabled,
    withAsterisk: shadcnProps.required,
    ...additionalProps,
  };
}

/**
 * Create form field props for React Hook Form integration with Mantine
 */
export function createFormFieldProps<T extends Record<string, any>>(
  form: UseFormReturn<T>,
  fieldName: keyof T,
  options?: {
    label?: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
    type?: string;
  }
) {
  const fieldState = form.getFieldState(fieldName as string);

  return {
    ...form.register(fieldName as string),
    label: options?.label,
    description: options?.description,
    placeholder: options?.placeholder,
    withAsterisk: options?.required,
    type: options?.type,
    error: fieldState.error?.message,
  };
}

/**
 * Validation helper for Zod schema integration
 */
export function createZodResolver<T>(schema: ZodSchema<T>) {
  return (values: T) => {
    try {
      schema.parse(values);
      return { values, errors: {} };
    } catch (error: any) {
      const errors: Record<string, string> = {};
      if (error.errors) {
        error.errors.forEach((err: any) => {
          if (err.path) {
            errors[err.path.join(".")] = err.message;
          }
        });
      }
      return { values: undefined, errors };
    }
  };
}
