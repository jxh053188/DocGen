# DocuSign Integration Implementation Plan

## Goal

Add DocuSign eSignature for Salesforce (Apex Toolkit) as an optional post-generation step. After a PDF is generated from Salesforce data, users can choose to attach it to a DocuSign envelope for signing, configure signatories, and receive native write-back status updates when the envelope completes.

---

## High-Level Flow

```
Template + Record Data
        |
        v
[Client-side PDF Generation] (existing)
        |
        v
   ContentVersion (existing)
        |
        v
+-------+-------+
|               |
v               v
Save Only    Send for Signature
(existing)     (new)
               |
               v
      [DocuSign Envelope]
               |
               v
      Signatories sign
      (DocuSign website)
               |
               v
      [DocuSign Connect]
      (Apex REST callback)
               |
               v
      Status written back
      to Document__c
```

---

## Data Model Extensions

### Document_Template__c (new fields)

| Field | Type | Purpose |
|-------|------|---------|
| `DocuSign_Template_Id__c` | Text(100) | Maps to DocuSign template GUID for pre-placed tabs |
| `DocuSign_Role_Mappings__c` | Long Text Area | JSON mapping of template roles to Salesforce field paths, e.g. `[{"role":"Signer1","contactField":"Primary_Contact__c"}]` |
| `Enable_DocuSign__c` | Checkbox | Whether this template supports sending for signature |
| `DocuSign_Email_Subject__c` | Text(255) | Default email subject for the envelope |
| `DocuSign_Email_Body__c` | Long Text Area | Default email body for signers |
| `DocuSign_Anchor_Tags__c` | Long Text Area | Optional anchor tag definitions for in-template placement (e.g. `{"signHere":"/s1/","dateSigned":"/d1/"}`) |

### Document__c (new fields)

| Field | Type | Purpose |
|-------|------|---------|
| `Envelope_Id__c` | Text(100) | DocuSign envelope ID (external key) |
| `DocuSign_Status__c` | Picklist | `Created`, `Sent`, `Delivered`, `Signed`, `Completed`, `Declined`, `Voided` |
| `DocuSign_Sent_Date__c` | DateTime | When envelope was sent |
| `DocuSign_Completed_Date__c` | DateTime | When all recipients finished signing |
| `DocuSign_Declined_Reason__c` | Text(255) | Reason if envelope declined |
| `Signed_Content_Version__c` | Lookup(ContentVersion) | Final signed PDF returned by DocuSign |
| `DocuSign_Error__c` | Long Text Area | Last error from DocuSign API |
| `Recipient_JSON__c` | Long Text Area | Snapshot of recipients sent to DocuSign |

Update `Status__c` picklist to include: `Sent for Signature`.

### DocuSign_Settings__c (new Custom Settings — Org Default)

| Field | Type | Purpose |
|-------|------|---------|
| `Account_Id__c` | Text(100) | DocuSign account GUID |
| `Default_Email_Subject__c` | Text(255) | Fallback subject line |
| `Default_Email_Body__c` | Long Text Area | Fallback email body |
| `Connect_Enabled__c` | Checkbox | Whether Connect callback is active |
| `Debug_Logging__c` | Checkbox | Log API request/response bodies |
| `Enable_Chunked_Signing__c` | Checkbox | Allow envelope creation without immediate send |

### New Custom Object: DocuSign_Recipient__c (child of Document__c)

Stores per-recipient state for visibility and tracking.

| Field | Type | Purpose |
|-------|------|---------|
| `Document__c` | Master-Detail | Parent document log |
| `Role_Name__c` | Text(100) | DocuSign role name |
| `Recipient_Type__c` | Picklist | `Signer`, `CarbonCopy`, `InPersonSigner` |
| `Email__c` | Email | Signer email |
| `Name__c` | Text(255) | Signer name |
| `Salesforce_Record_Id__c` | Text(18) | Linked Contact/Lead/User record |
| `Routing_Order__c` | Number | Signing sequence |
| `Status__c` | Picklist | `Created`, `Sent`, `Delivered`, `Signed`, `Declined` |
| `Signed_Date_Time__c` | DateTime | When this recipient signed |
| `Tab_Labels__c` | Long Text Area | JSON of tabs assigned to this recipient |

---

## Apex Architecture

### New Classes

#### 1. `DocuSignService.cls`

Central service wrapper around the DocuSign Apex Toolkit (`dfsle` namespace). All DocuSign API interactions go through here.

**Public Methods:**

