# DocGen - Salesforce PDF Generator Implementation

## Overview

DocGen is a client-heavy PDF generation system for Salesforce that processes templates in the browser, with server-side validation and secure data retrieval. PDFs are rendered using Salesforce Functions with Playwright/Puppeteer.

## Architecture

### Client-Heavy Approach
- **Browser**: DOCX→HTML conversion (Mammoth), token discovery, Handlebars compilation, filtering, math, preview
- **Apex**: Field validation, SOQL building with FLS/sharing, data retrieval only
- **Function**: PDF rendering (Chromium)
- **Storage**: Only persisted on explicit "Save & Attach" action

### Data Model

```
Document_Template__c (Template)
├── Name (Text)
├── Primary_Object__c (Text, required) - e.g., Account, Opportunity
├── Source_Type__c (Picklist: Word, HTML)
├── Source_File__c (Lookup ContentVersion) - optional
├── Html_Body__c (Long Text) - normalized HTML
├── Status__c (Picklist: Draft, Active, Archived)
├── Renderer_Strategy__c (Picklist: Function)
├── Allowed_Fields__c (Long Text) - optional whitelist
└── Version__c (Number) - auto-incremented

Dynamic_Template_Variable__c (Template Variable)
├── Template__c (Master-Detail to Document_Template__c)
├── Path__c (Text) - e.g., Owner.Name, Opportunities.Amount
├── Type__c (Picklist: Scalar, Collection)
└── Plan__c (Long Text) - JSON subquery plan

Document__c (Execution Log)
├── Template__c (Lookup to Document_Template__c)
├── Target_Record_Id__c (Text) - Record ID
├── Status__c (Picklist: Previewed, Saved, Failed)
├── Output_File__c (Lookup ContentVersion)
└── Error__c (Long Text)
```

## Implemented Components

### Apex Classes

#### 1. TemplateDTO.cls
DTOs for data transfer between client and server:
- `DiscoveryPayload` - parsed template tokens
- `CollectionSpec` - child relationship specs with filters/order/limits
- `Predicate` - AST for WHERE clauses
- `QueryPlan` - validated SOQL components
- `SubqueryPlan` - child subquery specs

#### 2. SecurityService.cls
Field-level security and permission management:
- `filterFieldsByFls()` - Filter fields by FLS for current user
- `enforceAllowedFields()` - Enforce template whitelist
- `hasCustomPermission()` - Check PDF_SafeHtml permission
- Caches describe results for performance

#### 3. TemplateService.cls
Query building, validation, and data fetching:
- `buildQuery()` - Build and validate QueryPlan from DiscoveryPayload
- `buildSubquery()` - Build child relationship subqueries
- `buildWhereClause()` - Convert predicate AST to SOQL WHERE
- `fetchDTO()` - Execute query with SECURITY_ENFORCED, return JSON
- Validates relationships, fields, and predicates
- Provides actionable error messages

#### 4. DocumentService.cls
PDF saving and document logging:
- `savePdfToRecord()` - Save PDF as ContentVersion and link to record
- `savePdfBase64ToRecord()` - Save base64-encoded PDF
- `logRun()` / `logPreview()` / `logSaved()` / `logFailure()` - Log execution
- `getUserLocale()` / `getUserTimezone()` / `getUserCurrencyCode()` - User settings

#### 5. TemplateController.cls
Aura-enabled controller for LWC:
- `buildQueryPlan()` - Validate discovery and build query plan
- `fetchData()` - Fetch data for record
- `savePdf()` - Save PDF and log
- `logPreview()` - Log preview only
- `getUserSettings()` - Get user locale/timezone/currency
- `getTemplatesForObject()` / `getAllTemplates()` / `getTemplate()` - Template retrieval
- `saveTemplate()` / `deleteTemplate()` - Template CRUD
- `validateSObject()` / `getChildRelationships()` - Metadata helpers

### LWC Components

#### 1. discoveryUtils
Template parsing and field discovery:
- `discoverFields()` - Parse Handlebars tokens and extract field paths
- Identifies scalar fields: `{{fieldPath}}`
- Identifies collections: `{{#each}}` and `{{#eachRelated}}`
- Extracts predicates, orderBy, limit/offset from parameters
- Returns structured DiscoveryPayload

#### 2. handlebarsHelpers
Comprehensive Handlebars helper library:

**Iteration:**
- `eachRelated` - Enhanced iteration with where/orderBy/limit

**Array:**
- `filter`, `length`, `first`, `last`, `pluck`, `unique`

