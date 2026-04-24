# API Callout Analysis

## Executive Summary

**Critical Finding: This package contains ZERO external API callouts.**

All data operations are performed through:
- Standard Apex database queries (SOQL) with bind variables
- Lightning Data Service (`lightning/uiRecordApi`)
- Client-side PDF generation using browser libraries
- File uploads via base64 encoding to Apex
# Claude Code Architecture Review Prompt

## Objective
Conduct a comprehensive architectural review of this Salesforce unmanaged package. Identify strengths, weaknesses, unused code, missing components, security concerns, and opportunities for improvement. Focus on the PDF generation system, API integrations, and Lightning page layout UX.

---

## Phase 1: Initial Discovery & Analysis

### Step 1: Repository Exploration
1. List all files and directory structure in the repository
2. Identify the main components:
   - Apex classes and their purposes
   - Lightning components (LWC/Aura)
   - Custom objects and fields
   - Visualforce pages (if any)
   - Configuration files
   - Utility/helper classes
3. Note the total file count and approximate codebase size
4. Create a visual diagram of the project structure

### Step 2: Code Inventory
Create a comprehensive inventory documenting:
- **Apex Classes**: Name, purpose, lines of code, dependencies, last modified date
- **Lightning Components**: Type (LWC/Aura), purpose, related classes
- **Custom Objects**: Names, key fields, relationships
- **Flows/Processes**: Names and purposes (if any)
- **Configuration**: Custom settings, metadata types, permission sets
- **Static Resources**: Purpose and usage

---

## Phase 2: Architecture Review - PDF Generation System

### Analysis Tasks
1. **Identify the HTML-to-PDF generation approach**:
   - What libraries/tools are being used? (e.g., jsPDF, html2pdf, custom solution)
   - Is this all browser-side processing?
   - How are the HTML templates structured and stored?
   - Where do the templates come from (static resources, custom objects, etc.)?

2. **Template Architecture**:
   - How are templates organized?
   - What data is being passed to templates?
   - Are there template inheritance patterns?
   - How maintainable are the templates?
   - Document the template data flow

3. **Data Flow Analysis**:
   - Trace the complete data flow from Salesforce record → HTML template → PDF
   - Identify all data sources
   - Where is data transformation happening?
   - Are there performance bottlenecks?

4. **Browser-Side Processing**:
   - What are the advantages of current approach?
   - What are the limitations/disadvantages?
   - File size considerations
   - Memory usage for large PDFs
   - Browser compatibility issues

---

## Phase 3: API Integration Review

### Critical Analysis - API Calls into Org

1. **Locate all API callouts**:
   - Find every `Http` class instantiation
   - Identify `@HttpMock` or actual callout endpoints
   - List all API endpoints being called
   - Document the purpose of each callout

2. **API Call Architecture Analysis**:
   - Which callouts are calling back into the same Salesforce org?
   - What data is being sent/received?
   - Why are these callouts necessary? (Could they be eliminated?)
   - Are there alternative patterns?

3. **Self-Referential API Elimination Assessment**:
   - For each internal API call, evaluate:
     - Could this be done directly via Apex instead?
     - Are there governor limit concerns preventing direct access?
     - Is there a security reason for the API layer?
     - Could this use synchronous processing vs. async?
   - Document the recommendation for each callout

4. **API Security Review**:
   - Are callouts using named credentials?
   - Is authentication properly handled?
   - Are HTTPS certificates valid?
   - Timeout handling implemented?
   - Error handling and retry logic?
   - Rate limiting considerations?

5. **API Performance**:
   - How many API calls per transaction?
   - Could calls be batched or consolidated?
   - Are there unnecessary network round-trips?
   - Caching opportunities?

---

## Phase 4: Lightning Page Layout & UX Review

### Step 1: Lightning Page Discovery
1. Find all Lightning pages in the package
2. Document:
   - Page names and their purposes
   - Components used on each page
   - Data sources (apex controllers, wired properties, etc.)
   - Page configurations (permissions, activations)

### Step 2: UX/Design Analysis
For each Lightning page, evaluate:

1. **Layout & Structure**:
   - Is the layout intuitive and logical?
   - Is information hierarchy clear?
   - Responsive design - works on mobile/tablet?
   - Whitespace and visual balance appropriate?
   - Create visual mockups/diagrams if needed

