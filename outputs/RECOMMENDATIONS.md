# Prioritized Recommendations

## Legend

| Priority | Meaning |
|----------|---------|
| Critical | Blocks production use, security vulnerability, or major functional breakage |
| High | Significant impact on usability, maintainability, or correctness |
| Medium | Important improvement for quality or developer experience |
| Low | Nice-to-have, cosmetic, or future optimization |

---

## Critical Priority

### #1. Unify PDF Rendering Strategy

| Attribute | Value |
|-----------|-------|
| **Priority** | Critical |
| **Category** | Architecture / UX |
| **Current State** | `generateDocumentAction` uses html2canvas+pdf-lib (preserves layout), while `templateEditor` uses jsPDF that strips all HTML to plain text. Completely different outputs. |
| **Proposed State** | Both components use the same rendering pipeline: compile template → html2canvas → pdf-lib → base64 PDF. Remove jsPDF dependency entirely. |
| **Effort** | Small |
| **Impact** | Eliminates user confusion and broken preview experience. Templates look identical in preview and final output. |
| **Implementation Notes** | Extract PDF rendering logic into a shared LWC module (e.g., `pdfGenerator.js`). Import in both `generateDocumentAction` and `templateEditor`. Delete jsPDF-related code from `templateEditor.js:345-452`. |
| **Dependencies** | None |

### #2. Add Apex Test Coverage

| Attribute | Value |
|-----------|-------|
| **Priority** | Critical |
| **Category** | Testing |
| **Current State** | Zero test classes. Production deployment is not possible. |
| **Proposed State** | Minimum 75% coverage across all Apex classes. Target: 90%. |
| **Effort** | Medium |
| **Impact** | Enables production deployment. Prevents regressions. Validates security logic. |
| **Implementation Notes** | Create test classes: `TemplateServiceTest`, `SecurityServiceTest`, `DocumentServiceTest`, `TemplateControllerTest`. Test field validation, FLS enforcement, query building, DML operations, error paths. Use `@TestSetup` for shared test data. |
| **Dependencies** | None |

### #3. Fix XSS Vulnerability in Template Rendering

| Attribute | Value |
|-----------|-------|
| **Priority** | Critical |
| **Category** | Security |
| **Current State** | Templates can contain arbitrary HTML and JavaScript. `html2canvas` will execute scripts during rendering. The `PDF_SafeHtml` permission disables escaping. No output encoding in `templateEngine.processVariables()`. |
| **Proposed State** | All template output is HTML-escaped by default. `PDF_SafeHtml` permission allows only specific safe HTML tags (whitelist approach), not arbitrary content. |
| **Effort** | Small |
| **Impact** | Prevents stored XSS attacks. Malicious templates cannot steal session cookies or perform actions on behalf of users. |
| **Implementation Notes** | In `templateEngine.js`, escape HTML in `formatValue()` by default. Add a `safeHtml` helper that validates against an allowed tag list (e.g., `<b>`, `<i>`, `<table>`, `<br>`). Update `hasSafeHtmlPermission` check to gate only the `safeHtml` helper, not disable all escaping. Consider using the existing `dompurify` static resource for sanitization. |
| **Dependencies** | None |

### #4. Add CRUD Checks in DocumentService

| Attribute | Value |
|-----------|-------|
| **Priority** | Critical |
| **Category** | Security |
| **Current State** | `DocumentService.savePdfToRecord()` inserts `ContentVersion` and `ContentDocumentLink` without checking `Schema.sObjectType.ContentVersion.isCreateable()`. |
| **Proposed State** | All DML operations check CRUD permissions before executing. |
| **Effort** | Small |
| **Impact** | Prevents unauthorized users from creating files even if they bypass the UI. Complies with Salesforce security review requirements. |
| **Implementation Notes** | Add CRUD checks before insert in `savePdfToRecord()`. Also add FLS check for `ContentDocumentLink.ShareType` and `Visibility` fields. Consider using `Security.stripInaccessible()` for bulk operations. |
| **Dependencies** | None |

---

## High Priority

### #5. Restrict TinyMCE postMessage Origin

