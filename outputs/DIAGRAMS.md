# Architecture Diagrams

## 1. Current System Architecture

```
+-------------------------------------------------------------+
|                     SALESFORCE ORG                          |
|                                                             |
|  +------------------+      +---------------------------+    |
|  |  Lightning App   |      |       Apex Layer          |    |
|  |   (DocGen)       |      |                           |    |
|  +--------+---------+      +-----------+---------------+    |
|           |                            |                    |
|  +--------v---------+      +-----------v---------------+    |
|  |   LWC Components |      |   TemplateController      |    |
|  |                  |      |   (AuraEnabled)           |    |
|  |  templateManager |<--->|   - buildQueryPlan        |    |
|  |  templateEditor    |<--->|   - fetchData             |    |
|  |  generateDocument  |<--->|   - savePdf               |    |
|  |  richTextEditor    |      |   - getTemplates          |    |
|  |  pdfjsViewer       |      |   - CRUD operations       |    |
|  |  docxtemplaterLoader|     |                           |    |
|  +--------+---------+      +-----------+---------------+    |
|           |                            |                    |
|  +--------v---------+      +-----------v---------------+    |
|  | templateEngine   |      |   TemplateService         |    |
|  | discoveryUtils   |      |   - buildQuery()          |    |
|  | (Client-side)    |      |   - fetchDTO()            |    |
|  +--------+---------+      |   - SOQL validation       |    |
|           |                 +-----------+---------------+    |
|           |                            |                    |
|  +--------v---------+      +-----------v---------------+    |
|  | Static Resources |      |   SecurityService         |    |
|  | - TinyMCE        |      |   - FLS checks            |    |
|  | - html2canvas    |      |   - Field whitelist       |    |
|  | - pdf-lib        |      |   - Permission checks     |    |
|  | - jsPDF          |      +---------------------------+    |
|  | - pdf.js         |                                       |
|  | - (unused libs)  |      +---------------------------+    |
|  +------------------+      |   DocumentService           |    |
|                            |   - savePdfToRecord()       |    |
|                            |   - logRun()                |    |
|                            +---------------------------+    |
|                                                             |
|  +------------------+      +---------------------------+    |
|  |  Custom Objects  |      |   Standard Objects        |    |
|  |  Document_Template |      |   - ContentVersion        |    |
|  |  Document__c       |      |   - ContentDocumentLink   |    |
|  |  Dynamic_Var     |      |   - User                  |    |
|  +------------------+      +---------------------------+    |
|                                                             |
+-------------------------------------------------------------+
```

---

## 2. PDF Generation Data Flow

```
Document Generation Flow
========================

User selects template + record
         |
         v
+--------------------------------+
| generateDocumentAction LWC     |
| 1. Get template from Apex      |
| 2. discoverFields() parses HTML |
+---------------+----------------+
                |
                v
+--------------------------------+
| TemplateController.buildQuery  |
| - Deserializes discovery JSON  |
| - Validates fields against FLS |
| - Builds QueryPlan with SOQL   |
+---------------+----------------+
                |
                v
+--------------------------------+
| TemplateController.fetchData   |
| - Executes SOQL with :recordId |
| - Returns JSON record data       |
+---------------+----------------+
                |
                v
+--------------------------------+
| templateEngine.render()        |
| - Substitutes {variables}      |
| - Processes {#each} blocks     |
| - Applies client-side filters    |
+---------------+----------------+
                |
                v
+--------------------------------+
| Browser PDF Generation         |
|                                |
| Path A (generateDocumentAction)|
|   html2canvas -> PNG image     |
|   pdf-lib -> embed PNG in PDF  |
|                                |
| Path B (templateEditor)        |
|   Strip HTML tags              |
|   jsPDF -> plain text lines    |
|   (DIFFERENT OUTPUT!)          |
+---------------+----------------+
                |
                v
+--------------------------------+
| TemplateController.savePdf     |
| - Base64 decode to Blob        |
| - Insert ContentVersion        |
| - Insert ContentDocumentLink   |
| - Log Document__c record       |
+--------------------------------+
```

---

## 3. Component Dependencies

