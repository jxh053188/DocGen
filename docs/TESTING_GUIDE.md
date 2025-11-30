# DocGen - Testing Guide

## 🧪 Complete Testing Checklist

### Prerequisites
- ✅ All components deployed successfully
- ✅ Permission set assigned (PDF_Admin recommended)
- ✅ Template Layout flexipage configured
- ✅ Quick action added to target object (e.g., Account)

---

## Test 1: Create Word Template via Template Manager

### Steps:
1. Navigate to **Templates** tab
2. Click **New Template**
3. Fill in:
   - **Template Name:** Test Word Template
   - **Primary Object:** Account
   - **Source Type:** Word
   - **Status:** Draft
4. Click **Save**

### Expected Result:
- Template record created
- File upload section appears
- HTML editor is hidden

---

## Test 2: Upload DOCX File

### Steps:
1. In the template record, you should see the **templateManager** component
2. Click **Choose Word File** button
3. Select a `.docx` file with docxtemplater syntax:
   ```
   Account Name: {Name}
   Phone: {Phone}
   Owner: {Owner.Name}
   
   Opportunities:
   {#Opportunities}
   - {Name} ({StageName}): {Amount}
   {/Opportunities}
   ```
4. File should be validated (max 10MB, .docx only)
5. Click **Save Template** again

### Expected Result:
- File name appears: "✓ File ready: [filename].docx"
- Save successful
- File uploaded to ContentVersion
- Template record updated

---

## Test 3: View Template in Template Editor

### Steps:
1. Navigate to the Template record page
2. The **templateEditor** component should load
3. For Word templates, you should see:
   - **Word Template File** section (not HTML editor)
   - File name displayed with delete button
   - Template Info showing "Source Type: Word"

### Expected Result:
- File info displayed correctly
- No HTML editor visible
- Source Type shown in Template Info

---

## Test 4: Discover Fields from Word Template

### Steps:
1. In **templateEditor**, click **Discover Fields**
2. System should:
   - Extract text from DOCX file
   - Parse docxtemplater syntax
   - Discover scalar fields (e.g., `Name`, `Phone`, `Owner.Name`)
   - Discover collections (e.g., `Opportunities`)

### Expected Result:
- "Fields discovered successfully" toast
- Discovered Fields table shows:
  - Type: Scalar, Path: Name
  - Type: Scalar, Path: Phone
  - Type: Scalar, Path: Owner.Name
  - Type: Collection, Path: Opportunities, Fields: Name, StageName, Amount

---

## Test 5: Preview Word Template

### Steps:
1. In **templateEditor**, enter a **Sample Record ID** (e.g., an Account ID)
2. Click **Preview**
3. System should:
   - Fetch DOCX file from ContentVersion
   - Process with docxtemplater
   - Convert to HTML using docx-preview
   - Display in preview modal

### Expected Result:
- Preview modal opens
- HTML shows populated data from the record
- Word formatting preserved (if possible)
- No errors in browser console

---

## Test 6: Generate PDF from Record (Word Template)

### Steps:
1. Open an **Account** record
2. Click **Generate Document** quick action
3. Select your Word template from dropdown
4. Click **Generate Preview**
5. System should:
   - Load DOCX libraries (pizzip, docxtemplater, docx-preview)
   - Fetch DOCX file
   - Extract text for field discovery
   - Build query plan
   - Fetch data
   - Process DOCX with data
   - Convert to HTML
   - Render PDF with html2pdf.js

### Expected Result:
- PDF preview displays in iframe
- All fields populated correctly
- Word formatting preserved
- No console errors

---

## Test 7: Save Generated PDF

### Steps:
1. After preview (from Test 6)
2. Click **Save & Attach**
3. System should:
   - Generate PDF blob
   - Upload to ContentVersion
   - Link to Account record
   - Log to Document__c

### Expected Result:
- Success toast: "PDF saved and attached successfully"
- File appears in **Files** related list on Account
- Document__c record created with status "Saved"

---

## Test 8: HTML Template Workflow (Comparison)

### Steps:
1. Create a new template with **Source Type: HTML**
2. Enter HTML directly in the textarea
3. Use docxtemplater syntax: `{Name}`, `{#Opportunities}{StageName}{/Opportunities}`
4. Discover fields
5. Preview
6. Generate PDF

### Expected Result:
- HTML editor visible (not file upload)
- All features work the same as Word templates
- PDF generation works correctly

---

## Test 9: Delete Word Template File

### Steps:
1. In **templateEditor** for a Word template
2. Click the **delete icon** next to the file name
3. Confirm deletion

### Expected Result:
- File deleted from ContentVersion
- File info section disappears
- Upload section appears again
- Success toast displayed

---

## Test 10: Replace Word Template File

### Steps:
1. Delete existing file (Test 9)
2. Upload a new DOCX file
3. Save template

### Expected Result:
- New file uploaded successfully
- Old file removed
- New file name displayed

---

## 🐛 Common Issues & Troubleshooting

### Issue: "DOCX libraries not loaded"
**Solution:** Check browser console for loadScript errors. Libraries should load automatically for Word templates.

### Issue: "No DOCX file found"
**Solution:** Verify file was uploaded successfully. Check ContentVersion records linked to template.

### Issue: "Field discovery fails"
**Solution:** Ensure DOCX contains valid docxtemplater syntax. Check browser console for extraction errors.

### Issue: "Preview shows blank"
**Solution:** 
- Verify sample record ID is correct
- Check that all fields in template are accessible (FLS)
- Check browser console for errors

### Issue: "PDF generation fails"
**Solution:**
- Verify html2pdf.js loaded successfully
- Check browser console for errors
- Ensure template has valid syntax

---

## ✅ Success Criteria

All tests should pass with:
- ✅ No JavaScript errors in console
- ✅ All UI elements render correctly
- ✅ Data populates correctly in templates
- ✅ PDFs generate and save successfully
- ✅ Files appear in related lists
- ✅ Document__c records created

---

## 📝 Test Data Examples

### Sample Word Template Content:
```
Account Overview

Account Name: {Name}
Phone: {Phone}
Website: {Website}
Owner: {Owner.Name}

Active Opportunities:
{#Opportunities where StageName != 'Closed Won'}
- {Name} ({StageName}): ${Amount}
{/Opportunities}

Total Opportunities: {Opportunities.length}
```

### Sample HTML Template:
```html
<h1>Account: {Name}</h1>
<p>Phone: {Phone}</p>
<p>Owner: {Owner.Name}</p>

<h2>Opportunities</h2>
{#Opportunities}
  <p>{Name} - {StageName} - ${Amount}</p>
{/Opportunities}
```

---

## 🎯 Next Steps After Testing

1. Create production templates for your use cases
2. Configure page layouts for all target objects
3. Assign appropriate permission sets to users
4. Train users on template creation and PDF generation
5. Monitor Document__c records for usage analytics

