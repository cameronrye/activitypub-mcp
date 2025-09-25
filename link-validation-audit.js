#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';

class LinkValidator {
  constructor() {
    this.results = {
      navigation: [],
      internal: [],
      external: [],
      anchors: [],
      missing: [],
      errors: []
    };
    
    this.astroFiles = [];
    this.markdownFiles = [];
    this.allLinks = new Set();
    this.fileStructure = new Set();
    this.headingAnchors = new Map(); // file -> Set of anchor IDs
  }

  // Extract links from navigation structure in DocsLayout.astro
  validateNavigationLinks() {
    console.log('🔍 Validating navigation links from DocsLayout.astro...');
    
    const navigationLinks = [
      '/docs/',
      '/docs/setup/config-guide/',
      '/docs/setup/cross-platform/',
      '/docs/guides/usage-guide/',
      '/docs/guides/examples/',
      '/docs/guides/real-world-test-scenario/',
      '/docs/development/dependency-management/',
      '/docs/development/performance-monitoring/',
      '/docs/development/security-audit-checklist/',
      '/docs/specifications/activitypub-llm-specification-guide/',
      '/docs/specifications/activitystreams-vocabulary-llm-specification-guide/',
      '/docs/specifications/fedify-cli-llm-specification-guide/',
      '/docs/specifications/webfinger-llm-specification-guide/',
      '/docs/changelog/'
    ];

    for (const link of navigationLinks) {
      const result = this.validateInternalLink(link, 'src/layouts/DocsLayout.astro');
      this.results.navigation.push(result);
    }
  }

  // Build file structure map
  buildFileStructure() {
    console.log('📁 Building file structure map...');
    
    // Add Astro pages
    const astroFiles = [
      'src/pages/docs/api/prompts.astro',
      'src/pages/docs/api/resources.astro',
      'src/pages/docs/api/tools.astro',
      'src/pages/docs/changelog.astro',
      'src/pages/docs/development/architecture.astro',
      'src/pages/docs/development/dependency-management.astro',
      'src/pages/docs/development/performance-monitoring.astro',
      'src/pages/docs/development/security-audit-checklist.astro',
      'src/pages/docs/guides/basic-usage.astro',
      'src/pages/docs/guides/examples.astro',
      'src/pages/docs/guides/fediverse-exploration.astro',
      'src/pages/docs/guides/practical-examples.astro',
      'src/pages/docs/guides/real-world-test-scenario.astro',
      'src/pages/docs/guides/usage-guide.astro',
      'src/pages/docs/index.astro',
      'src/pages/docs/setup/claude-desktop-integration.astro',
      'src/pages/docs/setup/claude-desktop.astro',
      'src/pages/docs/setup/config-guide.astro',
      'src/pages/docs/setup/configuration-options.astro',
      'src/pages/docs/setup/cross-platform.astro',
      'src/pages/docs/setup/index.astro',
      'src/pages/docs/specifications/activitypub-llm-specification-guide.astro',
      'src/pages/docs/specifications/webfinger-llm-specification-guide.astro',
      'src/pages/docs/troubleshooting.astro'
    ];

    // Map Astro files to their URL paths
    for (const file of astroFiles) {
      if (fs.existsSync(file)) {
        let urlPath = file
          .replace('src/pages', '')
          .replace('.astro', '')
          .replace(/\/index$/, '');
        
        if (!urlPath.endsWith('/') && urlPath !== '') {
          urlPath += '/';
        }
        
        this.fileStructure.add(urlPath);
        this.astroFiles.push(file);
      }
    }

    // Add markdown files
    const markdownFiles = [
      'docs/BIOME_CONFIGURATION.md',
      'docs/CHANGELOG.md',
      'docs/development/DEPENDENCY_MANAGEMENT.md',
      'docs/development/PERFORMANCE_MONITORING.md',
      'docs/development/SECURITY_AUDIT_CHECKLIST.md',
      'docs/guides/EXAMPLES.md',
      'docs/guides/real-world-test-scenario.md',
      'docs/guides/USAGE_GUIDE.md',
      'docs/README.md',
      'docs/setup/CONFIG_GUIDE.md',
      'docs/setup/CROSS_PLATFORM.md',
      'docs/specifications/activitypub-llm-specification-guide.md',
      'docs/specifications/activitystreams-vocabulary-llm-specification-guide.md',
      'docs/specifications/fedify-cli-llm-specification-guide.md',
      'docs/specifications/webfinger-llm-specification-guide.md'
    ];

    for (const file of markdownFiles) {
      if (fs.existsSync(file)) {
        this.markdownFiles.push(file);
      }
    }

    console.log(`📊 Found ${this.astroFiles.length} Astro files and ${this.markdownFiles.length} Markdown files`);
  }

