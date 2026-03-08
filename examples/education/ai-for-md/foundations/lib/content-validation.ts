/**
 * @fileoverview Content validation and sanitization utilities
 * @description Comprehensive validation and sanitization system for educational content
 * ensuring data integrity, security, and consistency across all content types
 */

import {
  ContentBlock,
  ValidationResult,
  ValidationFunction,
  ValidationRules,
  SanitizationOptions,
  ModuleContent,
  Lesson,
  Assessment,
  Question,
} from "./content-types";

// =================================================================================
// VALIDATION UTILITIES
// =================================================================================

/**
 * Main content validation class
 */
export class ContentValidator {
  private customValidators: Map<string, ValidationFunction> = new Map();

  /**
   * Register a custom validator
   */
  registerValidator(name: string, validator: ValidationFunction): void {
    this.customValidators.set(name, validator);
  }

  /**
   * Validate a content block
   */
  validateContentBlock(block: ContentBlock): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic structure validation
    if (!block.id) {
      errors.push("Content block must have an id");
    }

    if (!block.type) {
      errors.push("Content block must have a type");
    }

    if (!block.content) {
      errors.push("Content block must have content");
    }

    // Type-specific validation
    const typeValidation = this.validateByType(block);
    errors.push(...(typeValidation.errors || []));
    warnings.push(...(typeValidation.warnings || []));

    // Custom validation rules
    if (block.validation?.customValidators) {
      for (const validator of block.validation.customValidators) {
        const result = validator(block.content);
        if (!result.isValid) {
          errors.push(...(result.errors || []));
          warnings.push(...(result.warnings || []));
        }
      }
    }

    // Required fields validation
    if (block.validation?.required) {
      for (const field of block.validation.required) {
        if (!this.hasNestedProperty(block.content, field)) {
          errors.push(`Required field '${field}' is missing`);
        }
      }
    }

