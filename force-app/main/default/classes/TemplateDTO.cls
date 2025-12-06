/**
 * @description Data Transfer Objects for template processing and query building
 */
public with sharing class TemplateDTO {
    
    /**
     * Discovery payload sent from client with parsed template tokens
     */
    public class DiscoveryPayload {
        @AuraEnabled public String primaryObject { get; set; }
        @AuraEnabled public List<String> scalarPaths { get; set; }
        @AuraEnabled public List<CollectionSpec> collections { get; set; }
        
        public DiscoveryPayload() {
            this.scalarPaths = new List<String>();
            this.collections = new List<CollectionSpec>();
        }
    }
    
    /**
     * Specification for a related collection (child relationship)
     */
    public class CollectionSpec {
        @AuraEnabled public String relationshipName { get; set; }
        @AuraEnabled public List<String> fieldPaths { get; set; }
        @AuraEnabled public Predicate wherePredicate { get; set; }
        @AuraEnabled public List<OrderByClause> orderBy { get; set; }
        @AuraEnabled public Integer limitVal { get; set; }
        @AuraEnabled public Integer offsetVal { get; set; }
        
        public CollectionSpec() {
            this.fieldPaths = new List<String>();
            this.orderBy = new List<OrderByClause>();
        }
    }
    
    /**
     * Order by clause for SOQL
     */
    public class OrderByClause {
        @AuraEnabled public String field { get; set; }
        @AuraEnabled public String direction { get; set; } // ASC or DESC
        
        public OrderByClause() {}
        
        public OrderByClause(String field, String direction) {
            this.field = field;
            this.direction = direction;
        }
    }
    
    /**
     * Predicate AST node for WHERE clause building
     */
    public class Predicate {
        @AuraEnabled public String operator { get; set; } // AND, OR, NOT, eq, ne, gt, gte, lt, lte, contains, in, isNull, etc.
        @AuraEnabled public String field { get; set; }
        @AuraEnabled public String value { get; set; } // Changed from Object to String for JSON deserialization
        @AuraEnabled public List<Predicate> children { get; set; }
        
        public Predicate() {
            this.children = new List<Predicate>();
        }
    }
    
    /**
     * Query plan with validated SOQL components
     */
    public class QueryPlan {
        @AuraEnabled public String baseSObject { get; set; }
        @AuraEnabled public Set<String> selectFields { get; set; }
        @AuraEnabled public List<SubqueryPlan> subqueries { get; set; }
        @AuraEnabled public String soqlQuery { get; set; }
        
        public QueryPlan() {
            this.selectFields = new Set<String>();
            this.subqueries = new List<SubqueryPlan>();
        }
    }
    
    /**
     * Subquery plan for child relationships
     */
    public class SubqueryPlan {
        @AuraEnabled public String relationshipName { get; set; }
        @AuraEnabled public String childSObjectName { get; set; }
        @AuraEnabled public Set<String> selectFields { get; set; }
        @AuraEnabled public String whereClause { get; set; }
        @AuraEnabled public String orderByClause { get; set; }
        @AuraEnabled public Integer limitVal { get; set; }
        @AuraEnabled public Integer offsetVal { get; set; }
        @AuraEnabled public String soqlSubquery { get; set; }
        
        public SubqueryPlan() {
            this.selectFields = new Set<String>();
        }
    }
    
    /**
     * Response wrapper for errors
     */
    public class ErrorResponse {
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public String error { get; set; }
        @AuraEnabled public String errorType { get; set; }
        @AuraEnabled public String suggestion { get; set; }
        
        public ErrorResponse(String error, String errorType, String suggestion) {
            this.success = false;
            this.error = error;
            this.errorType = errorType;
            this.suggestion = suggestion;
        }
    }
}