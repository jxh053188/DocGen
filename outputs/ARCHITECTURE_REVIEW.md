# DocGen Package - Architecture Review

## Executive Summary

This is a Salesforce Lightning document generation package that enables users to create HTML-based templates, populate them with Salesforce record data using Handlebars-like syntax, and generate PDFs entirely within the browser. The package consists of 5 Apex classes, 9 LWC components, 3 custom objects, and a significant collection of static resource libraries.

### Overall Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture Clarity | 6/10 | Clear separation of concerns between client and server, but two conflicting PDF strategies |
| Security Posture | 5/10 | FLS checks present but XSS risks, missing CRUD checks, iframe origin wildcard |
| Code Quality | 5/10 | Reasonable structure but excessive console logging, dead code, zero tests |
| Performance | 5/10 | Client-side PDF generation avoids server limits but heavy library payload |
| Maintainability | 4/10 | Multiple unused libraries, deprecated DocX support artifacts, duplicated logic |
| UX/Design | 6/10 | Functional layouts but modal stacking issues, limited mobile considerations |

### Major Strengths

1. **No external API callouts** — All data operations use native Apex SOQL with bind variables. No authentication complexity, no network latency, no Named Credential management.
2. **Field-level security enforcement** — `SecurityService` validates FLS before query execution and supports configurable field whitelists per template.
3. **Client-side PDF generation** — Keeps PDF rendering off the Salesforce server, avoiding heap/governor limit issues for complex documents.
4. **Permission-based role separation** — Three permission sets (Admin, Generator, Template Editor) provide reasonable access control.
5. **Template engine with collection filtering** — Custom client-side engine supports `WHERE`, `ORDER BY`, `LIMIT`, and `OFFSET` on child relationships.

### Critical Issues

1. **Two incompatible PDF rendering paths** — `generateDocumentAction` uses html2canvas+pdf-lib (preserves layout), while `templateEditor` uses jsPDF that strips all HTML to plain text. Users see completely different outputs.
2. **Zero test coverage** — No Apex test classes exist. Production deployment is not possible.
3. **XSS vulnerability** — Templates can contain arbitrary HTML/JS that executes during html2canvas rendering. `PDF_SafeHtml` permission enables unescaped output.
4. **Unused libraries and dead code** — ~60% of static resources are loaded but never used. `Dynamic_Template_Variable__c` object is completely unused.
5. **Missing CRUD checks** — `DocumentService.savePdfToRecord()` inserts `ContentVersion` without explicit CRUD validation.

---

## Current Architecture Overview

### System Components

```
+-------------------------------------------------------------+
|                     SALESFORCE ORG                          |
|                                                             |
|  +------------------+      +---------------------------+     |
|  |  Lightning App   |      |       Apex Layer          |     |
|  |   (DocGen)       |      |                           |     |
|  +--------+---------+      +-----------+---------------+     |
|           |                            |                     |
|  +--------v---------+      +-----------v---------------+     |
|  |   LWC Components |      |   TemplateController      |     |
|  |                  |      |   (AuraEnabled)           |     |
|  |  templateManager |      |   - buildQueryPlan        |     |
|  |  templateEditor    |      |   - fetchData             |     |
|  |  generateDocument  |      |   - savePdf               |     |
|  |  pdfjsViewer       |      |   - CRUD operations       |     |
|  |  richTextEditor    |      |                           |     |
|  +--------+---------+      +-----------+---------------+     |
|           |                            |                     |
|  +--------v---------+      +-----------v---------------+     |
|  | Client-Side JS   |      |   TemplateService         |     |
|  | - discoveryUtils |      |   - SOQL validation       |     |
|  | - templateEngine |      |   - Query building        |     |
|  +--------+---------+      +-----------+---------------+     |
|           |                            |                     |
|  +--------v---------+      +-----------v---------------+     |
|  | Static Resources |      |   SecurityService         |     |
|  | - TinyMCE        |      |   - FLS checks            |     |
|  | - html2canvas    |      |   - Field whitelist       |     |
|  | - pdf-lib        |      +---------------------------+     |
|  | - jsPDF          |                                    |
|  +------------------+                                    |
|                                                             |
|  +------------------+      +---------------------------+     |
|  |  Custom Objects  |      |   Standard Objects        |     |
|  |  Document_Template |      |   - ContentVersion        |     |
|  |  Document__c       |      |   - ContentDocumentLink   |     |
|  |  Dynamic_Var     |      +---------------------------+     |
|  +------------------+                                    |
+-------------------------------------------------------------+
```