    // Content length validation
    if (block.validation?.maxLength) {
      const contentLength = this.getContentLength(block.content);
      if (contentLength > block.validation.maxLength) {
        errors.push(
          `Content exceeds maximum length of ${block.validation.maxLength} characters`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate content by type
   */
  private validateByType(block: ContentBlock): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (block.type) {
      case "text":
        if (typeof block.content.text !== "string") {
          errors.push("Text content must have a string text property");
        }
        break;

      case "rich-text":
        if (typeof block.content.html !== "string") {
          errors.push("Rich text content must have an html property");
        }
        // Validate HTML safety
        const htmlValidation = this.validateHTML(
          block.content.html,
          block.content.sanitization
        );
        errors.push(...(htmlValidation.errors || []));
        warnings.push(...(htmlValidation.warnings || []));
        break;

      case "interactive-demo":
        if (!block.content.demoType) {
          errors.push("Interactive demo must have a demoType");
        }
        if (!block.content.config) {
          errors.push("Interactive demo must have a config object");
        }
        break;

      case "assessment":
        const assessmentValidation = this.validateAssessment(block.content);
        errors.push(...(assessmentValidation.errors || []));
        warnings.push(...(assessmentValidation.warnings || []));
        break;

      case "multimedia":
        if (!block.content.mediaType) {
          errors.push("Multimedia content must have a mediaType");
        }
        if (!block.content.src) {
          errors.push("Multimedia content must have a src URL");
        }
        // Validate accessibility
        if (
          block.content.mediaType === "video" &&
          !block.content.captions &&
          !block.content.transcript
        ) {
          warnings.push(
            "Video content should have captions or transcript for accessibility"
          );
        }
        break;

      case "simulation":
        if (!block.content.simulationType) {
          errors.push("Simulation content must have a simulationType");
        }
        if (!block.content.parameters) {
          errors.push("Simulation content must have parameters");
        }
        break;

      default:
        warnings.push(`Unknown content type: ${block.type}`);
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate HTML content for security and structure
   */
  private validateHTML(
    html: string,
    sanitization?: SanitizationOptions
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for potentially dangerous content
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b/gi,
      /<object\b/gi,
      /<embed\b/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(html)) {
        if (sanitization?.stripDangerous) {
          warnings.push("Dangerous content detected and will be stripped");
        } else {
          errors.push("Dangerous content detected in HTML");
        }
      }
    }

    // Validate allowed tags if specified
    if (sanitization?.allowedTags) {
      const tagPattern = /<(\w+)(?:\s[^>]*)?>/g;
      let match;
      while ((match = tagPattern.exec(html)) !== null) {
        const tag = match[1].toLowerCase();
        if (!sanitization.allowedTags.includes(tag)) {
          warnings.push(`Tag '${tag}' is not in allowed tags list`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate assessment content
   */
  private validateAssessment(assessment: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!assessment.assessmentType) {
      errors.push("Assessment must have an assessmentType");
    }

    if (!assessment.questions || !Array.isArray(assessment.questions)) {
      errors.push("Assessment must have a questions array");
    } else {
      // Validate each question
      assessment.questions.forEach((question: Question, index: number) => {
        const questionValidation = this.validateQuestion(question);
        if (!questionValidation.isValid) {
          errors.push(
            ...(questionValidation.errors || []).map(
              (err) => `Question ${index + 1}: ${err}`
            )
          );
          warnings.push(
            ...(questionValidation.warnings || []).map(
              (warn) => `Question ${index + 1}: ${warn}`
            )
          );
        }
      });
    }

    // Validate scoring if present
    if (assessment.scoring) {
      if (typeof assessment.scoring.passingThreshold !== "number") {
        errors.push("Scoring must have a numeric passingThreshold");
      }
      if (
        assessment.scoring.passingThreshold < 0 ||
        assessment.scoring.passingThreshold > 1
      ) {
        errors.push("Passing threshold must be between 0 and 1");
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate individual question
   */
  private validateQuestion(question: Question): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!question.id) {
      errors.push("Question must have an id");
    }

    if (!question.type) {
      errors.push("Question must have a type");
    }

    if (!question.question) {
      errors.push("Question must have question text");
    }

    if (
      question.correctAnswer === undefined ||
      question.correctAnswer === null
    ) {
      errors.push("Question must have a correctAnswer");
    }

    if (typeof question.points !== "number" || question.points < 0) {
      errors.push("Question must have a positive numeric points value");
    }

    // Type-specific validation
    if (question.type === "multiple-choice") {
      if (!question.options || !Array.isArray(question.options)) {
        errors.push("Multiple choice question must have options array");
      } else if (question.options.length < 2) {
        errors.push("Multiple choice question must have at least 2 options");
      }
    }

    if (!question.explanation) {
      warnings.push(
        "Question should have an explanation for educational value"
      );
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate complete lesson
   */
  validateLesson(lesson: Lesson): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic lesson validation
    if (!lesson.id) {
      errors.push("Lesson must have an id");
    }

    if (!lesson.title) {
      errors.push("Lesson must have a title");
    }

    if (!lesson.content || !Array.isArray(lesson.content)) {
      errors.push("Lesson must have a content array");
    } else {
      // Validate each content block
      lesson.content.forEach((block, index) => {
        const blockValidation = this.validateContentBlock(block);
        if (!blockValidation.isValid) {
          errors.push(
            ...(blockValidation.errors || []).map(
              (err) => `Content block ${index + 1}: ${err}`
            )
          );
          warnings.push(
            ...(blockValidation.warnings || []).map(
              (warn) => `Content block ${index + 1}: ${warn}`
            )
          );
        }
      });
    }

    if (!lesson.learningObjectives || lesson.learningObjectives.length === 0) {
      warnings.push("Lesson should have learning objectives");
    }

    if (typeof lesson.duration !== "number" || lesson.duration <= 0) {
      warnings.push("Lesson should have a positive duration estimate");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate complete module
   */
  validateModule(module: ModuleContent): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic module validation
    if (!module.id) {
      errors.push("Module must have an id");
    }

    if (!module.title) {
      errors.push("Module must have a title");
    }

    if (!module.lessons || !Array.isArray(module.lessons)) {
      errors.push("Module must have a lessons array");
    } else {
      // Validate each lesson
      module.lessons.forEach((lesson, index) => {
        const lessonValidation = this.validateLesson(lesson);
        if (!lessonValidation.isValid) {
          errors.push(
            ...(lessonValidation.errors || []).map(
              (err) => `Lesson ${index + 1}: ${err}`
            )
          );
          warnings.push(
            ...(lessonValidation.warnings || []).map(
              (warn) => `Lesson ${index + 1}: ${warn}`
            )
          );
        }
      });
    }

    if (!module.learningOutcomes || module.learningOutcomes.length === 0) {
      warnings.push("Module should have learning outcomes");
    }

    if (!module.version) {
      warnings.push("Module should have a version number");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Check if object has nested property
   */
  private hasNestedProperty(obj: any, path: string): boolean {
    const keys = path.split(".");
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return false;
      }
      current = current[key];
    }

    return true;
  }

  /**
   * Get content length for validation
   */
  private getContentLength(content: any): number {
    if (typeof content === "string") {
      return content.length;
    }

    if (typeof content === "object") {
      return JSON.stringify(content).length;
    }

    return 0;
  }
}

// =================================================================================
// SANITIZATION UTILITIES
// =================================================================================

/**
 * Content sanitization class
 */
export class ContentSanitizer {
  private defaultAllowedTags = [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "div",
    "span",
    "a",
    "img",
  ];

  private defaultAllowedAttributes: Record<string, string[]> = {
    a: ["href", "title", "target"],
    img: ["src", "alt", "title", "width", "height"],
    table: ["class"],
    th: ["class"],
    td: ["class"],
    div: ["class", "style"],
    span: ["class", "style"],
    p: ["class"],
    h1: ["class"],
    h2: ["class"],
    h3: ["class"],
    h4: ["class"],
    h5: ["class"],
    h6: ["class"],
  };

  /**
   * Sanitize HTML content
   */
  sanitizeHTML(html: string, options?: SanitizationOptions): string {
    const allowedTags = options?.allowedTags || this.defaultAllowedTags;
    const allowedAttributes =
      options?.allowedAttributes || this.defaultAllowedAttributes;
    const stripDangerous = options?.stripDangerous !== false;

    let sanitized = html;

    // Remove dangerous content if requested
    if (stripDangerous) {
      sanitized = this.removeDangerousContent(sanitized);
    }

    // Remove disallowed tags
    sanitized = this.removeDisallowedTags(sanitized, allowedTags);

    // Remove disallowed attributes
    sanitized = this.removeDisallowedAttributes(sanitized, allowedAttributes);

    return sanitized;
  }

  /**
   * Remove dangerous content from HTML
   */
  private removeDangerousContent(html: string): string {
    let sanitized = html;

    // Remove script tags
    sanitized = sanitized.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );

    // Remove javascript: URLs
    sanitized = sanitized.replace(/javascript:/gi, "");

    // Remove event handlers
    sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "");

    // Remove dangerous tags
    const dangerousTags = [
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
    ];
    for (const tag of dangerousTags) {
      const regex = new RegExp(`<${tag}\\b[^>]*>.*?<\\/${tag}>`, "gi");
      sanitized = sanitized.replace(regex, "");

      // Also remove self-closing versions
      const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*\\/>`, "gi");
      sanitized = sanitized.replace(selfClosingRegex, "");
    }

    return sanitized;
  }

  /**
   * Remove disallowed HTML tags
   */
  private removeDisallowedTags(html: string, allowedTags: string[]): string {
    const tagPattern = /<\/?(\w+)(?:\s[^>]*)?>/g;

    return html.replace(tagPattern, (match, tagName) => {
      if (allowedTags.includes(tagName.toLowerCase())) {
        return match;
      }
      return "";
    });
  }

  /**
   * Remove disallowed attributes
   */
  private removeDisallowedAttributes(
    html: string,
    allowedAttributes: Record<string, string[]>
  ): string {
    const tagPattern = /<(\w+)(\s[^>]*)?>/g;

    return html.replace(tagPattern, (match, tagName, attributes) => {
      if (!attributes) {
        return match;
      }

      const allowedAttrs = allowedAttributes[tagName.toLowerCase()] || [];
      if (allowedAttrs.length === 0) {
        return `<${tagName}>`;
      }

      // Parse and filter attributes
      const attrPattern = /(\w+)\s*=\s*["']([^"']*)["']/g;
      const filteredAttrs: string[] = [];

      let attrMatch;
      while ((attrMatch = attrPattern.exec(attributes)) !== null) {
        const [, attrName, attrValue] = attrMatch;
        if (allowedAttrs.includes(attrName.toLowerCase())) {
          filteredAttrs.push(`${attrName}="${attrValue}"`);
        }
      }

      return filteredAttrs.length > 0
        ? `<${tagName} ${filteredAttrs.join(" ")}>`
        : `<${tagName}>`;
    });
  }

  /**
   * Sanitize content block
   */
  sanitizeContentBlock(block: ContentBlock): ContentBlock {
    const sanitized = { ...block };

    if (block.type === "rich-text" && block.content.html) {
      sanitized.content = {
        ...block.content,
        html: this.sanitizeHTML(block.content.html, block.content.sanitization),
      };
    }

    // Sanitize other content types as needed
    if (block.title) {
      sanitized.title = this.sanitizeText(block.title);
    }

    return sanitized;
  }

  /**
   * Sanitize plain text content
   */
  private sanitizeText(text: string): string {
    // Remove HTML tags from plain text
    return text.replace(/<[^>]*>/g, "");
  }
}

// =================================================================================
// CONTENT INTEGRITY UTILITIES
// =================================================================================

/**
 * Content integrity checker
 */
export class ContentIntegrityChecker {
  /**
   * Check content integrity with checksums
   */
  generateContentHash(content: any): string {
    const contentString =
      typeof content === "string" ? content : JSON.stringify(content, null, 0);

    // Simple hash function (in production, use crypto.subtle.digest)
    let hash = 0;
    for (let i = 0; i < contentString.length; i++) {
      const char = contentString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(16);
  }

  /**
   * Verify content integrity
   */
  verifyContentIntegrity(content: any, expectedHash: string): boolean {
    const actualHash = this.generateContentHash(content);
    return actualHash === expectedHash;
  }

  /**
   * Check for content completeness
   */
  checkContentCompleteness(module: ModuleContent): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check that all lessons have content
    module.lessons.forEach((lesson, index) => {
      if (!lesson.content || lesson.content.length === 0) {
        errors.push(
          `Lesson ${index + 1} (${lesson.title}) has no content blocks`
        );
      }

      // Check for empty content blocks
      lesson.content.forEach((block, blockIndex) => {
        if (
          !block.content ||
          (typeof block.content === "object" &&
            Object.keys(block.content).length === 0)
        ) {
          warnings.push(
            `Lesson ${index + 1}, block ${blockIndex + 1} appears to be empty`
          );
        }
      });
    });

    // Check for missing assessments
    if (!module.assessments || module.assessments.length === 0) {
      warnings.push(
        "Module has no assessments - consider adding knowledge checks"
      );
    }

    // Check for missing resources
    if (!module.resources || module.resources.length === 0) {
      warnings.push("Module has no additional resources");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

// =================================================================================
// EXPORTED INSTANCES
// =================================================================================

// Create singleton instances for easy use
export const contentValidator = new ContentValidator();
export const contentSanitizer = new ContentSanitizer();
export const contentIntegrityChecker = new ContentIntegrityChecker();

// =================================================================================
// BUILT-IN VALIDATORS
// =================================================================================

/**
 * Built-in validator for clinical content
 */
export const clinicalContentValidator: ValidationFunction = (
  content: any
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for medical terminology accuracy
  const medicalTerms = [
    "patient",
    "diagnosis",
    "treatment",
    "medication",
    "symptom",
  ];
  const contentString = JSON.stringify(content).toLowerCase();

  let hasMedicalContent = false;
  for (const term of medicalTerms) {
    if (contentString.includes(term)) {
      hasMedicalContent = true;
      break;
    }
  }

  if (hasMedicalContent) {
    // Additional validation for medical content
    if (
      contentString.includes("dosage") &&
      !contentString.includes("consult")
    ) {
      warnings.push(
        "Medical content with dosage information should include consultation disclaimer"
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};

/**
 * Built-in validator for accessibility compliance
 */
export const accessibilityValidator: ValidationFunction = (
  content: any
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (content.html) {
    // Check for images without alt text
    const imgPattern = /<img(?![^>]*alt=)[^>]*>/gi;
    if (imgPattern.test(content.html)) {
      errors.push("Images must have alt text for accessibility");
    }

    // Check for proper heading hierarchy
    const headingPattern = /<h([1-6])[^>]*>/gi;
    const headings: number[] = [];
    let match;
    while ((match = headingPattern.exec(content.html)) !== null) {
      headings.push(parseInt(match[1]));
    }

    // Check for skipped heading levels
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] - headings[i - 1] > 1) {
        warnings.push("Heading levels should not skip (e.g., h1 to h3)");
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};

// Register built-in validators
contentValidator.registerValidator("clinical", clinicalContentValidator);
contentValidator.registerValidator("accessibility", accessibilityValidator);