2. **Component Organization**:
   - Are components grouped logically?
   - Related fields/functions together?
   - Clear navigation and flow?
   - Unnecessary or duplicate components?

3. **Form Design** (if applicable):
   - Input field organization?
   - Required vs optional fields clear?
   - Validation messaging helpful?
   - Button placement and labeling?
   - Form complexity - can it be simplified?

4. **Data Display**:
   - Tables/lists formatted well?
   - Sortable/filterable where needed?
   - Read-only vs editable states clear?
   - Performance with large datasets?

5. **Accessibility**:
   - ARIA labels present?
   - Color contrast sufficient?
   - Keyboard navigation working?
   - Error messages descriptive?

6. **Performance**:
   - Number of API calls on page load?
   - Data load times?
   - Unnecessary renders/re-fetches?
   - Bundle size of components?

### Step 3: User Persona Analysis
- Who are the intended users?
- Are page layouts optimized for their workflows?
- Are there common tasks being made harder than necessary?
- Should there be role-specific page layouts?

---

## Phase 5: Code Quality & Best Practices

### Apex Code Review
For each class, analyze:
1. **Governor Limit Compliance**:
   - SOQL queries optimized and counted?
   - DML statements minimized?
   - Loops optimized?
   - Batch processing where needed?

2. **Security**:
   - SOQL injection prevention (bind variables)?
   - FLS/OLS enforced?
   - Sensitive data logging?
   - Input validation present?

3. **Error Handling**:
   - Try-catch blocks comprehensive?
   - Errors logged appropriately?
   - User-friendly error messages?
   - Graceful degradation?

4. **Code Quality**:
   - Methods too long? (Should be <50 lines)
   - Naming conventions followed?
   - Comments where needed?
   - Dead code or unused methods?
   - Duplicate code/DRY principle?

### Lightning Component Review
1. **Performance**:
   - Unnecessary re-renders?
   - Efficient data binding?
   - Lazy loading implemented?
   - Bundle size optimized?

2. **Best Practices**:
   - Proper use of lifecycle hooks?
   - State management clean?
   - Error handling in components?
   - Accessibility attributes present?

3. **Maintainability**:
   - Code organization?
   - Reusable vs. monolithic?
   - Comments/documentation?
   - Test coverage?

---

## Phase 6: Missing Components & Gaps

### Identify Missing Elements
1. **Testing**:
   - What test coverage exists?
   - What's not tested?
   - Integration tests?
   - Component tests?

2. **Error Handling**:
   - What failure scenarios aren't handled?
   - Logging/monitoring gaps?
   - User notification system?

3. **Documentation**:
   - Code documentation present?
   - Architecture documentation?
   - API documentation?
   - User guides?

4. **Functionality Gaps**:
   - What features might be missing?
   - Incomplete implementations?
   - Known issues not addressed?

5. **DevOps/Deployment**:
   - Deployment scripts?
   - Environment management?
   - Release notes?
   - Rollback procedures?

---

## Phase 7: Synthesis & Final Report

### Generate Comprehensive Written Review

Create a detailed written report including:

#### 1. Executive Summary
- Overall architecture assessment
- Major strengths of current implementation
- Critical issues identified
- High-level recommendations

#### 2. Current Architecture Overview
- System diagram showing components and data flow
- Description of each major component
- Current dependencies

#### 3. Detailed Findings by Category

**A. PDF Generation System**
- Current implementation details
- Strengths and limitations
- Opportunities for improvement
- Refactoring recommendations

**B. API Integration & Self-Referential Calls**
- Inventory of all API calls
- Analysis of internal API calls (why they exist, could they be eliminated?)
- Specific recommendations for removing/refactoring internal calls
- Proposed alternatives to each identified internal callout

**C. Lightning Page Layouts & UX**
- Current page layouts documented with observations
- UX analysis findings
- Accessibility assessment
- Performance metrics
- User workflow optimization opportunities

**D. Code Quality Assessment**
- Overall code quality score (1-10)
- Specific areas of strength
- Areas needing improvement
- Security posture evaluation
- Test coverage analysis

**E. Architecture Issues**
- Tight coupling areas
- Scalability concerns
- Performance bottlenecks
- Security vulnerabilities
- Maintainability issues