```apex
public static dfsle.Envelope createEnvelope(Id contentVersionId, Id templateId, Id recordId)
public static dfsle.Envelope sendEnvelope(String envelopeId)
public static void voidEnvelope(String envelopeId, String reason)
public static dfsle.Recipient[] buildRecipientsFromTemplate(Id templateId, Id recordId)
public static dfsle.Recipient[] buildRecipientsFromJson(String recipientJson, Id recordId)
```

**Implementation Notes:**
- Use `dfsle.EnvelopeService.getEmptyEnvelope(new dfsle.Entity(recordId))` as starting point.
- Add the generated PDF via `dfsle.Document.fromContentVersion(cv.Id, ...)`.
- If `DocuSign_Template_Id__c` is populated, merge with `dfsle.Template.fromId()` and apply tabs.
- Otherwise, use anchor tags from `DocuSign_Anchor_Tags__c` or manual tab placement.

#### 2. `DocuSignRecipientBuilder.cls`

Builds `dfsle.Recipient` objects from Salesforce record data.

**Public Methods:**

```apex
public static dfsle.Recipient[] buildFromRoleMappings(Document_Template__c template, SObject record)
```

**Logic:**
1. Parse `DocuSign_Role_Mappings__c` JSON.
2. For each role, resolve the Salesforce field path to a Contact/Lead/User record.
3. Construct `dfsle.Recipient.withRole(roleName).withName(...).withEmail(...)`.
4. Support fallback to record owner or default contact if primary field is empty.

#### 3. `DocuSignConnectCallback.cls` (Apex REST)

Receives DocuSign Connect push notifications.

```apex
@RestResource(urlMapping='/DocuSignConnect/*')
global with sharing class DocuSignConnectCallback {
    @HttpPost
    global static void handleNotification() { ... }
}
```

**Responsibilities:**
- Parse DocuSign XML notification (envelope status, recipient statuses, document bytes).
- Update `Document__c` status fields.
- If completed, create a new `ContentVersion` with the signed PDF and link it back via `Signed_Content_Version__c`.
- Log any processing errors to `DocuSign_Error__c`.

**Security:**
- Validate `X-DocuSign-Signature` header (HMAC-SHA256 with Connect secret).
- Verify envelope ID exists in our `Document__c` records before processing.

#### 4. `DocuSignStatusSync.cls`

Polling fallback if Connect push is not available (e.g., some sandbox configs).

**Public Methods:**
```apex
@future(callout=true)
public static void syncEnvelopeStatus(Set<Id> documentIds)
```

Queries DocuSign for envelope statuses not yet completed and updates records.

#### 5. `DocuSignController.cls` (AuraEnabled for LWC)

LWC-facing controller for DocuSign actions.

```apex
@AuraEnabled
public static DocuSignResult sendForSignature(Id documentLogId, String recipientOverridesJson)

@AuraEnabled
public static DocuSignResult resendEnvelope(Id documentLogId)

@AuraEnabled
public static DocuSignResult voidEnvelope(Id documentLogId, String reason)

@AuraEnabled(cacheable=true)
public static RecipientInfo[] getTemplateRecipients(Id templateId, Id recordId)
```

#### 6. `DocuSignResult.cls` (inner or separate)

Serializable DTO for LWC communication:
```apex
public class DocuSignResult {
    public Boolean success;
    public String envelopeId;
    public String errorMessage;
    public String status;
}
```

#### 7. `DocuSignSettings.cls`

Helper to read `DocuSign_Settings__c` org defaults with sensible fallbacks.

---

## Lightning Web Component Changes

### 1. `generateDocumentAction` (extension)

**Current flow:** Select Template -> Preview PDF -> Save/Download

**New flow:** Select Template -> Preview PDF -> Save / Download / Send for Signature

**HTML changes:**
- Add "Send for Signature" button in the preview step (only if `template.Enable_DocuSign__c` is true and user has `PDF_DocuSign_Send` custom permission).
- When clicked, open a new sub-step/modal for recipient confirmation.

**New step: `signatories`**
- Display recipients resolved from `DocuSign_Role_Mappings__c` in an editable datatable.
- Allow user to override name, email, and routing order before sending.
- Show email subject/body with ability to edit.
- "Send" button calls `DocuSignController.sendForSignature()`.

**JS additions:**
```javascript
@track showSignatories = false;
@track recipients = [];
@track emailSubject = '';
@track emailBody = '';

async handleSendForSignature() {
    // 1. Save PDF first (re-use handleSave logic to ensure ContentVersion exists)
    // 2. Call Apex to get resolved recipients
    // 3. Show recipient confirmation modal
}

async confirmSend() {
    // Call DocuSignController.sendForSignature
    // On success: show toast, update Document__c status, close action
}
```

