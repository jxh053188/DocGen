# Permission Set Audit - Required Fields

## Issue
Salesforce does not allow field-level permissions to be set on **required fields** in permission sets. Attempting to deploy permission sets with required field permissions results in:

```
Error: You cannot deploy to a required field: [ObjectName].[FieldName]
```

## All Required Fields Identified

### Document_Template__c
- ✅ `Primary_Object__c` - `<required>true</required>`

### Dynamic_Template_Variable__c  
- ✅ `Template__c` - MasterDetail (always required)
- ✅ `Path__c` - `<required>true</required>`

### Document__c
- ✅ `Template__c` - Lookup with `<required>true</required>`
- ✅ `Target_Record_Id__c` - `<required>true</required>`

## Actions Taken

### Removed from PDF_Admin Permission Set
- ❌ `Document_Template__c.Primary_Object__c`
- ❌ `Dynamic_Template_Variable__c.Path__c`
- ❌ `Document__c.Template__c`
- ❌ `Document__c.Target_Record_Id__c`

### Removed from PDF_Template_Editor Permission Set
- ❌ `Document_Template__c.Primary_Object__c`
- ❌ `Dynamic_Template_Variable__c.Path__c`
- ❌ `Document__c.Template__c`
- ❌ `Document__c.Target_Record_Id__c`

### Removed from PDF_Generator Permission Set
- ❌ `Document_Template__c.Primary_Object__c`
- ❌ `Dynamic_Template_Variable__c.Path__c`
- ❌ `Document__c.Template__c`
- ❌ `Document__c.Target_Record_Id__c`

## Remaining Field Permissions

### PDF_Admin (10 field permissions)
**Document_Template__c (6 fields):**
- ✅ Html_Body__c (editable)
- ✅ Source_Type__c (editable)
- ✅ Status__c (editable)
- ✅ Renderer_Strategy__c (editable)
- ✅ Allowed_Fields__c (editable)
- ✅ Version__c (editable)

**Dynamic_Template_Variable__c (2 fields):**
- ✅ Type__c (editable)
- ✅ Plan__c (editable)

**Document__c (2 fields):**
- ✅ Status__c (editable)
- ✅ Error__c (editable)

### PDF_Template_Editor (10 field permissions)
**Document_Template__c (6 fields):**
- ✅ Html_Body__c (editable)
- ✅ Source_Type__c (editable)
- ✅ Status__c (editable)
- ✅ Renderer_Strategy__c (editable)
- ✅ Allowed_Fields__c (editable)
- ✅ Version__c (editable)

**Dynamic_Template_Variable__c (2 fields):**
- ✅ Type__c (editable)
- ✅ Plan__c (editable)

**Document__c (2 fields):**
- ✅ Status__c (read-only)
- ✅ Error__c (read-only)

### PDF_Generator (10 field permissions)
**Document_Template__c (6 fields):**
- ✅ Html_Body__c (read-only)
- ✅ Source_Type__c (read-only)
- ✅ Status__c (read-only)
- ✅ Renderer_Strategy__c (read-only)
- ✅ Allowed_Fields__c (read-only)
- ✅ Version__c (read-only)

**Dynamic_Template_Variable__c (2 fields):**
- ✅ Type__c (read-only)
- ✅ Plan__c (read-only)

**Document__c (2 fields):**
- ✅ Status__c (editable)
- ✅ Error__c (editable)

## Why This Works

### Required Fields Get Access Automatically
When a field is marked as required:
- Users automatically have access to read and edit it (if they have object permissions)
- Permission sets don't need to grant access explicitly
- Attempting to set permissions causes deployment errors

### MasterDetail Fields Inherit Permissions
MasterDetail fields like `Template__c` in `Dynamic_Template_Variable__c`:
- Always required by definition
- Permissions controlled by parent object
- Cannot be set in permission sets

## Documentation
All permission set files now include comments explaining why required fields are not present:

```xml
<!-- Note: Primary_Object__c is required, permissions cannot be set -->
<!-- Note: Template__c is MasterDetail, Path__c is required - permissions inherited/cannot be set -->
<!-- Note: Template__c and Target_Record_Id__c are required, permissions cannot be set -->
```

## Verification

✅ **No required fields in any `<field>` tags**
✅ **All permission sets have 10 field permissions each**
✅ **Comments document the exclusions**
✅ **Ready for deployment**

---

**Last Updated**: 2025-10-21  
**Status**: ✅ All permission sets corrected  
**Ready for**: Successful deployment

