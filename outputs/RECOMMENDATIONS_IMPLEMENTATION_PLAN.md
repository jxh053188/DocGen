# DocGen Implementation Plan

## Overview

This plan provides detailed, step-by-step instructions for implementing all 20 recommendations from the architecture review. Each recommendation is broken down into:
- **Goal**: What we are trying to achieve
- **Target Files**: Exactly what to modify
- **Implementation Steps**: Specific, ordered actions
- **Testing Steps**: How to verify correctness
- **User Experience Impact**: What changes for end users and admins
- **AI Agent Notes**: Context for the implementing agent

---

## Phase 1: Foundation (Critical)

---

### #1: Unify PDF Rendering Strategy

**Goal**: Make `templateEditor` use the same html2canvas + pdf-lib pipeline as `generateDocumentAction`. Remove jsPDF usage entirely.

**Target Files**:
- `force-app/main/default/lwc/pdfGenerator/pdfGenerator.js` (new)
- `force-app/main/default/lwc/pdfGenerator/pdfGenerator.js-meta.xml` (new)
- `force-app/main/default/lwc/generateDocumentAction/generateDocumentAction.js`
- `force-app/main/default/lwc/templateEditor/templateEditor.js`
- `force-app/main/default/lwc/docxtemplaterLoader/docxtemplaterLoader.js`
- `force-app/main/default/lwc/templateEditor/templateEditor.html`

**Implementation Steps**:

1. **Create shared PDF generator module**
   - Create `lwc/pdfGenerator/` folder
   - Extract the PDF generation logic from `generateDocumentAction.js:157-278` into a new `pdfGenerator.js` with exported function `generatePdfFromHtml(html)` that returns `Promise<Uint8Array>`
   - Extract `uint8ArrayToBase64` into the same module as `convertUint8ArrayToBase64`
   - Add `convertBase64ToUint8Array` function (reverse operation)
   - The module should check for `window.html2canvas` and `window.PDFLib` availability and throw a clear error if missing
   - Keep the A4 dimensions, scaling logic, and container creation pattern exactly as-is
   - Export: `generatePdfFromHtml`, `convertUint8ArrayToBase64`, `convertBase64ToUint8Array`

2. **Refactor `generateDocumentAction.js`**
   - Import functions from `c/pdfGenerator`
   - Remove the entire `renderPdf` method and replace its usage with `generatePdfFromHtml(html)`
   - Remove `blobToBase64` and `uint8ArrayToBase64` methods (now in shared module)
   - The `pdfBase64` property should still receive a base64 string for the save flow — use `convertUint8ArrayToBase64(pdfBytes)` after generation

3. **Refactor `templateEditor.js`**
   - Import `generatePdfFromHtml` and `convertUint8ArrayToBase64` from `c/pdfGenerator`
   - Remove the entire `renderPdf` method (`templateEditor.js:345-452`)
   - In `handlePreview`, replace the call to `this.renderPdf(htmlContent)` with:
     ```js
     const pdfBytes = await generatePdfFromHtml(htmlContent);
     this.previewPdfBytes = pdfBytes;
     ```
   - Remove `downloadPdf` method (it duplicates logic that should be in the shared module or removed)
   - Update `handleDownloadPreview` to use `convertUint8ArrayToBase64` if it needs base64, or pass Uint8Array directly

4. **Update `docxtemplaterLoader.js`**
   - Remove `loadJspdf()` method
   - Remove `JSPDF` import
   - Remove jsPDF from the parallel load array in `loadLibraries()`
   - Remove jsPDF from the polling verification checks

5. **Update `templateEditor.html`**
   - Remove the `template if:false={previewPdfBytes}` fallback block that shows `previewPdfUrl` iframe or the raw HTML preview container
   - After this change, preview should ONLY use `c-pdfjs-viewer` with `previewPdfBytes`

**Testing Steps**:
- Open template editor, create a template with styled HTML (tables, colors, fonts), preview with a sample record
- The preview PDF should look identical to what `generateDocumentAction` produces for the same template
- Download the preview — should be a valid PDF with preserved styles
- Verify that jsPDF is no longer loaded in the browser network tab

**User Experience Impact**:
- End users: Template preview now matches final output exactly. No more "looks different in preview" complaints.
- Admins: Simpler mental model — one PDF engine, not two.

**AI Agent Notes**:
- Do NOT change the html2canvas options (scale, CORS settings, backgroundColor) — they are carefully tuned
- The `generatePdfFromHtml` function must return a `Uint8Array`, not a base64 string
- Keep the temporary DOM container creation pattern identical to avoid regressions
- The `convertUint8ArrayToBase64` chunking logic (chunkSize: 8192) must be preserved to avoid stack overflow on large PDFs

---

### #2: Add Apex Test Coverage

**Goal**: Achieve 75%+ test coverage across all Apex classes. Target: 90%.

**Target Files**:
- `force-app/main/default/classes/TemplateServiceTest.cls` (new)
- `force-app/main/default/classes/SecurityServiceTest.cls` (new)
- `force-app/main/default/classes/DocumentServiceTest.cls` (new)
- `force-app/main/default/classes/TemplateControllerTest.cls` (new)

**Implementation Steps**:

1. **Create `DocumentServiceTest.cls`**
   ```apex
   @isTest
   private class DocumentServiceTest {
       @TestSetup
       static void setup() {
           Account acc = new Account(Name = 'Test Account');
           insert acc;
       }

       @isTest
       static void testSavePdfToRecord_Success() {
           Account acc = [SELECT Id FROM Account LIMIT 1];
           Blob pdfBlob = Blob.valueOf('%PDF-1.4 test content');
           Id cvId = DocumentService.savePdfToRecord(acc.Id, 'Test.pdf', pdfBlob);
           System.assertNotEquals(null, cvId);
           
           ContentVersion cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cvId];
           List<ContentDocumentLink> links = [SELECT Id FROM ContentDocumentLink WHERE ContentDocumentId = :cv.ContentDocumentId];
           System.assertEquals(1, links.size());
       }

       @isTest
       static void testSavePdfToRecord_NullRecordId() {
           try {
               DocumentService.savePdfToRecord(null, 'Test.pdf', Blob.valueOf('test'));
               System.assert(false, 'Should have thrown exception');
           } catch (DocumentService.DocumentException e) {
               System.assert(e.getMessage().contains('Record ID is required'));
           }
       }

       @isTest
       static void testSavePdfBase64ToRecord() {
           Account acc = [SELECT Id FROM Account LIMIT 1];
           String base64 = EncodingUtil.base64Encode(Blob.valueOf('test'));
           Id cvId = DocumentService.savePdfBase64ToRecord(acc.Id, 'Test.pdf', base64);
           System.assertNotEquals(null, cvId);
       }

       @isTest
       static void testLogRun() {
           Account acc = [SELECT Id FROM Account LIMIT 1];
           Document_Template__c tmpl = new Document_Template__c(
               Name = 'Test Template',
               Primary_Object__c = 'Account',
               Status__c = 'Active'
           );
           insert tmpl;
           
           Id docId = DocumentService.logRun(tmpl.Id, acc.Id, 'Previewed', null, null);
           System.assertNotEquals(null, docId);
       }

       @isTest
       static void testLogRun_NullTemplate() {
           Account acc = [SELECT Id FROM Account LIMIT 1];
           try {
               DocumentService.logRun(null, acc.Id, 'Previewed', null, null);
               System.assert(false, 'Should have thrown exception');
           } catch (DocumentService.DocumentException e) {
               System.assert(e.getMessage().contains('required'));
           }
       }

       @isTest
       static void testUserSettings() {
           String locale = DocumentService.getUserLocale();
           System.assert(String.isNotBlank(locale));
           String tz = DocumentService.getUserTimezone();
           System.assert(String.isNotBlank(tz));
           String currency = DocumentService.getUserCurrencyCode();
           System.assert(String.isNotBlank(currency));
       }

       @isTest
       static void testBase64Conversions() {
           Blob testBlob = Blob.valueOf('Hello World');
           String base64 = DocumentService.blobToBase64(testBlob);
           Blob result = DocumentService.base64ToBlob(base64);
           System.assertEquals(testBlob.toString(), result.toString());
       }
   }
   ```