### 2. `docuSignStatusBadge` (new component)

Small LWC for record pages showing DocuSign envelope status.

- Displays colored badge: `Sent` (blue), `Delivered` (orange), `Completed` (green), `Declined` (red).
- Links to DocuSign envelope if available.
- Shows signing progress (e.g. "2 of 3 signed").

### 3. `docuSignRecipientCard` (new component)

Used within the signatories step of `generateDocumentAction`.

- Shows recipient name, email, role, routing order.
- Inline editing for email/name overrides.
- Icon indicators for recipient type (Signer, CC).

### 4. `templateEditor` (extension)

**New section: "DocuSign Settings"** (collapsible card)

- Toggle: `Enable DocuSign for this template`
- Input: `DocuSign Template Id` (text)
- Textarea: `Role Mappings JSON` with inline validation/helper
- Textarea: `Anchor Tags JSON` with helper examples
- Input: `Default Email Subject`
- Textarea: `Default Email Body`
- "Test Role Resolution" button: resolves recipients against a sample record and shows preview.

### 5. `docuSignConnectSetup` (new component)

Admin-only component for the DocGen app settings page.

- Shows Connect callback URL (org-specific REST endpoint).
- Copy-to-clipboard button.
- Shows validation status (whether Connect secret is configured).
- Debug log viewer for recent Connect payloads.

---

## Permission Model

Align with existing DocGen permission sets:

| Permission | Admin | Generator | Template Editor |
|------------|-------|-----------|-----------------|
| `PDF_DocuSign_Send` | Yes | Yes | No |
| `PDF_DocuSign_Configure` | Yes | No | Yes |
| `PDF_DocuSign_View_Status` | Yes | Yes | Yes |
| `PDF_DocuSign_Admin` | Yes | No | No |

**New Permission Sets field permissions:**
- Grant FLS on all new `Document_Template__c` DocuSign fields to Template Editor and Admin.
- Grant FLS on all new `Document__c` DocuSign fields to all three sets.
- Grant object CRUD on `DocuSign_Recipient__c` to Admin and Generator.

---

## Document Flow States (updated)

```
Document__c.Status__c values:
- Previewed       -> User viewed PDF
- Saved           -> PDF saved to Files
- Sent for Signature -> PDF attached to DocuSign envelope and sent
- Signed          -> All recipients completed (written back via Connect)
- Failed          -> Generation or DocuSign API failure
```

When `Send for Signature` is chosen:
1. Save PDF to `ContentVersion` (existing logic).
2. Insert `Document__c` with `Status__c = 'Saved'`.
3. Call DocuSign API: create envelope with PDF + recipients.
4. Update `Document__c`:
   - `Status__c = 'Sent for Signature'`
   - `Envelope_Id__c = <envelopeId>`
   - `DocuSign_Status__c = 'Sent'`
   - `DocuSign_Sent_Date__c = now`
5. Insert `DocuSign_Recipient__c` records for each signer.

When DocuSign Connect POSTs completion:
1. Find `Document__c` by `Envelope_Id__c`.
2. Update `DocuSign_Status__c = 'Completed'`.
3. Update `DocuSign_Completed_Date__c`.
4. Extract signed PDF bytes from Connect payload, create `ContentVersion`.
5. Update `Signed_Content_Version__c`.
6. Update `Status__c = 'Signed'`.

---

## Security Considerations

1. **CRUD/FLS**: Before every DocuSign API call, verify the running user has access to `Document__c`, `Document_Template__c`, and `ContentVersion`.
2. **Sharing**: `DocuSignConnectCallback` must be `with sharing` and verify the integration user context has row-level access.
3. **Connect Secret**: Store HMAC secret in a Protected Custom Setting or Named Credential (if supported by DocuSign package) — never in code.
4. **Input Validation**: Sanitize all JSON payloads (role mappings, anchor tags) before parsing. Reject unexpected keys.
5. **SOQL Injection**: When resolving role mappings to record fields, use the existing `SecurityService.validateField()` pattern — no dynamic SOQL concatenation.
6. **XSS**: DocuSign email subject/body should be HTML-escaped before display in LWC. Do not allow script tags in template metadata.

---

## Error Handling & Retry Strategy

| Failure Mode | Behavior |
|--------------|----------|
| DocuSign API unavailable | Log to `DocuSign_Error__c`, show user-friendly toast, keep `Document__c` in `Failed` state |
| Invalid recipient email | Pre-send validation in LWC (regex), fallback to record owner email |
| Envelope voided by sender | User clicks "Void Envelope" action; updates DocuSign and local status |
| Connect callback missed | Scheduled job (hourly) calls `DocuSignStatusSync.syncEnvelopeStatus()` for envelopes in `Sent`/`Delivered` older than 1 hour |
| Duplicate Connect payload | EnvelopeId + Status combination idempotency check before DML |
| Large signed PDF in Connect payload | Stream bytes directly to ContentVersion; if > 35MB, store URL reference instead |