**F. Missing Components**
- Testing gaps
- Documentation gaps
- Feature gaps
- Monitoring/logging gaps

#### 4. Prioritized Recommendations

Create a numbered list organized by priority (Critical → High → Medium → Low):

For each recommendation include:
- **Title**: Clear, actionable name
- **Priority**: Critical/High/Medium/Low
- **Category**: Architecture/Security/Performance/UX/Code Quality/Testing/Documentation
- **Current State**: What's happening now
- **Proposed State**: What should happen instead
- **Effort Estimate**: Small/Medium/Large
- **Impact**: What improves (performance, security, maintainability, UX, etc.)
- **Implementation Notes**: How to approach the change
- **Dependencies**: What needs to happen first

#### 5. Architecture Diagrams
- Current architecture diagram
- Refactored architecture diagram (after major recommendations)
- Data flow diagrams for complex processes
- Component dependency diagram

#### 6. Next Steps
- Phase 1 recommendations (do first)
- Phase 2 recommendations (dependent on Phase 1)
- Phase 3 recommendations (longer term)
- Success criteria for each phase

---

## Output Format

Generate the following deliverables:

1. **ARCHITECTURE_REVIEW.md** - Complete written review with all sections above
2. **RECOMMENDATIONS.md** - Prioritized list of recommendations in table format
3. **DIAGRAMS.md** - Visual diagrams in ASCII/Mermaid format (architecture, data flows, dependencies)
4. **CODE_INVENTORY.md** - Detailed inventory of all code artifacts
5. **API_CALLOUT_ANALYSIS.md** - Detailed analysis of all API integrations with recommendations

All files should be saved to the outputs folder.

---

## Important Notes

- **Be thorough**: This is a foundational review for future planning
- **Be specific**: Point to actual files/classes when discussing issues
- **Be objective**: Focus on architectural patterns, not coding style preferences
- **Be actionable**: Every recommendation should be implementable
- **Diagram when helpful**: Use ASCII or Mermaid diagrams to clarify complex architecture
- **DocuSign focus**: Note areas where DocuSign Apex Toolkit integration will touch the architecture (for future planning)

---

## Success Criteria

When complete, the review should answer:
1. ✅ What is this package doing and how is it organized?
2. ✅ What are the major architectural strengths?
3. ✅ What are the critical issues that need fixing?
4. ✅ Why are there internal API calls and can they be eliminated?
5. ✅ Are the Lightning pages user-friendly and performant?
6. ✅ What's missing or incomplete?
7. ✅ What should be prioritized in the next development phase?
8. ✅ How should DocuSign integration fit into the architecture?
This is a **positive architectural decision** — there are no self-referential REST API calls, no external HTTP callouts, and no Named Credential dependencies. The system operates entirely within the Salesforce platform boundary.

---

## Apex Data Access Patterns

### 1. Direct SOQL (Internal Data Access)

All data access uses native Apex SOQL with bind variables — no API layer indirection:

| Location | Pattern | Security |
|----------|---------|----------|
| `TemplateService.fetchDTO()` | `Database.query(plan.soqlQuery)` with `:recordId` binding | Query built with field validation + `WITH SECURITY_ENFORCED` |
| `TemplateController.getTemplatesForObject()` | Direct SOQL with `WITH SECURITY_ENFORCED` | Standard |
| `DocumentService.savePdfToRecord()` | Direct DML on `ContentVersion`, `ContentDocumentLink` | No explicit CRUD check before insert |

### 2. Lightning Data Service

| Component | Usage |
|-----------|-------|
| `generateDocumentAction` | `getRecord` from `lightning/uiRecordApi` (imported but not used in current code) |

---

## Client-Server Communication

### Apex `@AuraEnabled` Methods