2. **Create `SecurityServiceTest.cls`**
   ```apex
   @isTest
   private class SecurityServiceTest {
       @isTest
       static void testFilterFieldsByFls_Accessible() {
           Set<String> fields = new Set<String>{'Name', 'Industry'};
           Set<String> result = SecurityService.filterFieldsByFls('Account', fields);
           System.assert(result.contains('Name'));
       }

       @isTest
       static void testFilterFieldsByFls_InvalidObject() {
           Set<String> result = SecurityService.filterFieldsByFls('InvalidObject__c', new Set<String>{'Name'});
           System.assert(result.isEmpty());
       }

       @isTest
       static void testEnforceAllowedFields_Whitelist() {
           Set<String> fields = new Set<String>{'Name'};
           SecurityService.enforceAllowedFields(fields, '["Name", "Industry"]');
           // Should not throw
       }

       @isTest
       static void testEnforceAllowedFields_Violation() {
           Set<String> fields = new Set<String>{'Name', 'InvalidField__c'};
           try {
               SecurityService.enforceAllowedFields(fields, '["Name"]');
               System.assert(false, 'Should have thrown');
           } catch (SecurityService.SecurityException e) {
               System.assert(e.getMessage().contains('not in the allowed fields'));
           }
       }

       @isTest
       static void testEnforceAllowedFields_NoWhitelist() {
           Set<String> fields = new Set<String>{'Name'};
           SecurityService.enforceAllowedFields(fields, null);
           // Should not throw
       }

       @isTest
       static void testHasCustomPermission() {
           // Assuming test user may or may not have PDF_SafeHtml
           Boolean hasPerm = SecurityService.hasCustomPermission('PDF_SafeHtml');
           // Just verify it doesn't throw
           System.assert(hasPerm != null);
       }

       @isTest
       static void testRelationshipTraversal() {
           Set<String> fields = new Set<String>{'Owner.Name'};
           Set<String> result = SecurityService.filterFieldsByFls('Account', fields);
           // Owner.Name accessibility depends on profile, but method should not crash
       }
   }
   ```

3. **Create `TemplateServiceTest.cls`**
   ```apex
   @isTest
   private class TemplateServiceTest {
       @isTest
       static void testBuildQuery_Success() {
           TemplateDTO.DiscoveryPayload payload = new TemplateDTO.DiscoveryPayload();
           payload.primaryObject = 'Account';
           payload.scalarPaths = new List<String>{'Name', 'Industry'};
           
           TemplateDTO.QueryPlan plan = TemplateService.buildQuery(payload, null);
           
           System.assertEquals('Account', plan.baseSObject);
           System.assert(plan.selectFields.contains('Name'));
           System.assert(plan.selectFields.contains('Industry'));
           System.assert(plan.soqlQuery.contains('WITH SECURITY_ENFORCED'));
           System.assert(plan.soqlQuery.contains('WHERE Id = :recordId'));
       }

       @isTest
       static void testBuildQuery_InvalidObject() {
           TemplateDTO.DiscoveryPayload payload = new TemplateDTO.DiscoveryPayload();
           payload.primaryObject = 'InvalidObject';
           try {
               TemplateService.buildQuery(payload, null);
               System.assert(false, 'Should have thrown');
           } catch (TemplateService.TemplateException e) {
               System.assert(e.getMessage().contains('Unknown SObject'));
           }
       }

       @isTest
       static void testBuildQuery_WithSubquery() {
           TemplateDTO.DiscoveryPayload payload = new TemplateDTO.DiscoveryPayload();
           payload.primaryObject = 'Account';
           
           TemplateDTO.CollectionSpec coll = new TemplateDTO.CollectionSpec();
           coll.relationshipName = 'Contacts';
           coll.fieldPaths = new List<String>{'FirstName', 'LastName'};
           payload.collections = new List<TemplateDTO.CollectionSpec>{coll};
           
           TemplateDTO.QueryPlan plan = TemplateService.buildQuery(payload, null);
           System.assertEquals(1, plan.subqueries.size());
           System.assert(plan.subqueries[0].soqlSubquery.contains('Contacts'));
       }

       @isTest
       static void testBuildQuery_WhitelistEnforcement() {
           TemplateDTO.DiscoveryPayload payload = new TemplateDTO.DiscoveryPayload();
           payload.primaryObject = 'Account';
           payload.scalarPaths = new List<String>{'Name'};
           
           try {
               TemplateService.buildQuery(payload, '["Industry"]');
               System.assert(false, 'Should have thrown');
           } catch (SecurityService.SecurityException e) {
               System.assert(e.getMessage().contains('not in the allowed fields'));
           }
       }

       @isTest
       static void testFetchDTO() {
           Account acc = new Account(Name = 'Test');
           insert acc;
           
           TemplateDTO.QueryPlan plan = new TemplateDTO.QueryPlan();
           plan.baseSObject = 'Account';
           plan.selectFields = new Set<String>{'Id', 'Name'};
           plan.soqlQuery = 'SELECT Id, Name FROM Account WHERE Id = :recordId WITH SECURITY_ENFORCED';
           
           String json = TemplateService.fetchDTO(acc.Id, plan);
           System.assert(json.contains('Test'));
       }

       @isTest
       static void testBuildWhereClause() {
           // Test via buildQuery with a predicate
           TemplateDTO.Predicate pred = new TemplateDTO.Predicate();
           pred.operator = 'eq';
           pred.field = 'StageName';
           pred.value = 'Prospecting';
           
           TemplateDTO.CollectionSpec coll = new TemplateDTO.CollectionSpec();
           coll.relationshipName = 'Opportunities';
           coll.fieldPaths = new List<String>{'Name'};
           coll.wherePredicate = pred;
           
           TemplateDTO.DiscoveryPayload payload = new TemplateDTO.DiscoveryPayload();
           payload.primaryObject = 'Account';
           payload.collections = new List<TemplateDTO.CollectionSpec>{coll};
           
           TemplateDTO.QueryPlan plan = TemplateService.buildQuery(payload, null);
           System.assert(plan.subqueries[0].whereClause.contains('StageName'));
       }
   }
   ```

