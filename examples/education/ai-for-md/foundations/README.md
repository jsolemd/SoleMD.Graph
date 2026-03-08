# AI for MD Foundations - Content Migration System

## Overview

This directory contains the comprehensive content migration system for transforming the existing AI for MD webapp into a native SoleMD education module. The system provides automated content transformation, validation, backup, and rollback capabilities while preserving all educational value and interactive functionality.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ with npm
- TypeScript support
- Access to source webapp directory (`temp-ai-for-mds/`)

### Installation

```bash
cd app/education/ai-for-md/foundations
npm install
```

### Basic Migration

```bash
# Perform dry run first
npm run migrate:dry-run

# Execute migration
npm run migrate

# Validate results
npm run validate
```

## 📁 Directory Structure

```
app/education/ai-for-md/foundations/
├── lib/                          # Core migration libraries
│   ├── content-types.ts          # TypeScript interfaces
│   ├── content-validation.ts     # Validation utilities
│   ├── content-transformation.ts # Transformation engine
│   └── migration-utilities.ts    # Migration orchestration
├── scripts/                      # CLI tools
│   └── migrate-content.ts        # Main migration CLI
├── docs/                         # Documentation
│   ├── content-structure-standards.md
│   └── migration-process-guide.md
├── analysis/                     # Migration analysis
│   ├── webapp-structure-analysis.md
│   └── migration-checklist.md
├── data/                         # Migrated content (generated)
├── migration-backups/            # Backup storage (generated)
└── package.json                  # Dependencies and scripts
```

## 🛠️ Migration Commands

### Core Commands

#### Migrate Content

```bash
# Basic migration
npm run migrate

# Dry run (no changes made)
npm run migrate:dry-run

# Force migration (skip confirmations)
npm run migrate:force

# Strict validation mode
npm run migrate:strict

# Custom source/target paths
npx tsx scripts/migrate-content.ts migrate -s ./custom-source -t ./custom-target
```

#### Validate Content

```bash
# Basic validation
npm run validate

# Generate validation report
npm run validate:report

# Custom validation
npx tsx scripts/migrate-content.ts validate --report ./custom-report.md
```

#### Rollback Migration

```bash
# List available backups
npm run rollback:list

# Interactive rollback
npm run rollback

# Rollback specific migration
npx tsx scripts/migrate-content.ts rollback -i migration_2024-01-15_abc123
```

#### Analyze Source Content

```bash
# Basic analysis
npm run analyze

# Generate analysis report
npm run analyze:report

# Custom analysis
npx tsx scripts/migrate-content.ts analyze --output ./custom-analysis.md
```

### Utility Commands

```bash
# Test migration pipeline
npm run test:migration

# Clean backup files
npm run clean:backups

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📊 Migration Process

### 1. Pre-Migration Analysis

```bash
npm run analyze
```

- Analyzes source webapp structure
- Counts components and interactive elements
- Estimates migration complexity
- Generates analysis report

### 2. Content Transformation

```bash
npm run migrate:dry-run
```

- Transforms webapp components to education modules
- Preserves all interactive functionality
- Maintains educational content structure
- Creates comprehensive lesson plans

### 3. Validation and Quality Assurance

```bash
npm run validate
```

- Validates content structure and integrity
- Checks educational objectives preservation
- Verifies interactive element functionality
- Ensures accessibility compliance

### 4. Backup and Rollback

- Automatic backup creation before migration
- Integrity checking with hash verification
- One-click rollback to previous state
- Backup cleanup and management

## 🎯 Content Preservation

### Interactive Components Migrated

- ✅ **Temperature Slider**: Creativity vs factuality control
- ✅ **Model Size Comparison**: Capability vs performance trade-offs
- ✅ **Tokenizer Demo**: Medical text processing visualization
- ✅ **Context Window**: Information limitation demonstration
- ✅ **Prompt Builder**: 6-step precision prompting methodology
- ✅ **S.A.F.E.R. Framework**: Clinical AI safety checklist
- ✅ **Grounding Demo**: Source attribution importance
- ✅ **Chain-of-Thought**: Reasoning transparency

### Educational Structure Preserved

- ✅ **Learning Objectives**: Clear goals for each section
- ✅ **Progressive Complexity**: Building from basic to advanced
- ✅ **Clinical Context**: Medical scenarios and examples
- ✅ **Assessment Elements**: Knowledge validation throughout
- ✅ **Takeaway Messages**: Key learning point summaries

## 🔧 Configuration

### Migration Configuration

Create `migration-config.json` for custom settings:

```json
{
  "sourceFormat": "json",
  "targetFormat": "react",
  "validation": {
    "validateSource": true,
    "validateTarget": true,
    "strict": false
  },
  "rules": [
    {
      "id": "interactive-components",
      "sourcePattern": "/foundations/",
      "targetTransform": "interactive-demo",
      "priority": 1
    }
  ]
}
```

### Module Metadata

Customize module information:

```typescript
const moduleMetadata = {
  id: "ai-for-md-foundations",
  title: "AI for MD Foundations",
  description: "Interactive guide for clinicians to develop AI skills",
  version: "1.0.0",
  author: "Dr. Jon Sole",
  difficulty: "intermediate",
  learningOutcomes: [
    "Understand core LLM concepts and mechanics",
    "Master precision prompting techniques",
    "Apply S.A.F.E.R. framework for clinical AI use",
  ],
};
```

## 🧪 Testing and Validation

### Automated Testing

```bash
# Run complete test suite
npm run test:migration

