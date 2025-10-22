# Browser-Based PDF Generation Architecture

## Overview
This application uses a **100% browser-based architecture** for PDF generation, eliminating the need for server-side rendering or external services.

## PDF Rendering Stack

### html2pdf.js
- **Version**: 0.10.1
- **Bundle Includes**: html2canvas + jsPDF
- **Location**: Static Resource `html2pdf`
- **Size**: ~885KB minified

### How It Works
```
HTML Template → Handlebars Compilation → html2canvas Rendering → jsPDF Conversion → PDF Blob → Base64 → ContentVersion
```

## Architecture Benefits

### ✅ Advantages
1. **No External Dependencies**: Everything runs in the browser
2. **Instant PDF Generation**: No network latency from function calls
3. **No Costs**: No compute/function invocation costs
4. **Better Privacy**: Data never leaves Salesforce environment
5. **Simplified Deployment**: No function setup or endpoints to configure
6. **Works Everywhere**: Compatible with all Salesforce editions

### ⚠️ Limitations
1. **Browser Resource Usage**: Large documents may consume client memory
2. **CSS Support**: Limited to what html2canvas can render
3. **Complex Layouts**: Some advanced CSS may not render perfectly
4. **Performance**: Slower for very large/complex documents vs server-side

## Technical Flow

### 1. Template Compilation (Client-Side)
```javascript
// Load Handlebars and html2pdf
await Promise.all([
    loadScript(this, HANDLEBARS),
    loadScript(this, HTML2PDF)
]);

// Compile template
const Handlebars = window.Handlebars;
registerHelpers(Handlebars);
const template = Handlebars.compile(htmlBody);
const html = template(data);
```

### 2. PDF Generation (Browser)
```javascript
// Create temporary DOM container
const container = document.createElement('div');
container.innerHTML = html;
container.style.position = 'absolute';
container.style.left = '-9999px';
container.style.width = '210mm'; // A4 width
document.body.appendChild(container);

// Configure options
const options = {
    margin: 10,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true
    },
    jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'portrait' 
    }
};

// Generate PDF
const pdf = await window.html2pdf()
    .set(options)
    .from(container)
    .outputPdf('blob');

// Clean up
document.body.removeChild(container);
```

### 3. Save to Salesforce
```javascript
// Convert blob to base64
const pdfBase64 = await blobToBase64(pdf);

// Save via Apex
await savePdf({
    templateId: templateId,
    recordId: recordId,
    pdfData: pdfBase64,
    fileName: fileName
});
```

## Static Resources Required

| Resource | Purpose | Size | Source |
|----------|---------|------|--------|
| `handlebars` | Template compilation | ~90KB | Handlebars.js v4.7.8 |
| `mammoth` | DOCX → HTML conversion | ~180KB | Mammoth.js v1.6.0 |
| `html2pdf` | HTML → PDF rendering | ~885KB | html2pdf.js v0.10.1 |

## Performance Considerations

### Optimal Use Cases
- ✅ Documents under 20 pages
- ✅ Simple to moderate CSS
- ✅ Standard fonts and layouts
- ✅ Charts/images embedded as data URIs

### Watch Out For
- ⚠️ Very large data sets (100+ records in tables)
- ⚠️ Heavy JavaScript/animations in HTML
- ⚠️ External images (must be base64 embedded)
- ⚠️ Complex CSS Grid/Flexbox layouts

## CSS Best Practices for PDF

### ✅ Well-Supported
```css
/* Simple layouts */
.header { 
    text-align: center; 
    padding: 20px;
    border-bottom: 2px solid #333;
}

/* Tables */
table { 
    width: 100%; 
    border-collapse: collapse; 
}

/* Page breaks */
.page-break { 
    page-break-after: always; 
}
```

### ⚠️ Use Carefully
```css
/* Avoid position: fixed (may not render) */
.footer { position: fixed; bottom: 0; }

/* Avoid transform/rotate */
.rotated { transform: rotate(45deg); }

/* Avoid backdrop-filter/blur */
.blur { backdrop-filter: blur(5px); }
```

## Comparison: Browser vs Server

| Aspect | Browser (html2pdf) | Server (Playwright) |
|--------|-------------------|---------------------|
| **Setup** | Static resource only | Function + endpoint setup |
| **Performance** | 2-5s for typical doc | 1-2s for typical doc |
| **Cost** | Free | Pay per invocation |
| **CSS Support** | Good (80%) | Excellent (95%) |
| **Memory** | Client-side | Server-side |
| **Reliability** | Browser-dependent | Consistent |
| **Privacy** | Data stays in SF | Data sent to function |

## Migration Notes

### What Was Removed
- ❌ `functions/pdfrenderer/` directory
- ❌ `PdfRenderService.cls`
- ❌ `PdfRenderController.cls`
- ❌ `PDF_Function_Config__mdt`

### What Was Added
- ✅ `html2pdf.resource` (Static Resource)
- ✅ Browser-based `renderPdf()` method
- ✅ `blobToBase64()` utility

### No Changes Required
- ✅ Apex controllers (TemplateController, etc.)
- ✅ Data model (Template__c, Document__c, etc.)
- ✅ LWC components (templateManager, templateEditor)
- ✅ Handlebars helpers
- ✅ Discovery utilities

## Testing Recommendations

### Browser Testing
Test on:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (Mac)
- ✅ Mobile Safari (iOS)

### Document Testing
- Simple 1-page document with text
- Multi-page document (5+ pages)
- Document with tables
- Document with images
- Document with charts (if applicable)

## Future Enhancements

### Potential Improvements
1. **Client-Side Caching**: Cache compiled templates
2. **Progressive Rendering**: Show progress for large docs
3. **Custom Page Sizes**: A4, Letter, Legal options
4. **Header/Footer Support**: Repeating headers per page
5. **Watermarks**: Add custom watermarks

### If Server-Side Needed Later
If html2pdf.js doesn't meet your needs, consider:
- **Heroku Function**: Deploy Puppeteer on Heroku
- **AWS Lambda**: Serverless PDF rendering
- **Third-Party API**: DocRaptor, PDFShift, etc.

## Troubleshooting

### PDF Not Generating
1. Check browser console for errors
2. Verify static resource deployed: `html2pdf`
3. Check `html2pdfLoaded = true` in component
4. Verify HTML doesn't have syntax errors

### PDF Looks Wrong
1. Check CSS compatibility with html2canvas
2. Simplify complex layouts
3. Embed external images as base64
4. Use standard fonts

### Performance Issues
1. Reduce image sizes
2. Limit table rows per page
3. Simplify CSS
4. Break into multiple smaller PDFs

## Summary

The browser-based approach provides:
- ✅ **Simplicity**: No server setup
- ✅ **Cost**: Zero additional costs
- ✅ **Privacy**: Data never leaves Salesforce
- ✅ **Compatibility**: Works on all Salesforce editions

For 95% of use cases, this architecture is sufficient and recommended.