4. **Create `TemplateControllerTest.cls`**
   ```apex
   @isTest
   private class TemplateControllerTest {
       @TestSetup
       static void setup() {
           Document_Template__c tmpl = new Document_Template__c(
               Name = 'Test Template',
               Primary_Object__c = 'Account',
               Status__c = 'Active',
               Html_Body__c = '<h1>{Name}</h1>'
           );
           insert tmpl;
       }

       @isTest
       static void testGetTemplatesForObject() {
           List<Document_Template__c> tmpls = TemplateController.getTemplatesForObject('Account');
           System.assertEquals(1, tmpls.size());
       }

       @isTest
       static void testGetAllTemplates() {
           List<Document_Template__c> tmpls = TemplateController.getAllTemplates();
           System.assertEquals(1, tmpls.size());
       }

       @isTest
       static void testGetTemplate() {
           Document_Template__c tmpl = [SELECT Id FROM Document_Template__c LIMIT 1];
           Document_Template__c result = TemplateController.getTemplate(tmpl.Id);
           System.assertEquals('Test Template', result.Name);
       }

       @isTest
       static void testSaveTemplate() {
           Document_Template__c tmpl = new Document_Template__c(
               Name = 'New Template',
               Primary_Object__c = 'Contact',
               Status__c = 'Draft'
           );
           Id id = TemplateController.saveTemplate(tmpl);
           System.assertNotEquals(null, id);
       }

       @isTest
       static void testDeleteTemplate() {
           Document_Template__c tmpl = [SELECT Id FROM Document_Template__c LIMIT 1];
           TemplateController.deleteTemplate(tmpl.Id);
           List<Document_Template__c> remaining = [SELECT Id FROM Document_Template__c WHERE Id = :tmpl.Id];
           System.assertEquals(0, remaining.size());
       }

       @isTest
       static void testValidateSObject() {
           System.assert(TemplateController.validateSObject('Account'));
           System.assert(!TemplateController.validateSObject('InvalidObject'));
       }

       @isTest
       static void testGetChildRelationships() {
           List<String> rels = TemplateController.getChildRelationships('Account');
           System.assert(!rels.isEmpty());
       }

       @isTest
       static void testBuildQueryPlan() {
           Document_Template__c tmpl = [SELECT Id FROM Document_Template__c LIMIT 1];
           TemplateDTO.DiscoveryPayload payload = new TemplateDTO.DiscoveryPayload();
           payload.primaryObject = 'Account';
           payload.scalarPaths = new List<String>{'Name'};
           String json = JSON.serialize(payload);
           
           String planJson = TemplateController.buildQueryPlan(json, tmpl.Id);
           System.assert(String.isNotBlank(planJson));
       }

       @isTest
       static void testFetchData() {
           Account acc = new Account(Name = 'Test');
           insert acc;
           
           TemplateDTO.QueryPlan plan = new TemplateDTO.QueryPlan();
           plan.baseSObject = 'Account';
           plan.selectFields = new Set<String>{'Id', 'Name'};
           plan.soqlQuery = 'SELECT Id, Name FROM Account WHERE Id = :recordId WITH SECURITY_ENFORCED';
           
           String data = TemplateController.fetchData(acc.Id, JSON.serialize(plan));
           System.assert(data.contains('Test'));
       }

       @isTest
       static void testSavePdf() {
           Account acc = new Account(Name = 'Test');
           insert acc;
           Document_Template__c tmpl = [SELECT Id FROM Document_Template__c LIMIT 1];
           String base64 = EncodingUtil.base64Encode(Blob.valueOf('test pdf content'));
           
           Id cvId = TemplateController.savePdf(acc.Id, tmpl.Id, 'test.pdf', base64);
           System.assertNotEquals(null, cvId);
       }
   }
   ```

5. **Run tests and verify coverage**
   ```bash
   sfdx force:apex:test:run --testlevel RunLocalTests --codecoverage --resultformat human --wait 30
   ```

**Testing Steps**:
- Run all tests via SFDX
- Verify coverage is above 75% for each class
- Check that all assertions pass
- Test with restricted user profile to ensure FLS enforcement tests are meaningful

**User Experience Impact**:
- End users: No direct UX change
- Admins: Confidence that the code is tested and deployable to production

**AI Agent Notes**:
- Use `@TestSetup` for shared test data to reduce test execution time
- Test both positive and negative paths
- For FLS tests, create a test user with restricted profile if needed
- Cover exception handling paths

---

### #4: Add CRUD Checks in DocumentService

**Goal**: Ensure `DocumentService.savePdfToRecord()` checks CRUD permissions before inserting `ContentVersion` and `ContentDocumentLink`.

**Target Files**:
- `force-app/main/default/classes/DocumentService.cls`
- `force-app/main/default/classes/DocumentServiceTest.cls`

**Implementation Steps**:

1. **Add CRUD checks to `savePdfToRecord`**
   ```apex
   public static Id savePdfToRecord(Id recordId, String fileName, Blob pdfBlob) {
       if (recordId == null) {
           throw new DocumentException('Record ID is required');
       }
       if (pdfBlob == null) {
           throw new DocumentException('PDF content is required');
       }
       if (String.isBlank(fileName)) {
           fileName = 'Document.pdf';
       }
       if (!fileName.endsWithIgnoreCase('.pdf')) {
           fileName += '.pdf';
       }
       
       // CRUD check for ContentVersion
       if (!Schema.sObjectType.ContentVersion.isCreateable()) {
           throw new DocumentException('You do not have permission to create files.');
       }
       
       ContentVersion cv = new ContentVersion();
       cv.Title = fileName.removeEnd('.pdf');
       cv.PathOnClient = fileName;
       cv.VersionData = pdfBlob;
       cv.IsMajorVersion = true;
       cv.Origin = 'H';
       
       try {
           insert cv;
       } catch (DmlException e) {
           throw new DocumentException('Failed to save PDF: ' + e.getMessage());
       }
       
       cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id WITH SECURITY_ENFORCED LIMIT 1];
       
       // CRUD check for ContentDocumentLink
       if (!Schema.sObjectType.ContentDocumentLink.isCreateable()) {
           // Clean up orphaned ContentVersion
           delete cv; // But we can't delete without delete permission...
           throw new DocumentException('You do not have permission to link files to records.');
       }
       
       ContentDocumentLink cdl = new ContentDocumentLink();
       cdl.ContentDocumentId = cv.ContentDocumentId;
       cdl.LinkedEntityId = recordId;
       cdl.ShareType = 'V';
       cdl.Visibility = 'AllUsers';
       
       try {
           insert cdl;
       } catch (DmlException e) {
           throw new DocumentException('PDF saved but failed to link to record: ' + e.getMessage());
       }
       
       return cv.Id;
   }
   ```

2. **Add FLS check helper**
   ```apex
   private static void checkContentVersionFls() {
       Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.ContentVersion.fields.getMap();
       String[] requiredFields = new String[]{'Title', 'PathOnClient', 'VersionData', 'IsMajorVersion', 'Origin'};
       for (String fieldName : requiredFields) {
           Schema.SObjectField field = fieldMap.get(fieldName.toLowerCase());
           if (field == null || !field.getDescribe().isCreateable()) {
               throw new DocumentException('Missing required field permissions for ContentVersion: ' + fieldName);
           }
       }
   }
   ```
   Call this helper in `savePdfToRecord` after the object CRUD check.

3. **Add test for CRUD failure**
   Add a test in `DocumentServiceTest` that verifies the exception is thrown when permissions are missing. Since we cannot easily remove permissions in a test, create a test that mocks or uses `System.runAs` with a user that has minimal permissions.

**Testing Steps**:
- Run existing tests — they should still pass
- Create a test user with no ContentVersion create permission
- Run `savePdfToRecord` as that user and verify `DocumentException` is thrown with correct message
- Verify that the error message is user-friendly (no raw Salesforce error)

**User Experience Impact**:
- End users: If they lack permissions, they see a clear error instead of a generic Salesforce error
- Admins: Better security posture, clearer error messages for permission issues

**AI Agent Notes**:
- The `ContentDocumentLink` cleanup is tricky — if link fails after version is created, we have an orphaned ContentVersion. Consider using a transaction or documenting this limitation.
- `delete cv` in the catch block is not ideal — if the user lacks delete permission, this will throw another exception. Document this as a known limitation or use a platform event for cleanup.

---

### #7: Extract Shared PDF Generation Module

**Goal**: Create a single shared module for PDF generation that both components use.

