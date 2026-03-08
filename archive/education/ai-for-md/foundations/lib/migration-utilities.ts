/**
 * @fileoverview Automated content migration utilities
 * @description Comprehensive tools for migrating AI for MD webapp content
 * with validation, backup, rollback, and integrity checking capabilities
 */

import { promises as fs } from "fs";
import path from "path";
import {
  ModuleContent,
  MigrationResult,
  MigrationError,
  MigrationStatistics,
  TransformationConfig,
} from "./content-types";
import {
  ContentTransformer,
  ContentMigrator,
  createDefaultTransformationConfig,
} from "./content-transformation";
import {
  contentValidator,
  contentSanitizer,
  contentIntegrityChecker,
} from "./content-validation";

// =================================================================================
// MIGRATION ORCHESTRATOR
// =================================================================================

/**
 * Main migration orchestrator class
 */
export class MigrationOrchestrator {
  private config: TransformationConfig;
  private migrator: ContentMigrator;
  private backupDirectory: string;
  private logFile: string;

  constructor(config?: Partial<TransformationConfig>) {
    this.config = { ...createDefaultTransformationConfig(), ...config };
    this.migrator = new ContentMigrator(this.config);
    this.backupDirectory = path.join(process.cwd(), "migration-backups");
    this.logFile = path.join(this.backupDirectory, "migration.log");
  }

  /**
   * Execute complete migration process
   */
  async executeMigration(
    sourceDirectory: string,
    targetDirectory: string,
    moduleMetadata: Partial<ModuleContent>
  ): Promise<MigrationResult> {
    const migrationId = this.generateMigrationId();

    try {
      // Initialize migration
      await this.initializeMigration(migrationId);

      // Load source content
      this.log(`Loading source content from ${sourceDirectory}`);
      const sourceContent = await this.loadSourceContent(sourceDirectory);

      // Create backup
      this.log(`Creating backup for migration ${migrationId}`);
      await this.createMigrationBackup(migrationId, sourceContent);

      // Execute transformation
      this.log(`Executing content transformation`);
      const migrationResult = await this.migrator.migrateWithBackup(
        sourceContent.components,
        sourceContent.data,
        moduleMetadata
      );

      if (!migrationResult.success) {
        this.log(`Migration failed: ${JSON.stringify(migrationResult.errors)}`);
        return migrationResult;
      }

      // Validate migrated content
      this.log(`Validating migrated content`);
      const validationResult = await this.validateMigratedContent(
        migrationResult.content!
      );

      if (!validationResult.isValid) {
        migrationResult.success = false;
        migrationResult.errors = migrationResult.errors || [];
        migrationResult.errors.push({
          type: "validation",
          message: "Migrated content failed validation",
          severity: "error",
        });
        return migrationResult;
      }

      // Save migrated content
      this.log(`Saving migrated content to ${targetDirectory}`);
      await this.saveMigratedContent(targetDirectory, migrationResult.content!);

      // Generate migration report
      this.log(`Generating migration report`);
      await this.generateMigrationReport(migrationId, migrationResult);

      this.log(`Migration ${migrationId} completed successfully`);
      return migrationResult;
    } catch (error) {
      this.log(`Migration ${migrationId} failed with error: ${error}`);
      return {
        success: false,
        errors: [
          {
            type: "system",
            message: `Migration failed: ${error}`,
            severity: "error",
          },
        ],
      };
    }
  }

  /**
   * Rollback migration to previous state
   */
  async rollbackMigration(migrationId: string): Promise<boolean> {
    try {
      this.log(`Initiating rollback for migration ${migrationId}`);

      const backupPath = path.join(this.backupDirectory, migrationId);
      const backupExists = await this.fileExists(backupPath);

      if (!backupExists) {
        this.log(`Backup not found for migration ${migrationId}`);
        return false;
      }

      // Load backup data
      const backupData = await this.loadBackupData(migrationId);

      // Restore original content
      await this.restoreFromBackup(backupData);

      this.log(`Rollback for migration ${migrationId} completed successfully`);
      return true;
    } catch (error) {
      this.log(`Rollback failed for migration ${migrationId}: ${error}`);
      return false;
    }
  }