**Aggregation:**
- `sum`, `avg`, `min`, `max`, `sumBy`, `avgBy`, `minBy`, `maxBy`, `countWhere`

**Math:**
- `add`, `sub`, `mul`, `div`, `safeDiv`, `mod`, `round`, `floor`, `ceil`, `abs`, `inc`, `dec`, `clamp`

**Comparison:**
- `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `in`, `notIn`

**Logical:**
- `and`, `or`, `not`, `all`, `any`, `isNull`, `isNotNull`, `isBlank`, `isNotBlank`

**Formatting (locale-aware):**
- `formatDate`, `formatDateTime`, `formatCurrency`, `number`

#### 3. templateManager
Template management UI:
- List all templates in datatable
- Create/edit templates
- Upload DOCX files (with Mammoth conversion)
- Set primary object, status, allowed fields
- Delete templates
- Version tracking

#### 4. templateEditor
Template HTML editor with preview:
- Edit HTML body in textarea
- Discover fields from template
- Preview compiled HTML with sample record
- Display discovered fields and relationships
- Save template (auto-increment version)

#### 5. generateDocumentAction
Record quick action for PDF generation:
- Select template for current record's SObject
- Generate preview (client-side compilation)
- Display PDF in iframe
- Save & Attach to record OR Discard
- Download PDF
- Logs preview/save/failure

## Handlebars Template Examples

### Basic Fields
```html
<h1>{{Name}}</h1>
<p>Owner: {{Owner.Name}}</p>
<p>Amount: {{formatCurrency Amount CurrencyIsoCode}}</p>
```

### Related Lists with Filtering
```handlebars
{{#eachRelated "OpportunityLineItems" 
              where=(all (eq "Product2.Family" "Hardware") (gt "Quantity" 0))
              orderBy=(array "SortOrder" "ASC" "Product2.Name" "ASC")
              limit=100}}
<tr>
  <td>{{inc @index}}</td>
  <td>{{Product2.Name}}</td>
  <td>{{number Quantity}}</td>
  <td>{{formatCurrency UnitPrice ../CurrencyIsoCode}}</td>
  <td>{{formatCurrency TotalPrice ../CurrencyIsoCode}}</td>
