# DocGen Package - Code Inventory

## Overview
| Metric | Value |
|--------|-------|
| Apex Classes | 5 (~1,301 lines) |
| LWC Components | 9 (~2,836 lines JS) |
| Custom Objects | 3 |
| Permission Sets | 3 |
| Static Resources | 12 (including 3rd-party libraries) |
| FlexiPages | 2 |
| Custom Application | 1 |
| Total Source Files (excl. 3rd party) | ~35 |

---

## Apex Classes

| Class | Lines | Purpose | Dependencies | Notes |
|-------|-------|---------|--------------|-------|
| `DocumentService.cls` | 211 | PDF saving to ContentVersion, document logging, user settings | `Document__c`, `ContentVersion`, `ContentDocumentLink` | No tests. `logRun` catches DML and returns null silently. |
| `SecurityService.cls` | 207 | FLS enforcement, field whitelist parsing, custom permission checks | Schema describe | Caches globalDescribe and field maps. Has `SecurityException` inner class. |
| `TemplateController.cls` | 298 | AuraEnabled endpoints for LWC components | `TemplateService`, `DocumentService`, `SecurityService`, `TemplateDTO` | Uses emoji in debug logs. No `@AuraEnabled` exception detail leakage is good. |
| `TemplateDTO.cls` | 114 | Data transfer objects for JSON (de)serialization | None | Inner classes: `DiscoveryPayload`, `CollectionSpec`, `OrderByClause`, `Predicate`, `QueryPlan`, `SubqueryPlan`, `ErrorResponse` |
| `TemplateService.cls` | 471 | Query plan building, SOQL generation, data fetching | `TemplateDTO`, `SecurityService` | Builds dynamic SOQL with bind variables. `MAX_SUBQUERY_ROWS = 200`. Contains WHERE clause builder with predicate AST. |

**Total Apex Lines of Code**: ~1,301
**Test Coverage**: 0% — No test classes exist.

---

## Lightning Web Components

| Component | JS Lines | HTML Lines | Purpose | Notes |
|-----------|----------|------------|---------|-------|
| `templateManager` | 226 | 62 | Template CRUD list view with modal editor | Wired to `getAllTemplates`. Uses `confirm()` for delete. |
| `templateEditor` | 646 | 147 | Rich template editor with field discovery and PDF preview | Most complex component. Contains two different PDF render paths. |
| `generateDocumentAction` | 358 | 40 | Quick action for record page PDF generation | Uses `light` render mode. Three-step wizard (select/preview/save). |
| `templateEngine` | 522 | — | Client-side template engine (Handlebars-like) | Supports `{#each}`, `{?if}`, and variable substitution. Client-side WHERE filtering with DSL. |
| `discoveryUtils` | 529 | — | Field discovery from template HTML | Parses Handlebars/docxtemplater syntax. Merges duplicate collections. Has predicate normalization. |
| `richTextEditor` | 108 | 42 | TinyMCE iframe wrapper | PostMessage communication. `*` origin target. |
| `pdfjsViewer` | 129 | 7 | PDF.js viewer wrapper | Receives `Uint8Array` and displays via iframe + postMessage. |
| `docxtemplaterLoader` | 163 | 4 | Library loader for static resources | Loads 6 libraries in parallel with polling verification. |
| `pdfViewerTest` | 159 | — | **DEAD CODE** — Test component for PDF viewer | Not referenced anywhere. Imports unused `jspdf` and `pdfjs`. |

**Total LWC JS Lines**: ~2,836

---

## Custom Objects

| Object | Label | Key Fields | Relationships | Notes |
|--------|-------|------------|-------------|-------|
| `Document_Template__c` | Template | `Primary_Object__c`, `Html_Body__c`, `Status__c`, `Version__c`, `Source_Type__c`, `Renderer_Strategy__c`, `Allowed_Fields__c` | None | Stores HTML templates. Auto-number name. |
| `Document__c` | Document | `Target_Record_Id__c`, `Template__c`, `Status__c`, `Error__c` | Lookup to `Document_Template__c` | Execution log. No actual link field to `ContentVersion` — only logs metadata. |
| `Dynamic_Template_Variable__c` | Template Variable | `Path__c`, `Type__c`, `Plan__c` | Master-Detail to `Document_Template__c` | **Appears unused in code** — no references in Apex or LWC. |

---

## Static Resources

| Resource | Type | Purpose | Used By |
|----------|------|---------|---------|
| `TinyMCE` | Library | Rich text editor | `richTextEditor` |
| `html2canvas` | Library | HTML to canvas rendering | `generateDocumentAction` |
| `pdflib` | Library | PDF generation (PDF-lib) | `generateDocumentAction` |
| `jspdf` | Library | PDF generation (jsPDF) | `templateEditor`, `pdfViewerTest` |
| `mammoth` | Library | DOCX to HTML conversion | `docxtemplaterLoader` (loaded but unused) |
| `docxtemplater` | Library | DOCX template rendering | `docxtemplaterLoader` (loaded but unused) |
| `pizzip` | Library | ZIP manipulation for DOCX | `docxtemplaterLoader` (loaded but unused) |
| `handlebars` | Library | Templating engine | **Wrapped but unused** — custom `templateEngine` used instead |
| `mustache` | Library | Templating engine | **Not referenced in code** |
| `dompurify` | Library | HTML sanitization | **Not referenced in code** |
| `pdfjs` | Library | PDF.js viewer | `pdfjsViewer`, `pdfViewerTest` |
| `DocGenResources` | Bundle | Handlebars wrapper, html2pdf, mammoth | Mixed — some unused |

**Observation**: Several libraries are loaded but never used (`docxtemplater`, `pizzip`, `mammoth`, `handlebars`, `mustache`, `dompurify`). This adds bundle weight and maintenance burden.

---

## Permission Sets

| Permission Set | Label | Permissions | Notes |
|----------------|-------|-------------|-------|
| `PDF_Admin` | PDF Admin | Full CRUD on all custom objects, all fields | `modifyAllRecords=true` on all objects |
| `PDF_Generator` | PDF Generator | Read templates, create Document__c logs | Cannot edit templates. Can generate/save PDFs. |
| `PDF_Template_Editor` | PDF Template Editor | CRUD on templates, read-only on Document__c | Cannot save PDFs to records. Can preview. |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `DocGen.app-meta.xml` | Custom application with tabs for Templates, Variables, and Document logs |
| `Template_Layout.flexipage-meta.xml` | Record page for `Document_Template__c` with `templateEditor` component |
| `DocGen_UtilityBar.flexipage-meta.xml` | Utility bar configuration |
| `PDF_SafeHtml.customPermission-meta.xml` | Custom permission for allowing unescaped HTML in templates |

---

## Unused / Dead Code

1. **`pdfViewerTest` LWC** — Not referenced in any flexipage or component. Contains duplicate PDF conversion logic.
2. **`Dynamic_Template_Variable__c` object** — Defined but never queried or referenced in code.
3. **Handlebars/Mustache libraries** — Custom `templateEngine` replaced these.
4. **Docxtemplater/PizZip/Mammoth** — Loaded by `docxtemplaterLoader` but no component uses them.
5. **`DOMPurify`** — Static resource present but never loaded.
6. **Docx source type** — `Source_Type__c` field exists but only "HTML" is supported everywhere.
7. **`Renderer_Strategy__c` field** — Only value ever set is "Function".
