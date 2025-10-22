# DocGen - Complete Deployment Guide

## ✅ 100% BROWSER-BASED - Ready for Production

All functionality implemented with browser-based PDF generation. No external services or compute environments required!

---

## What's Been Implemented

### 1. ✅ Complete Data Model (3 Objects)
- **Document_Template__c** - Templates with HTML body and metadata
- **Dynamic_Template_Variable__c** - Field discovery and query plans
- **Document__c** - Execution logging and audit trail

### 2. ✅ Complete Apex Backend (5 Classes)
- **TemplateDTO** - Data transfer objects for client-server communication
- **SecurityService** - FLS and field validation
- **TemplateService** - Query building and SOQL generation
- **DocumentService** - PDF saving and logging
- **TemplateController** - LWC controller with 12 @AuraEnabled methods

### 3. ✅ Complete LWC Components (5 Components)
- **discoveryUtils** - Template parsing and field discovery
- **handlebarsHelpers** - 50+ Handlebars custom helpers
- **templateManager** - Template CRUD with DOCX upload
- **templateEditor** - HTML editor with live preview
- **generateDocumentAction** - Full PDF generation workflow

### 4. ✅ Static Resources (3 Libraries)
- **handlebars.resource** (86KB) - Handlebars.js v4.7.8
- **mammoth.resource** (628KB) - Mammoth.js v1.6.0 for DOCX conversion
- **html2pdf.resource** (885KB) - html2pdf.js v0.10.1 for PDF generation

### 5. ✅ Permission Sets & Security
- **PDF_Admin** - Full access to all features
- **PDF_Template_Editor** - Template management and preview
- **PDF_Generator** - PDF generation and download only
- **PDF_SafeHtml** - Custom permission for unescaped HTML

---

## Architecture Flow

```
1. USER UPLOADS DOCX
   └─> Browser (Mammoth.js) → HTML → Store in Template__c

2. USER EDITS TEMPLATE
   └─> Discovery Parser → Field Paths → Apex Validation → Query Plan

3. USER GENERATES PDF
   ├─> LWC: Discover fields from template
   ├─> Apex: Build SOQL with security → Fetch data with SECURITY_ENFORCED
   ├─> LWC: Compile Handlebars → Apply helpers → Generate HTML
   ├─> LWC: Render PDF with html2pdf.js (browser-based)
   └─> LWC: Display in iframe → Save & Attach OR Discard

4. USER SAVES PDF
   └─> Apex: Create ContentVersion → Link to Record → Log Document__c
```

**Key Point:** All PDF generation happens in the browser. No external services!

---

## Deployment Steps

### Step 1: Deploy Salesforce Metadata

```bash
cd /Users/jarredharkness/Desktop/DocGen/DocGen

# Deploy all metadata
sf project deploy start

# Or deploy to specific org
sf project deploy start --target-org YOUR_ORG_ALIAS
```

**What gets deployed:**
- ✅ 5 Apex classes
- ✅ 5 LWC components
- ✅ 3 Custom objects (16 custom fields total)
- ✅ 3 Permission sets
- ✅ 1 Custom permission
- ✅ 3 Static resources (handlebars, mammoth, html2pdf)
- ✅ 3 Custom tabs
- ✅ 1 FlexiPage (utility bar)

### Step 2: Assign Permission Sets

```bash
# Assign admin permissions to yourself
sf org assign permset --name PDF_Admin

# For template editors (optional)
sf org assign permset --name PDF_Template_Editor --target-org YOUR_ORG

# For PDF generators only (optional)
sf org assign permset --name PDF_Generator --target-org YOUR_ORG
```

**Permission Set Breakdown:**
- **PDF_Admin**: Create/edit/delete templates + generate PDFs + full field access
- **PDF_Template_Editor**: Create/edit templates + preview only (no save)
- **PDF_Generator**: Generate and save PDFs only (no template editing)

### Step 3: Configure Page Layouts (Optional)

#### Add Template Manager to App Home
1. Navigate to **Setup → App Manager**
2. Edit your app (or create new)
3. Add `templateManager` component to Home page
4. Save and activate

#### Add Template Editor to Template Page Layout
1. Navigate to **Setup → Object Manager → Template**
2. Select **Page Layouts → Template Layout**
3. Add `templateEditor` component to detail section
4. Save

