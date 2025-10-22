# Static Resources Setup Instructions

## Required Libraries

The DocGen application requires two JavaScript libraries to be uploaded as Salesforce Static Resources. Please follow these steps:

## 1. Handlebars.js (v4.7.8 or later)

### Download
Download the minified version from:
```
https://cdn.jsdelivr.net/npm/handlebars@4.7.8/dist/handlebars.min.js
```

Or via npm:
```bash
npm install handlebars@4.7.8
# Then copy node_modules/handlebars/dist/handlebars.min.js
```

### Upload to Salesforce
1. Navigate to Setup → Static Resources → New
2. Name: `handlebars`
3. File: Upload `handlebars.min.js`
4. Cache Control: Public
5. Click Save

## 2. Mammoth.js (v1.6.0 or later)

### Download
Download the browser version from:
```
https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js
```

Or via npm:
```bash
npm install mammoth@1.6.0
# Then copy node_modules/mammoth/mammoth.browser.min.js
```

### Upload to Salesforce
1. Navigate to Setup → Static Resources → New
2. Name: `mammoth`
3. File: Upload `mammoth.browser.min.js`
4. Cache Control: Public
5. Click Save

## Quick Setup Script

If you have npm installed, run this script from the project root:

```bash
#!/bin/bash
# Download required libraries
npm install handlebars@4.7.8 mammoth@1.6.0 --no-save

# Copy to static resources folder
cp node_modules/handlebars/dist/handlebars.min.js force-app/main/default/staticresources/handlebars.resource
cp node_modules/mammoth/mammoth.browser.min.js force-app/main/default/staticresources/mammoth.resource

# Clean up
npm uninstall handlebars mammoth

echo "Static resources ready for deployment!"
```

## Verification

After deployment, verify the static resources are available:
1. Setup → Static Resources
2. Confirm both `handlebars` and `mammoth` are listed
3. Click each to verify the file size is > 0

## Troubleshooting

**Problem:** Components show "Handlebars library not loaded"
**Solution:** Verify the static resource is named exactly `handlebars` (lowercase)

**Problem:** DOCX conversion fails
**Solution:** Verify the static resource is named exactly `mammoth` (lowercase)

**Problem:** 404 error loading resources
**Solution:** Ensure Cache Control is set to "Public" on both resources

