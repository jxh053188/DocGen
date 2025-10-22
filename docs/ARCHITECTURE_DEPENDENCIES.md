# Architecture & Dependencies - Complete Reference

## 🏗️ Three-Tier Architecture

The DocGen application uses a **three-tier architecture** with dependencies split between browser, server, and compute layers:

```
┌─────────────────────────────────────────┐
│  BROWSER (Lightning Web Components)     │
│  Dependencies: Static Resources          │
│  - handlebars.js (86KB) ✅               │
│  - mammoth.js (628KB) ✅                 │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│  SALESFORCE SERVER (Apex)                │
│  Dependencies: None (native platform)    │
│  - Uses Salesforce APIs only             │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│  COMPUTE LAYER (Salesforce Function)     │
│  Dependencies: npm packages              │
│  - playwright-chromium (300MB) ✅        │
└─────────────────────────────────────────┘
```

---

## ✅ Browser-Side Dependencies (Static Resources)

### What Runs in the Browser?
- DOCX to HTML conversion
- Handlebars template compilation
- Field discovery and parsing
- Filtering, sorting, math operations
- PDF preview display

### Required Libraries: 2

#### 1. **handlebars.resource** ✅ INCLUDED
- **Version:** 4.7.8
- **Size:** 86KB (minified)
- **Purpose:** Compile Handlebars templates with data
- **Used by:**
  - `templateEditor` - Preview compilation
  - `generateDocumentAction` - PDF generation compilation
  - `handlebarsHelpers` - Helper registration

**Import:**
```javascript
import { loadScript } from 'lightning/platformResourceLoader';
import HANDLEBARS from '@salesforce/resourceUrl/handlebars';

await loadScript(this, HANDLEBARS);
const Handlebars = window.Handlebars; // Available globally
```

#### 2. **mammoth.resource** ✅ INCLUDED
- **Version:** 1.6.0
- **Size:** 628KB (browser build)
- **Purpose:** Convert DOCX files to HTML in browser
- **Used by:**
  - `templateManager` - DOCX upload and conversion

**Import:**
```javascript
import { loadScript } from 'lightning/platformResourceLoader';
import MAMMOTH from '@salesforce/resourceUrl/mammoth';

await loadScript(this, MAMMOTH);
const mammoth = window.mammoth; // Available globally
```

### ✅ All Browser Dependencies Verified

**LWC Components Analysis:**

| Component | External Deps | Status |
|-----------|--------------|--------|
| discoveryUtils | None (pure JS) | ✅ No deps needed |
| handlebarsHelpers | Uses Handlebars | ✅ Included |
| templateManager | Uses Mammoth | ✅ Included |
| templateEditor | Uses Handlebars | ✅ Included |
| generateDocumentAction | Uses Handlebars | ✅ Included |

**All browser-side dependencies are included!** ✅

---

## ✅ Server-Side Dependencies (Apex)

### What Runs in Apex?
- Query validation
- SOQL generation
- Data fetching (WITH SECURITY_ENFORCED)
- PDF saving
- Document logging
- Function invocation

### Required Libraries: 0

**Apex uses only native Salesforce APIs:**
- Schema describe API
- Database query API
- DML operations
- HTTP callouts (native)
- JSON serialization (native)

**No external dependencies needed!** ✅

---

## ✅ Compute Layer Dependencies (Salesforce Function)

### What Runs in the Function?
- HTML to PDF conversion
- Chromium browser control
- PDF binary generation

### Required Libraries: 1

#### **playwright-chromium** ✅ INCLUDED
- **Version:** 1.40.0
- **Size:** ~300MB (includes Chromium binaries)
- **Purpose:** Headless browser for PDF rendering
- **Why NOT in Static Resources:**
  - Node.js only (not browser-compatible)
  - Includes native binaries
  - Requires file system access
  - Too large for static resources (10MB limit)

**Location:** `functions/pdfrenderer/package.json`

```json
{
  "dependencies": {
    "playwright-chromium": "^1.40.0"
  }
}
```

**Usage in Function:**
```javascript
import { chromium } from 'playwright-chromium';

const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setContent(html);
const pdfBuffer = await page.pdf({ format: 'A4' });
```

---

## 🚫 Why Playwright is NOT a Static Resource

### Common Misconception
"We need Playwright in static resources for PDF generation in LWC"

### Reality
Playwright **cannot** run in a browser because:

1. **Node.js Only**
   - Uses Node.js APIs (fs, child_process, etc.)
   - Browser doesn't have these APIs

2. **Native Binaries**
   - Ships with Chromium browser (~200MB)
   - Includes platform-specific executables
   - Static resources only support JavaScript files

3. **File System Access**
   - Needs to download and install browser
   - Requires write access to disk
   - Browser environment is sandboxed