# Individual test components
npm run migrate:dry-run  # Test transformation
npm run validate         # Test validation
npm run rollback:list    # Test backup system
```

### Manual Validation Checklist

- [ ] All interactive elements functional
- [ ] Educational content preserved
- [ ] Learning objectives clear
- [ ] Navigation working properly
- [ ] Accessibility compliance verified
- [ ] Mobile responsiveness confirmed
- [ ] Performance benchmarks met

## 📈 Performance Optimization

### Large Content Sets

For large migrations, use streaming options:

```bash
npx tsx scripts/migrate-content.ts migrate --streaming --batch-size 10
```

### Memory Management

Monitor memory usage during migration:

```typescript
const memoryUsage = process.memoryUsage();
console.log("Memory usage:", {
  rss: Math.round(memoryUsage.rss / 1024 / 1024) + "MB",
  heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
});
```

## 🔒 Security and Validation

### Content Sanitization

- HTML content sanitized to prevent XSS
- Dangerous tags and attributes removed
- Input validation on all user content
- CSRF protection for form submissions

### Validation Levels

1. **Structure Validation**: Data structure and required fields
2. **Content Validation**: Educational quality and completeness
3. **Security Validation**: XSS prevention and content safety
4. **Accessibility Validation**: WCAG AA compliance
5. **Clinical Validation**: Medical accuracy and safety

## 🚨 Error Handling and Troubleshooting

### Common Issues

#### Source Content Not Found

```bash
Error: Source directory not found: ./temp-ai-for-mds
```

**Solution**: Verify source path and ensure webapp directory exists

#### Migration Validation Failures

```bash
Error: Migrated content failed validation
```

**Solution**: Review validation errors and adjust transformation rules

#### Interactive Component Issues

```bash
Warning: Interactive component data missing
```

**Solution**: Verify component data files exist and are properly formatted

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
npx tsx scripts/migrate-content.ts migrate --verbose
```

### Recovery Procedures

1. **Check backup availability**: `npm run rollback:list`
2. **Rollback if needed**: `npm run rollback`
3. **Review error logs**: Check `migration-backups/migration.log`
4. **Validate source content**: `npm run analyze`
5. **Retry with fixes**: Adjust configuration and retry

## 📚 Documentation

### Available Documentation

- **[Content Structure Standards](./docs/content-structure-standards.md)**: Comprehensive content organization guidelines
- **[Migration Process Guide](./docs/migration-process-guide.md)**: Detailed migration procedures
- **[Webapp Structure Analysis](./analysis/webapp-structure-analysis.md)**: Original webapp analysis
- **[Migration Checklist](./analysis/migration-checklist.md)**: Quality assurance checklist

### API Documentation

All TypeScript interfaces and functions include comprehensive JSDoc documentation. Generate API docs with:

```bash
npx typedoc lib/ --out docs/api/
```

## 🤝 Contributing

### Development Setup

```bash
git clone <repository>
cd app/education/ai-for-md/foundations
npm install
npm run type-check
npm run lint
```

### Adding New Migration Rules

1. Define transformation rule in configuration
2. Implement transformation logic in `content-transformation.ts`
3. Add validation rules in `content-validation.ts`
4. Update tests and documentation

### Code Standards

- TypeScript strict mode enabled
- Comprehensive error handling
- JSDoc documentation required
- ESLint configuration enforced
- Test coverage for critical paths

## 📄 License

This migration system is part of the SoleMD platform and follows the same licensing terms.

## 🆘 Support

For migration issues or questions:

1. Check the troubleshooting section above
2. Review the comprehensive documentation
3. Examine migration logs in `migration-backups/`
4. Contact the development team with specific error details

## 🎯 Success Metrics

### Migration Success Criteria

- ✅ 100% of educational content preserved
- ✅ All interactive elements functional
- ✅ WCAG AA accessibility compliance
- ✅ Performance meets SoleMD standards
- ✅ Seamless platform integration
- ✅ Comprehensive documentation provided

### Quality Assurance Metrics

- **Content Completeness**: All original content migrated
- **Functionality Preservation**: Interactive elements work correctly
- **Educational Effectiveness**: Learning objectives maintained
- **Technical Performance**: Load times and responsiveness optimized
- **User Experience**: Intuitive navigation and consistent design

This migration system ensures that the valuable educational content of the AI for MD webapp is successfully transformed into a native SoleMD education module while maintaining all interactive functionality and educational effectiveness.
