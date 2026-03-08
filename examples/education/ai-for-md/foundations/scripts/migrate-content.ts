#!/usr/bin/env node

/**
 * @fileoverview CLI tool for migrating AI for MD webapp content
 * @description Command-line interface for executing content migration with
 * comprehensive options for validation, backup, and rollback
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import path from "path";
import { promises as fs } from "fs";
import {
  MigrationOrchestrator,
  createMigrationOrchestrator,
  validateMigrationResult,
  createMigrationValidator,
} from "../lib/migration-utilities";
import { createDefaultTransformationConfig } from "../lib/content-transformation";
import { ModuleContent } from "../lib/content-types";

// =================================================================================
// CLI PROGRAM SETUP
// =================================================================================

const program = new Command();

program
  .name("migrate-content")
  .description(
    "Migrate AI for MD webapp content to SoleMD education module format"
  )
  .version("1.0.0");

// =================================================================================
// MIGRATION COMMAND
// =================================================================================

program
  .command("migrate")
  .description("Execute content migration")
  .option("-s, --source <path>", "Source webapp directory", "./temp-ai-for-mds")
  .option(
    "-t, --target <path>",
    "Target module directory",
    "./app/education/ai-for-md/foundations/data"
  )
  .option("-c, --config <path>", "Migration configuration file")
  .option("--dry-run", "Perform dry run without making changes")
  .option("--force", "Force migration without confirmation prompts")
  .option("--verbose", "Enable verbose logging")
  .option("--strict", "Enable strict validation mode")
  .action(async (options) => {
    try {
      await executeMigrationCommand(options);
    } catch (error) {
      console.error(chalk.red("Migration failed:"), error);
      process.exit(1);
    }
  });

// =================================================================================
// VALIDATION COMMAND
// =================================================================================

program
  .command("validate")
  .description("Validate migrated content")
  .option("-s, --source <path>", "Source webapp directory", "./temp-ai-for-mds")
  .option(
    "-t, --target <path>",
    "Target module directory",
    "./app/education/ai-for-md/foundations/data"
  )
  .option("--report <path>", "Generate validation report at specified path")
  .action(async (options) => {
    try {
      await executeValidationCommand(options);
    } catch (error) {
      console.error(chalk.red("Validation failed:"), error);
      process.exit(1);
    }
  });

// =================================================================================
// ROLLBACK COMMAND
// =================================================================================

program
  .command("rollback")
  .description("Rollback migration to previous state")
  .option("-i, --migration-id <id>", "Migration ID to rollback")
  .option("--list", "List available backups")
  .option("--force", "Force rollback without confirmation")
  .action(async (options) => {
    try {
      await executeRollbackCommand(options);
    } catch (error) {
      console.error(chalk.red("Rollback failed:"), error);
      process.exit(1);
    }
  });

// =================================================================================
// ANALYZE COMMAND
// =================================================================================

program
  .command("analyze")
  .description("Analyze source content structure")
  .option("-s, --source <path>", "Source webapp directory", "./temp-ai-for-mds")
  .option("--output <path>", "Output analysis to file")
  .action(async (options) => {
    try {
      await executeAnalyzeCommand(options);
    } catch (error) {
      console.error(chalk.red("Analysis failed:"), error);
      process.exit(1);
    }
  });

// =================================================================================
// COMMAND IMPLEMENTATIONS
// =================================================================================

/**
 * Execute migration command
 */
