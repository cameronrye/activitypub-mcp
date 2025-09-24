#!/usr/bin/env node

/**
 * Validates the biome.json configuration file against the expected schema
 * This script helps prevent configuration errors that could break the build
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIOME_CONFIG_PATH = path.join(__dirname, "..", "biome.json");

// Expected schema structure based on Biome documentation
const EXPECTED_SCHEMA = {
  files: {
    required: false,
    properties: {
      includes: { type: "array", required: false },
      ignoreUnknown: { type: "boolean", required: false },
      maxSize: { type: "number", required: false },
      experimentalScannerIgnores: { type: "array", required: false },
    },
    invalidProperties: ["include", "ignore", "ignores"], // Common mistakes
  },
  formatter: {
    required: false,
    properties: {
      enabled: { type: "boolean", required: false },
      indentStyle: { type: "string", required: false },
      indentWidth: { type: "number", required: false },
      lineEnding: { type: "string", required: false },
      lineWidth: { type: "number", required: false },
    },
  },
  linter: {
    required: false,
    properties: {
      enabled: { type: "boolean", required: false },
      rules: { type: "object", required: false },
    },
  },
  javascript: {
    required: false,
    properties: {
      formatter: { type: "object", required: false },
      linter: { type: "object", required: false },
      parser: { type: "object", required: false },
    },
  },
  // Top-level properties that are NOT valid
  invalidTopLevel: ["organizeImports"],
};

function validateBiomeConfig() {
  console.log("🔍 Validating biome.json configuration...");

  // Check if file exists
  if (!fs.existsSync(BIOME_CONFIG_PATH)) {
    console.error("❌ biome.json file not found!");
    process.exit(1);
  }

  let config;
  try {
    const content = fs.readFileSync(BIOME_CONFIG_PATH, "utf8");
    config = JSON.parse(content);
  } catch (error) {
    console.error("❌ Failed to parse biome.json:", error.message);
    process.exit(1);
  }

  const errors = [];

  // Check for invalid top-level properties
  for (const prop of EXPECTED_SCHEMA.invalidTopLevel) {
    if (Object.hasOwn(config, prop)) {
      errors.push(
        `Invalid top-level property "${prop}" found. This should be moved to the appropriate section.`,
      );
    }
  }

  // Check files section
  if (config.files) {
    const filesErrors = validateSection(config.files, EXPECTED_SCHEMA.files, "files");
    errors.push(...filesErrors);
  }

  // Validate that we're using correct property names
  if (config.files?.include) {
    errors.push('Use "includes" instead of "include" in files section');
  }
  if (config.files?.ignore) {
    errors.push('Use negated patterns in "includes" instead of separate "ignore" section');
  }
  if (config.files?.ignores) {
    errors.push('Use negated patterns in "includes" instead of "ignores" section');
  }

  // Report results
  if (errors.length > 0) {
    console.error("❌ Biome configuration validation failed:");
    for (const error of errors) {
      console.error(`  • ${error}`);
    }
    console.error("\n📖 See https://biomejs.dev/reference/configuration/ for correct schema");
    process.exit(1);
  }

  console.log("✅ Biome configuration is valid!");
}

function validateSection(section, schema, sectionName) {
  const errors = [];

  if (schema.invalidProperties) {
    for (const prop of schema.invalidProperties) {
      if (Object.hasOwn(section, prop)) {
        errors.push(`Invalid property "${prop}" in ${sectionName} section`);
      }
    }
  }

  return errors;
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateBiomeConfig();
}

export { validateBiomeConfig };