### Data Flow

1. **Template Discovery** (`discoveryUtils.js`): Parses HTML template to find `{field}` references and `{#collection}` blocks
2. **Query Planning** (`TemplateController.buildQueryPlan`): Apex validates fields against schema and FLS, builds SOQL query plan
3. **Data Fetching** (`TemplateController.fetchData`): Executes SOQL with `Id = :recordId` binding, returns JSON
4. **Template Rendering** (`templateEngine.js`): Substitutes variables, processes collections with client-side filtering
5. **PDF Generation** (Browser): html2canvas renders HTML to PNG, pdf-lib embeds PNG into PDF
6. **File Saving** (`DocumentService.savePdfToRecord`): Creates `ContentVersion`, links via `ContentDocumentLink`, logs to `Document__c`

---

## PDF Generation System

### Current Implementation

The system uses **browser-side PDF generation exclusively** — no server-side rendering. This is architecturally sound for avoiding Salesforce governor limits, but the implementation has critical inconsistencies.

#### Path A: `generateDocumentAction` (Record Page Quick Action)

| Step | Library | Action |
|------|---------|--------|
| 1 | html2canvas | Renders compiled HTML to PNG canvas |
| 2 | pdf-lib (PDFDocument) | Creates PDF, embeds PNG as image |
| 3 | custom | Converts Uint8Array to base64 |
| 4 | Apex | Saves base64 to `ContentVersion` |

**Behavior**: Preserves HTML layout, styling, tables, and images. Produces WYSIWYG output.

**Code**: `generateDocumentAction.js:157-278`

#### Path B: `templateEditor` (Template Preview)

| Step | Library | Action |
|------|---------|--------|
| 1 | jsPDF | Creates PDF document |
| 2 | custom | Strips all HTML tags, converts to plain text |
| 3 | jsPDF.splitTextToSize | Wraps text to page width |
| 4 | custom | Returns Uint8Array |

**Behavior**: Destroys all formatting — no tables, no colors, no images, no fonts. Plain text only.

**Code**: `templateEditor.js:345-452`

### Critical Finding: Output Divergence

A template with a styled table in `templateEditor` preview will show as plain text lines. The same template generated from a record page will show the formatted table. This is a **user-facing bug** that undermines trust in the preview functionality.

### Template Storage

Templates are stored as HTML in `Document_Template__c.Html_Body__c` (Long Text Area). The field supports:
- Standard HTML tags
- Handlebars-like syntax: `{{field}}`, `{{#each collection}}`
- Docxtemplater syntax: `{field}`, `{#collection}`
- Client-side WHERE clauses: `{#Contacts where="StageName eq 'Closed Won'"}`

### Template Data Flow

```
Document_Template__c.Html_Body__c
    |
    v
discoveryUtils.discoverFields(html, primaryObject)
    +-- scalarPaths: ["Name", "Owner.Name", "Account.Industry"]
    +-- collections: [{relationshipName: "Contacts", fieldPaths: ["FirstName", "LastName"]}]
    |
    v
TemplateController.buildQueryPlan(JSON, templateId)
    +-- SecurityService.enforceAllowedFields()
    +-- SecurityService.filterFieldsByFls()
    +-- validateField() against Schema
    |
    v
QueryPlan (JSON)
    +-- soqlQuery: "SELECT Id, Name, Owner.Name, Account.Industry, (SELECT Id, FirstName, LastName FROM Contacts) FROM Opportunity WHERE Id = :recordId WITH SECURITY_ENFORCED"
    |
    v
TemplateController.fetchData(recordId, queryPlanJson)
    +-- Database.query(plan.soqlQuery)
    +-- JSON.serialize(record)
    |
    v
templateEngine.render(htmlTemplate, data)
    +-- processVariables()  // {field} substitution
    +-- processEach()       // {#collection} blocks
    +-- processIf()         // {?condition} blocks
    +-- Client-side filtering/sorting/limiting
    |
    v
Rendered HTML
    |
    v
[Browser PDF Generation]
```