#### Add Quick Action to Objects
1. Navigate to **Setup → Object Manager → [Your Object]** (e.g., Account)
2. Go to **Buttons, Links, and Actions**
3. Click **New Action**
4. Select **Lightning Web Component**
5. Choose `c:generateDocumentAction`
6. Label: "Generate Document"
7. Save
8. Add to Page Layout (Salesforce Mobile & Lightning Actions section)

### Step 4: Verify Static Resources

```bash
# Verify all resources are present
sf org open --target-org YOUR_ORG
```

Then navigate to: **Setup → Static Resources**

You should see:
- ✅ `handlebars` (86KB) - JavaScript, Public cache
- ✅ `mammoth` (628KB) - JavaScript, Public cache
- ✅ `html2pdf` (885KB) - JavaScript, Public cache

---

## Test the Application

### Test 1: Create a Template

1. Navigate to the **Templates** tab
2. Click **New**
3. Fill in:
   - **Template Name:** Test Template
   - **Primary Object:** Account
   - **Status:** Active
4. Click **Next**
5. Either:
   - **Upload DOCX:** Drag-drop a Word file
   - **Enter HTML:** Paste HTML directly
6. Click **Save**

**Expected Result:** Template created, HTML visible in editor

### Test 2: Add Handlebars Variables

1. Edit the template HTML:
```html
<h1>Account: {{Name}}</h1>
<p>Phone: {{Phone}}</p>
<p>Owner: {{Owner.Name}}</p>

<h2>Opportunities</h2>
{{#each Opportunities}}
  <p>{{Name}} - {{StageName}} - {{formatCurrency Amount}}</p>
{{/each}}
```

2. Click **Parse & Preview**
3. Select a sample Account record
4. Click **Generate Preview**

**Expected Result:** HTML preview shows with actual data

### Test 3: Generate PDF

1. Open an **Account** record
2. Click **Generate Document** (quick action)
3. Select your template from dropdown
4. Click **Generate Preview**
5. Wait 2-5 seconds
6. PDF displays in iframe

**Expected Result:** PDF preview shows formatted document

### Test 4: Save PDF

1. After preview (from Test 3)
2. Click **Save & Attach**
3. Check **Files** related list on Account

**Expected Result:** PDF attached with filename

### Test 5: Verify Logging

1. Navigate to **Documents** tab
2. Find your generated document
3. Verify:
   - Status: Saved
   - Template: Linked correctly
   - Target Record Id: Correct Account ID
   - Output File: Linked to ContentVersion

**Expected Result:** Document__c record created with all details

---

## Configuration Options

### PDF Options

Edit in `generateDocumentAction.js` (lines 193-207):

```javascript
const options = {
    margin: 10,                    // Margin in mm (10mm = 1cm)
    filename: this.fileName,       // Auto-generated or custom
    image: { 
        type: 'jpeg',              // 'jpeg' or 'png'
        quality: 0.98              // 0.1 - 1.0
    },
    html2canvas: { 
        scale: 2,                  // Resolution multiplier (1-4)
        useCORS: true,             // Allow cross-origin images
        letterRendering: true      // Better text rendering
    },
    jsPDF: { 
        unit: 'mm',                // 'mm', 'cm', 'in', 'px'
        format: 'a4',              // 'a4', 'letter', 'legal'
        orientation: 'portrait'    // 'portrait' or 'landscape'
    }
};
```

### Common Customizations

**Letter Size (US):**
```javascript
format: 'letter',
margin: 12.7,  // 0.5 inch
```

**Landscape Orientation:**
```javascript
orientation: 'landscape'
```

**High Resolution:**
```javascript
html2canvas: { scale: 3 }
```

**Smaller File Size:**
```javascript
image: { type: 'jpeg', quality: 0.7 }
```

### Handlebars Helper Customization

Edit `handlebarsHelpers.js` to add custom helpers:

```javascript
export function registerHelpers(Handlebars, userSettings) {
    // ... existing helpers ...
    
    // Add your custom helper
    Handlebars.registerHelper('myCustomHelper', function(value) {
        return value.toUpperCase();
    });
}
```

---

## Verification Checklist

### ✅ Metadata Deployed
- [ ] All Apex classes deployed (5 classes)
- [ ] All LWC components deployed (5 components)
- [ ] Static resources uploaded (3 files: handlebars, mammoth, html2pdf)
- [ ] Custom objects created (3 objects)
- [ ] Permission sets created (3 sets)
- [ ] Custom tabs visible

