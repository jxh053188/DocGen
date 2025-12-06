/**
 * @description Service for template processing, query building, and data fetching
 */
public with sharing class TemplateService {
    
    private static final Integer MAX_SUBQUERY_ROWS = 200;
    private static final Integer MAX_RELATIONSHIP_DEPTH = 5;
    
    /**
     * Build and validate a query plan from discovery payload
     * @param payload Discovery payload from client
     * @param allowedFieldsRaw Optional whitelist from template
     * @return Validated query plan
     */
    public static TemplateDTO.QueryPlan buildQuery(TemplateDTO.DiscoveryPayload payload, String allowedFieldsRaw) {
        if (payload == null || String.isBlank(payload.primaryObject)) {
            throw new TemplateException('Primary object is required');
        }
        
        // Validate primary object exists
        Schema.SObjectType sObjectType = Schema.getGlobalDescribe().get(payload.primaryObject);
        if (sObjectType == null) {
            throw new TemplateException('Unknown SObject: ' + payload.primaryObject);
        }
        
        TemplateDTO.QueryPlan plan = new TemplateDTO.QueryPlan();
        plan.baseSObject = payload.primaryObject;
        plan.selectFields = new Set<String>{'Id'}; // Always include Id
        
        // Collect all field paths (convert List to Set)
        Set<String> allFieldPaths = new Set<String>();
        if (payload.scalarPaths != null) {
            allFieldPaths.addAll(payload.scalarPaths);
        }
        
        // Enforce allowed fields whitelist
        if (String.isNotBlank(allowedFieldsRaw)) {
            SecurityService.enforceAllowedFields(allFieldPaths, allowedFieldsRaw);
        }
        
        // Validate and add scalar fields
        if (payload.scalarPaths != null) {
            for (String fieldPath : payload.scalarPaths) {
                validateAndAddField(payload.primaryObject, fieldPath, plan.selectFields);
            }
        }
        
        // Process collections (subqueries)
        if (payload.collections != null) {
            for (TemplateDTO.CollectionSpec collectionSpec : payload.collections) {
                TemplateDTO.SubqueryPlan subquery = buildSubquery(payload.primaryObject, collectionSpec, allowedFieldsRaw);
                plan.subqueries.add(subquery);
            }
        }
        
        // Build final SOQL
        plan.soqlQuery = buildSoqlQuery(plan);
        
        return plan;
    }
    
    /**
     * Build a subquery plan for a child relationship
     */
    private static TemplateDTO.SubqueryPlan buildSubquery(String parentSObject, TemplateDTO.CollectionSpec spec, String allowedFieldsRaw) {
        if (String.isBlank(spec.relationshipName)) {
            throw new TemplateException('Relationship name is required for collection');
        }
        
        // Validate relationship exists
        Schema.SObjectType parentType = Schema.getGlobalDescribe().get(parentSObject);
        Schema.DescribeSObjectResult parentDescribe = parentType.getDescribe();
        
        Schema.ChildRelationship childRel = findChildRelationship(parentDescribe, spec.relationshipName);
        if (childRel == null) {
            String suggestion = findSimilarRelationship(parentDescribe, spec.relationshipName);
            throw new TemplateException(
                '"' + spec.relationshipName + '" isn\'t a child relationship of "' + parentSObject + '".' +
                (String.isNotBlank(suggestion) ? ' Did you mean "' + suggestion + '"?' : '')
                );
        }
        
        TemplateDTO.SubqueryPlan subquery = new TemplateDTO.SubqueryPlan();
        subquery.relationshipName = spec.relationshipName;
        subquery.childSObjectName = childRel.getChildSObject().getDescribe().getName();
        subquery.selectFields = new Set<String>{'Id'};
        
        // Collect child field paths for allowed fields check
        Set<String> childFieldPaths = new Set<String>();
        if (spec.fieldPaths != null) {
            childFieldPaths.addAll(spec.fieldPaths);
        }
        
        // Add fields from predicates
        if (spec.wherePredicate != null) {
            collectPredicateFields(spec.wherePredicate, childFieldPaths);
        }
        
        // Add fields from order by
        if (spec.orderBy != null) {
            for (TemplateDTO.OrderByClause orderBy : spec.orderBy) {
                if (String.isNotBlank(orderBy.field)) {
                    childFieldPaths.add(orderBy.field);
                }
            }
        }
        
        // Enforce allowed fields for child
        if (String.isNotBlank(allowedFieldsRaw)) {
            SecurityService.enforceAllowedFields(childFieldPaths, allowedFieldsRaw);
        }
        
        // Validate and add child fields
        for (String fieldPath : spec.fieldPaths) {
            validateAndAddField(subquery.childSObjectName, fieldPath, subquery.selectFields);
        }
        
        // Build WHERE clause
        if (spec.wherePredicate != null) {
            subquery.whereClause = buildWhereClause(subquery.childSObjectName, spec.wherePredicate);
        }
        
        // Build ORDER BY clause
        if (spec.orderBy != null && !spec.orderBy.isEmpty()) {
            List<String> orderParts = new List<String>();
            for (TemplateDTO.OrderByClause orderBy : spec.orderBy) {
                validateAndAddField(subquery.childSObjectName, orderBy.field, subquery.selectFields);
                String direction = String.isNotBlank(orderBy.direction) ? orderBy.direction.toUpperCase() : 'ASC';
                orderParts.add(orderBy.field + ' ' + direction);
            }
            subquery.orderByClause = String.join(orderParts, ', ');
        }
        
        // Apply limit and offset
        if (spec.limitVal != null && spec.limitVal > 0) {
            subquery.limitVal = Math.min(spec.limitVal, MAX_SUBQUERY_ROWS);
        }
        subquery.offsetVal = spec.offsetVal;
        
        // Build subquery SOQL
        subquery.soqlSubquery = buildSubquerySoql(subquery);
        
        return subquery;
    }
    
    /**
     * Build WHERE clause from predicate tree
     */
    private static String buildWhereClause(String sObjectName, TemplateDTO.Predicate predicate) {
        if (predicate == null) {
            return '';
        }
        
        String op = predicate.operator?.toLowerCase();
        
        // Logical operators
        if (op == 'and' || op == 'or') {
            List<String> childClauses = new List<String>();
            for (TemplateDTO.Predicate child : predicate.children) {
                String clause = buildWhereClause(sObjectName, child);
                if (String.isNotBlank(clause)) {
                    childClauses.add('(' + clause + ')');
                }
            }
            return String.join(childClauses, ' ' + op.toUpperCase() + ' ');
        }
        
        if (op == 'not') {
            if (!predicate.children.isEmpty()) {
                String clause = buildWhereClause(sObjectName, predicate.children[0]);
                return 'NOT (' + clause + ')';
            }
        }
        
        // Comparison operators
        String field = predicate.field;
        Object value = predicate.value;
        
        if (String.isBlank(field)) {
            return '';
        }
        
        // Validate field
        validateField(sObjectName, field);
        
        switch on op {
            when 'eq' {
                return field + ' = ' + formatValue(value);
            }
            when 'ne' {
                return field + ' != ' + formatValue(value);
            }
            when 'gt' {
                return field + ' > ' + formatValue(value);
            }
            when 'gte' {
                return field + ' >= ' + formatValue(value);
            }
            when 'lt' {
                return field + ' < ' + formatValue(value);
            }
            when 'lte' {
                return field + ' <= ' + formatValue(value);
            }
            when 'contains' {
                return field + ' LIKE \'%' + String.escapeSingleQuotes(String.valueOf(value)) + '%\'';
            }
            when 'startswith' {
                return field + ' LIKE \'' + String.escapeSingleQuotes(String.valueOf(value)) + '%\'';
            }
            when 'endswith' {
                return field + ' LIKE \'%' + String.escapeSingleQuotes(String.valueOf(value)) + '\'';
            }
            when 'in' {
                // Parse value as JSON array since it comes as a string representation
                List<Object> values = (List<Object>) JSON.deserializeUntyped(String.valueOf(value));
                List<String> formattedValues = new List<String>();
                for (Object v : values) {
                    formattedValues.add(formatValue(v));
                }
                return field + ' IN (' + String.join(formattedValues, ', ') + ')';
            }
            when 'isnull' {
                return field + ' = null';
            }
            when 'isnotnull' {
                return field + ' != null';
            }
            when else {
                throw new TemplateException('Unsupported predicate operator: ' + op);
            }
        }
    }
    
    /**
     * Format value for SOQL
     */
    private static String formatValue(Object value) {
        if (value == null) {
            return 'null';
        }
        
        if (value instanceof String) {
            return '\'' + String.escapeSingleQuotes(String.valueOf(value)) + '\'';
        }
        
        if (value instanceof Boolean || value instanceof Integer || value instanceof Long ||
        value instanceof Decimal || value instanceof Double) {
            return String.valueOf(value);
        }
        
        if (value instanceof Date) {
            Date d = (Date) value;
            return String.valueOf(d);
        }
        
        if (value instanceof Datetime) {
            Datetime dt = (Datetime) value;
            return dt.format('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
        }
        
        return '\'' + String.escapeSingleQuotes(String.valueOf(value)) + '\'';
    }
    
    /**
     * Collect all field references from predicate tree
     */
    private static void collectPredicateFields(TemplateDTO.Predicate predicate, Set<String> fields) {
        if (predicate == null) {
            return;
        }
        
        if (String.isNotBlank(predicate.field)) {
            fields.add(predicate.field);
        }
        
        if (predicate.children != null) {
            for (TemplateDTO.Predicate child : predicate.children) {
                collectPredicateFields(child, fields);
            }
        }
    }
    
    /**
     * Validate field exists and is accessible, add to select set
     */
    private static void validateAndAddField(String sObjectName, String fieldPath, Set<String> selectFields) {
        if (String.isBlank(fieldPath) || fieldPath.equalsIgnoreCase('Id')) {
            return; // Id always included
        }
        
        validateField(sObjectName, fieldPath);
        
        // Check FLS
        Set<String> accessibleFields = SecurityService.filterFieldsByFls(sObjectName, new Set<String>{fieldPath});
        if (accessibleFields.isEmpty()) {
            throw new SecurityService.SecurityException(
                'Field "' + fieldPath + '" on "' + sObjectName + '" isn\'t visible to your profile/permission set.'
                );
        }
        
        selectFields.add(fieldPath);
    }
    
    /**
     * Validate field exists on object
     */
    private static void validateField(String sObjectName, String fieldPath) {
        Schema.SObjectType sObjectType = Schema.getGlobalDescribe().get(sObjectName);
        if (sObjectType == null) {
            throw new TemplateException('Unknown SObject: ' + sObjectName);
        }
        
        // Split field path for relationship traversal
        List<String> pathParts = fieldPath.split('\\.');
        String currentSObject = sObjectName;
        
        for (Integer i = 0; i < pathParts.size(); i++) {
            String part = pathParts[i];
            Schema.SObjectType currentType = Schema.getGlobalDescribe().get(currentSObject);
            Map<String, Schema.SObjectField> fieldMap = currentType.getDescribe().fields.getMap();
            
            // Try the field name as-is first
            Schema.SObjectField field = fieldMap.get(part.toLowerCase());
            
            // If not found and not the last part, try adding "Id" suffix for relationship fields
            // (e.g., "Owner" -> "OwnerId")
            if (field == null && i < pathParts.size() - 1) {
                field = fieldMap.get((part + 'Id').toLowerCase());
            }
            
            if (field == null) {
                throw new TemplateException(
                    '"' + part + '" isn\'t a field on "' + currentSObject + '". Remove it or update the template.'
                    );
            }
            
            // If not last part, traverse relationship
            if (i < pathParts.size() - 1) {
                Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
                List<Schema.SObjectType> refTypes = fieldDescribe.getReferenceTo();
                if (refTypes.isEmpty()) {
                    throw new TemplateException(
                        '"' + part + '" is not a relationship field.'
                        );
                }
                currentSObject = refTypes[0].getDescribe().getName();
            }
        }
    }
    
    /**
     * Find child relationship by name
     */
    private static Schema.ChildRelationship findChildRelationship(Schema.DescribeSObjectResult describe, String relationshipName) {
        for (Schema.ChildRelationship rel : describe.getChildRelationships()) {
            if (rel.getRelationshipName() == relationshipName) {
                return rel;
            }
        }
        return null;
    }
    
    /**
     * Find similar relationship names for suggestions
     */
    private static String findSimilarRelationship(Schema.DescribeSObjectResult describe, String relationshipName) {
        String lowerName = relationshipName.toLowerCase();
        for (Schema.ChildRelationship rel : describe.getChildRelationships()) {
            String relName = rel.getRelationshipName();
            if (relName != null && relName.toLowerCase().contains(lowerName)) {
                return relName;
            }
        }
        return null;
    }
    
    /**
     * Build SOQL query string from plan
     */
    private static String buildSoqlQuery(TemplateDTO.QueryPlan plan) {
        List<String> selectList = new List<String>(plan.selectFields);
        selectList.sort();
        
        String soql = 'SELECT ' + String.join(selectList, ', ');
        
        // Add subqueries
        if (!plan.subqueries.isEmpty()) {
            for (TemplateDTO.SubqueryPlan subquery : plan.subqueries) {
                soql += ', ' + subquery.soqlSubquery;
            }
        }
        
        soql += ' FROM ' + plan.baseSObject;
        soql += ' WHERE Id = :recordId';
        soql += ' WITH SECURITY_ENFORCED';
        
        return soql;
    }
    
    /**
     * Build subquery SOQL string
     */
    private static String buildSubquerySoql(TemplateDTO.SubqueryPlan subquery) {
        List<String> selectList = new List<String>(subquery.selectFields);
        selectList.sort();
        
        String soql = '(SELECT ' + String.join(selectList, ', ');
        soql += ' FROM ' + subquery.relationshipName;
        
        if (String.isNotBlank(subquery.whereClause)) {
            soql += ' WHERE ' + subquery.whereClause;
        }
        
        if (String.isNotBlank(subquery.orderByClause)) {
            soql += ' ORDER BY ' + subquery.orderByClause;
        }
        
        if (subquery.limitVal != null && subquery.limitVal > 0) {
            soql += ' LIMIT ' + subquery.limitVal;
        }
        
        if (subquery.offsetVal != null && subquery.offsetVal > 0) {
            soql += ' OFFSET ' + subquery.offsetVal;
        }
        
        soql += ')';
        
        return soql;
    }
    
    /**
     * Execute query plan and return JSON DTO
     * @param recordId Record to fetch data for
     * @param plan Validated query plan
     * @return JSON serialized data
     */
    public static String fetchDTO(Id recordId, TemplateDTO.QueryPlan plan) {
        if (recordId == null) {
            throw new TemplateException('Record ID is required');
        }
        
        if (plan == null || String.isBlank(plan.soqlQuery)) {
            throw new TemplateException('Query plan is required');
        }
        
        try {
            // Execute query with binding
            List<SObject> records = Database.query(plan.soqlQuery);
            
            if (records.isEmpty()) {
                throw new TemplateException('Record not found: ' + recordId);
            }
            
            SObject record = records[0];
            
            // Convert to untyped map for JSON serialization
            Map<String, Object> dto = (Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(record));
            
            // Return JSON
            return JSON.serialize(dto);
            
        } catch (QueryException e) {
            throw new TemplateException('Query execution failed: ' + e.getMessage());
        }
    }
    
    /**
     * Custom exception for template processing
     */
    public class TemplateException extends Exception {}
}