| Attribute | Value |
|-----------|-------|
| **Priority** | High |
| **Category** | Security |
| **Current State** | `tinymce.html` uses `window.parent.postMessage(..., '*')` on lines 56 and 62. Any page can receive or spoof messages. |
| **Proposed State** | Restrict target origin to the Salesforce domain. |
| **Effort** | Small |
| **Impact** | Prevents cross-origin message interception and injection attacks. |
| **Implementation Notes** | Pass the parent origin to the iframe via URL parameter or initial postMessage. Use `window.location.origin` in the iframe to validate. Alternatively, use `event.origin` validation in the LWC `handleMessage` method. |
| **Dependencies** | None |

### #6. Remove Dead Code and Unused Libraries

| Attribute | Value |
|-----------|-------|
| **Priority** | High |
| **Category** | Maintainability |
| **Current State** | Loaded but unused: `docxtemplater`, `pizzip`, `mammoth`, `handlebars`, `mustache`, `dompurify`. Dead component: `pdfViewerTest`. Dead object: `Dynamic_Template_Variable__c`. |
| **Proposed State** | Remove all unused static resources, components, and objects. Reduce bundle size and cognitive load. |
| **Effort** | Small |
| **Impact** | Faster deployments, smaller package, cleaner codebase, reduced security surface area. |
| **Implementation Notes** | Delete: `docxtemplaterLoader` (or simplify to load only used libs), `pdfViewerTest`, `handlebars`/`mustache` static resources, `Dynamic_Template_Variable__c` object and tab. If DocX support is planned for future, document in README instead of keeping dead code. |
| **Dependencies** | #1 (remove jsPDF first) |

### #7. Extract Shared PDF Generation Module

| Attribute | Value |
|-----------|-------|
| **Priority** | High |
| **Category** | Code Quality |
| **Current State** | PDF conversion logic is duplicated across `generateDocumentAction.js`, `templateEditor.js`, and `pdfjsViewer.js`. |
| **Proposed State** | Single shared module handles all PDF generation and base64 conversion. |
| **Effort** | Small |
| **Impact** | Eliminates duplication. Easier to swap PDF libraries later. Consistent error handling. |
| **Implementation Notes** | Create `lwc/pdfGenerator/pdfGenerator.js` with exported functions: `generatePdfFromHtml(html)`, `convertBase64ToUint8Array(base64)`, `convertUint8ArrayToBase64(uint8Array)`. Refactor existing components to use shared module. |
| **Dependencies** | #1 |

### #8. Add Input Validation for Template HTML

| Attribute | Value |
|-----------|-------|
| **Priority** | High |
| **Category** | Security |
| **Current State** | `saveTemplate` accepts arbitrary HTML in `Html_Body__c` with no validation. `<script>` tags, event handlers, and external resources are all allowed. |
| **Proposed State** | Template HTML is sanitized on save to remove scripts, event handlers, and dangerous tags. |
| **Effort** | Small |
| **Impact** | Prevents stored XSS in template storage. Reduces attack surface even before rendering. |
| **Implementation Notes** | Use DOMPurify (already present as static resource) in `templateEditor` before saving. Alternatively, validate in Apex using a regex whitelist approach (though client-side is more reliable for HTML parsing). |
| **Dependencies** | #6 (if keeping DOMPurify) |

### #9. Fix Preview Flow in `templateEditor`

| Attribute | Value |
|-----------|-------|
| **Priority** | High |
| **Category** | UX |
| **Current State** | Preview shows a spinner modal AND a preview modal. `updatePreviewContainer()` uses `setTimeout` chains with console spam. PDF viewer iframe may not receive data. |
| **Proposed State** | Single modal with clear loading state → preview state. Remove `setTimeout` polling. Use `lwc:if` for conditional rendering instead of manual DOM queries. |
| **Effort** | Small |
| **Impact** | Reliable preview functionality. Better user experience. Easier to maintain. |
| **Implementation Notes** | Remove `updatePreviewContainer()` and `populateContainer()` methods. Use `lwc:if` in template to show either spinner, PDF viewer, or HTML fallback. Pass `previewPdfBytes` directly to `c-pdfjs-viewer` without DOM manipulation. |
| **Dependencies** | #1 |

### #10. Add Record Picker for Preview Sample Record

| Attribute | Value |
|-----------|-------|
| **Priority** | High |
| **Category** | UX |
| **Current State** | Users must manually paste a Salesforce record ID into a text input. No validation until preview is clicked. |
| **Proposed State** | Use `lightning-record-picker` or `lightning-input-field` with lookup to select a sample record. |
| **Effort** | Small |
| **Impact** | Dramatically better template authoring experience. Reduces errors. |
| **Implementation Notes** | Replace the `lightning-input` in `templateEditor.html` with `lightning-record-picker` bound to `template.Primary_Object__c`. Validate selection before enabling preview. |
| **Dependencies** | None |