  // Extract links from a file
  extractLinksFromFile(filePath) {
    console.log(`🔗 Extracting links from ${filePath}...`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const links = [];
      
      // Extract markdown links [text](url)
      const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
      let match;
      while ((match = markdownLinkRegex.exec(content)) !== null) {
        links.push({
          text: match[1],
          url: match[2],
          type: 'markdown',
          line: this.getLineNumber(content, match.index)
        });
      }
      
      // Extract HTML links <a href="url">
      const htmlLinkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
      while ((match = htmlLinkRegex.exec(content)) !== null) {
        links.push({
          text: 'HTML link',
          url: match[1],
          type: 'html',
          line: this.getLineNumber(content, match.index)
        });
      }
      
      // Extract Astro href attributes
      const astroHrefRegex = /href=["']([^"']+)["']/gi;
      while ((match = astroHrefRegex.exec(content)) !== null) {
        links.push({
          text: 'Astro href',
          url: match[1],
          type: 'astro',
          line: this.getLineNumber(content, match.index)
        });
      }

      // Extract headings for anchor validation
      this.extractHeadings(filePath, content);
      
      return links;
    } catch (error) {
      this.results.errors.push({
        file: filePath,
        error: `Failed to read file: ${error.message}`
      });
      return [];
    }
  }

  // Extract headings from content for anchor validation
  extractHeadings(filePath, content) {
    const headings = new Set();
    
    // Markdown headings
    const markdownHeadingRegex = /^#{1,6}\s+(.+)$/gm;
    let match;
    while ((match = markdownHeadingRegex.exec(content)) !== null) {
      const id = this.generateAnchorId(match[1]);
      headings.add(id);
    }
    
    // HTML headings
    const htmlHeadingRegex = /<h[1-6][^>]*id=["']([^"']+)["'][^>]*>/gi;
    while ((match = htmlHeadingRegex.exec(content)) !== null) {
      headings.add(match[1]);
    }
    
    this.headingAnchors.set(filePath, headings);
  }