---

## Testing Strategy

### Apex Tests (minimum 75% coverage)

1. `DocuSignServiceTest`
   - Mock `dfsle` calls using `Test.setMock(HttpCalloutMock.class, ...)` where possible, or stub wrapper if Toolkit doesn't support mocking.
   - Test envelope creation with and without DocuSign template ID.
   - Test recipient resolution from role mappings.
   - Test error paths (missing content version, invalid template ID).

2. `DocuSignRecipientBuilderTest`
   - Test role mapping JSON parsing.
   - Test field path resolution to Contact/Lead/User.
   - Test fallback behavior.

3. `DocuSignConnectCallbackTest`
   - POST with valid envelope XML: verify Document__c updated.
   - POST with invalid signature: verify 401 response and no DML.
   - POST with duplicate completion: verify idempotent update.
   - POST with signed PDF: verify ContentVersion created.

4. `DocuSignControllerTest`
   - Test `sendForSignature` with valid data.
   - Test permission enforcement (user without `PDF_DocuSign_Send` gets error).
   - Test recipient override JSON parsing.

### LWC Tests

1. `generateDocumentAction`:
   - "Send for Signature" button visible only when enabled and permitted.
   - Recipient confirmation modal renders resolved recipients.
   - Success toast shown after send.

2. `docuSignStatusBadge`:
   - Badge color changes with status prop.
   - Link generation correct for sandbox vs production.

---

## Deployment & Configuration

### Prerequisites

1. DocuSign eSignature for Salesforce managed package installed in target org.
2. DocuSign account connected via the managed package setup wizard.
3. Connect webhook configured with the Salesforce REST endpoint URL.

### Post-Deploy Steps

1. Assign `PDF_DocuSign_*` custom permissions to appropriate users.
2. Populate `DocuSign_Settings__c` org defaults.
3. Configure DocuSign Connect in the DocuSign web console:
   - URL: `https://<instance>.salesforce.com/services/apexrest/DocuSignConnect/v1/`
   - Enable event types: `Envelope Sent`, `Envelope Delivered`, `Envelope Completed`, `Envelope Declined`, `Recipient Signed`
   - Set HMAC secret and copy it into `DocuSign_Settings__c.Connect_Secret__c`.
4. Add `docuSignStatusBadge` to relevant Lightning record pages (Opportunity, Contact, Account).

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

