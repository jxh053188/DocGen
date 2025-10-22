/**
 * @description Service for enforcing field-level security and allowed fields
 */
public with sharing class SecurityService {
    
    private static Map<String, Schema.SObjectType> globalDescribeCache;
    private static Map<String, Map<String, Schema.SObjectField>> fieldDescribeCache;
    
    /**
     * Filter field paths by FLS (Field-Level Security) for the current user
     * @param sObjectApiName Base SObject API name
     * @param fieldPaths Set of field paths to check (may include relationships like Owner.Name)
     * @return Set of accessible field paths
     */
    public static Set<String> filterFieldsByFls(String sObjectApiName, Set<String> fieldPaths) {
        Set<String> accessibleFields = new Set<String>();
        Schema.SObjectType sObjectType = getSObjectType(sObjectApiName);
        
        if (sObjectType == null) {
            return accessibleFields;
        }
        
        Map<String, Schema.SObjectField> fieldMap = getFieldMap(sObjectApiName);
        
        for (String fieldPath : fieldPaths) {
            if (isFieldAccessible(sObjectApiName, fieldPath, fieldMap)) {
                accessibleFields.add(fieldPath);
            }
        }
        
        return accessibleFields;
    }
    
    /**
     * Check if a field path is accessible (handles relationship traversal)
     * @param baseSObjectApiName Starting SObject
     * @param fieldPath Field path (may be dotted like Owner.Name)
     * @param fieldMap Field map for the base SObject
     * @return True if accessible
     */
    private static Boolean isFieldAccessible(String baseSObjectApiName, String fieldPath, Map<String, Schema.SObjectField> fieldMap) {
        // Handle standard Id field
        if (fieldPath.equalsIgnoreCase('Id')) {
            return true;
        }
        
        // Split path for relationship traversal
        List<String> pathParts = fieldPath.split('\\.');
        
        // Single field check
        if (pathParts.size() == 1) {
            Schema.SObjectField field = fieldMap.get(pathParts[0].toLowerCase());
            if (field == null) {
                return false;
            }
            return field.getDescribe().isAccessible();
        }
        
        // Relationship traversal
        String currentSObject = baseSObjectApiName;
        for (Integer i = 0; i < pathParts.size(); i++) {
            String part = pathParts[i];
            Map<String, Schema.SObjectField> currentFieldMap = getFieldMap(currentSObject);
            
            if (i == pathParts.size() - 1) {
                // Last part - check accessibility
                Schema.SObjectField field = currentFieldMap.get(part.toLowerCase());
                if (field == null) {
                    return false;
                }
                return field.getDescribe().isAccessible();
            } else {
                // Intermediate relationship - traverse
                // Try the relationship name as-is first, then try with "Id" suffix
                Schema.SObjectField field = currentFieldMap.get(part.toLowerCase());
                
                // If not found, try adding "Id" suffix for lookup/master-detail fields
                // (e.g., "Owner" -> "OwnerId")
                if (field == null) {
                    field = currentFieldMap.get((part + 'Id').toLowerCase());
                }
                
                if (field == null) {
                    return false;
                }
                
                Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
                if (!fieldDescribe.isAccessible()) {
                    return false;
                }
                
                List<Schema.sObjectType> refTypes = fieldDescribe.getReferenceTo();
                if (refTypes.isEmpty()) {
                    return false;
                }
                
                // Use first reference type (polymorphic fields use first)
                currentSObject = refTypes[0].getDescribe().getName();
            }
        }
        
        return false;
    }
    
    /**
     * Enforce allowed fields whitelist if configured on template
     * @param fieldPaths Set of field paths from discovery
     * @param allowedFieldsRaw Raw string from Template (JSON array or newline-separated)
     * @throws SecurityException if any field is not in the whitelist
     */
    public static void enforceAllowedFields(Set<String> fieldPaths, String allowedFieldsRaw) {
        if (String.isBlank(allowedFieldsRaw)) {
            return; // No whitelist configured
        }
        
        Set<String> allowedFields = parseAllowedFields(allowedFieldsRaw);
        
        for (String fieldPath : fieldPaths) {
            if (!allowedFields.contains(fieldPath)) {
                throw new SecurityException(
                    'Field "' + fieldPath + '" is not in the allowed fields whitelist for this template.'
                    );
            }
        }
    }
    
    /**
     * Parse allowed fields from JSON array or newline-separated string
     * @param allowedFieldsRaw Raw configuration string
     * @return Set of allowed field paths
     */
    private static Set<String> parseAllowedFields(String allowedFieldsRaw) {
        Set<String> allowedFields = new Set<String>();
        
        if (String.isBlank(allowedFieldsRaw)) {
            return allowedFields;
        }
        
        // Try JSON array first
        try {
            List<Object> fieldList = (List<Object>) JSON.deserializeUntyped(allowedFieldsRaw);
            for (Object field : fieldList) {
                allowedFields.add(String.valueOf(field).trim());
            }
            return allowedFields;
        } catch (Exception e) {
            // Not JSON, treat as newline-separated
        }
        
        // Parse as newline-separated
        for (String line : allowedFieldsRaw.split('\\n')) {
            String field = line.trim();
            if (String.isNotBlank(field)) {
                allowedFields.add(field);
            }
        }
        
        return allowedFields;
    }
    
    /**
     * Check if user has custom permission
     * @param permissionName API name of custom permission
     * @return True if user has the permission
     */
    public static Boolean hasCustomPermission(String permissionName) {
        return FeatureManagement.checkPermission(permissionName);
    }
    
    /**
     * Get SObject type from global describe (with caching)
     */
    private static Schema.SObjectType getSObjectType(String sObjectApiName) {
        if (globalDescribeCache == null) {
            globalDescribeCache = Schema.getGlobalDescribe();
        }
        return globalDescribeCache.get(sObjectApiName);
    }
    
    /**
     * Get field map for an SObject (with caching)
     */
    private static Map<String, Schema.SObjectField> getFieldMap(String sObjectApiName) {
        if (fieldDescribeCache == null) {
            fieldDescribeCache = new Map<String, Map<String, Schema.SObjectField>>();
        }
        
        if (!fieldDescribeCache.containsKey(sObjectApiName)) {
            Schema.SObjectType sObjectType = getSObjectType(sObjectApiName);
            if (sObjectType != null) {
                Map<String, Schema.SObjectField> fieldMap = sObjectType.getDescribe().fields.getMap();
                // Normalize to lowercase keys for case-insensitive lookup
                Map<String, Schema.SObjectField> normalizedMap = new Map<String, Schema.SObjectField>();
                for (String key : fieldMap.keySet()) {
                    normalizedMap.put(key.toLowerCase(), fieldMap.get(key));
                }
                fieldDescribeCache.put(sObjectApiName, normalizedMap);
            }
        }
        
        return fieldDescribeCache.get(sObjectApiName);
    }
    
    /**
     * Custom exception for security violations
     */
    public class SecurityException extends Exception {}
}