  // Generate anchor ID from heading text (similar to what Astro does)
  generateAnchorId(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Get line number for a character index
  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  // Validate internal link
  validateInternalLink(url, sourceFile) {
    const result = {
      url,
      sourceFile,
      valid: false,
      reason: '',
      targetExists: false,
      anchorExists: false
    };

    // Parse URL and anchor
    const [path, anchor] = url.split('#');
    
    // Check if the path exists in our file structure
    result.targetExists = this.fileStructure.has(path);
    
    if (!result.targetExists) {
      result.reason = `Target path '${path}' does not exist`;
      return result;
    }

    // If there's an anchor, validate it
    if (anchor) {
      const targetFile = this.findFileForPath(path);
      if (targetFile && this.headingAnchors.has(targetFile)) {
        result.anchorExists = this.headingAnchors.get(targetFile).has(anchor);
        if (!result.anchorExists) {
          result.reason = `Anchor '#${anchor}' not found in target file`;
          return result;
        }
      }
    }

    result.valid = true;
    result.reason = 'Valid internal link';
    return result;
  }

  // Find the actual file path for a URL path
  findFileForPath(urlPath) {
    // This is a simplified mapping - in a real implementation,
    // you'd need to map URL paths back to actual file paths
    for (const file of [...this.astroFiles, ...this.markdownFiles]) {
      // Simple heuristic mapping
      if (file.includes(urlPath.replace(/^\/docs\//, '').replace(/\/$/, ''))) {
        return file;
      }
    }
    return null;
  }

  // Validate external link
  async validateExternalLink(url, sourceFile) {
    return new Promise((resolve) => {
      const result = {
        url,
        sourceFile,
        valid: false,
        status: null,
        reason: ''
      };

      try {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const req = client.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
          result.status = res.statusCode;
          result.valid = res.statusCode >= 200 && res.statusCode < 400;
          result.reason = result.valid ? 'Accessible' : `HTTP ${res.statusCode}`;
          resolve(result);
        });

        req.on('error', (error) => {
          result.reason = error.message;
          resolve(result);
        });

        req.on('timeout', () => {
          result.reason = 'Request timeout';
          req.destroy();
          resolve(result);
        });

        req.end();
      } catch (error) {
        result.reason = `Invalid URL: ${error.message}`;
        resolve(result);
      }
    });
  }

  // Process all files and validate links
  async processAllFiles() {
    console.log('🚀 Starting comprehensive link validation...');
    
    this.buildFileStructure();
    this.validateNavigationLinks();

    // Process all files
    const allFiles = [...this.astroFiles, ...this.markdownFiles];
    
    for (const file of allFiles) {
      const links = this.extractLinksFromFile(file);
      
      for (const link of links) {
        this.allLinks.add(link.url);
        
        if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
          // External link
          const result = await this.validateExternalLink(link.url, file);
          this.results.external.push(result);
        } else if (link.url.startsWith('/')) {
          // Internal absolute link
          const result = this.validateInternalLink(link.url, file);
          this.results.internal.push(result);
        } else if (link.url.startsWith('#')) {
          // Anchor link within same page
          const headings = this.headingAnchors.get(file) || new Set();
          const anchorId = link.url.substring(1);
          const result = {
            url: link.url,
            sourceFile: file,
            valid: headings.has(anchorId),
            reason: headings.has(anchorId) ? 'Valid anchor' : 'Anchor not found'
          };
          this.results.anchors.push(result);
        }
      }
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n📋 COMPREHENSIVE LINK VALIDATION AUDIT REPORT');
    console.log('=' .repeat(60));
    
    // Summary
    const totalLinks = this.results.navigation.length + 
                      this.results.internal.length + 
                      this.results.external.length + 
                      this.results.anchors.length;
    
    const brokenLinks = [
      ...this.results.navigation.filter(r => !r.valid),
      ...this.results.internal.filter(r => !r.valid),
      ...this.results.external.filter(r => !r.valid),
      ...this.results.anchors.filter(r => !r.valid)
    ];

    console.log(`\n📊 SUMMARY:`);
    console.log(`Total links checked: ${totalLinks}`);
    console.log(`Broken links found: ${brokenLinks.length}`);
    console.log(`Success rate: ${((totalLinks - brokenLinks.length) / totalLinks * 100).toFixed(1)}%`);

    // Navigation Links
    console.log(`\n🧭 NAVIGATION LINKS (${this.results.navigation.length}):`);
    const brokenNav = this.results.navigation.filter(r => !r.valid);
    if (brokenNav.length === 0) {
      console.log('✅ All navigation links are valid');
    } else {
      brokenNav.forEach(result => {
        console.log(`❌ ${result.url} - ${result.reason}`);
      });
    }

    // Internal Links
    console.log(`\n🔗 INTERNAL LINKS (${this.results.internal.length}):`);
    const brokenInternal = this.results.internal.filter(r => !r.valid);
    if (brokenInternal.length === 0) {
      console.log('✅ All internal links are valid');
    } else {
      brokenInternal.forEach(result => {
        console.log(`❌ ${result.url} in ${result.sourceFile} - ${result.reason}`);
      });
    }

    // Anchor Links
    console.log(`\n⚓ ANCHOR LINKS (${this.results.anchors.length}):`);
    const brokenAnchors = this.results.anchors.filter(r => !r.valid);
    if (brokenAnchors.length === 0) {
      console.log('✅ All anchor links are valid');
    } else {
      brokenAnchors.forEach(result => {
        console.log(`❌ ${result.url} in ${result.sourceFile} - ${result.reason}`);
      });
    }

    // External Links
    console.log(`\n🌐 EXTERNAL LINKS (${this.results.external.length}):`);
    const brokenExternal = this.results.external.filter(r => !r.valid);
    if (brokenExternal.length === 0) {
      console.log('✅ All external links are accessible');
    } else {
      brokenExternal.forEach(result => {
        console.log(`❌ ${result.url} in ${result.sourceFile} - ${result.reason}`);
      });
    }

    // Errors
    if (this.results.errors.length > 0) {
      console.log(`\n⚠️  ERRORS (${this.results.errors.length}):`);
      this.results.errors.forEach(error => {
        console.log(`❌ ${error.file}: ${error.error}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Link validation audit complete!');
    
    return {
      totalLinks,
      brokenLinks: brokenLinks.length,
      successRate: ((totalLinks - brokenLinks.length) / totalLinks * 100).toFixed(1),
      details: this.results
    };
  }
}

// Run the validation
async function main() {
  const validator = new LinkValidator();
  await validator.processAllFiles();
  const report = validator.generateReport();
  
  // Exit with error code if broken links found
  if (report.brokenLinks > 0) {
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default LinkValidator;
