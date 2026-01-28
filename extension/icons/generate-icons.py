#!/usr/bin/env python3
"""Generate placeholder icons for SyllaBud extension"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """Create a simple book-style icon"""
    # Background color (SyllaBud blue)
    img = Image.new('RGBA', (size, size), (74, 144, 226, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw a white book/page
    padding = size // 5
    draw.rectangle(
        [padding, padding, size - padding, size - padding],
        fill=(255, 255, 255, 255),
        outline=(50, 100, 180, 255),
        width=max(1, size // 20)
    )
    
    # Add lines representing text on the page
    line_padding = size // 3
    line_width = max(1, size // 32)
    num_lines = 3 if size >= 32 else 2
    
    for i in range(num_lines):
        y = padding + size // 4 + (i * size // 10)
        draw.line(
            [line_padding, y, size - line_padding, y],
            fill=(74, 144, 226, 255),
            width=line_width
        )
    
    img.save(output_path, 'PNG')
    print(f"Created {output_path}")

# Generate all required sizes
script_dir = os.path.dirname(os.path.abspath(__file__))
for size in [16, 32, 48, 128]:
    output_path = os.path.join(script_dir, f'icon{size}.png')
    create_icon(size, output_path)

print("\n✅ All icons generated successfully!")