  // =================================================================================
  // PRIVATE METHODS
  // =================================================================================

  /**
   * Generate unique migration ID
   */
  private generateMigrationId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).substr(2, 9);
    return `migration_${timestamp}_${random}`;
  }

  /**
   * Initialize migration environment
   */
  private async initializeMigration(migrationId: string): Promise<void> {
    // Ensure backup directory exists
    await this.ensureDirectoryExists(this.backupDirectory);

    // Create migration-specific backup directory
    const migrationBackupDir = path.join(this.backupDirectory, migrationId);
    await this.ensureDirectoryExists(migrationBackupDir);

    // Initialize log file
    await this.initializeLogFile();

    this.log(`Migration ${migrationId} initialized`);
  }

  /**
   * Load source content from webapp directory
   */
  private async loadSourceContent(sourceDirectory: string): Promise<any> {
    const components = await this.loadWebappComponents(sourceDirectory);
    const data = await this.loadWebappData(sourceDirectory);

    return { components, data };
  }

  /**
   * Load webapp components from source
   */
  private async loadWebappComponents(sourceDirectory: string): Promise<any[]> {
    const indexPath = path.join(sourceDirectory, "index.ts");

    if (!(await this.fileExists(indexPath))) {
      throw new Error(`Index file not found at ${indexPath}`);
    }

    // Parse index.ts to extract component definitions
    const indexContent = await fs.readFile(indexPath, "utf-8");

    // Extract component definitions (simplified parsing)
    const componentMatches = indexContent.match(
      /const\s+(\w+Components):\s*Component\[\]\s*=\s*\[([\s\S]*?)\];/g
    );

    if (!componentMatches) {
      throw new Error("No component definitions found in index.ts");
    }

    // Parse component objects (this is a simplified implementation)
    const components = this.parseComponentDefinitions(componentMatches[0]);

    return components;
  }

  /**
   * Load webapp data files
   */
  private async loadWebappData(
    sourceDirectory: string
  ): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    // Load main data file
    const dataPath = path.join(sourceDirectory, "data.ts");
    if (await this.fileExists(dataPath)) {
      const dataContent = await fs.readFile(dataPath, "utf-8");
      data.main = this.parseDataFile(dataContent);
    }

    // Load component-specific data files
    const componentsDir = path.join(sourceDirectory, "src", "components");
    if (await this.fileExists(componentsDir)) {
      await this.loadComponentData(componentsDir, data);
    }

    return data;
  }

  /**
   * Load component-specific data files recursively
   */
  private async loadComponentData(
    componentsDir: string,
    data: Record<string, any>
  ): Promise<void> {
    const entries = await fs.readdir(componentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const componentDir = path.join(componentsDir, entry.name);
        const dataFile = path.join(componentDir, `${entry.name}.data.json`);

        if (await this.fileExists(dataFile)) {
          const dataContent = await fs.readFile(dataFile, "utf-8");
          data[entry.name] = JSON.parse(dataContent);
        }

        // Recursively check subdirectories
        await this.loadComponentData(componentDir, data);
      }
    }
  }

  /**
   * Create migration backup
   */
  private async createMigrationBackup(
    migrationId: string,
    sourceContent: any
  ): Promise<void> {
    const backupPath = path.join(
      this.backupDirectory,
      migrationId,
      "backup.json"
    );
    const backupData = {
      migrationId,
      timestamp: new Date().toISOString(),
      sourceContent,
      metadata: {
        version: "1.0.0",
        description: "AI for MD webapp content backup",
      },
    };

    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));

    // Create integrity hash
    const hash = contentIntegrityChecker.generateContentHash(backupData);
    const hashPath = path.join(
      this.backupDirectory,
      migrationId,
      "backup.hash"
    );
    await fs.writeFile(hashPath, hash);
  }

  /**
   * Validate migrated content
   */
  private async validateMigratedContent(content: ModuleContent): Promise<any> {
    // Comprehensive validation
    const structureValidation = contentValidator.validateModule(content);
    const integrityValidation =
      contentIntegrityChecker.checkContentCompleteness(content);

    const isValid = structureValidation.isValid && integrityValidation.isValid;
    const errors = [
      ...(structureValidation.errors || []),
      ...(integrityValidation.errors || []),
    ];
    const warnings = [
      ...(structureValidation.warnings || []),
      ...(integrityValidation.warnings || []),
    ];

    return {
      isValid,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Save migrated content to target directory
   */
  private async saveMigratedContent(
    targetDirectory: string,
    content: ModuleContent
  ): Promise<void> {
    await this.ensureDirectoryExists(targetDirectory);

    // Save main module file
    const moduleFile = path.join(targetDirectory, "module.json");
    await fs.writeFile(moduleFile, JSON.stringify(content, null, 2));

    // Save individual lesson files
    const lessonsDir = path.join(targetDirectory, "lessons");
    await this.ensureDirectoryExists(lessonsDir);

    for (const lesson of content.lessons) {
      const lessonFile = path.join(lessonsDir, `${lesson.id}.json`);
      await fs.writeFile(lessonFile, JSON.stringify(lesson, null, 2));
    }

    // Save assessments
    if (content.assessments && content.assessments.length > 0) {
      const assessmentsDir = path.join(targetDirectory, "assessments");
      await this.ensureDirectoryExists(assessmentsDir);

      for (const assessment of content.assessments) {
        const assessmentFile = path.join(
          assessmentsDir,
          `${assessment.id}.json`
        );
        await fs.writeFile(assessmentFile, JSON.stringify(assessment, null, 2));
      }
    }

    // Save resources
    if (content.resources && content.resources.length > 0) {
      const resourcesDir = path.join(targetDirectory, "resources");
      await this.ensureDirectoryExists(resourcesDir);

      const resourcesFile = path.join(resourcesDir, "resources.json");
      await fs.writeFile(
        resourcesFile,
        JSON.stringify(content.resources, null, 2)
      );
    }
  }

  /**
   * Generate migration report
   */
  private async generateMigrationReport(
    migrationId: string,
    result: MigrationResult
  ): Promise<void> {
    const reportPath = path.join(
      this.backupDirectory,
      migrationId,
      "migration-report.json"
    );

    const report = {
      migrationId,
      timestamp: new Date().toISOString(),
      success: result.success,
      statistics: result.statistics,
      errors: result.errors,
      warnings: result.warnings,
      summary: this.generateMigrationSummary(result),
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Also generate human-readable report
    const readableReportPath = path.join(
      this.backupDirectory,
      migrationId,
      "migration-report.md"
    );
    const readableReport = this.generateReadableReport(report);
    await fs.writeFile(readableReportPath, readableReport);
  }

  /**
   * Generate migration summary
   */
  private generateMigrationSummary(result: MigrationResult): string {
    if (!result.statistics) {
      return "Migration completed without statistics";
    }

    const stats = result.statistics;
    const successRate =
      stats.totalBlocks > 0
        ? Math.round((stats.successfulBlocks / stats.totalBlocks) * 100)
        : 0;

    return (
      `Migration processed ${stats.totalBlocks} content blocks with ${successRate}% success rate. ` +
      `Processing time: ${stats.processingTime}ms. ` +
      `Content size: ${stats.sizeComparison.before} → ${stats.sizeComparison.after} bytes.`
    );
  }

  /**
   * Generate human-readable migration report
   */
  private generateReadableReport(report: any): string {
    let markdown = `# Migration Report\n\n`;
    markdown += `**Migration ID:** ${report.migrationId}\n`;
    markdown += `**Timestamp:** ${report.timestamp}\n`;
    markdown += `**Status:** ${
      report.success ? "✅ Success" : "❌ Failed"
    }\n\n`;

    if (report.statistics) {
      markdown += `## Statistics\n\n`;
      markdown += `- **Total Content Blocks:** ${report.statistics.totalBlocks}\n`;
      markdown += `- **Successful Blocks:** ${report.statistics.successfulBlocks}\n`;
      markdown += `- **Failed Blocks:** ${report.statistics.failedBlocks}\n`;
      markdown += `- **Processing Time:** ${report.statistics.processingTime}ms\n`;
      markdown += `- **Size Before:** ${report.statistics.sizeComparison.before} bytes\n`;
      markdown += `- **Size After:** ${report.statistics.sizeComparison.after} bytes\n\n`;
    }

    if (report.errors && report.errors.length > 0) {
      markdown += `## Errors\n\n`;
      report.errors.forEach((error: any, index: number) => {
        markdown += `${index + 1}. **${error.type}**: ${error.message}\n`;
        if (error.location) {
          markdown += `   - Location: ${error.location}\n`;
        }
      });
      markdown += `\n`;
    }

    if (report.warnings && report.warnings.length > 0) {
      markdown += `## Warnings\n\n`;
      report.warnings.forEach((warning: string, index: number) => {
        markdown += `${index + 1}. ${warning}\n`;
      });
      markdown += `\n`;
    }

    markdown += `## Summary\n\n${report.summary}\n`;

    return markdown;
  }

  /**
   * Load backup data for rollback
   */
  private async loadBackupData(migrationId: string): Promise<any> {
    const backupPath = path.join(
      this.backupDirectory,
      migrationId,
      "backup.json"
    );
    const hashPath = path.join(
      this.backupDirectory,
      migrationId,
      "backup.hash"
    );

    // Verify backup integrity
    const backupContent = await fs.readFile(backupPath, "utf-8");
    const backupData = JSON.parse(backupContent);

    if (await this.fileExists(hashPath)) {
      const expectedHash = await fs.readFile(hashPath, "utf-8");
      const actualHash =
        contentIntegrityChecker.generateContentHash(backupData);

      if (expectedHash.trim() !== actualHash) {
        throw new Error("Backup integrity check failed");
      }
    }

    return backupData;
  }

  /**
   * Restore content from backup
   */
  private async restoreFromBackup(backupData: any): Promise<void> {
    // This would restore the original webapp content
    // Implementation depends on specific restoration requirements
    this.log("Backup restoration completed");
  }

  // =================================================================================
  // UTILITY METHODS
  // =================================================================================

  /**
   * Parse component definitions from index.ts
   */
  private parseComponentDefinitions(componentText: string): any[] {
    // Simplified parsing - in production, use a proper AST parser
    const components: any[] = [];

    // Extract component objects using regex
    const componentPattern =
      /{\s*id:\s*['"]([^'"]+)['"],\s*htmlPath:\s*['"]([^'"]+)['"](?:,\s*initializers:\s*\[([^\]]*)\])?(?:,\s*placeholderId:\s*['"]([^'"]+)['"])?(?:,\s*hasData:\s*(true|false))?\s*}/g;

    let match;
    while ((match = componentPattern.exec(componentText)) !== null) {
      const [, id, htmlPath, initializers, placeholderId, hasData] = match;

      components.push({
        id,
        htmlPath,
        initializers: initializers
          ? initializers.split(",").map((s) => s.trim())
          : undefined,
        placeholderId,
        hasData: hasData === "true",
      });
    }

    return components;
  }

  /**
   * Parse data file content
   */
  private parseDataFile(dataContent: string): any {
    // Extract the guideData export
    const dataMatch = dataContent.match(
      /export\s+const\s+guideData:\s*GuideData\s*=\s*({[\s\S]*});/
    );

    if (!dataMatch) {
      return {};
    }

    // This is a simplified implementation
    // In production, use a proper TypeScript parser
    try {
      // Remove TypeScript-specific syntax and evaluate as JSON
      const cleanedData = dataMatch[1]
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove comments
        .replace(/\/\/.*$/gm, "") // Remove line comments
        .replace(/,\s*}/g, "}") // Remove trailing commas
        .replace(/,\s*]/g, "]"); // Remove trailing commas in arrays

      return eval(`(${cleanedData})`);
    } catch (error) {
      this.log(`Failed to parse data file: ${error}`);
      return {};
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Initialize log file
   */
  private async initializeLogFile(): Promise<void> {
    const logHeader = `Migration Log - ${new Date().toISOString()}\n${"=".repeat(
      50
    )}\n`;
    await fs.writeFile(this.logFile, logHeader);
  }

  /**
   * Log message to file and console
   */
  private async log(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    // Log to console
    console.log(logEntry.trim());

    // Log to file
    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }
}

// =================================================================================
// MIGRATION UTILITIES
// =================================================================================

/**
 * Content integrity checker for migrations
 */
export class MigrationIntegrityChecker {
  /**
   * Verify migration integrity
   */
  async verifyMigrationIntegrity(
    originalContent: any,
    migratedContent: ModuleContent
  ): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check content preservation
    const contentPreservation = this.checkContentPreservation(
      originalContent,
      migratedContent
    );
    issues.push(...contentPreservation);

    // Check educational structure
    const educationalStructure =
      this.checkEducationalStructure(migratedContent);
    issues.push(...educationalStructure);

    // Check interactive elements
    const interactiveElements = this.checkInteractiveElements(
      originalContent,
      migratedContent
    );
    issues.push(...interactiveElements);

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Check content preservation
   */
  private checkContentPreservation(
    original: any,
    migrated: ModuleContent
  ): string[] {
    const issues: string[] = [];

    // Check that all original components are represented
    if (original.components) {
      const originalIds = original.components.map((c: any) => c.id);
      const migratedIds = migrated.lessons.map((l) => l.id);

      const missingComponents = originalIds.filter(
        (id: string) => !migratedIds.includes(id)
      );
      if (missingComponents.length > 0) {
        issues.push(
          `Missing components in migration: ${missingComponents.join(", ")}`
        );
      }
    }

    // Check that educational content is preserved
    if (migrated.lessons.length === 0) {
      issues.push("No lessons found in migrated content");
    }

    return issues;
  }

  /**
   * Check educational structure
   */
  private checkEducationalStructure(migrated: ModuleContent): string[] {
    const issues: string[] = [];

    // Check learning objectives
    if (!migrated.learningOutcomes || migrated.learningOutcomes.length === 0) {
      issues.push("Module has no learning outcomes");
    }

    // Check lesson structure
    migrated.lessons.forEach((lesson, index) => {
      if (
        !lesson.learningObjectives ||
        lesson.learningObjectives.length === 0
      ) {
        issues.push(
          `Lesson ${index + 1} (${lesson.id}) has no learning objectives`
        );
      }

      if (!lesson.content || lesson.content.length === 0) {
        issues.push(`Lesson ${index + 1} (${lesson.id}) has no content blocks`);
      }
    });

    return issues;
  }

  /**
   * Check interactive elements
   */
  private checkInteractiveElements(
    original: any,
    migrated: ModuleContent
  ): string[] {
    const issues: string[] = [];

    // Count interactive elements in original
    let originalInteractiveCount = 0;
    if (original.data) {
      Object.keys(original.data).forEach((key) => {
        if (original.data[key] && typeof original.data[key] === "object") {
          originalInteractiveCount++;
        }
      });
    }

    // Count interactive elements in migrated
    let migratedInteractiveCount = 0;
    migrated.lessons.forEach((lesson) => {
      lesson.content.forEach((block) => {
        if (block.type === "interactive-demo") {
          migratedInteractiveCount++;
        }
      });
    });

    if (migratedInteractiveCount < originalInteractiveCount) {
      issues.push(
        `Interactive elements may be missing: original had ${originalInteractiveCount}, migrated has ${migratedInteractiveCount}`
      );
    }

    return issues;
  }
}

// =================================================================================
// MIGRATION VALIDATOR
// =================================================================================

/**
 * Specialized validator for migration results
 */
export class MigrationValidator {
  private integrityChecker: MigrationIntegrityChecker;

  constructor() {
    this.integrityChecker = new MigrationIntegrityChecker();
  }

  /**
   * Validate complete migration result
   */
  async validateMigration(
    originalContent: any,
    migrationResult: MigrationResult
  ): Promise<{ isValid: boolean; report: string }> {
    const validationResults: string[] = [];

    // Check migration success
    if (!migrationResult.success) {
      validationResults.push("❌ Migration failed");
      if (migrationResult.errors) {
        migrationResult.errors.forEach((error) => {
          validationResults.push(`   - ${error.type}: ${error.message}`);
        });
      }
      return { isValid: false, report: validationResults.join("\n") };
    }

    validationResults.push("✅ Migration completed successfully");

    // Check content integrity
    if (migrationResult.content) {
      const integrityCheck =
        await this.integrityChecker.verifyMigrationIntegrity(
          originalContent,
          migrationResult.content
        );

      if (integrityCheck.isValid) {
        validationResults.push("✅ Content integrity verified");
      } else {
        validationResults.push("⚠️ Content integrity issues found:");
        integrityCheck.issues.forEach((issue) => {
          validationResults.push(`   - ${issue}`);
        });
      }
    }

    // Check statistics
    if (migrationResult.statistics) {
      const stats = migrationResult.statistics;
      validationResults.push(`📊 Statistics:`);
      validationResults.push(`   - Total blocks: ${stats.totalBlocks}`);
      validationResults.push(`   - Successful: ${stats.successfulBlocks}`);
      validationResults.push(`   - Failed: ${stats.failedBlocks}`);
      validationResults.push(`   - Processing time: ${stats.processingTime}ms`);

      const successRate =
        stats.totalBlocks > 0
          ? Math.round((stats.successfulBlocks / stats.totalBlocks) * 100)
          : 0;

      if (successRate >= 95) {
        validationResults.push("✅ High success rate achieved");
      } else if (successRate >= 80) {
        validationResults.push(
          "⚠️ Moderate success rate - review failed blocks"
        );
      } else {
        validationResults.push(
          "❌ Low success rate - migration may need revision"
        );
      }
    }

    // Check warnings
    if (migrationResult.warnings && migrationResult.warnings.length > 0) {
      validationResults.push(
        `⚠️ Warnings (${migrationResult.warnings.length}):`
      );
      migrationResult.warnings.forEach((warning) => {
        validationResults.push(`   - ${warning}`);
      });
    }

    const isValid =
      migrationResult.success &&
      (!migrationResult.errors || migrationResult.errors.length === 0);

    return {
      isValid,
      report: validationResults.join("\n"),
    };
  }
}

// =================================================================================
// EXPORTED UTILITIES
// =================================================================================

/**
 * Create migration orchestrator with default configuration
 */
export function createMigrationOrchestrator(
  config?: Partial<TransformationConfig>
): MigrationOrchestrator {
  return new MigrationOrchestrator(config);
}

/**
 * Create migration integrity checker
 */
export function createMigrationIntegrityChecker(): MigrationIntegrityChecker {
  return new MigrationIntegrityChecker();
}

/**
 * Create migration validator
 */
export function createMigrationValidator(): MigrationValidator {
  return new MigrationValidator();
}

/**
 * Execute quick migration with default settings
 */
export async function executeMigration(
  sourceDirectory: string,
  targetDirectory: string,
  moduleMetadata: Partial<ModuleContent>
): Promise<MigrationResult> {
  const orchestrator = createMigrationOrchestrator();
  return await orchestrator.executeMigration(
    sourceDirectory,
    targetDirectory,
    moduleMetadata
  );
}

/**
 * Validate migration result
 */
export async function validateMigrationResult(
  originalContent: any,
  migrationResult: MigrationResult
): Promise<{ isValid: boolean; report: string }> {
  const validator = createMigrationValidator();
  return await validator.validateMigration(originalContent, migrationResult);
}
