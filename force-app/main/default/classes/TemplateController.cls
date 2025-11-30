/**
 * @description Apex controller for template management and document generation LWC components
 */
public with sharing class TemplateController {
    
    /**
     * Validate discovery payload and build query plan
     * @param payloadJson JSON serialized DiscoveryPayload
     * @param templateId Template record Id (for allowed fields check)
     * @return JSON serialized QueryPlan
     */
    @AuraEnabled
    public static String buildQueryPlan(String payloadJson, Id templateId) {
        try {
            // Debug: Log the incoming JSON
            System.debug('🔍 Received JSON from LWC: ' + payloadJson);
            
            // Deserialize payload
            System.debug('🔄 Attempting to deserialize...');
            TemplateDTO.DiscoveryPayload payload = (TemplateDTO.DiscoveryPayload)
                JSON.deserialize(payloadJson, TemplateDTO.DiscoveryPayload.class);
            
            System.debug('✅ Deserialization successful!');
            System.debug('📦 Payload: ' + JSON.serializePretty(payload));
            
            // Get template for allowed fields
            String allowedFields = null;
            if (templateId != null) {
                List<Document_Template__c> templates = [
                    SELECT Allowed_Fields__c 
                    FROM Document_Template__c 
                    WHERE Id = :templateId 
                    WITH SECURITY_ENFORCED 
                    LIMIT 1
                ];
                if (!templates.isEmpty()) {
                    allowedFields = templates[0].Allowed_Fields__c;
                }
            }
            
            // Build query plan
            TemplateDTO.QueryPlan plan = TemplateService.buildQuery(payload, allowedFields);
            
            // Return as JSON
            return JSON.serialize(plan);
            
        } catch (Exception e) {
            // Enhanced error logging
            System.debug(LoggingLevel.ERROR, '❌ buildQueryPlan failed!');
            System.debug(LoggingLevel.ERROR, '❌ Error Type: ' + e.getTypeName());
            System.debug(LoggingLevel.ERROR, '❌ Error Message: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, '❌ Stack Trace: ' + e.getStackTraceString());
            
            // Return detailed error message
            String errorMsg = e.getTypeName() + ': ' + e.getMessage();
            throw new AuraHandledException(errorMsg);
        }
    }
    
    /**
     * Fetch data for a record using query plan
     * @param recordId Record to fetch data for
     * @param queryPlanJson JSON serialized QueryPlan
     * @return JSON DTO with data
     */
    @AuraEnabled
    public static String fetchData(Id recordId, String queryPlanJson) {
        try {
            // Deserialize query plan
            TemplateDTO.QueryPlan plan = (TemplateDTO.QueryPlan)
                JSON.deserialize(queryPlanJson, TemplateDTO.QueryPlan.class);
            
            // Fetch data
            return TemplateService.fetchDTO(recordId, plan);
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Save PDF to record and log
     * @param recordId Record to attach PDF to
     * @param templateId Template used
     * @param fileName File name
     * @param pdfBase64 Base64-encoded PDF
     * @return ContentVersion Id
     */
    @AuraEnabled
    public static Id savePdf(Id recordId, Id templateId, String fileName, String pdfBase64) {
        try {
            // Save PDF
            Id contentVersionId = DocumentService.savePdfBase64ToRecord(recordId, fileName, pdfBase64);
            
            // Log
            DocumentService.logSaved(templateId, recordId, contentVersionId);
            
            return contentVersionId;
            
        } catch (Exception e) {
            // Log failure
            DocumentService.logFailure(templateId, recordId, e.getMessage());
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Log preview (no save)
     * @param recordId Target record
     * @param templateId Template used
     */
    @AuraEnabled
    public static void logPreview(Id recordId, Id templateId) {
        try {
            DocumentService.logPreview(templateId, recordId);
        } catch (Exception e) {
            // Preview logging is not critical
            System.debug(LoggingLevel.WARN, 'Failed to log preview: ' + e.getMessage());
        }
    }
    
    /**
     * Get user locale and formatting settings
     * @return Map with locale, timezone, currencyCode
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, String> getUserSettings() {
        return new Map<String, String>{
            'locale' => DocumentService.getUserLocale(),
            'timezone' => DocumentService.getUserTimezone(),
            'currencyCode' => DocumentService.getUserCurrencyCode()
        };
    }
    
    /**
     * Get active templates for a specific SObject
     * @param sObjectName SObject API name
     * @return List of templates
     */
    @AuraEnabled(cacheable=true)
    public static List<Document_Template__c> getTemplatesForObject(String sObjectName) {
        try {
            return [
                SELECT Id, Name, Primary_Object__c, Status__c, Version__c
                FROM Document_Template__c
                WHERE Primary_Object__c = :sObjectName
                AND Status__c = 'Active'
                WITH SECURITY_ENFORCED
                ORDER BY Name
            ];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Get all templates
     * @return List of templates
     */
    @AuraEnabled(cacheable=true)
    public static List<Document_Template__c> getAllTemplates() {
        try {
            return [
                SELECT Id, Name, Primary_Object__c, Status__c, Version__c, 
                       Source_Type__c, LastModifiedDate
                FROM Document_Template__c
                WITH SECURITY_ENFORCED
                ORDER BY LastModifiedDate DESC
                LIMIT 200
            ];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Get template by Id
     * @param templateId Template Id
     * @return Template record
     */
    @AuraEnabled
    public static Document_Template__c getTemplate(Id templateId) {
        try {
            List<Document_Template__c> templates = [
                SELECT Id, Name, Primary_Object__c, Status__c, Version__c,
                       Source_Type__c, Html_Body__c, Allowed_Fields__c,
                       Renderer_Strategy__c
                FROM Document_Template__c
                WHERE Id = :templateId
                WITH SECURITY_ENFORCED
                LIMIT 1
            ];
            
            if (templates.isEmpty()) {
                throw new AuraHandledException('Template not found');
            }
            
            return templates[0];
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Save or update template
     * @param template Template to save
     * @return Saved template Id
     */
    @AuraEnabled
    public static Id saveTemplate(Document_Template__c template) {
        try {
            if (template.Id != null) {
                // Update existing - increment version
                template.Version__c = (template.Version__c != null ? template.Version__c : 0) + 1;
                update template;
            } else {
                // Insert new
                if (template.Version__c == null) {
                    template.Version__c = 1;
                }
                insert template;
            }
            
            return template.Id;
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Delete template
     * @param templateId Template to delete
     */
    @AuraEnabled
    public static void deleteTemplate(Id templateId) {
        try {
            delete [SELECT Id FROM Document_Template__c WHERE Id = :templateId WITH SECURITY_ENFORCED];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Validate SObject name
     * @param sObjectName SObject API name to validate
     * @return True if valid
     */
    @AuraEnabled
    public static Boolean validateSObject(String sObjectName) {
        try {
            Schema.SObjectType sObjectType = Schema.getGlobalDescribe().get(sObjectName);
            return sObjectType != null;
        } catch (Exception e) {
            return false;
        }
    }
    
    /**
     * Get child relationships for an SObject
     * @param sObjectName SObject API name
     * @return List of relationship names
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getChildRelationships(String sObjectName) {
        try {
            Schema.SObjectType sObjectType = Schema.getGlobalDescribe().get(sObjectName);
            if (sObjectType == null) {
                return new List<String>();
            }
            
            List<String> relationships = new List<String>();
            Schema.DescribeSObjectResult describe = sObjectType.getDescribe();
            
            for (Schema.ChildRelationship rel : describe.getChildRelationships()) {
                if (rel.getRelationshipName() != null) {
                    relationships.add(rel.getRelationshipName());
                }
            }
            
            relationships.sort();
            return relationships;
            
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    /**
     * Check if user has PDF_SafeHtml custom permission
     * @return True if user has permission
     */
    @AuraEnabled(cacheable=true)
    public static Boolean hasSafeHtmlPermission() {
        return SecurityService.hasCustomPermission('PDF_SafeHtml');
    }
    
    /**
     * Upload a DOCX file and link it to a Template record
     * @param templateId - ID of the template record
     * @param fileName - Name of the file
     * @param base64Data - Base64-encoded file content
     * @return ContentVersion ID
     */
    @AuraEnabled
    public static Id uploadTemplateFile(Id templateId, String fileName, String base64Data) {
        try {
            // Create ContentVersion
            ContentVersion cv = new ContentVersion();
            cv.Title = fileName;
            cv.PathOnClient = fileName;
            cv.VersionData = EncodingUtil.base64Decode(base64Data);
            cv.IsMajorVersion = true;
            cv.FirstPublishLocationId = templateId; // Link directly to the template
            insert cv;
            
            return cv.Id;
        } catch (Exception e) {
            System.debug('❌ Error uploading file: ' + e.getMessage());
            throw new AuraHandledException('Error uploading file: ' + e.getMessage());
        }
    }
    
    /**
     * Get the DOCX file content for a template
     * @param templateId - ID of the template record
     * @return Map with file name and base64 content
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, String> getTemplateFile(Id templateId) {
        try {
            // Query ContentDocumentLinks to find files linked to this template
            List<ContentDocumentLink> links = [
        SELECT ContentDocumentId, ContentDocument.LatestPublishedVersionId
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :templateId
        AND ContentDocument.FileType = 'DOCX'
        ORDER BY SystemModstamp DESC
        LIMIT 1
      ];
            
            if (links.isEmpty()) {
                return null;
            }
            
            // Get the ContentVersion
            Id versionId = links[0].ContentDocument.LatestPublishedVersionId;
            ContentVersion cv = [
        SELECT Title, VersionData, FileExtension
        FROM ContentVersion
        WHERE Id = :versionId
        LIMIT 1
      ];
            
            // Return file data
            return new Map<String, String>{
                'fileName' => cv.Title + '.' + cv.FileExtension,
                'base64Data' => EncodingUtil.base64Encode(cv.VersionData)
            };
        } catch (Exception e) {
            System.debug('❌ Error fetching file: ' + e.getMessage());
            throw new AuraHandledException('Error fetching file: ' + e.getMessage());
        }
    }
    
    /**
     * Delete the DOCX file linked to a template
     * @param templateId - ID of the template record
     */
    @AuraEnabled
    public static void deleteTemplateFile(Id templateId) {
        try {
            // Query ContentDocumentLinks to find files linked to this template
            List<ContentDocumentLink> links = [
        SELECT ContentDocumentId
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :templateId
        AND ContentDocument.FileType = 'DOCX'
      ];
            
            if (!links.isEmpty()) {
                // Get ContentDocument IDs
                Set<Id> docIds = new Set<Id>();
                for (ContentDocumentLink link : links) {
                    docIds.add(link.ContentDocumentId);
                }
                
                // Delete ContentDocuments (this will cascade delete links and versions)
                List<ContentDocument> docs = [
          SELECT Id
          FROM ContentDocument
          WHERE Id IN :docIds
        ];
                delete docs;
            }
        } catch (Exception e) {
            System.debug('❌ Error deleting file: ' + e.getMessage());
            throw new AuraHandledException('Error deleting file: ' + e.getMessage());
        }
    }
}