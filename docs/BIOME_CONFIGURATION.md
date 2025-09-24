# Biome Configuration Guide

This document provides guidance on maintaining the correct Biome configuration for this project.

## Overview

Biome is our code formatter and linter. The configuration is stored in `biome.json` at the project root.

## Common Configuration Mistakes

### ❌ Incorrect Property Names

**Wrong:**
```json
{
  "files": {
    "include": ["src/**/*.ts"],   // ❌ Should be "includes"
    "ignore": ["dist/**"]         // ❌ Should use negated patterns
  }
}
```

**Correct:**
```json
{
  "files": {
    "includes": [                 // ✅ Correct (plural)
      "src/**/*.ts",
      "!dist/**"                  // ✅ Use negated patterns for ignoring
    ]
  }
}
```

### ❌ Invalid Top-Level Properties

**Wrong:**
```json
{
  "organizeImports": {            // ❌ Not a valid top-level property
    "enabled": true
  }
}
```

**Correct:**
```json
{
  "javascript": {
    // Note: organizeImports is not currently supported in Biome
    // Use other formatting options instead
  }
}
```

## Current Configuration Structure

Our `biome.json` follows this structure:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.4/schema.json",
  "files": {
    "includes": [/* file patterns with negated patterns for ignoring */],
    "ignoreUnknown": true
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "off"
      }
    }
  }
}
```

## Validation

### Automatic Validation

We have automated validation in place:

1. **Pre-commit validation**: Run `npm run precommit` to validate configuration before committing
2. **Manual validation**: Run `npm run validate:biome` to check configuration
3. **CI validation**: The configuration is validated in our CI pipeline

### Manual Validation

To manually validate the configuration:

```bash
# Validate Biome configuration
npm run validate:biome

# Test that Biome can parse the configuration
npm run lint

# Run formatting to ensure it works
npm run format:check
```

## Troubleshooting

### Configuration Errors

If you see errors like:
- `Found an unknown key 'include'` → Use `includes` instead (plural)
- `Found an unknown key 'ignore'` → Use negated patterns in `includes` instead
- `Found an unknown key 'organizeImports'` → Remove this property (not supported)

### Schema Validation

Always refer to the official Biome documentation:
- [Configuration Reference](https://biomejs.dev/reference/configuration/)
- [Schema Documentation](https://biomejs.dev/schemas/2.2.4/schema.json)

## Best Practices

1. **Always validate** configuration changes with `npm run validate:biome`
2. **Test locally** with `npm run lint` and `npm run format:check`
3. **Use the schema** by including the `$schema` property for IDE support
4. **Keep it simple** - only include necessary configuration options
5. **Document changes** when modifying the configuration

## Schema Updates

When updating Biome:

1. Check the [changelog](https://biomejs.dev/internals/changelog/) for breaking changes
2. Update the `$schema` URL to the new version
3. Run validation to ensure compatibility
4. Test all formatting and linting commands

## Getting Help

- [Biome Documentation](https://biomejs.dev/)
- [Configuration Reference](https://biomejs.dev/reference/configuration/)
- [GitHub Issues](https://github.com/biomejs/biome/issues)