| Task | Files | Effort |
|------|-------|--------|
| Create custom settings + fields | `DocuSign_Settings__c`, `Document_Template__c` fields, `Document__c` fields | Small |
| Create `DocuSign_Recipient__c` object | Object + fields + layout | Small |
| Build `DocuSignSettings` helper | `DocuSignSettings.cls` | Small |
| Build `DocuSignService` skeleton | `DocuSignService.cls` | Medium |
| Build `DocuSignRecipientBuilder` | `DocuSignRecipientBuilder.cls` | Medium |
| Add CRUD checks to `DocumentService` | `DocumentService.cls` (see Arch Review #4) | Small |

### Phase 2: Core Sending Flow (Week 2)

| Task | Files | Effort |
|------|-------|--------|
| Build `DocuSignController` | `DocuSignController.cls` | Medium |
| Extend `generateDocumentAction` UI | `generateDocumentAction.html/js` | Medium |
| Build `docuSignRecipientCard` | New LWC | Small |
| Build `docuSignStatusBadge` | New LWC | Small |
| Wire save-then-send logic | `generateDocumentAction.js` | Medium |
| Add permission sets fields | Permission set metadata | Small |

### Phase 3: Connect Write-Back (Week 3)

| Task | Files | Effort |
|------|-------|--------|
| Build `DocuSignConnectCallback` | `DocuSignConnectCallback.cls` | Medium |
| Build `DocuSignStatusSync` (polling fallback) | `DocuSignStatusSync.cls` | Small |
| Parse signed PDF from Connect payload | `DocuSignConnectCallback.cls` | Medium |
| Security: HMAC validation | `DocuSignConnectCallback.cls` | Small |
| Add admin setup component | `docuSignConnectSetup` LWC | Small |

### Phase 4: Template Editor Integration (Week 4)

| Task | Files | Effort |
|------|-------|--------|
| Add DocuSign section to `templateEditor` | `templateEditor.html/js` | Medium |
| Role mapping JSON validator | Client-side + Apex | Small |
| "Test Role Resolution" preview | `templateEditor.js` | Small |
| Anchor tag helper UI | `templateEditor.html` | Small |

### Phase 5: Testing & Hardening (Week 5)

| Task | Files | Effort |
|------|-------|--------|
| Apex test classes | `DocuSignServiceTest`, `DocuSignConnectCallbackTest`, etc. | Medium |
| LWC Jest tests | `generateDocumentAction`, `docuSignStatusBadge` | Medium |
| Security review (FLS/CRUD/XSS) | All new files | Small |
| End-to-end test in sandbox | Manual | Small |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| DocuSign Apex Toolkit (`dfsle`) not available in scratch orgs | High | Require managed package installation in scratch org definition; document prerequisite clearly |
| Connect callback URL changes per sandbox/prod | Medium | Use `URL.getSalesforceBaseUrl()` dynamically; admin component displays current URL |
| Large signed PDFs in Connect payload hit heap limits | Medium | Stream to ContentVersion in chunks; fallback to async document retrieval via API if > 10MB |
| DocuSign API rate limits | Low | Batch status sync into small chunks; use Connect as primary, polling as fallback only |
| Multi-currency / multi-language email templates | Low | Use existing `DocumentService.getUserLocale/getUserCurrencyCode` for personalization |
| Recipient role mapping JSON becomes complex | Medium | Provide UI builder in Phase 4 instead of raw JSON; start with simple field paths |

---

## Open Questions

1. Should the signed PDF replace the original ContentDocumentLink, or remain as a separate file?
   - **Recommendation**: Create a new `ContentVersion` and update `Signed_Content_Version__c`. Keep original for audit trail.

2. Should envelope creation and send be separate actions (draft vs. immediate send)?
   - **Recommendation**: Start with immediate send (simpler UX). Add `Enable_Chunked_Signing__c` setting for draft mode later.

3. Do we need to support in-person signing (signing on a device)?
   - **Recommendation**: Design `DocuSign_Recipient__c.Recipient_Type__c` with `InPersonSigner` value. Implement in Phase 2 if needed, else Phase 5.

4. Should we support DocuSign template merging (pre-placed fields) or only anchor tags?
   - **Recommendation**: Support both. Use `DocuSign_Template_Id__c` for pre-placed; fallback to `DocuSign_Anchor_Tags__c` for dynamic placement.

---

## Files to Create/Modify Summary

### New Files
- `classes/DocuSignService.cls`
- `classes/DocuSignService.cls-meta.xml`
- `classes/DocuSignRecipientBuilder.cls`
- `classes/DocuSignRecipientBuilder.cls-meta.xml`
- `classes/DocuSignConnectCallback.cls`
- `classes/DocuSignConnectCallback.cls-meta.xml`
- `classes/DocuSignStatusSync.cls`
- `classes/DocuSignStatusSync.cls-meta.xml`
- `classes/DocuSignController.cls`
- `classes/DocuSignController.cls-meta.xml`
- `classes/DocuSignSettings.cls`
- `classes/DocuSignSettings.cls-meta.xml`
- `classes/DocuSignResult.cls`
- `classes/DocuSignResult.cls-meta.xml`
- `classes/DocuSignServiceTest.cls`
- `classes/DocuSignConnectCallbackTest.cls`
- `classes/DocuSignControllerTest.cls`
- `classes/DocuSignRecipientBuilderTest.cls`
- `lwc/docuSignStatusBadge/`
- `lwc/docuSignRecipientCard/`
- `lwc/docuSignConnectSetup/`
- `objects/DocuSign_Recipient__c/`
- `objects/DocuSign_Settings__c/`

### Modified Files
- `classes/DocumentService.cls` (add CRUD checks, new overload for DocuSign path)
- `lwc/generateDocumentAction/generateDocumentAction.js`
- `lwc/generateDocumentAction/generateDocumentAction.html`
- `lwc/templateEditor/templateEditor.js`
- `lwc/templateEditor/templateEditor.html`
- `objects/Document_Template__c/fields/*.field-meta.xml` (6 new fields)
- `objects/Document__c/fields/*.field-meta.xml` (7 new fields)
- `permissionsets/PDF_Admin.permissionset-meta.xml`
- `permissionsets/PDF_Generator.permissionset-meta.xml`
- `permissionsets/PDF_Template_Editor.permissionset-meta.xml`

---

*Plan created 2026-04-24 based on Architecture Review outputs and current codebase state on branch `remove-doc-x-support`.*