```
                    templateManager
                         |
              +----------+----------+
              |                     |
              v                     v
        templateEditor      generateDocumentAction
              |                     |
    +---------+---------+          |
    |         |         |          |
    v         v         v          v
 richText  pdfjsViewer  |     templateEngine
    |                   |          |
    v                   |          v
 TinyMCE iframe    (preview)  discoveryUtils
    |                            |
    v                            v
  (postMessage)            (field parsing)

 docxtemplaterLoader (library loader - parallel loads)
    |
    +-- html2canvas
    +-- pdf-lib
    +-- jsPDF
    +-- mammoth (unused)
    +-- docxtemplater (unused)
    +-- pizzip (unused)
    +-- jspdf (unused)
```

---

## 4. SOQL Query Building Flow

```
Template HTML
     |
     | Contains: {Account.Name}, {#Contacts}...{/Contacts}
     v
discoveryUtils.discoverFields()
     |
     +-- scalarPaths: ["Account.Name", "Owner.Name"]
     +-- collections: [
     |      { relationshipName: "Contacts",
     |        fieldPaths: ["FirstName", "LastName"] }
     |    ]
     v
TemplateController.buildQueryPlan(payloadJson, templateId)
     |
     v
TemplateService.buildQuery(payload, allowedFields)
     |
     +-- validate primaryObject exists
     +-- enforceAllowedFields() [whitelist check]
     +-- validateAndAddField() for each scalar [FLS check]
     +-- buildSubquery() for each collection
     |      +-- findChildRelationship()
     |      +-- validate child fields
     |      +-- buildWhereClause() [predicate AST]
     |      +-- buildSubquerySoql()
     +-- buildSoqlQuery()
     |
     v
QueryPlan DTO
     {
       baseSObject: "Account",
       selectFields: {"Id", "Account.Name", "Owner.Name"},
       subqueries: [
         { relationshipName: "Contacts",
           selectFields: {"Id", "FirstName", "LastName"},
           soqlSubquery: "(SELECT Id, FirstName, LastName FROM Contacts)" }
       ],
       soqlQuery: "SELECT Id, Account.Name, Owner.Name, ... FROM Account WHERE Id = :recordId WITH SECURITY_ENFORCED"
     }
```

---

## 5. Permission Model

```
                    Users
                     |
     +---------------+---------------+
     |               |               |
     v               v               v
 PDF_Admin    PDF_Generator  PDF_Template_Editor
     |               |               |
     v               v               v
 Full CRUD      Read templates   CRUD templates
 on all objs    Generate PDFs    Preview PDFs
 Save PDFs      Log documents    Read logs
     |               |               |
     +---------------+---------------+
                     |
                     v
            PDF_SafeHtml
            (custom permission)
                     |
                     v
            Allows unescaped HTML
            in template rendering
```

---

## 6. Refactored Architecture (Recommended)

```
+-------------------------------------------------------------+
|                     SALESFORCE ORG                          |
|                                                             |
|  +------------------+      +---------------------------+    |
|  |  Lightning App   |      |       Apex Layer          |    |
|  +--------+---------+      +-----------+---------------+    |
|           |                            |                    |
|  +--------v---------+      +-----------v---------------+    |
|  |   LWC Components |      |   Unified Controller        |    |
|  |                  |      |   (reduced methods)         |    |
|  |  templateManager |<--->|   - getTemplates            |    |
|  |  templateEditor  |<--->|   - generateDocument()      |    |
|  |  generateAction  |<--->|   - saveDocument()          |    |
|  |  pdfViewer       |      |                             |    |
|  |  richTextEditor  |      +-----------+---------------+    |
|  +--------+---------+                  |                    |
|           |                 +----------v----------+        |
|           |                 |  DocumentService    |        |
|  +--------v---------+       |  - CRUD ops         |        |
|  | Unified PDF Gen  |       |  - Logging          |        |
|  | (single strategy) |       +-------------------+        |
|  +------------------+                                       |
|                                                             |
|  +------------------+      +---------------------------+    |
|  |  Static Resources|      |   QueryBuilderService     |    |
|  |  - TinyMCE       |      |   - Field validation      |    |
|  |  - html2canvas   |      |   - FLS enforcement       |    |
|  |  - pdf-lib       |      |   - SOQL generation       |    |
|  |  - (remove rest) |      +---------------------------+    |
|  +------------------+                                       |
|                                                             |
+-------------------------------------------------------------+
```