async function executeMigrationCommand(options: any): Promise<void> {
  console.log(chalk.blue.bold("🚀 AI for MD Content Migration Tool\n"));

  // Validate source directory
  const sourceExists = await fileExists(options.source);
  if (!sourceExists) {
    throw new Error(`Source directory not found: ${options.source}`);
  }

  // Load configuration
  const config = await loadMigrationConfig(options.config);
  if (options.strict) {
    config.validation.strict = true;
  }

  // Create orchestrator
  const orchestrator = createMigrationOrchestrator(config);

  // Get module metadata
  const moduleMetadata = await getModuleMetadata(options.force);

  if (options.dryRun) {
    console.log(chalk.yellow("🔍 Performing dry run...\n"));
    await performDryRun(
      orchestrator,
      options.source,
      options.target,
      moduleMetadata
    );
    return;
  }

  // Confirm migration
  if (!options.force) {
    const confirmed = await confirmMigration(options.source, options.target);
    if (!confirmed) {
      console.log(chalk.yellow("Migration cancelled by user"));
      return;
    }
  }

  // Execute migration
  const spinner = ora("Executing migration...").start();

  try {
    const migrationResult = await orchestrator.executeMigration(
      options.source,
      options.target,
      moduleMetadata
    );

    spinner.stop();

    if (migrationResult.success) {
      console.log(chalk.green("✅ Migration completed successfully!\n"));
      displayMigrationResults(migrationResult);
    } else {
      console.log(chalk.red("❌ Migration failed!\n"));
      displayMigrationErrors(migrationResult);
    }
  } catch (error) {
    spinner.fail("Migration failed with error");
    throw error;
  }
}

/**
 * Execute validation command
 */
async function executeValidationCommand(options: any): Promise<void> {
  console.log(chalk.blue.bold("🔍 Content Validation Tool\n"));

  const spinner = ora("Loading content for validation...").start();

  try {
    // Load original and migrated content
    const originalContent = await loadSourceContent(options.source);
    const migratedContent = await loadMigratedContent(options.target);

    spinner.text = "Validating content...";

    // Create validator and validate
    const validator = createMigrationValidator();
    const migrationResult = { success: true, content: migratedContent };
    const validationResult = await validator.validateMigration(
      originalContent,
      migrationResult
    );

    spinner.stop();

    console.log(chalk.blue("Validation Results:\n"));
    console.log(validationResult.report);

    if (options.report) {
      await fs.writeFile(options.report, validationResult.report);
      console.log(
        chalk.green(`\n📄 Validation report saved to: ${options.report}`)
      );
    }

    if (!validationResult.isValid) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail("Validation failed");
    throw error;
  }
}

/**
 * Execute rollback command
 */
async function executeRollbackCommand(options: any): Promise<void> {
  console.log(chalk.blue.bold("⏪ Migration Rollback Tool\n"));

  const orchestrator = createMigrationOrchestrator();

  if (options.list) {
    const backups = orchestrator.listBackups();
    if (backups.length === 0) {
      console.log(chalk.yellow("No backups available"));
      return;
    }

    console.log(chalk.blue("Available backups:\n"));
    backups.forEach((backup, index) => {
      console.log(`${index + 1}. ${backup.id} (${backup.timestamp})`);
    });
    return;
  }

  let migrationId = options.migrationId;

  if (!migrationId) {
    const backups = orchestrator.listBackups();
    if (backups.length === 0) {
      console.log(chalk.yellow("No backups available for rollback"));
      return;
    }

    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "migrationId",
        message: "Select migration to rollback:",
        choices: backups.map((backup) => ({
          name: `${backup.id} (${backup.timestamp})`,
          value: backup.id,
        })),
      },
    ]);

    migrationId = answer.migrationId;
  }

  // Confirm rollback
  if (!options.force) {
    const confirmed = await confirmRollback(migrationId);
    if (!confirmed) {
      console.log(chalk.yellow("Rollback cancelled by user"));
      return;
    }
  }

  const spinner = ora("Executing rollback...").start();

  try {
    const success = await orchestrator.rollbackMigration(migrationId);

    spinner.stop();

    if (success) {
      console.log(chalk.green("✅ Rollback completed successfully!"));
    } else {
      console.log(chalk.red("❌ Rollback failed!"));
      process.exit(1);
    }
  } catch (error) {
    spinner.fail("Rollback failed");
    throw error;
  }
}

/**
 * Execute analyze command
 */
async function executeAnalyzeCommand(options: any): Promise<void> {
  console.log(chalk.blue.bold("📊 Content Analysis Tool\n"));

  const spinner = ora("Analyzing source content...").start();

  try {
    const analysis = await analyzeSourceContent(options.source);

    spinner.stop();

    console.log(chalk.blue("Content Analysis Results:\n"));
    displayAnalysisResults(analysis);

    if (options.output) {
      const analysisReport = generateAnalysisReport(analysis);
      await fs.writeFile(options.output, analysisReport);
      console.log(
        chalk.green(`\n📄 Analysis report saved to: ${options.output}`)
      );
    }
  } catch (error) {
    spinner.fail("Analysis failed");
    throw error;
  }
}