### Browser-Side Processing Analysis

#### Advantages

- **No server heap limits** — PDF size limited only by browser memory
- **No CPU timeout** — Rendering happens in user time, not Apex CPU time
- **No API callout limits** — No external services to rate-limit
- **Immediate feedback** — Preview generated without round-trips
- **Rich formatting** — html2canvas captures CSS, fonts, images

#### Disadvantages

- **html2canvas limitations** — Cannot render SVG, complex CSS transforms, or external images reliably
- **Memory consumption** — Large documents can crash browser tabs
- **Cross-origin image issues** — `useCORS: true` is set but may fail with authenticated Salesforce images
- **File size** — PNG-based PDFs are large (raster instead of vector)
- **Text not selectable** — PDF contains embedded image, not actual text
- **No server logging** — Failures in client-side rendering are invisible to admin monitoring
- **Accessibility** — Generated PDFs are images, not accessible to screen readers

### Recommended PDF Architecture

Unify on a single rendering strategy. Recommendation:

1. **Short-term**: Make `templateEditor` use the same html2canvas+pdf-lib path as `generateDocumentAction`
2. **Medium-term**: Evaluate server-side alternatives:
   - Salesforce CPQ Document Generation (if licensed)
   - Third-party service with Named Credential (e.g., DocRaptor, PDFShift)
   - Heroku microservice with Puppeteer/Playwright
3. **Long-term**: For accessible, selectable text PDFs, consider pdfmake or a server-side headless Chrome solution

---

## API Integration Review

### Finding: Zero External API Callouts

This package makes **no external HTTP callouts**. All data access is through:

- Native Apex SOQL with bind variables
- Lightning Data Service (`lightning/uiRecordApi`)
- Standard Salesforce object DML

This is architecturally correct. There are no self-referential REST API calls, no unnecessary indirection layers, and no Named Credential dependencies.

### `@AuraEnabled` Endpoint Inventory

| Method | Purpose | Cacheable | Risk Level |
|--------|---------|-----------|------------|
| `buildQueryPlan` | Validates template fields, builds SOQL | No | Medium — deserializes JSON without full schema validation |
| `fetchData` | Executes query plan, returns record data | No | Low — uses bind variables and `WITH SECURITY_ENFORCED` |
| `savePdf` | Saves base64 PDF, logs generation | No | Medium — no CRUD check on ContentVersion |
| `logPreview` | Logs preview action | No | Low — errors swallowed |
| `getUserSettings` | Returns locale/timezone/currency | Yes | Low |
| `getTemplatesForObject` | Lists active templates | Yes | Low |
| `getAllTemplates` | Lists all templates | Yes | Low — no pagination |
| `getTemplate` | Gets single template with HTML | No | Low |
| `saveTemplate` | Upserts template record | No | Low |
| `deleteTemplate` | Deletes template | No | Low |
| `validateSObject` | Checks SObject existence | No | Low |
| `getChildRelationships` | Lists child relationships | Yes | Low |
| `hasSafeHtmlPermission` | Checks custom permission | Yes | Low |

### Communication Pattern Assessment

The client-server split is well-designed:
- **Client does**: Template parsing, field discovery, HTML rendering, PDF generation, user interaction
- **Server does**: Schema validation, FLS enforcement, SOQL execution, file persistence, logging

This minimizes server load while keeping security-critical operations (data access, permission checks) on the server.

---

## Lightning Page Layout & UX Review

### Pages Discovered

| Page | Type | Components | Notes |
|------|------|------------|-------|
| `Template_Layout` | Record Page | `templateEditor`, `force:highlightsPanel`, `force:detailPanel` | Custom record page for template editing |
| `DocGen_UtilityBar` | Utility Bar | Standard utility bar | No custom components |

### UX Analysis: `templateEditor`

#### Layout

- **Two-column layout** on desktop (editor 2/3, sidebar 1/3) with toggle to full-width
- Uses SLDS grid system appropriately
- Sidebar collapsible via button — good use of screen real estate

