# Extension Icons

This folder should contain the extension icons at the following sizes:

- `icon16.png` - 16x16 pixels (favicon, context menus)
- `icon32.png` - 32x32 pixels (Windows taskbar)
- `icon48.png` - 48x48 pixels (Extensions management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## Quick Icon Generation

### Option 1: Use an Online Tool

1. Go to [Favicon Generator](https://realfavicongenerator.net/)
2. Upload a 512x512 PNG of your icon
3. Download the generated sizes

### Option 2: Use ImageMagick

```bash
# From a 128x128 source image
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 32x32 icon32.png
convert icon128.png -resize 16x16 icon16.png
```

### Option 3: Create Simple Icons with Python

```python
from PIL import Image, ImageDraw, ImageFont

def create_icon(size, output_path):
    img = Image.new('RGBA', (size, size), (74, 144, 226, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw a simple book emoji representation
    padding = size // 4
    draw.rectangle(
        [padding, padding, size - padding, size - padding],
        fill=(255, 255, 255, 255),
        outline=(50, 100, 180, 255),
        width=max(1, size // 16)
    )
    
    # Add lines for book pages
    line_padding = size // 3
    for i in range(3):
        y = line_padding + (i * size // 8)
        draw.line(
            [line_padding, y, size - line_padding, y],
            fill=(74, 144, 226, 255),
            width=max(1, size // 32)
        )
    
    img.save(output_path)

# Generate all sizes
for size in [16, 32, 48, 128]:
    create_icon(size, f'icon{size}.png')
```

## Icon Design Guidelines

- **Simple:** Recognizable at 16x16 pixels
- **Consistent:** Same design at all sizes, not just scaled
- **Branded:** Use SyllaBud's blue (#4A90E2) as primary color
- **Clear:** No text at small sizes
- **Unique:** Distinguishable from other extensions

## Suggested Icon Concept

A stylized open book with a graduation cap, or a book with a checkmark:

📚 or 📋 or 🎓

## Temporary Placeholder

Until you create proper icons, you can use solid color squares:
- The extension will still load
- Just won't look polished

## Icon Requirements

- Format: PNG with transparency
- Color depth: 32-bit RGBA
- No rounded corners (Chrome adds them)
- Design should work on both light and dark browser themes
