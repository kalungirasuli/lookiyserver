#!/bin/bash

# Script to delete all compiled JavaScript files from src folder
# Keeps only TypeScript files (.ts)

echo "🧹 Cleaning up compiled JavaScript files from src folder..."

# Navigate to the src directory
cd "$(dirname "$0")/src" || {
    echo "❌ Error: Could not navigate to src directory"
    exit 1
}

echo "📂 Current directory: $(pwd)"

# Count files before deletion
js_count=$(find . -name "*.js" -type f | wc -l | tr -d ' ')
echo "📊 Found $js_count JavaScript files to delete"

if [ "$js_count" -eq 0 ]; then
    echo "✅ No JavaScript files found. Nothing to clean up!"
    exit 0
fi

# List files that will be deleted (for confirmation)
echo "📋 Files to be deleted:"
find . -name "*.js" -type f

# Ask for confirmation
read -p "⚠️  Are you sure you want to delete these files? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Delete all .js files recursively
    find . -name "*.js" -type f -delete
    
    # Verify deletion
    remaining_js=$(find . -name "*.js" -type f | wc -l | tr -d ' ')
    
    if [ "$remaining_js" -eq 0 ]; then
        echo "✅ Successfully deleted $js_count JavaScript files!"
        echo "🎉 Only TypeScript files (.ts) remain in the src folder"
    else
        echo "⚠️  Warning: $remaining_js JavaScript files still remain"
    fi
    
    # Show remaining TypeScript files count
    ts_count=$(find . -name "*.ts" -type f | wc -l | tr -d ' ')
    echo "📈 TypeScript files remaining: $ts_count"
else
    echo "❌ Operation cancelled. No files were deleted."
fi

echo "🏁 Cleanup script completed."