// =================================================================================
// UTILITY FUNCTIONS
// =================================================================================

/**
 * Load migration configuration
 */
async function loadMigrationConfig(configPath?: string): Promise<any> {
  if (!configPath) {
    return createDefaultTransformationConfig();
  }

  const configExists = await fileExists(configPath);
  if (!configExists) {
    console.warn(
      chalk.yellow(`Config file not found: ${configPath}, using defaults`)
    );
    return createDefaultTransformationConfig();
  }

  const configContent = await fs.readFile(configPath, "utf-8");
  const customConfig = JSON.parse(configContent);

  return {
    ...createDefaultTransformationConfig(),
    ...customConfig,
  };
}

/**
 * Get module metadata from user input
 */
async function getModuleMetadata(
  force: boolean
): Promise<Partial<ModuleContent>> {
  if (force) {
    return getDefaultModuleMetadata();
  }

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "title",
      message: "Module title:",
      default: "AI for MD Foundations",
    },
    {
      type: "input",
      name: "description",
      message: "Module description:",
      default:
        "Interactive guide for clinicians to develop AI skills for research, analysis, and discovery",
    },
    {
      type: "input",
      name: "version",
      message: "Module version:",
      default: "1.0.0",
    },
    {
      type: "input",
      name: "author",
      message: "Module author:",
      default: "Dr. Jon Sole",
    },
    {
      type: "list",
      name: "difficulty",
      message: "Difficulty level:",
      choices: ["beginner", "intermediate", "advanced"],
      default: "intermediate",
    },
  ]);

  return {
    id: "ai-for-md-foundations",
    ...answers,
    learningOutcomes: [
      "Understand core LLM concepts and mechanics",
      "Master precision prompting techniques",
      "Apply S.A.F.E.R. framework for clinical AI use",
      "Integrate AI tools into clinical workflows",
    ],
  };
}

/**
 * Get default module metadata
 */
function getDefaultModuleMetadata(): Partial<ModuleContent> {
  return {
    id: "ai-for-md-foundations",
    title: "AI for MD Foundations",
    description:
      "Interactive guide for clinicians to develop AI skills for research, analysis, and discovery",
    version: "1.0.0",
    author: "Dr. Jon Sole",
    difficulty: "intermediate",
    learningOutcomes: [
      "Understand core LLM concepts and mechanics",
      "Master precision prompting techniques",
      "Apply S.A.F.E.R. framework for clinical AI use",
      "Integrate AI tools into clinical workflows",
    ],
  };
}

/**
 * Perform dry run migration
 */
async function performDryRun(
  orchestrator: MigrationOrchestrator,
  source: string,
  target: string,
  metadata: Partial<ModuleContent>
): Promise<void> {
  console.log(chalk.blue("Dry run analysis:\n"));

  // Analyze source content
  const analysis = await analyzeSourceContent(source);
  displayAnalysisResults(analysis);

  console.log(chalk.blue("\nMigration would:"));
  console.log(`• Transform ${analysis.componentCount} components`);
  console.log(`• Create ${analysis.interactiveCount} interactive demos`);
  console.log(`• Preserve ${analysis.contentBlockCount} content blocks`);
  console.log(`• Generate module with ${analysis.estimatedLessons} lessons`);

  console.log(chalk.green("\n✅ Dry run completed - no changes made"));
}

/**
 * Confirm migration with user
 */
async function confirmMigration(
  source: string,
  target: string
): Promise<boolean> {
  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: `Migrate content from ${source} to ${target}?`,
      default: false,
    },
  ]);

  return answer.confirmed;
}

/**
 * Confirm rollback with user
 */
async function confirmRollback(migrationId: string): Promise<boolean> {
  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: `Rollback migration ${migrationId}? This will restore previous content.`,
      default: false,
    },
  ]);

  return answer.confirmed;
}

/**
 * Display migration results
 */