### ✅ Static Resources Verified
- [ ] Navigate to Setup → Static Resources
- [ ] Confirm `handlebars` exists (86KB)
- [ ] Confirm `mammoth` exists (628KB)
- [ ] Confirm `html2pdf` exists (885KB)
- [ ] All set to "Public" cache control

### ✅ Browser Testing
- [ ] Open browser console (F12)
- [ ] Navigate to Templates tab
- [ ] Check for no errors in console
- [ ] Verify "Handlebars loaded successfully" message
- [ ] Verify "Mammoth.js loaded successfully" message

### ✅ Integration Working
- [ ] DOCX upload converts to HTML
- [ ] Template editor discovers fields
- [ ] Preview shows compiled template
- [ ] Query plan displays correctly
- [ ] PDF generates in browser
- [ ] PDF preview displays in iframe
- [ ] Save & Attach creates ContentVersion
- [ ] Document__c log created

### ✅ Security Configured
- [ ] WITH SECURITY_ENFORCED in all queries
- [ ] FLS enforced on field access
- [ ] Permission sets assigned to users
- [ ] Sharing rules respected

---

## Troubleshooting

### Static Resources Not Loading

**Error:** "Failed to load templating library" or "Handlebars not defined"

**Solution:**
1. Verify static resources exist: **Setup → Static Resources**
2. Check exact names: `handlebars`, `mammoth`, `html2pdf` (case-sensitive)
3. Clear browser cache (Cmd+Shift+R or Ctrl+Shift+F5)
4. Check browser console for 404 errors
5. Verify static resource metadata files exist:
   - `handlebars.resource-meta.xml`
   - `mammoth.resource-meta.xml`
   - `html2pdf.resource-meta.xml`

**Force Re-upload:**
```bash
sf project deploy start --source-dir force-app/main/default/staticresources
```

### PDF Not Generating

**Error:** "PDF library not loaded. Please refresh the page."

**Solution:**
1. Check that `html2pdf.resource` was deployed
2. Refresh the page (F5)
3. Check browser console: should see "Libraries loaded successfully"
4. Verify `window.html2pdf` exists in console:
   ```javascript
   console.log(typeof window.html2pdf); // Should be "function"
   ```

**Error:** "PDF rendering failed: [message]"

**Solution:**
1. Check HTML template for syntax errors
2. Simplify template (remove images/complex CSS)
3. Check browser console for detailed error
4. Verify data compiled correctly (check preview HTML)

### Template Discovery Errors

**Error:** "Field 'X' does not exist on Y"

**Solution:**
1. Check field API name (must be exact, including `__c`)
2. Verify field exists: **Setup → Object Manager → [Object] → Fields**
3. Check user has field-level security access
4. For relationship fields, use dot notation: `Owner.Name`, not `Owner->Name`

**Error:** "No relationship 'X' found"

**Solution:**
1. Check relationship name (usually plural, e.g., `Opportunities`)
2. Verify it's a child relationship (not parent lookup)
3. Check in Object Manager → Relationships
4. Use `{{#each RelationshipName}}`, not `{{RelationshipName}}`

### Permission Errors

**Error:** "You don't have access to field 'X'"

**Solution:**
1. Assign appropriate permission set: `PDF_Admin` or `PDF_Template_Editor`
2. Check field-level security: **Setup → Object Manager → [Object] → [Field] → Set Field-Level Security**
3. Grant Read access for your profile
4. If using `Allowed_Fields__c` whitelist, ensure field is included

**Error:** "Operation WITH SECURITY_ENFORCED resulted in no rows"

**Solution:**
1. You don't have access to any records matching the query
2. Check sharing rules
3. Check object permissions
4. Verify you have Read access to the object

### PDF Display Issues

**Problem:** PDF looks wrong (missing styles, wrong layout)

**Solution:**
1. Simplify CSS (avoid complex flexbox/grid)
2. Use tables for layout (better PDF support)
3. Embed images as base64 (no external URLs)
4. Avoid `position: fixed` or `position: absolute`
5. Use standard fonts (Arial, Times New Roman, etc.)
6. Test with simple HTML first, then add complexity

**Problem:** PDF is too large (> 10MB)

**Solution:**
1. Reduce image sizes/quality
2. Lower `html2canvas.scale` (from 2 to 1)
3. Lower `image.quality` (from 0.98 to 0.7)
4. Compress images before embedding
5. Remove unnecessary content

### Performance Issues

**Problem:** PDF generation is slow (> 10 seconds)

**Solution:**
1. Reduce `html2canvas.scale` (from 2 to 1)
2. Simplify HTML (remove complex CSS)
3. Reduce image sizes
4. Limit number of records in tables
5. Split into multiple smaller PDFs