</tr>
{{/eachRelated}}
```

### Aggregations
```handlebars
<p>Total: {{formatCurrency (sumBy OpportunityLineItems "TotalPrice") CurrencyIsoCode}}</p>
<p>Average: {{formatCurrency (avgBy OpportunityLineItems "UnitPrice") CurrencyIsoCode}}</p>
<p>Item Count: {{length OpportunityLineItems}}</p>
```

### Conditional Logic
```handlebars
{{#if (gt Amount 100000)}}
  <p>High Value Opportunity!</p>
{{/if}}

{{#if (eq Stage "Closed Won")}}
  <p>Congratulations!</p>
{{else}}
  <p>Stage: {{Stage}}</p>
{{/if}}
```

## Permission Sets

### PDF_Admin
- Full CRUD on all objects
- Modify all records
- Can save PDFs to records
- Can manage templates

### PDF_Template_Editor
- CRUD on templates and variables
- Read-only on documents
- Can preview but not save

### PDF_Generator
- Read-only on templates
- Create documents
- Can generate and save PDFs
- No template editing

### Custom Permission: PDF_SafeHtml
- Enables `{{{ }}}` unescaped HTML
- Security-sensitive
- Check with `hasSafeHtmlPermission()`

## Setup Instructions

### 1. Deploy Metadata
```bash
sfdx force:source:deploy -p force-app/main/default
```

### 2. Assign Permission Sets
```bash
sfdx force:user:permset:assign -n PDF_Admin
```

### 3. Add Static Resources
Required JavaScript libraries:
- **Handlebars** (handlebars.min.js) - Template engine
- **Mammoth** (mammoth.browser.min.js) - DOCX conversion

Upload as Static Resources in Salesforce.

### 4. Configure Salesforce Function
Set up Function for PDF rendering:
- Endpoint: `/render/pdf`
- Input: `{ html, options }`
- Output: `{ pdfBase64 }`
- Use Playwright or Puppeteer

### 5. Add Components to Pages
- Add **templateManager** to App page
- Add **templateEditor** to Template record page
- Add **generateDocumentAction** as quick action to target objects

## Client-Heavy Workflow

### Template Creation
1. Admin uploads DOCX or enters HTML
2. Browser converts DOCX → HTML (Mammoth)
3. HTML stored in Template.Html_Body__c
4. Original file optionally stored as ContentVersion

### Discovery
1. User edits template
2. Browser parses Handlebars tokens
3. Sends DiscoveryPayload to Apex
4. Apex validates fields, relationships, FLS
5. Returns validated QueryPlan

### Document Generation
1. User clicks "Generate PDF"
2. Browser discovers fields → Apex validates → returns QueryPlan
3. Apex executes SOQL with SECURITY_ENFORCED → returns JSON DTO
4. Browser compiles Handlebars with DTO
5. Browser applies filters, sorting, math (client-side)
6. Browser sends HTML to Function → receives PDF base64
7. Browser displays PDF in iframe (preview)
8. User clicks "Save & Attach" → Apex creates ContentVersion
9. If discarded, nothing is persisted

## Predicate DSL

Predicates are represented as AST for translation to SOQL and client evaluation.

### Operators
- Logical: `and`, `or`, `not`, `all`, `any`
- Comparison: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- String: `contains`, `startsWith`, `endsWith`
- Set: `in`, `notIn`
- Null: `isNull`, `isNotNull`

### Example AST
```json
{
  "operator": "and",
  "children": [
    {
      "operator": "eq",
      "field": "Product2.Family",
      "value": "Hardware"
    },
    {
      "operator": "gt",
      "field": "Quantity",
      "value": 0
    }
  ]
}
```

Translated to SOQL:
```sql
WHERE (Product2.Family = 'Hardware') AND (Quantity > 0)
```

## Error Handling

All services provide actionable error messages:

- **Unknown relationship:** `"Opportunities" isn't a child relationship of "Account". Did you mean "Cases"?`
- **Unknown field:** `"Amunt" isn't a field on "Opportunity". Remove it or update the template.`
- **FLS violation:** `Field "Salary__c" on "Employee__c" isn't visible to your profile/permission set.`
- **Unsupported predicate:** `Predicate "regex" not supported for field "Name" (type "String").`

## Testing

### Apex Tests
Create test classes for:
- `TemplateServiceTest` - Query building, validation, SOQL generation
- `SecurityServiceTest` - FLS filtering, allowed fields enforcement
- `DocumentServiceTest` - PDF saving, logging
- `TemplateControllerTest` - Controller methods

Target: ≥85% code coverage

### LWC Jest Tests
Test modules:
- `discoveryUtils.test.js` - Token parsing, field extraction
- `handlebarsHelpers.test.js` - Helper functions, predicates, formatting

### Integration Tests
- Upload DOCX → verify HTML conversion
- Create template → discover fields → generate PDF
- Test FLS enforcement with different profiles
- Test predicate evaluation (SOQL and client-side parity)

## Localization

User settings drive formatting:
- `formatDate` → `Intl.DateTimeFormat(locale, timezone)`
- `formatCurrency` → `Intl.NumberFormat(locale, currency)`
- `number` → `Intl.NumberFormat(locale)`

Retrieved via `getUserSettings()` from UserInfo.

## Limitations

### SOQL Limits
- Max 200 rows per subquery (enforced)
- Max 5 relationship depth (enforced)
- Query timeout: 120 seconds

### Field Access
- All queries use `WITH SECURITY_ENFORCED`
- Fields without FLS are filtered out
- Optional `Allowed_Fields__c` whitelist

### Predicate Parity
Any predicate that cannot be translated to SOQL is rejected during discovery with an actionable error.

## Next Steps

1. **Implement Salesforce Function** for PDF rendering
2. **Add Static Resources** (Handlebars, Mammoth)
3. **Create Page Layouts** for Template objects
4. **Build sample templates** for common objects
5. **Add Monaco Editor** for better HTML editing experience
6. **Implement version diffing** for template changes
7. **Add CSS injection** for print styling
8. **Create template marketplace** with pre-built templates

## Support & Documentation

- **Field Reference:** Use `discoverFields()` to see all tokens in template
- **Query Plan Preview:** Use `buildQueryPlan()` to see generated SOQL
- **Error Messages:** All errors include suggestions for resolution
- **Relationships:** Use `getChildRelationships()` to see available relationships

## Security Considerations

- All data access respects FLS and sharing rules
- `WITH SECURITY_ENFORCED` on all queries
- Triple-stache `{{{ }}}` requires `PDF_SafeHtml` permission
- ContentVersions are linked with appropriate sharing
- No Visualforce = no governor limit bypass vulnerabilities

## Performance Optimization

- Describe caching in SecurityService
- Cacheable Apex methods where appropriate
- Client-side compilation reduces server load
- Only save PDFs on explicit action (no automatic storage)
- Subquery limits prevent runaway queries

---

**Version:** 1.0  
**Last Updated:** 2025-10-21  
**License:** Proprietary

