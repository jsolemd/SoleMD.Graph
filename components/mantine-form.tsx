/**
 * Mantine form components that integrate with React Hook Form and Zod validation
 * Provides a migration path from shadcn/ui form components
 */

"use client";

import * as React from "react";
import {
  TextInput,
  TextInputProps,
  Box,
  Text,
  Group,
  Stack,
} from "@mantine/core";
import {
  useForm as useReactHookForm,
  UseFormReturn,
  FieldPath,
  FieldValues,
  Controller,
  FormProvider,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ZodSchema } from "zod";

// Form context for managing form state
interface MantineFormContextValue<T extends FieldValues = FieldValues> {
  form: UseFormReturn<T>;
}

const MantineFormContext = React.createContext<MantineFormContextValue | null>(
  null
);

/**
 * Hook to access form context
 */
export function useMantineForm<T extends FieldValues = FieldValues>() {
  const context = React.useContext(MantineFormContext);
  if (!context) {
    throw new Error("useMantineForm must be used within MantineFormProvider");
  }
  return context.form as UseFormReturn<T>;
}

/**
 * Form provider component that wraps React Hook Form
 */
interface MantineFormProviderProps<T extends FieldValues = FieldValues> {
  form: UseFormReturn<T>;
  children: React.ReactNode;
}

export function MantineFormProvider<T extends FieldValues = FieldValues>({
  form,
  children,
}: MantineFormProviderProps<T>) {
  return (
    <MantineFormContext.Provider value={{ form }}>
      <FormProvider {...form}>{children}</FormProvider>
    </MantineFormContext.Provider>
  );
}

/**
 * Form field wrapper component
 */
interface MantineFormFieldProps<T extends FieldValues = FieldValues> {
  name: FieldPath<T>;
  children: (field: {
    value: any;
    onChange: (value: any) => void;
    onBlur: () => void;
    error?: string;
  }) => React.ReactNode;
}

export function MantineFormField<T extends FieldValues = FieldValues>({
  name,
  children,
}: MantineFormFieldProps<T>) {
  const form = useMantineForm<T>();

  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) =>
        children({
          ...field,
          error: fieldState.error?.message,
        })
      }
    />
  );
}

/**
 * Form item wrapper for consistent spacing and layout
 */
interface MantineFormItemProps {
  children: React.ReactNode;
  className?: string;
}

export function MantineFormItem({ children, className }: MantineFormItemProps) {
  return (
    <Box className={className} mb="md">
      {children}
    </Box>
  );
}

/**
 * Enhanced TextInput with form integration
 */
interface MantineFormTextInputProps<T extends FieldValues = FieldValues>
  extends Omit<TextInputProps, "value" | "onChange" | "error"> {
  name: FieldPath<T>;
}

export function MantineFormTextInput<T extends FieldValues = FieldValues>({
  name,
  ...props
}: MantineFormTextInputProps<T>) {
  return (
    <MantineFormField name={name}>
      {({ value, onChange, onBlur, error }) => (
        <TextInput
          {...props}
          value={value || ""}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={onBlur}
          error={error}
        />
      )}
    </MantineFormField>
  );
}

/**
 * Form message component for displaying validation errors
 */
interface MantineFormMessageProps {
  children?: React.ReactNode;
  error?: string;
}

export function MantineFormMessage({
  children,
  error,
}: MantineFormMessageProps) {
  const message = error || children;

  if (!message) {
    return null;
  }

  return (
    <Text size="sm" c="red" mt={4}>
      {message}
    </Text>
  );
}

/**
 * Form description component
 */
interface MantineFormDescriptionProps {
  children: React.ReactNode;
}

export function MantineFormDescription({
  children,
}: MantineFormDescriptionProps) {
  return (
    <Text size="sm" c="dimmed" mt={4}>
      {children}
    </Text>
  );
}

/**
 * Hook to create a form with Zod validation
 */
export function useMantineFormWithZod<T extends FieldValues = FieldValues>(
  schema: ZodSchema<T>,
  defaultValues?: Partial<T>
) {
  return useReactHookForm<T>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange",
  });
}

/**
 * Form root component
 */
interface MantineFormProps extends React.ComponentProps<"form"> {
  children: React.ReactNode;
}

export function MantineForm({ children, ...props }: MantineFormProps) {
  return (
    <form {...props}>
      <Stack gap="md">{children}</Stack>
    </form>
  );
}