function displayMigrationResults(result: any): void {
  if (result.statistics) {
    const stats = result.statistics;
    console.log(chalk.blue("Migration Statistics:"));
    console.log(`• Total content blocks: ${stats.totalBlocks}`);
    console.log(`• Successfully migrated: ${stats.successfulBlocks}`);
    console.log(`• Failed: ${stats.failedBlocks}`);
    console.log(`• Processing time: ${stats.processingTime}ms`);
    console.log(
      `• Size change: ${stats.sizeComparison.before} → ${stats.sizeComparison.after} bytes\n`
    );
  }

  if (result.warnings && result.warnings.length > 0) {
    console.log(chalk.yellow("⚠️ Warnings:"));
    result.warnings.forEach((warning: string) => {
      console.log(`• ${warning}`);
    });
    console.log();
  }
}

/**
 * Display migration errors
 */
function displayMigrationErrors(result: any): void {
  if (result.errors && result.errors.length > 0) {
    console.log(chalk.red("❌ Errors:"));
    result.errors.forEach((error: any) => {
      console.log(`• ${error.type}: ${error.message}`);
      if (error.location) {
        console.log(`  Location: ${error.location}`);
      }
    });
    console.log();
  }
}

/**
 * Analyze source content
 */
async function analyzeSourceContent(sourcePath: string): Promise<any> {
  // Load and analyze source content structure
  const indexPath = path.join(sourcePath, "index.ts");
  const dataPath = path.join(sourcePath, "data.ts");

  let componentCount = 0;
  let interactiveCount = 0;
  let contentBlockCount = 0;

  if (await fileExists(indexPath)) {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const componentMatches = indexContent.match(/{\s*id:\s*['"][^'"]+['"]/g);
    componentCount = componentMatches ? componentMatches.length : 0;
  }

  if (await fileExists(dataPath)) {
    const dataContent = await fs.readFile(dataPath, "utf-8");
    // Count interactive elements (simplified)
    interactiveCount = (dataContent.match(/initializers/g) || []).length;
    contentBlockCount = (dataContent.match(/takeaways|icons/g) || []).length;
  }

  return {
    componentCount,
    interactiveCount,
    contentBlockCount,
    estimatedLessons: Math.max(componentCount - 2, 1), // Exclude UI components
    sourceSize: await getDirectorySize(sourcePath),
  };
}

/**
 * Display analysis results
 */
function displayAnalysisResults(analysis: any): void {
  console.log(`📊 Components found: ${analysis.componentCount}`);
  console.log(`🎮 Interactive elements: ${analysis.interactiveCount}`);
  console.log(`📝 Content blocks: ${analysis.contentBlockCount}`);
  console.log(`📚 Estimated lessons: ${analysis.estimatedLessons}`);
  console.log(`💾 Source size: ${formatBytes(analysis.sourceSize)}`);
}

/**
 * Generate analysis report
 */
function generateAnalysisReport(analysis: any): string {
  return `# Content Analysis Report

Generated: ${new Date().toISOString()}

## Summary
- Components: ${analysis.componentCount}
- Interactive Elements: ${analysis.interactiveCount}
- Content Blocks: ${analysis.contentBlockCount}
- Estimated Lessons: ${analysis.estimatedLessons}
- Source Size: ${formatBytes(analysis.sourceSize)}

## Recommendations
- Verify all interactive components have proper data files
- Ensure educational content is properly structured
- Review component dependencies before migration
- Plan for adequate target storage space
`;
}

/**
 * Load source content
 */
async function loadSourceContent(sourcePath: string): Promise<any> {
  // Simplified implementation - load basic structure
  return {
    path: sourcePath,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Load migrated content
 */
async function loadMigratedContent(targetPath: string): Promise<ModuleContent> {
  const moduleFile = path.join(targetPath, "module.json");
  const moduleContent = await fs.readFile(moduleFile, "utf-8");
  return JSON.parse(moduleContent);
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get directory size
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let size = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        size += stats.size;
      }
    }
  } catch (error) {
    // Directory might not exist or be accessible
  }

  return size;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// =================================================================================
// PROGRAM EXECUTION
// =================================================================================

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
