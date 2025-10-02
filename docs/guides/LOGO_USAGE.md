# ActivityPub MCP Logo Usage Guide

This directory contains the official logo files for the ActivityPub MCP project.

## Available Logo Files

### 1. `logo.svg` - Full Color Logo
- **Use for**: Main branding, documentation headers, website
- **Colors**: Blue gradient (#2563eb to #3b82f6) with purple accents (#7c3aed)
- **Size**: Scalable vector (100x100 viewBox)
- **Best for**: Light and dark backgrounds

### 2. `logo-monochrome.svg` - Monochrome Logo
- **Use for**: Single-color applications, print materials, watermarks
- **Colors**: Uses `currentColor` (inherits text color)
- **Size**: Scalable vector (100x100 viewBox)
- **Best for**: Situations requiring a single color or when color printing is not available

### 3. `favicon.svg` - Favicon Optimized
- **Use for**: Browser favicons, small icons (16x16px to 32x32px)
- **Colors**: Simplified color scheme for better visibility at small sizes
- **Size**: Scalable vector (100x100 viewBox) with thicker strokes
- **Best for**: Browser tabs, bookmarks, mobile home screen icons

## Logo Design

The logo represents:
- **Central Node**: The MCP server acting as a bridge
- **Satellite Nodes**: Federated ActivityPub instances across the Fediverse
- **Connection Lines**: The network connections facilitated by the protocol

The design symbolizes the core concept of the project: connecting LLMs to the decentralized Fediverse through the Model Context Protocol.

## Usage Guidelines

### Recommended Sizes

- **Website Header**: 32x32px to 48x48px
- **Hero Section**: 100x100px to 150x150px
- **Documentation**: 64x64px to 100x100px
- **Favicon**: 16x16px, 32x32px, 48x48px
- **Social Media**: 400x400px to 1200x1200px

### Color Specifications

**Primary Colors:**
- Blue: `#2563eb` (Primary Dark), `#3b82f6` (Primary Light)
- Purple: `#7c3aed` (Secondary), `#8b5cf6` (Secondary Light)

**Usage:**
- Always maintain the gradient for the central node in the full-color version
- Use the monochrome version when color is not available or appropriate
- Ensure sufficient contrast with the background

### Don'ts

- ❌ Don't distort or stretch the logo
- ❌ Don't change the colors in the full-color version
- ❌ Don't add effects (shadows, outlines) unless necessary for visibility
- ❌ Don't place the logo on busy backgrounds without proper spacing
- ❌ Don't use low-resolution raster versions when SVG is available

### Clear Space

Maintain a minimum clear space around the logo equal to the height of one satellite node (approximately 10% of the logo height).

## File Formats

All logos are provided in SVG format for maximum scalability and quality. SVG files can be:
- Embedded directly in HTML
- Used as `<img>` sources
- Converted to PNG or other raster formats at any resolution without quality loss
- Styled with CSS (especially the monochrome version)

## Converting to Other Formats

If you need PNG or ICO formats for specific use cases:

### Using ImageMagick (Command Line)
```bash
# Convert to PNG at different sizes
convert -background none logo.svg -resize 512x512 logo-512.png
convert -background none logo.svg -resize 256x256 logo-256.png
convert -background none logo.svg -resize 128x128 logo-128.png
convert -background none logo.svg -resize 64x64 logo-64.png
convert -background none logo.svg -resize 32x32 logo-32.png
convert -background none logo.svg -resize 16x16 logo-16.png

# Convert to ICO (multi-resolution favicon)
convert logo-16.png logo-32.png logo-48.png favicon.ico
```

### Using Online Tools
- [CloudConvert](https://cloudconvert.com/svg-to-png) - SVG to PNG
- [Favicon.io](https://favicon.io/favicon-converter/) - Generate favicon package
- [RealFaviconGenerator](https://realfavicongenerator.net/) - Comprehensive favicon generator

## Integration Examples

### HTML
```html
<!-- In header -->
<img src="/logo.svg" alt="ActivityPub MCP" width="32" height="32">

<!-- As favicon -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

### Markdown
```markdown
![ActivityPub MCP Logo](public/logo.svg)
```

### CSS
```css
.logo {
  background-image: url('/logo.svg');
  width: 48px;
  height: 48px;
  background-size: contain;
}
```

## License

The ActivityPub MCP logo is part of the ActivityPub MCP project and is licensed under the MIT License, consistent with the project's license.

## Questions?

For questions about logo usage or to request additional formats, please open an issue on the [GitHub repository](https://github.com/cameronrye/activitypub-mcp).