#### Issues

1. **Modal stacking**: Preview modal (`slds-modal_large`) appears over the record page. On smaller screens, the 80vh max-height may not leave room for the PDF viewer iframe (600px fixed height).
2. **No mobile optimization**: `slds-large-size_2-of-3` means mobile gets single column, but the rich text editor iframe and PDF viewer are not responsive.
3. **Console.log noise**: Every preview operation logs 10+ debug messages. This indicates unfinished debugging code.
4. **Sample Record ID input**: Requires users to manually paste a Salesforce record ID. No record picker or lookup component.
5. **Preview flow confusion**: Two separate spinner states (`isLoading` and `previewLoading`) create visual confusion.

### UX Analysis: `generateDocumentAction`

#### Layout

- Three-step wizard: Select Template → Preview PDF → Save/Download
- Clean, focused design appropriate for a quick action

#### Issues

1. **PDF preview uses data URL**: `src={pdfUrl}` with `data:application/pdf;base64,...` is unreliable across browsers and can fail for large PDFs.
2. **No error recovery**: If PDF generation fails, user must start over from template selection.
3. **No progress indication during generation**: Only a generic "Processing..." spinner — no sense of which step is running.
4. **Missing template metadata**: No indication of template version, last modified date, or description in selection step.

### UX Analysis: `templateManager`

#### Layout

- Standard Lightning datatable with row actions
- Modal dialog for create/edit

#### Issues

1. **No search/filter**: Datatable shows all templates with no way to filter by object or status.
2. **HTML body in textarea**: The create/edit modal uses `lightning-textarea` for HTML input instead of the rich text editor component.
3. **No clone action**: Common workflow (duplicate template, modify) requires manual copy-paste.
4. **No version history**: Version number auto-increments but old versions are not preserved.

### Accessibility Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| ARIA labels | Partial | Modals have `role="dialog"` but iframe lacks `title` attribute |
| Keyboard navigation | Partial | Standard Lightning components support keyboard, but custom iframe interactions do not |
| Color contrast | Good | Uses SLDS standard tokens |
| Error messages | Partial | Toast events used, but some errors only logged to console |
| Screen reader | Poor | PDF output is raster image (not accessible). TinyMCE iframe may not communicate content changes. |

---

## Code Quality Assessment

### Apex Code Review

#### Governor Limits

| Class | SOQL Count | DML Count | Assessment |
|-------|-----------|-----------|------------|
| `DocumentService` | 1 per call | Up to 2 per call | Low risk |
| `TemplateController` | 1-2 per method | 1 per method | Low risk |
| `TemplateService` | 1 per call | 0 | Low risk |
| `SecurityService` | Uses cached describes | 0 | Low risk — caches `globalDescribe` and field maps |

**Positive**: `SecurityService` caches `Schema.getGlobalDescribe()` and field maps to avoid repeated describe calls.

**Negative**: `TemplateService.validateField()` calls `Schema.getGlobalDescribe()` on every field validation without caching.

#### Security

| Concern | Status | Location |
|---------|--------|----------|
| SOQL injection | Mitigated | `TemplateService` uses bind variables and `escapeSingleQuotes` |
| FLS enforcement | Present | `SecurityService.filterFieldsByFls()` checks before query |
| CRUD on ContentVersion | Missing | `DocumentService.savePdfToRecord()` no CRUD check |
| Input validation | Partial | Template JSON deserialized but field paths validated against schema |
| Sensitive data logging | Risk | Debug logs may contain record data in JSON form |

#### Error Handling

- `TemplateController` wraps most methods in try-catch and throws `AuraHandledException`
- `DocumentService.logRun()` silently catches DML failures — appropriate for non-critical logging
- `generateDocumentAction.js` handles library load failures but only with generic messages
- `templateEditor.js` has extensive try-catch but logs errors to console rather than user-facing toasts in some paths

### Lightning Component Review

#### Performance

| Concern | Component | Impact |
|---------|-----------|--------|
| Multiple library loads | `docxtemplaterLoader` | Loads 6 libraries on app init even if unused |
| No lazy loading | `templateEditor` | TinyMCE iframe loads immediately on page load |
| Double modal spinners | `templateEditor` | Both `isLoading` and `previewLoading` can be active |
| No pagination | `templateManager` | Loads all templates (max 200) |
| Base64 payload | `generateDocumentAction` | Large PDFs create large Apex parameter payloads |

