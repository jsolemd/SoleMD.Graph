/**
 * Tests for Mantine form components and migration utilities
 * Updated to use custom test utilities with proper Mantine theme integration
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "../test-utils";
import { z } from "zod";
import {
  MantineForm,
  MantineFormProvider,
  MantineFormItem,
  MantineFormTextInput,
  MantineFormMessage,
  MantineFormDescription,
  useMantineFormWithZod,
} from "../components/mantine-form";
import { TestForm } from "../components/test-form";

describe("Mantine Form Components", () => {
  describe("MantineFormTextInput", () => {
    it("renders with label and placeholder", () => {
      const schema = z.object({ email: z.string().email() });

      function TestComponent() {
        const form = useMantineFormWithZod(schema, { email: "" });

        return (
          <MantineFormProvider form={form}>
            <MantineFormTextInput
              name="email"
              label="Email Address"
              placeholder="Enter your email"
            />
          </MantineFormProvider>
        );
      }

      render(<TestComponent />);

      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Enter your email")
      ).toBeInTheDocument();
    });

    it("displays validation errors", async () => {
      const schema = z.object({
        email: z.string().email("Invalid email address"),
      });

      function TestComponent() {
        const form = useMantineFormWithZod(schema, { email: "" });

        return (
          <MantineFormProvider form={form}>
            <MantineForm onSubmit={form.handleSubmit(() => {})}>
              <MantineFormTextInput
                name="email"
                label="Email Address"
                placeholder="Enter your email"
              />
              <button type="submit">Submit</button>
            </MantineForm>
          </MantineFormProvider>
        );
      }

      render(<TestComponent />);

      const input = screen.getByLabelText("Email Address");
      const submitButton = screen.getByText("Submit");

      // Enter invalid email
      fireEvent.change(input, { target: { value: "invalid-email" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Invalid email address")).toBeInTheDocument();
      });
    });
  });

  describe("MantineFormMessage", () => {
    it("renders error message", () => {
      render(<MantineFormMessage error="This is an error" />);

      expect(screen.getByText("This is an error")).toBeInTheDocument();
    });

    it("renders children when no error", () => {
      render(<MantineFormMessage>Custom message</MantineFormMessage>, {
        wrapper: TestWrapper,
      });

      expect(screen.getByText("Custom message")).toBeInTheDocument();
    });

    it("does not render when no error or children", () => {
      const { container } = render(<MantineFormMessage />, {
        wrapper: TestWrapper,
      });

      expect(container.firstChild).toBeNull();
    });
  });

  describe("MantineFormDescription", () => {
    it("renders description text", () => {
      render(
        <MantineFormDescription>
          This is a form description
        </MantineFormDescription>,
        { wrapper: TestWrapper }
      );

      expect(
        screen.getByText("This is a form description")
      ).toBeInTheDocument();
    });
  });

  describe("TestForm Integration", () => {
    it("renders complete form with all fields", () => {
      render(<TestForm />, { wrapper: TestWrapper });

      expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Message/)).toBeInTheDocument();
      expect(screen.getByText("Submit")).toBeInTheDocument();
    });

    it("shows validation errors on invalid submission", async () => {
      render(<TestForm />, { wrapper: TestWrapper });

      const submitButton = screen.getByText("Submit");
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Invalid email address")).toBeInTheDocument();
        expect(
          screen.getByText("Name must be at least 2 characters")
        ).toBeInTheDocument();
        expect(
          screen.getByText("Message must be at least 10 characters")
        ).toBeInTheDocument();
      });
    });

    it("submits form with valid data", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      render(<TestForm />, { wrapper: TestWrapper });

      const emailInput = screen.getByLabelText(/Email/);
      const nameInput = screen.getByLabelText(/Full Name/);
      const messageInput = screen.getByLabelText(/Message/);
      const submitButton = screen.getByText("Submit");

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.change(nameInput, { target: { value: "John Doe" } });
      fireEvent.change(messageInput, {
        target: { value: "This is a test message that is long enough" },
      });

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith("Form submitted:", {
          email: "test@example.com",
          name: "John Doe",
          message: "This is a test message that is long enough",
        });
      });

      consoleSpy.mockRestore();
    });
  });
});