| Method | Class | Purpose | Cacheable | Notes |
|--------|-------|---------|-----------|-------|
| `buildQueryPlan` | `TemplateController` | Validates fields and returns query plan | No | Complex deserialization from JSON |
| `fetchData` | `TemplateController` | Executes query plan and returns record data | No | Calls `TemplateService.fetchDTO()` |
| `savePdf` | `TemplateController` | Saves base64 PDF to record | No | Validates + logs |
| `logPreview` | `TemplateController` | Logs preview action | No | Non-critical, errors swallowed |
| `getUserSettings` | `TemplateController` | Returns locale/timezone/currency | **Yes** | Good use of caching |
| `getTemplatesForObject` | `TemplateController` | Lists active templates | **Yes** | Good use of caching |
| `getAllTemplates` | `TemplateController` | Lists all templates | **Yes** | Good use of caching |
| `getTemplate` | `TemplateController` | Gets single template | No | Returns full HTML body |
| `saveTemplate` | `TemplateController` | Upserts template | No | Auto-increments version |
| `deleteTemplate` | `TemplateController` | Deletes template | No | Direct delete DML |
| `validateSObject` | `TemplateController` | Checks if SObject exists | No | Uses `Schema.getGlobalDescribe()` |
| `getChildRelationships` | `TemplateController` | Lists child relationships | **Yes** | Good use of caching |
| `hasSafeHtmlPermission` | `TemplateController` | Checks custom permission | **Yes** | Good use of caching |

### Communication Flow

```
LWC Component
    |
    |--(1)--> buildQueryPlan(payloadJson, templateId)
    |           [Field discovery validation]
    |           [Allowed fields whitelist check]
    |           [SOQL query plan generation]
    |           returns: QueryPlan JSON
    |
    |--(2)--> fetchData(recordId, queryPlanJson)
    |           [Execute SOQL with bind var]
    |           [Serialize SObject to JSON]
    |           returns: Record data JSON
    |
    |--(3)--> [Client-side] templateEngine.render(html, data)
    |           [Handlebars-like substitution]
    |           returns: Rendered HTML
    |
    |--(4)--> [Client-side] html2canvas + pdf-lib
    |           [Browser-side PDF generation]
    |           returns: Base64 PDF
    |
    |--(5)--> savePdf(recordId, templateId, fileName, pdfBase64)
                [Create ContentVersion]
                [Create ContentDocumentLink]
                [Log Document__c record]
                returns: ContentVersion Id
```

---

## Security Assessment

### Strengths

1. **No external callouts** = no external credential management, no HTTPS certificate issues, no timeout concerns
2. **Bind variables used** in all dynamic SOQL (`WHERE Id = :recordId`)
3. **`WITH SECURITY_ENFORCED`** present on most SOQL queries
4. **Field-level validation** before query execution (`validateField`, `filterFieldsByFls`)
5. **Allowed fields whitelist** configurable per template
6. **No raw user input** concatenated into SOQL strings (values use `formatValue()` with `escapeSingleQuotes`)

### Weaknesses

1. **DocumentService.savePdfToRecord()** does not check CRUD/FLS before inserting `ContentVersion` and `ContentDocumentLink`
2. **No explicit sharing checks** on `ContentDocumentLink` — uses `Visibility = 'AllUsers'` which may over-share
3. **TinyMCE iframe** uses `postMessage` with `*` target origin (`tinymce.html:56`) — could be exploited by malicious frames
4. **No rate limiting** on `@AuraEnabled` methods — rapid preview generation could hit governor limits
5. **`buildQueryPlan`** deserializes arbitrary JSON without schema validation beyond Apex DTO casting

---

## Performance Assessment

| Concern | Location | Impact |
|---------|----------|--------|
| `Schema.getGlobalDescribe()` called repeatedly | `TemplateService.validateField()`, `SecurityService.getSObjectType()` | Mitigated by caching in `SecurityService` but not in `TemplateService` |
| Large base64 payload transfer | `savePdf()` — PDF data sent as base64 string | Could hit heap/CPU limits for large PDFs |
| `JSON.serialize()` + `JSON.deserializeUntyped()` double round-trip | `TemplateService.fetchDTO()` | Adds overhead but necessary for untyped conversion |
| No query result size limits on parent query | `TemplateService.fetchDTO()` | Relies on `Id = :recordId` which returns max 1 row |

---

## Recommendations

1. **Add CRUD checks** in `DocumentService.savePdfToRecord()` before DML
2. **Restrict postMessage origin** in TinyMCE iframe to Salesforce domain
3. **Add `@AuraEnabled` rate limiting** or caching for `buildQueryPlan` / `fetchData`
4. **Consider chunked upload** for large PDFs instead of single base64 string
5. **Cache `Schema.getGlobalDescribe()`** in `TemplateService` similar to `SecurityService`