#### Maintainability

| Issue | Location | Severity |
|-------|----------|----------|
| Duplicate PDF conversion logic | `templateEditor.js` and `pdfjsViewer.js` | Medium |
| Excessive console logging | `templateEditor.js`, `discoveryUtils.js` | Low |
| Hardcoded constants | `generateDocumentAction.js` (794px A4 width) | Low |
| Unused imports | `generateDocumentAction.js` imports `getRecord` but never uses it | Low |
| Commented code blocks | Multiple files | Low |

---

## Missing Components & Gaps

### Testing

| Gap | Severity | Notes |
|-----|----------|-------|
| Zero Apex test classes | Critical | Cannot deploy to production |
| Zero LWC tests | High | No Jest tests for any component |
| No integration tests | Medium | No end-to-end document generation test |
| No security tests | Medium | No tests for FLS bypass attempts |

### Error Handling

| Gap | Severity | Notes |
|-----|----------|-------|
| No server-side PDF generation fallback | Medium | Client-side failure = no document |
| No retry logic | Low | Single attempt for all operations |
| No admin error monitoring | Medium | Client-side errors only visible in browser console |
| Missing ContentDocumentLink error handling | Low | If link fails, ContentVersion is orphaned |

### Documentation

| Gap | Severity | Notes |
|-----|----------|-------|
| No architecture documentation | Medium | Only generated review docs exist |
| No template syntax guide | High | Users must infer syntax from code |
| No API documentation | Low | Methods have docstrings but no consolidated guide |
| No deployment guide | Medium | No instructions for installing in scratch org |

### Functionality Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| No template versioning | Medium | Version number increments but no history |
| No template clone | Low | Common workflow unsupported |
| No batch generation | Medium | Cannot generate for multiple records |
| No scheduled generation | Low | No flow action or scheduled job |
| No email delivery | Low | PDF saved to Files but not emailed |
| No DocX output | Low | Source type field exists but only HTML works |
| No template categories/folders | Low | All templates in single list |
| No usage analytics | Low | Document__c logs exist but no dashboard |

### DevOps/Deployment

| Gap | Severity | Notes |
|-----|----------|-------|
| No CI/CD pipeline | Medium | No GitHub Actions, no validation scripts |
| No scratch org definition | Medium | No `project-scratch-def.json` visible |
| No package manifest | Low | `package.xml` not maintained |
| No release notes | Low | No changelog or versioning strategy |

---

## DocuSign Integration Considerations

When planning DocuSign Apex Toolkit integration, the following architectural touch points should be considered:

1. **Document Service Extension**: `DocumentService.savePdfToRecord()` should be extended to optionally trigger DocuSign envelope creation instead of (or in addition to) saving to Files.

2. **Template Metadata**: `Document_Template__c` could gain fields for DocuSign template mapping (recipient roles, anchor tags, signing order).

3. **Recipient Data**: The existing query plan system (`TemplateService.buildQuery`) already supports relationship traversal. This could be leveraged to fetch signer contact/lead/user data.

4. **Status Tracking**: `Document__c` object is well-suited to track DocuSign envelope status (Sent, Delivered, Completed, Declined).

5. **Permission Sets**: DocuSign permissions should align with the existing role model:
   - PDF_Admin: Can configure DocuSign integration settings
   - PDF_Generator: Can send documents for signature
   - PDF_Template_Editor: Can map template fields to DocuSign tabs

6. **Callback Handling**: DocuSign Connect callbacks would need a new Apex REST class (separate from existing `@AuraEnabled` methods) to update `Document__c` status.

7. **Library Load Impact**: DocuSign eSignature for Salesforce is a managed package dependency. The current static resource-heavy approach should not conflict, but the `docxtemplaterLoader` component's aggressive library loading should be reviewed.

---

*Review completed on 2026-04-24. Files analyzed: 5 Apex classes, 9 LWC components, 3 custom objects, 3 permission sets, 12 static resources, 2 flexipages.*