4. **Size Constraints**
   - Playwright + Chromium = ~300MB
   - Static resources limited to 10MB per file
   - Would exceed limits by 30x

### How PDF Generation Works

```
┌─────────────────────────────────────────────┐
│ 1. LWC compiles HTML (browser)              │
│    - Uses Handlebars from static resource   │
│    - Pure JavaScript, runs client-side      │
└──────────────┬──────────────────────────────┘
               │ HTML string
               ↓
┌─────────────────────────────────────────────┐
│ 2. Apex invokes Function (server)           │
│    - PdfRenderService.renderPdf()           │
│    - HTTP callout to Function endpoint      │
└──────────────┬──────────────────────────────┘
               │ HTTP request with HTML
               ↓
┌─────────────────────────────────────────────┐
│ 3. Function renders PDF (compute)           │
│    - Playwright launches Chromium           │
│    - Loads HTML in headless browser         │
│    - Generates PDF binary                   │
└──────────────┬──────────────────────────────┘
               │ Base64 PDF
               ↓
┌─────────────────────────────────────────────┐
│ 4. LWC displays PDF (browser)               │
│    - Receives base64 from Apex              │
│    - Creates data URL                       │
│    - Displays in iframe                     │
└─────────────────────────────────────────────┘
```

---

## 📋 Complete Dependency Checklist

### ✅ Static Resources (Browser)
- [x] handlebars.resource (86KB)
- [x] handlebars.resource-meta.xml
- [x] mammoth.resource (628KB)
- [x] mammoth.resource-meta.xml

### ✅ Function Dependencies (Compute)
- [x] playwright-chromium in package.json
- [x] Functions project structure
- [x] index.js with PDF rendering logic

### ✅ Platform Dependencies (Native)
- [x] Lightning Platform (LWC framework)
- [x] Apex (language runtime)
- [x] SOQL (query engine)
- [x] platformResourceLoader (static resource API)

---

## 🔍 Verification Commands

### Check Static Resources
```bash
ls -lh force-app/main/default/staticresources/*.resource
# Should show:
# handlebars.resource (86K)
# mammoth.resource (628K)
```

### Check Function Dependencies
```bash
cat functions/pdfrenderer/package.json | grep -A 3 '"dependencies"'
# Should show:
# "dependencies": {
#   "playwright-chromium": "^1.40.0"
# }
```

### Verify LWC Imports
```bash
grep -r "import.*@salesforce/resourceUrl" force-app/main/default/lwc/
# Should show:
# templateManager: MAMMOTH from '@salesforce/resourceUrl/mammoth'
# templateEditor: HANDLEBARS from '@salesforce/resourceUrl/handlebars'
# generateDocumentAction: HANDLEBARS from '@salesforce/resourceUrl/handlebars'
```

---

## 🚀 Deployment Verification

### After Deploying Static Resources
1. Navigate to: **Setup → Static Resources**
2. Verify both resources present:
   - `handlebars` (86KB, JavaScript)
   - `mammoth` (628KB, JavaScript)
3. Click each to verify file content loads

### After Deploying Function
1. Deploy to compute environment
2. Test Function responds:
   ```bash
   curl -X POST https://your-function-url \
     -H "Content-Type: application/json" \
     -d '{"data":{"html":"<h1>Test</h1>"}}'
   ```
3. Should return: `{"success":true,"pdfBase64":"..."}`

### After Configuration
1. Test in Developer Console:
   ```java
   String result = PdfRenderController.testPdfRendering();
   System.debug(result);
   // Should output: "PDF generated successfully. Size: XXXX bytes"
   ```

---

## ⚠️ Common Misconceptions

### ❌ "Add Playwright to static resources"
**Wrong:** Playwright is Node.js only, cannot run in browser

**Right:** Playwright runs in Salesforce Function (server-side)

### ❌ "We need pdf.js or jsPDF"
**Wrong:** Client-side PDF libraries produce low-quality PDFs

**Right:** Chromium (via Playwright) produces print-quality PDFs with full CSS support

### ❌ "Why not use Visualforce renderAs?"
**Wrong:** Spec requires no Visualforce, and it has limited CSS support

**Right:** Modern approach with Function + Chromium + full CSS3

---

## ✅ Final Status

**All dependencies are correctly configured!**

- ✅ Browser dependencies: 2/2 included
- ✅ Server dependencies: 0 needed (native platform)
- ✅ Compute dependencies: 1/1 included
- ✅ All LWC components have required libraries
- ✅ Function has required npm packages
- ✅ Architecture is correct and complete

**No missing dependencies. Ready for deployment!** 🚀

---

**Last Updated:** 2025-10-21  
**Status:** ✅ Complete  
**Total Dependencies:** 3 (2 browser, 0 server, 1 compute)