### #11. Add Pagination to Template Manager

| Attribute | Value |
|-----------|-------|
| **Priority** | High |
| **Category** | Performance |
| **Current State** | `getAllTemplates` returns up to 200 records with no pagination, no search, no filter. |
| **Proposed State** | Paginated datatable with search by name and filter by primary object. |
| **Effort** | Small |
| **Impact** | Scales beyond 200 templates. Faster load times. Better usability. |
| **Implementation Notes** | Add `@AuraEnabled` method `searchTemplates(searchTerm, objectName, offset, limit)`. Use `lightning-datatable` with `loadMore` event for infinite scroll or numbered pagination. |
| **Dependencies** | None |

---

## Medium Priority

### #12. Cache Schema Describes in TemplateService

| Attribute | Value |
|-----------|-------|
| **Priority** | Medium |
| **Category** | Performance |
| **Current State** | `TemplateService.validateField()` calls `Schema.getGlobalDescribe()` on every field validation. Called multiple times per template. |
| **Proposed State** | Use `SecurityService`'s existing caching pattern or implement local cache in `TemplateService`. |
| **Effort** | Small |
| **Impact** | Reduces CPU time and describe calls. Faster template validation. |
| **Implementation Notes** | Add `static Map<String, Schema.SObjectType>` cache to `TemplateService` or delegate all describe calls to `SecurityService`. |
| **Dependencies** | None |

### #13. Add Error Boundary Handling in LWC

| Attribute | Value |
|-----------|-------|
| **Priority** | Medium |
| **Category** | UX |
| **Current State** | Many async operations catch errors and show toasts, but some errors are only logged to console. No global error handling. |
| **Proposed State** | Consistent error handling across all components with user-friendly messages and optional "Report Error" action. |
| **Effort** | Medium |
| **Impact** | Better user trust. Easier debugging. Reduced support tickets. |
| **Implementation Notes** | Create `errorUtils.js` module with standard error parsing. Wrap all async operations in components with consistent pattern. Add error boundary component for unhandled exceptions. |
| **Dependencies** | None |

### #14. Remove Excessive Console Logging

| Attribute | Value |
|-----------|-------|
| **Priority** | Medium |
| **Category** | Code Quality |
| **Current State** | `discoveryUtils.js`, `templateEditor.js`, and `templateEngine.js` contain extensive `console.log` with emojis and debug details. This is production code. |
| **Proposed State** | Remove or guard all debug logging. Use a configurable logger utility. |
| **Effort** | Small |
| **Impact** | Cleaner production code. No information leakage through browser console. Better performance. |
| **Implementation Notes** | Replace all `console.log` with a lightweight logger that checks a `DEBUG` flag. Remove emoji prefixes. Strip debug logs before production builds. |
| **Dependencies** | None |

### #15. Consolidate Library Loading

| Attribute | Value |
|-----------|-------|
| **Priority** | Medium |
| **Category** | Performance |
| **Current State** | `docxtemplaterLoader` loads 6+ libraries on app init. Only 3 are actually used (html2canvas, pdf-lib, jsPDF — and jsPDF should be removed). |
| **Proposed State** | Load only required libraries. Load on demand (when PDF generation is first requested) rather than on app init. |
| **Effort** | Small |
| **Impact** | Faster app load time. Reduced memory footprint. |
| **Implementation Notes** | Remove `docxtemplaterLoader` component. Use `loadScript` directly in the PDF generation module with `Promise.all` for parallel loading. Cache loaded state to avoid reloading. |
| **Dependencies** | #6, #7 |

### #16. Add Template Clone Functionality

| Attribute | Value |
|-----------|-------|
| **Priority** | Medium |
| **Category** | UX / Functionality |
| **Current State** | No clone action. Users must manually copy HTML body and recreate the template. |
| **Proposed State** | "Clone" row action in template manager. Creates copy with "(Copy)" suffix and Draft status. |
| **Effort** | Small |
| **Impact** | Common workflow supported. Faster template iteration. |
| **Implementation Notes** | Add `cloneTemplate` Apex method. Add row action in `templateManager.js`. Reset version to 1, append " (Copy)" to name, set status to Draft. |
| **Dependencies** | None |