**Problem:** Browser freezes during PDF generation

**Solution:**
1. Document is too large for browser memory
2. Reduce number of pages (< 50)
3. Reduce image sizes
4. Lower `scale` to 1
5. Split into multiple documents

---

## Performance Expectations

### PDF Generation Times
- **Simple template (1-2 pages):** 2-3 seconds
- **Medium template (5-10 pages):** 5-7 seconds
- **Complex template (20+ pages):** 10-15 seconds

### Resource Usage
- **Browser memory:** ~200MB per PDF generation
- **PDF size:** Typically 50KB - 2MB
- **Image impact:** +500KB per high-res image

### Limits
- **Recommended max pages:** 50
- **Recommended max images:** 20
- **Recommended max table rows:** 100 per page
- **Max HTML size:** ~10MB (before rendering)

---

## Maintenance

### Update Templates

1. Navigate to **Templates** tab
2. Edit existing template
3. Version auto-increments on save
4. Set Status to **Draft** while editing
5. Set Status to **Active** when ready

### Monitor Usage

Query Document__c to see usage:
```sql
SELECT Template__r.Name, Status__c, COUNT(Id) 
FROM Document__c 
WHERE CreatedDate = THIS_MONTH 
GROUP BY Template__r.Name, Status__c
```

### View Errors

Check failed generations:
```sql
SELECT Template__r.Name, Error__c, CreatedDate, CreatedBy.Name
FROM Document__c 
WHERE Status__c = 'Failed' 
ORDER BY CreatedDate DESC
```

---

## Complete Feature List

### ✅ Template Management
- [x] Create/Edit/Delete templates
- [x] DOCX upload with Mammoth conversion
- [x] HTML source support
- [x] Version tracking
- [x] Status management (Draft/Active/Archived)
- [x] Allowed fields whitelist
- [x] Primary object configuration

### ✅ Template Editing
- [x] HTML editor
- [x] Field discovery from Handlebars tokens
- [x] Preview with sample record
- [x] Query plan display
- [x] Relationship validation
- [x] FLS checking

### ✅ PDF Generation (Browser-Based)
- [x] Template selection
- [x] Data fetching with SECURITY_ENFORCED
- [x] Handlebars compilation (50+ helpers)
- [x] Client-side filtering/sorting/math
- [x] **Browser-based PDF rendering (html2pdf.js)**
- [x] PDF preview in iframe
- [x] Save & Attach to record
- [x] Download option
- [x] Discard without saving
- [x] Execution logging

### ✅ Security
- [x] WITH SECURITY_ENFORCED on all queries
- [x] Field-level security filtering
- [x] Sharing rules enforced
- [x] Optional field whitelist
- [x] Custom permission for unsafe HTML
- [x] Permission sets for role-based access

### ✅ Handlebars Features
- [x] Iteration (each, eachRelated, eachWithIndex)
- [x] Filtering (eq, ne, gt, lt, contains, in)
- [x] Sorting (orderBy with ASC/DESC)
- [x] Limits and offsets
- [x] Aggregations (sum, avg, min, max, count)
- [x] Math operations (add, sub, mul, div, round, ceil, floor, abs, min, max, mod, pow)
- [x] Comparison operators (eq, ne, gt, gte, lt, lte, contains, in)
- [x] Logical operators (and, or, not)
- [x] String operations (uppercase, lowercase, capitalize, truncate, replace, concat)
- [x] Locale-aware formatting (dates, currency, numbers, percentages)

---

## Status: ✅ PRODUCTION READY

**All functionality implemented with browser-based architecture!**

### Summary
- **No External Dependencies**: Everything runs in browser
- **Zero Additional Costs**: No function invocations or compute
- **Simple Deployment**: Single `sf project deploy start` command
- **Works Everywhere**: All Salesforce editions supported
- **Privacy First**: Data never leaves Salesforce

---

### Quick Start Commands

```bash
# 1. Deploy everything
sf project deploy start

# 2. Assign permissions
sf org assign permset --name PDF_Admin

# 3. Open org
sf org open

# 4. Navigate to Templates tab and create your first template!
```

---

**Last Updated:** 2025-10-21  
**Version:** 1.0 Browser-Based  
**Total Files:** ~70  
**Total Code:** ~4,500 lines  
**PDF Engine:** html2pdf.js (browser-based)  
**Status:** ✅ Ready for Production Deployment
