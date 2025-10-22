/**
 * @description Service for saving PDFs and logging document generation runs
 */
public with sharing class DocumentService {
  
  /**
   * Save PDF to record as ContentVersion and link via ContentDocumentLink
   * @param recordId Record to attach PDF to
   * @param fileName Name for the PDF file
   * @param pdfBlob PDF content as Blob
   * @return ContentVersion Id
   */
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
    
    // Ensure .pdf extension
    if (!fileName.endsWithIgnoreCase('.pdf')) {
      fileName += '.pdf';
    }
    
    // Create ContentVersion
    ContentVersion cv = new ContentVersion();
    cv.Title = fileName.removeEnd('.pdf');
    cv.PathOnClient = fileName;
    cv.VersionData = pdfBlob;
    cv.IsMajorVersion = true;
    cv.Origin = 'H'; // Chatter file
    
    try {
      insert cv;
    } catch (DmlException e) {
      throw new DocumentException('Failed to save PDF: ' + e.getMessage());
    }
    
    // Query for ContentDocumentId
    cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id WITH SECURITY_ENFORCED LIMIT 1];
    
    // Link to record
    ContentDocumentLink cdl = new ContentDocumentLink();
    cdl.ContentDocumentId = cv.ContentDocumentId;
    cdl.LinkedEntityId = recordId;
    cdl.ShareType = 'V'; // Viewer
    cdl.Visibility = 'AllUsers';
    
    try {
      insert cdl;
    } catch (DmlException e) {
      // ContentVersion already created, but link failed
      throw new DocumentException('PDF saved but failed to link to record: ' + e.getMessage());
    }
    
    return cv.Id;
  }
  
  /**
   * Save base64-encoded PDF to record
   * @param recordId Record to attach PDF to
   * @param fileName Name for the PDF file
   * @param pdfBase64 Base64-encoded PDF content
   * @return ContentVersion Id
   */
  public static Id savePdfBase64ToRecord(Id recordId, String fileName, String pdfBase64) {
    if (String.isBlank(pdfBase64)) {
      throw new DocumentException('PDF content is required');
    }
    
    Blob pdfBlob = EncodingUtil.base64Decode(pdfBase64);
    return savePdfToRecord(recordId, fileName, pdfBlob);
  }
  
  /**
   * Log a document generation run
   * @param templateId Template used
   * @param recordId Target record
   * @param status Status of generation (Previewed, Saved, Failed)
   * @param errorMsg Error message if failed
   * @param contentVersionId ContentVersion Id if saved
   * @return Document__c record Id
   */
  public static Id logRun(Id templateId, Id recordId, String status, String errorMsg, Id contentVersionId) {
    if (templateId == null || recordId == null) {
      throw new DocumentException('Template ID and Record ID are required');
    }
    
    Document__c doc = new Document__c();
    doc.Template__c = templateId;
    doc.Target_Record_Id__c = recordId;
    doc.Status__c = status;
    doc.Error__c = errorMsg;
    // Note: ContentVersion link handled separately via ContentDocumentLink
    
    try {
      insert doc;
      return doc.Id;
    } catch (DmlException e) {
      // Log failure is not critical, just return null
      System.debug(LoggingLevel.WARN, 'Failed to log document run: ' + e.getMessage());
      return null;
    }
  }
  
  /**
   * Log preview (no file saved)
   * @param templateId Template used
   * @param recordId Target record
   * @return Document__c record Id
   */
  public static Id logPreview(Id templateId, Id recordId) {
    return logRun(templateId, recordId, 'Previewed', null, null);
  }
  
  /**
   * Log successful save
   * @param templateId Template used
   * @param recordId Target record
   * @param contentVersionId Saved PDF ContentVersion Id
   * @return Document__c record Id
   */
  public static Id logSaved(Id templateId, Id recordId, Id contentVersionId) {
    return logRun(templateId, recordId, 'Saved', null, contentVersionId);
  }
  
  /**
   * Log failure
   * @param templateId Template used
   * @param recordId Target record
   * @param errorMsg Error message
   * @return Document__c record Id
   */
  public static Id logFailure(Id templateId, Id recordId, String errorMsg) {
    return logRun(templateId, recordId, 'Failed', errorMsg, null);
  }
  
  /**
   * Get user's locale for formatting
   * @return Locale string (e.g., en_US)
   */
  public static String getUserLocale() {
    return UserInfo.getLocale();
  }
  
  /**
   * Get user's timezone
   * @return Timezone string (e.g., America/New_York)
   */
  public static String getUserTimezone() {
    return UserInfo.getTimeZone().toString();
  }
  
  /**
   * Get user's currency ISO code
   * @return Currency code (e.g., USD)
   */
  public static String getUserCurrencyCode() {
    if (UserInfo.isMultiCurrencyOrganization()) {
      // For multi-currency orgs, use dynamic SOQL to get user's default currency
      // DefaultCurrencyIsoCode is only available in multi-currency orgs
      String query = 'SELECT DefaultCurrencyIsoCode FROM User WHERE Id = :userId WITH SECURITY_ENFORCED LIMIT 1';
      Id userId = UserInfo.getUserId();
      
      try {
        List<SObject> users = Database.query(query);
        if (!users.isEmpty()) {
          return (String)users[0].get('DefaultCurrencyIsoCode');
        }
      } catch (Exception e) {
        System.debug('Unable to fetch user currency: ' + e.getMessage());
      }
    }
    // Single currency org - return org default
    return UserInfo.getDefaultCurrency();
  }
  
  /**
   * Convert base64 PDF to Blob
   * @param base64String Base64-encoded string
   * @return Blob
   */
  public static Blob base64ToBlob(String base64String) {
    if (String.isBlank(base64String)) {
      return null;
    }
    return EncodingUtil.base64Decode(base64String);
  }
  
  /**
   * Convert Blob to base64 PDF
   * @param blobData Blob data
   * @return Base64-encoded string
   */
  public static String blobToBase64(Blob blobData) {
    if (blobData == null) {
      return null;
    }
    return EncodingUtil.base64Encode(blobData);
  }
  
  /**
   * Custom exception for document operations
   */
  public class DocumentException extends Exception {}
}