---

## Low Priority

### #17. Improve PDF Preview in `generateDocumentAction`

| Attribute | Value |
|-----------|-------|
| **Priority** | Low |
| **Category** | UX |
| **Current State** | Preview uses `data:application/pdf;base64,...` in an iframe. Large PDFs may fail to render. No zoom, no page navigation. |
| **Proposed State** | Use `c-pdfjs-viewer` component instead of raw iframe. Consistent with template editor preview. |
| **Effort** | Small |
| **Impact** | Consistent preview experience. Better performance for large PDFs. |
| **Implementation Notes** | Replace iframe in `generateDocumentAction.html` with `c-pdfjs-viewer`. Pass `pdfBase64` converted to `Uint8Array`. |
| **Dependencies** | #7 |

### #18. Add Template Categories/Tags

| Attribute | Value |
|-----------|-------|
| **Priority** | Low |
| **Category** | Functionality |
| **Current State** | Templates are a flat list. No organization beyond primary object. |
| **Proposed State** | Add `Category__c` picklist or multi-select to `Document_Template__c`. Filter by category in template manager. |
| **Effort** | Small |
| **Impact** | Better template organization at scale. |
| **Implementation Notes** | Add custom field. Update `templateManager` filter UI. Update `getAllTemplates` to support category filter. |
| **Dependencies** | None |

### #19. Add Document Usage Dashboard

| Attribute | Value |
|-----------|-------|
| **Priority** | Low |
| **Category** | Functionality |
| **Current State** | `Document__c` logs generation runs but no reporting or analytics. |
| **Proposed State** | Lightning dashboard or report showing template usage, generation volume, error rates. |
| **Effort** | Medium |
| **Impact** | Visibility into system usage. Helps identify popular templates and problems. |
| **Implementation Notes** | Create report types for `Document__c`. Add dashboard to DocGen app. Consider adding `GeneratedDate__c` field for time-based reporting (currently only has auto-number). |
| **Dependencies** | None |

### #20. Add Batch Document Generation

| Attribute | Value |
|-----------|-------|
| **Priority** | Low |
| **Category** | Functionality |
| **Current State** | One record = one PDF. No mass generation capability. |
| **Proposed State** | List view button or flow action to generate PDFs for multiple records. Queueable Apex for server-side processing. |
| **Effort** | Large |
| **Impact** | Enables use cases like generating invoices for all open opportunities, welcome packets for new contacts. |
| **Implementation Notes** | This is a significant feature. Requires Queueable/Batch Apex, status tracking UI, and potentially email delivery. Document as future roadmap item. |
| **Dependencies** | #2 (needs tests first), #7 (shared PDF module) |

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

| # | Recommendation | Effort |
|---|----------------|--------|
| 1 | Unify PDF rendering strategy | Small |
| 2 | Add Apex test coverage | Medium |
| 4 | Add CRUD checks in DocumentService | Small |
| 7 | Extract shared PDF generation module | Small |

### Phase 2: Security & Cleanup (Weeks 3-4)

| # | Recommendation | Effort |
|---|----------------|--------|
| 3 | Fix XSS vulnerability | Small |
| 5 | Restrict TinyMCE postMessage origin | Small |
| 6 | Remove dead code and unused libraries | Small |
| 8 | Add input validation for template HTML | Small |
| 14 | Remove excessive console logging | Small |

### Phase 3: UX Improvements (Weeks 5-6)

| # | Recommendation | Effort |
|---|----------------|--------|
| 9 | Fix preview flow in templateEditor | Small |
| 10 | Add record picker for preview | Small |
| 11 | Add pagination to template manager | Small |
| 16 | Add template clone functionality | Small |
| 17 | Improve PDF preview in generateDocumentAction | Small |

### Phase 4: Performance & Scale (Weeks 7-8)

| # | Recommendation | Effort |
|---|----------------|--------|
| 12 | Cache schema describes | Small |
| 13 | Add error boundary handling | Medium |
| 15 | Consolidate library loading | Small |
| 18 | Add template categories | Small |
| 19 | Add document usage dashboard | Medium |

### Phase 5: Advanced Features (Future)

| # | Recommendation | Effort |
|---|----------------|--------|
| 20 | Add batch document generation | Large |

---

*Recommendations generated from architecture review completed 2026-04-24.*