**Target Files**:
- `force-app/main/default/lwc/pdfGenerator/pdfGenerator.js` (new)
- `force-app/main/default/lwc/pdfGenerator/pdfGenerator.js-meta.xml` (new)
- `force-app/main/default/lwc/generateDocumentAction/generateDocumentAction.js`
- `force-app/main/default/lwc/templateEditor/templateEditor.js`
- `force-app/main/default/lwc/pdfjsViewer/pdfjsViewer.js`
- `force-app/main/default/lwc/pdfViewerTest/pdfViewerTest.js` (will be deleted in #6)

**Implementation Steps**:

1. **Create `pdfGenerator.js`**
   ```javascript
   /**
    * Shared PDF generation utilities for DocGen
    * Uses html2canvas + pdf-lib for consistent WYSIWYG output
    */

   /**
    * Generate a PDF from HTML content using html2canvas + pdf-lib
    * @param {string} html - HTML content to render
    * @returns {Promise<Uint8Array>} - PDF bytes
    */
   export async function generatePdfFromHtml(html) {
       if (!window.html2canvas) {
           throw new Error('html2canvas library not loaded. Please refresh the page.');
       }
       if (!window.PDFLib) {
           throw new Error('PDFLib library not loaded. Please refresh the page.');
       }

       const container = document.createElement('div');
       container.classList.add('pdf-render-container');
       container.innerHTML = html;
       
       container.style.position = 'fixed';
       container.style.top = '0';
       container.style.left = '0';
       container.style.width = '79px';
       container.style.minHeight = '112px';
       container.style.backgroundColor = 'white';
       container.style.padding = '20px';
       container.style.boxSizing = 'border-box';
       container.style.overflow = 'visible';
       container.style.zIndex = '999999';
       container.style.fontSize = '1px';
       
       document.body.appendChild(container);
       container.offsetHeight; // force reflow

       await new Promise(resolve => setTimeout(resolve, 500));

       try {
           const canvas = await window.html2canvas(container, {
               scale: 10,
               useCORS: true,
               allowTaint: true,
               backgroundColor: '#ffffff',
               logging: false,
               removeContainer: false,
               onclone: (clonedDoc, clonedElement) => {
                   if (clonedElement) {
                       clonedElement.style.position = 'absolute';
                       clonedElement.style.top = '0';
                       clonedElement.style.left = '0';
                       clonedElement.style.width = '794px';
                       clonedElement.style.minHeight = '1123px';
                       clonedElement.style.fontSize = '16px';
                       clonedElement.style.visibility = 'visible';
                       clonedElement.style.opacity = '1';
                   }
               }
           });

           const imgData = canvas.toDataURL('image/png');
           const { PDFDocument } = window.PDFLib;
           const pdfDoc = await PDFDocument.create();
           
           const pageWidth = 595.28;
           const pageHeight = 841.89;
           
           const imgWidth = canvas.width;
           const imgHeight = canvas.height;
           const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
           const scaledWidth = imgWidth * scale;
           const scaledHeight = imgHeight * scale;
           
           const page = pdfDoc.addPage([pageWidth, pageHeight]);
           const pngImage = await pdfDoc.embedPng(imgData);
           page.drawImage(pngImage, {
               x: 0,
               y: pageHeight - scaledHeight,
               width: scaledWidth,
               height: scaledHeight
           });

           const pdfBytes = await pdfDoc.save();
           return pdfBytes;
       } finally {
           if (container.parentNode) {
               document.body.removeChild(container);
           }
       }
   }

   /**
    * Convert Uint8Array to base64 string efficiently
    * @param {Uint8Array} uint8Array
    * @returns {string}
    */
   export function convertUint8ArrayToBase64(uint8Array) {
       let binary = '';
       const chunkSize = 8192;
       for (let i = 0; i < uint8Array.length; i += chunkSize) {
           const chunk = uint8Array.subarray(i, i + chunkSize);
           binary += String.fromCharCode.apply(null, chunk);
       }
       return btoa(binary);
   }

   /**
    * Convert base64 string to Uint8Array
    * @param {string} base64
    * @returns {Uint8Array}
    */
   export function convertBase64ToUint8Array(base64) {
       const binary = atob(base64);
       const bytes = new Uint8Array(binary.length);
       for (let i = 0; i < binary.length; i++) {
           bytes[i] = binary.charCodeAt(i);
       }
       return bytes;
   }
   ```

2. **Create `pdfGenerator.js-meta.xml`**
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
       <apiVersion>61.0</apiVersion>
       <isExposed>false</isExposed>
   </LightningComponentBundle>
   ```

3. **Update `generateDocumentAction.js`**
   - Add import: `import { generatePdfFromHtml, convertUint8ArrayToBase64 } from 'c/pdfGenerator';`
   - Remove `renderPdf`, `blobToBase64`, `uint8ArrayToBase64` methods
   - Update `processHtmlTemplate`:
     ```javascript
     const pdfBytes = await generatePdfFromHtml(html);
     this.pdfBase64 = convertUint8ArrayToBase64(pdfBytes);
     ```

4. **Update `templateEditor.js`**
   - Add import: `import { generatePdfFromHtml } from 'c/pdfGenerator';`
   - Remove `renderPdf` method
   - Update `handlePreview`:
     ```javascript
     const pdfBytes = await generatePdfFromHtml(htmlContent);
     this.previewPdfBytes = pdfBytes;
     ```

5. **Update `pdfjsViewer.js`**
   - Remove `convertPdfDataToBase64AndBlob` if it duplicates shared module logic
   - Import `convertUint8ArrayToBase64` from shared module if needed

**Testing Steps**:
- Generate PDF from record page — should work identically
- Preview PDF from template editor — should now use html2canvas, preserving styles
- Download both — should produce visually identical PDFs
- Check browser console for "library not loaded" errors

**User Experience Impact**:
- End users: Consistent preview and final output. Styled templates look correct everywhere.
- Admins: Single point of maintenance for PDF generation logic.

**AI Agent Notes**:
- This module must NOT be exposed (`isExposed=false`) — it's a utility, not a UI component
- The `finally` block ensures the temp container is always cleaned up, even on error
- Keep all html2canvas options identical to current implementation

---

## Phase 2: Security & Cleanup (Critical + High)

---

### #3: Fix XSS Vulnerability in Template Rendering

**Goal**: Escape HTML output by default. Only allow raw HTML for users with `PDF_SafeHtml` permission, and even then validate against a whitelist.

**Target Files**:
- `force-app/main/default/lwc/templateEngine/templateEngine.js`
- `force-app/main/default/lwc/templateEditor/templateEditor.js`

**Implementation Steps**:

1. **Update `formatValue` in `templateEngine.js`**
   Change the default behavior to escape HTML:
   ```javascript
   export function formatValue(value, allowHtml = false) {
       if (value === null || value === undefined) {
           return '';
       }
       if (typeof value === 'object') {
           return JSON.stringify(value);
       }
       const str = String(value);
       if (allowHtml) {
           return str;
       }
       return escapeHtml(str);
   }
   ```

2. **Update `escapeHtml`**
   The existing `escapeHtml` function is already defined in `templateEngine.js:497-507`. Verify it handles all entities:
   ```javascript
   export function escapeHtml(text) {
       if (!text) return '';
       const map = {
           '&': '&amp;',
           '<': '&lt;',
           '>': '&gt;',
           '"': '&quot;',
           "'": '&#039;'
       };
       return String(text).replace(/[&<>"']/g, m => map[m]);
   }
   ```

3. **Update `processVariables`**
   ```javascript
   export function render(template, data, allowHtml = false) {
       let result = template;
       result = processEach(result, data, allowHtml);
       result = processIf(result, data, allowHtml);
       result = processVariables(result, data, allowHtml);
       return result;
   }
   ```

4. **Update `generateDocumentAction.js` and `templateEditor.js`**
   - `generateDocumentAction.js`: Pass `allowHtml = false` to `renderTemplate` unless user has `PDF_SafeHtml` permission
   - `templateEditor.js`: Same logic for preview
   - The `hasSafeHtmlPermission` Apex method already exists — call it during component init

5. **Add HTML sanitizer option**
   If `PDF_SafeHtml` is granted, still sanitize the output to remove scripts, event handlers, and dangerous tags. Use DOMPurify (already in static resources) or a regex whitelist approach:
   ```javascript
   function sanitizeHtml(html) {
       // Remove script tags and event handlers
       return html
           .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
           .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
   }
   ```

**Testing Steps**:
- Create a template with `{{Name}}` where Name is `<script>alert('xss')</script>`
- Generate PDF — the output should show literal `<script>alert('xss')</script>` as text, not execute
- Enable `PDF_SafeHtml` permission for a test user
- As that user, the script tag should still be removed, but safe HTML like `<b>bold</b>` should render

**User Experience Impact**:
- End users: Safer. Malicious data in records cannot execute scripts in generated documents.
- Admins: Can grant `PDF_SafeHtml` for trusted power users who need HTML in templates.

**AI Agent Notes**:
- The `allowHtml` parameter defaulting to `false` is the security-critical change
- DOMPurify is already a static resource — consider loading and using it for the safeHtml path instead of a custom regex
- Update `render` function signature in all call sites

---

### #5: Restrict TinyMCE postMessage Origin

**Goal**: Prevent cross-origin message interception by validating the origin in TinyMCE iframe postMessage.

**Target Files**:
- `force-app/main/default/staticresources/TinyMCE/tinymce/js/tinymce/tinymce.html`
- `force-app/main/default/lwc/richTextEditor/richTextEditor.js`

**Implementation Steps**:

1. **Update `tinymce.html`**
   Replace `window.parent.postMessage(..., '*')` with a target origin derived from a URL parameter:
   ```javascript
   // Parse origin from URL hash or query param
   const urlParams = new URLSearchParams(window.location.search);
   const parentOrigin = urlParams.get('origin') || '*';
   
   // In the setup function:
   editor.on('Change KeyUp Undo Redo', function () {
       window.parent.postMessage(
           { type: 'EDITOR_CONTENT_UPDATE', content: editor.getContent() },
           parentOrigin
       );
   });
   
   editor.on('init', function () {
       window.parent.postMessage({ type: 'EDITOR_READY' }, parentOrigin);
   });
   ```

2. **Update `richTextEditor.js`**
   Pass the current origin as a URL parameter:
   ```javascript
   connectedCallback() {
       const origin = window.location.origin;
       this.editorURL = EDITOR + '/tinymce/js/tinymce/tinymce.html?origin=' + encodeURIComponent(origin);
       window.addEventListener('message', this.handleMessage.bind(this));
   }
   ```

3. **Validate origin in `handleMessage`**
   ```javascript
   handleMessage(event) {
       // Validate origin
       if (event.origin !== window.location.origin) {
           console.warn('Rejected postMessage from unexpected origin:', event.origin);
           return;
       }
       
       if (event.data && event.data.type) {
           switch (event.data.type) {
               case 'EDITOR_READY':
                   this.editorLoaded = true;
                   if (this._value) {
                       this.sendContentToEditor();
                   }
                   break;
               case 'EDITOR_CONTENT_UPDATE':
                   this._value = event.data.content;
                   this.dispatchEvent(new CustomEvent('change', {
                       detail: { value: this._value }
                   }));
                   break;
           }
       }
   }
   ```

4. **Update `sendContentToEditor`**
   ```javascript
   sendContentToEditor() {
       if (this.iframeElement && this.iframeElement.contentWindow && this._value !== undefined) {
           try {
               this.iframeElement.contentWindow.postMessage({
                   type: 'SET_CONTENT',
                   content: this._value
               }, window.location.origin);
           } catch (error) {
               console.error('Error sending content to editor:', error);
           }
       }
   }
   ```

**Testing Steps**:
- Open template editor. TinyMCE should load and receive initial content correctly.
- Type in TinyMCE — content should sync back to the parent component.
- In browser dev tools, verify postMessage target origin is the Salesforce domain, not `*`.
- Verify that messages from other origins are rejected.

**User Experience Impact**:
- End users: No visible change
- Admins: Improved security posture. Reduced XSS surface area.

**AI Agent Notes**:
- The `window.location.origin` approach works for most Salesforce domains but verify in Experience Cloud (Sites) where the origin may differ
- If this component is used in Experience Cloud, you may need to pass the parent origin dynamically

---

### #6: Remove Dead Code and Unused Libraries

**Goal**: Delete all unused static resources, components, and objects.

**Target Files to Delete**:
- `force-app/main/default/lwc/pdfViewerTest/` (entire folder)
- `force-app/main/default/staticresources/docxtemplater.js`
- `force-app/main/default/staticresources/docxtemplater.resource-meta.xml`
- `force-app/main/default/staticresources/pizzip.js`
- `force-app/main/default/staticresources/pizzip.resource-meta.xml`
- `force-app/main/default/staticresources/mammoth.js`
- `force-app/main/default/staticresources/mammoth.resource-meta.xml`
- `force-app/main/default/staticresources/handlebars.js`
- `force-app/main/default/staticresources/handlebars.resource-meta.xml`
- `force-app/main/default/staticresources/dompurify.js` (keep if #3 uses it)
- `force-app/main/default/staticresources/DocGenResources/DocGenResources/mammoth.js`
- `force-app/main/default/staticresources/DocGenResources/DocGenResources/html2pdf.js` (verify unused)
- `force-app/main/default/staticresources/DocGenResources/DocGenResources/mustache.min.js`
- `force-app/main/default/objects/Dynamic_Template_Variable__c/` (entire folder)
- `force-app/main/default/tabs/Dynamic_Template_Variable__c.tab-meta.xml`
- `force-app/main/default/staticresources/jspdf.js` (will be removed in #1)
- `force-app/main/default/staticresources/jspdf.resource-meta.xml`

**Files to Update**:
- `force-app/main/default/applications/DocGen.app-meta.xml` — remove `Dynamic_Template_Text__c` tab reference
- `force-app/main/default/lwc/docxtemplaterLoader/docxtemplaterLoader.js` — simplify to load only used libraries
- `force-app/main/default/lwc/templateEditor/templateEditor.js` — remove `PdfjsViewer` import if unused (check actual usage)

**Implementation Steps**:

1. **Delete unused static resources**
   - Remove all files listed above
   - Be careful with `dompurify.js` — keep it if implementing #3 with DOMPurify sanitization

2. **Delete `pdfViewerTest`**
   - Remove entire `lwc/pdfViewerTest/` directory

3. **Delete `Dynamic_Template_Variable__c`**
   - This is a deployed object. In a scratch org, you can delete the metadata folder.
   - In a production org, the object must be deleted manually or via destructive changes.
   - For the package source, remove the entire folder and tab reference.

4. **Update `DocGen.app-meta.xml`**
   ```xml
   <!-- Remove this line -->
   <tabs>Dynamic_Template_Text__c</tabs>
   ```

5. **Update `docxtemplaterLoader`**
   - Remove `loadMammoth()`, `loadDocxtemplater()`, `loadPizzip()` methods
   - Remove corresponding imports
   - Keep only: `loadHtml2canvas()`, `loadPdflib()`
   - Update polling verification to check only those two

**Testing Steps**:
- Deploy to scratch org and verify no deployment errors
- Open template editor — TinyMCE should load
- Generate a document from record page — PDF should generate
- Verify no 404 errors for deleted static resources in browser network tab
- Run Apex tests — all should pass

**User Experience Impact**:
- End users: Slightly faster page loads (fewer libraries to download)
- Admins: Cleaner package, fewer objects to manage

**AI Agent Notes**:
- When deleting an object that was deployed, you must also delete all records first or use destructive deployment
- Check `DocGenResources` bundle carefully — some files may still be referenced
- `Dynamic_Template_Text__c` tab in `DocGen.app-meta.xml` may refer to an object not even in the package — investigate

---

### #8: Add Input Validation for Template HTML

**Goal**: Strip dangerous content from template HTML before saving.

**Target Files**:
- `force-app/main/default/lwc/templateEditor/templateEditor.js`
- `force-app/main/default/lwc/templateManager/templateManager.js`

**Implementation Steps**:

1. **Create `htmlSanitizer.js` utility**
   ```javascript
   const DANGEROUS_TAGS = /<(script|iframe|object|embed|form)[\s>]/gi;
   const EVENT_HANDLERS = /\son\w+\s*=\s*["'][^"']*["']/gi;
   const JAVASCRIPT_URLS = /href\s*=\s*["']javascript:[^"']*["']/gi;

   export function sanitizeTemplateHtml(html) {
       if (!html) return '';
       return html
           .replace(DANGEROUS_TAGS, '')
           .replace(EVENT_HANDLERS, '')
           .replace(JAVASCRIPT_URLS, 'href="#"')
           .replace(/<link[^>]*>/gi, ''); // remove external stylesheet links
   }
   ```

2. **Update `templateEditor.js`**
   - Import `sanitizeTemplateHtml`
   - In `handleSave()`, sanitize before saving:
     ```javascript
     const sanitizedHtml = sanitizeTemplateHtml(this.htmlBody);
     if (sanitizedHtml !== this.htmlBody) {
         console.warn('Template HTML was sanitized for security');
         this.htmlBody = sanitizedHtml;
     }
     ```

3. **Update `templateManager.js`**
   - Same sanitization before saving in `handleSave()`

**Testing Steps**:
- Create a template with `<script>alert('xss')</script>` — should be stripped on save
- Verify that `<table>`, `<b>`, `<div>` are preserved
- Save template, reload — verify dangerous content is gone

**User Experience Impact**:
- End users: Templates are automatically cleaned of malicious content
- Admins: Reduced security risk from template injection

**AI Agent Notes**:
- This is a defense-in-depth measure. Even with #3 (output escaping), sanitizing input is best practice.
- The regex approach is simple but may have edge cases. Consider loading DOMPurify if more robust sanitization is needed.
- Be careful not to strip template syntax like `{#Contacts}` or `{{Name}}`

---

### #14: Remove Excessive Console Logging

**Goal**: Clean up debug logging for production.

**Target Files**:
- `force-app/main/default/lwc/discoveryUtils/discoveryUtils.js`
- `force-app/main/default/lwc/templateEditor/templateEditor.js`
- `force-app/main/default/lwc/templateEngine/templateEngine.js`
- `force-app/main/default/lwc/generateDocumentAction/generateDocumentAction.js`
- `force-app/main/default/classes/TemplateController.cls`

**Implementation Steps**:

1. **Create `logger.js` utility**
   ```javascript
   const DEBUG = false; // Set to true for development

   export function log(...args) {
       if (DEBUG) {
           console.log(...args);
       }
   }

   export function warn(...args) {
       if (DEBUG) {
           console.warn(...args);
       }
   }

   export function error(...args) {
       // Always log errors
       console.error(...args);
   }
   ```

2. **Replace all `console.log` with `log()`**
   - In `discoveryUtils.js`: Replace all `console.log`, `console.warn`, `console.error` with logger utility
   - In `templateEditor.js`: Same
   - In `templateEngine.js`: Same — keep warnings for unknown operators, but remove verbose collection processing logs
   - In `generateDocumentAction.js`: Same

3. **Clean up Apex debug logs**
   - In `TemplateController.cls`, remove or guard emoji-prefixed debug logs:
     ```apex
     // Remove or replace with:
     // System.debug(LoggingLevel.DEBUG, 'Received JSON: ' + payloadJson);
     ```
   - Keep error-level logs

**Testing Steps**:
- Open browser console while using the app
- Verify no debug spam during normal operations
- Verify errors are still logged
- Toggle DEBUG to true and verify logs appear

**User Experience Impact**:
- End users: Cleaner browser console (minor)
- Admins: No leaked information in production browser console

**AI Agent Notes**:
- Be careful not to remove error logs or logs inside catch blocks
- The `templateEditor.js` has especially verbose logging in `updatePreviewContainer()` and `populateContainer()` — these should all be removed or guarded
- Apex `System.debug` statements with emojis are unprofessional and should be cleaned up

---

## Phase 3: UX Improvements (High Priority)

---

### #9: Fix Preview Flow in `templateEditor`

**Goal**: Simplify preview to a single modal with clean state transitions. Remove `setTimeout` polling.

**Target Files**:
- `force-app/main/default/lwc/templateEditor/templateEditor.js`
- `force-app/main/default/lwc/templateEditor/templateEditor.html`

**Implementation Steps**:

1. **Remove `updatePreviewContainer` and `populateContainer` methods**
   - Delete `templateEditor.js:490-607`

2. **Remove `renderedCallback` preview logic**
   - Delete the `renderedCallback` override or simplify it to remove preview-related code

3. **Update `handlePreview`**
   ```javascript
   async handlePreview() {
       if (!this.sampleRecordId) {
           this.showToast('Error', 'Please enter a sample record ID for preview', 'error');
           return;
       }

       if (!this.queryPlan) {
           await this.handleDiscoverFields();
           if (!this.queryPlan) return;
       }

       this.previewLoading = true;
       this.showPreview = true;
       this.previewPdfBytes = null;

       try {
           const dataJson = await fetchData({
               recordId: this.sampleRecordId,
               queryPlanJson: JSON.stringify(this.queryPlan)
           });

           const htmlContent = await this.compileTemplate(this.htmlBody, dataJson);
           const pdfBytes = await generatePdfFromHtml(htmlContent);
           
           this.previewPdfBytes = pdfBytes;
           this.previewLoading = false;
       } catch (error) {
           this.previewLoading = false;
           this.showPreview = false;
           this.showToast('Error', 'Preview failed: ' + (error.body?.message || error.message), 'error');
       }
   }
   ```

4. **Update HTML template**
   Simplify the preview modal:
   ```html
   <template if:true={showPreview}>
       <section role="dialog" tabindex="-1" class="slds-modal slds-fade-in-open slds-modal_large">
           <div class="slds-modal__container">
               <header class="slds-modal__header">
                   <h2 class="slds-text-heading_medium">Document Preview</h2>
               </header>
               <div class="slds-modal__content slds-p-around_medium" style="min-height: 400px; max-height: 80vh; overflow-y: auto;">
                   <template if:true={previewLoading}>
                       <div class="slds-align_absolute-center" style="min-height: 300px;">
                           <lightning-spinner alternative-text="Generating preview..."></lightning-spinner>
                       </div>
                   </template>
                   <template if:false={previewLoading}>
                       <c-pdfjs-viewer pdf-bytes={previewPdfBytes} file-name={template.Name}></c-pdfjs-viewer>
                   </template>
               </div>
               <footer class="slds-modal__footer">
                   <lightning-button label="Download PDF" variant="brand" onclick={handleDownloadPreview} class="slds-m-right_small"></lightning-button>
                   <lightning-button label="Close" onclick={handleClosePreview}></lightning-button>
               </footer>
           </div>
       </section>
       <div class="slds-backdrop slds-backdrop_open"></div>
   </template>
   ```

5. **Remove duplicate spinner**
   - Remove the separate "Loading Spinner (for other operations)" block from HTML if it overlaps with the preview spinner

**Testing Steps**:
- Click Preview in template editor
- A single modal appears with a spinner
- When PDF is ready, spinner disappears and PDF viewer shows the document
- PDF should match the final output from record page generation
- Close and reopen preview — should work consistently

**User Experience Impact**:
- End users: Cleaner, more reliable preview. No more "container not found" errors.
- Admins: Fewer support tickets about broken previews.

**AI Agent Notes**:
- The key change is using `lwc:if` and component binding instead of manual DOM queries
- `previewPdfBytes` is a `@track` property — when it changes, `c-pdfjs-viewer` re-renders automatically
- Remove the fallback HTML preview — it's broken and confusing

---

### #10: Add Record Picker for Preview Sample Record

**Goal**: Replace manual record ID input with a proper record picker.

**Target Files**:
- `force-app/main/default/lwc/templateEditor/templateEditor.html`
- `force-app/main/default/lwc/templateEditor/templateEditor.js`

**Implementation Steps**:

1. **Update HTML**
   Replace the sample record input:
   ```html
   <lightning-record-picker
       label="Select Sample Record"
       object-api-name={template.Primary_Object__c}
       value={sampleRecordId}
       onchange={handleSampleRecordChange}
       placeholder="Search for a record to preview...">
   </lightning-record-picker>
   ```

2. **Update JS handler**
   ```javascript
   handleSampleRecordChange(event) {
       this.sampleRecordId = event.detail.recordId;
   }
   ```

3. **Handle empty primary object**
   If `template.Primary_Object__c` is not set, show a message instead of the record picker:
   ```html
   <template if:true={template.Primary_Object__c}>
       <lightning-record-picker ...></lightning-record-picker>
   </template>
   <template if:false={template.Primary_Object__c}>
       <p class="slds-text-color_weak">Save the template with a primary object to enable preview.</p>
   </template>
   ```

**Testing Steps**:
- Open template editor for a template with Primary Object = Account
- Record picker should show Account records
- Select a record, click Preview — should work
- For a new template without Primary Object, record picker should not appear

**User Experience Impact**:
- End users: Much easier to select a sample record. No need to copy-paste IDs.
- Admins: No more "invalid record ID" errors from users.

**AI Agent Notes**:
- `lightning-record-picker` requires API version 60.0+. Check `sfdx-project.json` for API version.
- If the org doesn't support `lightning-record-picker`, use `lightning-record-edit-form` with a lookup field instead.

---

### #11: Add Pagination to Template Manager

**Goal**: Support large template lists with search and pagination.

**Target Files**:
- `force-app/main/default/lwc/templateManager/templateManager.js`
- `force-app/main/default/lwc/templateManager/templateManager.html`
- `force-app/main/default/classes/TemplateController.cls`

**Implementation Steps**:

1. **Add new Apex method**
   ```apex
   @AuraEnabled(cacheable=true)
   public static List<Document_Template__c> searchTemplates(String searchTerm, String objectName, Integer offset, Integer limitSize) {
       try {
           String query = 'SELECT Id, Name, Primary_Object__c, Status__c, Source_Type__c, Version__c, LastModifiedDate ' +
                          'FROM Document_Template__c ';
           List<String> conditions = new List<String>();
           
           if (String.isNotBlank(searchTerm)) {
               conditions.add('Name LIKE :searchTerm');
               searchTerm = '%' + searchTerm + '%';
           }
           if (String.isNotBlank(objectName)) {
               conditions.add('Primary_Object__c = :objectName');
           }
           
           if (!conditions.isEmpty()) {
               query += 'WHERE ' + String.join(conditions, ' AND ') + ' ';
           }
           
           query += 'WITH SECURITY_ENFORCED ORDER BY LastModifiedDate DESC LIMIT :limitSize OFFSET :offset';
           return Database.query(query);
       } catch (Exception e) {
           throw new AuraHandledException(e.getMessage());
       }
   }
   ```

2. **Update `templateManager.js`**
   - Replace `@wire(getAllTemplates)` with a wired search
   - Add search input and object filter:
     ```javascript
     @track searchTerm = '';
     @track filterObject = '';
     offset = 0;
     pageSize = 25;
     
     @wire(searchTemplates, { searchTerm: '$searchTerm', objectName: '$filterObject', offset: '$offset', limitSize: '$pageSize' })
     wiredTemplates(result) { ... }
     
     handleSearchChange(event) {
         this.searchTerm = event.target.value;
         this.offset = 0;
     }
     
     handleNext() {
         this.offset += this.pageSize;
     }
     
     handlePrevious() {
         this.offset = Math.max(0, this.offset - this.pageSize);
     }
     ```

3. **Update HTML**
   Add search and filter inputs above the datatable, and pagination buttons below.

**Testing Steps**:
- Create 30+ templates
- Verify pagination works (Next/Previous buttons)
- Verify search filters by name
- Verify object filter works
- Run Apex tests

**User Experience Impact**:
- End users: Can find templates quickly even with hundreds of records.
- Admins: Better performance with large template libraries.

**AI Agent Notes**:
- `searchTerm` in SOQL uses `LIKE` with `%` — this is safe because it uses bind variables
- Consider adding an index on `Document_Template__c.Name` for performance at scale

---

### #16: Add Template Clone Functionality

**Goal**: Allow users to duplicate templates with one click.

**Target Files**:
- `force-app/main/default/classes/TemplateController.cls`
- `force-app/main/default/lwc/templateManager/templateManager.js`
- `force-app/main/default/lwc/templateManager/templateManager.html`

**Implementation Steps**:

1. **Add Apex method**
   ```apex
   @AuraEnabled
   public static Id cloneTemplate(Id templateId) {
       try {
           Document_Template__c original = [
               SELECT Name, Primary_Object__c, Html_Body__c, Source_Type__c, 
                      Renderer_Strategy__c, Allowed_Fields__c
               FROM Document_Template__c
               WHERE Id = :templateId
               WITH SECURITY_ENFORCED
               LIMIT 1
           ];
           
           Document_Template__c clone = original.clone(false, false, false, false);
           clone.Name = original.Name + ' (Copy)';
           clone.Status__c = 'Draft';
           clone.Version__c = 1;
           insert clone;
           return clone.Id;
       } catch (Exception e) {
           throw new AuraHandledException('Failed to clone template: ' + e.getMessage());
       }
   }
   ```

2. **Update `templateManager.js`**
   - Add `cloneTemplate` import
   - Add 'Clone' to row actions:
     ```javascript
     { label: 'Edit', name: 'edit' },
     { label: 'Clone', name: 'clone' },
     { label: 'Delete', name: 'delete' }
     ```
   - Add `handleClone` method:
     ```javascript
     async handleClone(template) {
         this.isLoading = true;
         try {
             const newId = await cloneTemplate({ templateId: template.Id });
             this.showToast('Success', 'Template cloned successfully', 'success');
             await refreshApex(this.wiredTemplatesResult);
         } catch (error) {
             this.showToast('Error', 'Failed to clone template: ' + error.body?.message, 'error');
         } finally {
             this.isLoading = false;
         }
     }
     ```

3. **Add test for clone**
   In `TemplateControllerTest`:
   ```apex
   @isTest
   static void testCloneTemplate() {
       Document_Template__c tmpl = [SELECT Id FROM Document_Template__c LIMIT 1];
       Id cloneId = TemplateController.cloneTemplate(tmpl.Id);
       System.assertNotEquals(tmpl.Id, cloneId);
       Document_Template__c clone = [SELECT Name, Status__c FROM Document_Template__c WHERE Id = :cloneId];
       System.assert(clone.Name.contains('Copy'));
       System.assertEquals('Draft', clone.Status__c);
   }
   ```

**Testing Steps**:
- Click Clone on a template
- Verify new template has "(Copy)" suffix, Draft status, version 1
- Verify all HTML content is copied
- Verify original template is unchanged

**User Experience Impact**:
- End users: Much faster template iteration. Common "start from existing" workflow supported.
- Admins: Users create fewer broken templates from scratch.

**AI Agent Notes**:
- The `clone(false, false, false, false)` means: no preserveId, no isDeepClone, no preserveReadonlyTimestamps, no preserveAutonumber
- We intentionally reset version to 1 and status to Draft

---

## Phase 4: Performance & Scale (Medium Priority)

---

### #12: Cache Schema Describes in TemplateService

**Goal**: Avoid repeated `Schema.getGlobalDescribe()` calls in `validateField`.

**Target Files**:
- `force-app/main/default/classes/TemplateService.cls`

**Implementation Steps**:

1. **Add static cache**
   ```apex
   public with sharing class TemplateService {
       private static final Integer MAX_SUBQUERY_ROWS = 200;
       private static final Integer MAX_RELATIONSHIP_DEPTH = 5;
       private static Map<String, Schema.SObjectType> sObjectTypeCache;
       
       private static Schema.SObjectType getSObjectTypeCached(String sObjectName) {
           if (sObjectTypeCache == null) {
               sObjectTypeCache = new Map<String, Schema.SObjectType>();
           }
           if (!sObjectTypeCache.containsKey(sObjectName)) {
               sObjectTypeCache.put(sObjectName, Schema.getGlobalDescribe().get(sObjectName));
           }
           return sObjectTypeCache.get(sObjectName);
       }
   ```

2. **Update `validateField`**
   Replace `Schema.getGlobalDescribe().get(sObjectName)` with `getSObjectTypeCached(sObjectName)`.

**Testing Steps**:
- Run existing tests — should pass
- Performance improvement is measurable only with many field validations

**User Experience Impact**:
- End users: Slightly faster template validation (negligible)
- Admins: Better governor limit compliance

---

### #13: Add Error Boundary Handling in LWC

**Goal**: Consistent error handling across all components.

**Target Files**:
- `force-app/main/default/lwc/errorUtils/errorUtils.js` (new)
- All existing LWC components

**Implementation Steps**:

1. **Create `errorUtils.js`**
   ```javascript
   export function parseError(error) {
       let message = 'An unexpected error occurred';
       if (error.body && error.body.message) {
           message = error.body.message;
       } else if (error.message) {
           message = error.message;
       } else if (typeof error === 'string') {
           message = error;
       }
       return message;
   }

   export function handleAsyncError(component, error, toastTitle = 'Error') {
       const message = parseError(error);
       component.dispatchEvent(new ShowToastEvent({
           title: toastTitle,
           message: message,
           variant: 'error'
       }));
       return message;
   }
   ```

2. **Update components**
   In each component, replace error handling with:
   ```javascript
   import { parseError, handleAsyncError } from 'c/errorUtils';
   
   // Instead of:
   this.showToast('Error', error.body?.message || error.message, 'error');
   
   // Use:
   handleAsyncError(this, error, 'Failed to load templates');
   ```

**Testing Steps**:
- Trigger errors in each component (e.g., invalid record ID, missing template)
- Verify toast messages are user-friendly
- Verify console still shows full error details

**User Experience Impact**:
- End users: Consistent, clear error messages
- Admins: Easier to diagnose issues from user reports

---

### #15: Consolidate Library Loading

**Goal**: Load only required libraries on demand.

**Target Files**:
- `force-app/main/default/lwc/pdfGenerator/pdfGenerator.js` (from #7)
- `force-app/main/default/lwc/docxtemplaterLoader/docxtemplaterLoader.js`

**Implementation Steps**:

1. **Move library loading into `pdfGenerator`**
   ```javascript
   import { loadScript } from 'lightning/platformResourceLoader';
   import HTML2CANVAS from '@salesforce/resourceUrl/html2canvas';
   import PDFLIB from '@salesforce/resourceUrl/pdflib';

   let html2canvasLoaded = false;
   let pdflibLoaded = false;

   async function ensureLibrariesLoaded() {
       const promises = [];
       if (!html2canvasLoaded) {
           promises.push(loadScript(null, HTML2CANVAS).then(() => { html2canvasLoaded = true; }));
       }
       if (!pdflibLoaded) {
           promises.push(loadScript(null, PDFLIB).then(() => { pdflibLoaded = true; }));
       }
       await Promise.all(promises);
   }
   ```
   Note: `loadScript` requires a component reference as first param. The shared module can't call it directly unless passed a component.

2. **Alternative: Keep loader in a component, but simplify**
   Update `docxtemplaterLoader` to only load html2canvas and pdf-lib.
   Remove unused event dispatches.

3. **Remove `docxtemplaterLoader` from app entirely**
   If the PDF generator module handles its own lazy loading, `docxtemplaterLoader` may be removable.

**Testing Steps**:
- Clear browser cache
- Open app — verify only necessary scripts load
- Generate PDF — verify html2canvas and pdf-lib load on first use

**User Experience Impact**:
- End users: Faster initial page load
- Admins: Fewer static resources to manage

---

## Phase 5: Advanced Features (Low Priority / Future)

---

### #17: Improve PDF Preview in `generateDocumentAction`

**Goal**: Use `c-pdfjs-viewer` instead of raw data URL iframe.

**Target Files**:
- `force-app/main/default/lwc/generateDocumentAction/generateDocumentAction.html`
- `force-app/main/default/lwc/generateDocumentAction/generateDocumentAction.js`

**Implementation Steps**:

1. **Update HTML**
   Replace the iframe:
   ```html
   <template if:true={showPreview}>
       <c-pdfjs-viewer pdf-bytes={pdfBytes} file-name={fileName}></c-pdfjs-viewer>
   </template>
   ```

2. **Update JS**
   - Add `pdfBytes` tracked property
   - In `handleGenerate`, store `pdfBytes` (Uint8Array) from `generatePdfFromHtml`
   - Remove `pdfUrl` and `pdfBase64` properties (or keep pdfBase64 only for save)

**Testing Steps**:
- Generate PDF — should show in pdfjs viewer with page navigation, zoom
- Verify download still works

---

### #18: Add Template Categories/Tags

**Goal**: Organize templates with categories.

**Target Files**:
- `force-app/main/default/objects/Document_Template__c/fields/Category__c.field-meta.xml` (new)
- `force-app/main/default/classes/TemplateController.cls`
- `force-app/main/default/lwc/templateManager/templateManager.js`

**Implementation Steps**:

1. **Add custom field**
   Create `Category__c` as Picklist or Text field on `Document_Template__c`.

2. **Update Apex**
   Add `Category__c` to queries and `searchTemplates` method.

3. **Update UI**
   Add category filter dropdown and display column in template manager.

---

### #19: Add Document Usage Dashboard

**Goal**: Analytics on template usage.

**Target Files**:
- `force-app/main/default/reports/` (new folder)
- `force-app/main/default/dashboards/` (new folder)

**Implementation Steps**:

1. **Create report type**
   Report type on `Document__c` with `Document_Template__c` as related object.

2. **Create reports**
   - Documents by Template
   - Documents by Status
   - Documents by User (Last Modified By)
   - Documents by Month

3. **Create dashboard**
   Add charts for the above reports.

---

## Appendix: Salesforce Development Best Practices

### Apex
- Always use `WITH SECURITY_ENFORCED` in SOQL
- Always check CRUD with `Schema.sObjectType.X.isCreateable()` before DML
- Always use bind variables (`:variable`) in dynamic SOQL
- Keep methods focused and under 50 lines where possible
- Use `AuraHandledException` for `@AuraEnabled` methods
- Never log sensitive data (record IDs in debug are acceptable; passwords, tokens are not)

### LWC
- Use `lwc:if`/`lwc:elseif`/`lwc:else` instead of `if:true`/`if:false` (API 58+)
- Use `@wire` for cached data, imperative Apex for mutations
- Never use `innerHTML` on user-provided content without sanitization
- Use `lightning-*` base components instead of custom markup where possible
- Always handle async errors with try-catch
- Remove all `console.log` before production (or use a guarded logger)

### Security
- Strip HTML from user input before saving
- Escape output by default; allow raw HTML only with explicit permission
- Validate all Apex parameters
- Use permission sets, not profile modifications
- Check FLS before querying fields

### Testing
- Target 90% test coverage
- Test positive paths, negative paths, and exception handling
- Use `@TestSetup` for shared data
- Use `System.runAs` for permission-specific tests
- Test governor limit compliance with bulk data where relevant

### UX
- Use `lightning-record-picker` instead of manual ID inputs
- Show clear loading states for async operations
- Provide helpful error messages, not raw exceptions
- Use SLDS spacing and layout utilities consistently
- Ensure modals have proper ARIA attributes
- Test on mobile form factors

---

*Implementation plan generated 2026-04-24. Covers 20 recommendations across 5 phases.*
