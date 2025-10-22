# DocGen Template Syntax Guide

This guide explains the template syntax supported by the DocGen custom template engine.

## Table of Contents
- [Basic Variable Replacement](#basic-variable-replacement)
- [Nested Field Paths](#nested-field-paths)
- [Collections (Iteration)](#collections-iteration)
- [Conditionals](#conditionals)
- [Advanced Collections with Filtering](#advanced-collections-with-filtering)
- [Complete Examples](#complete-examples)

---

## Basic Variable Replacement

Use double curly braces to insert field values from the primary record.

### Syntax
```html
{{FieldName}}
```

### Example
```html
<h1>Account: {{Name}}</h1>
<p>Phone: {{Phone}}</p>
<p>Annual Revenue: {{AnnualRevenue}}</p>
```

### Output (for an Account record)
```html
<h1>Account: Acme Corporation</h1>
<p>Phone: (555) 123-4567</p>
<p>Annual Revenue: 1000000</p>
```

---

## Nested Field Paths

Access fields from related parent records using dot notation.

### Syntax
```html
{{RelationshipName.FieldName}}
```

### Example
```html
<p>Owner: {{Owner.Name}}</p>
<p>Owner Email: {{Owner.Email}}</p>
<p>Created By: {{CreatedBy.Name}}</p>
```

### Output
```html
<p>Owner: John Smith</p>
<p>Owner Email: john.smith@example.com</p>
<p>Created By: Jane Doe</p>
```

### Notes
- The template engine automatically handles the relationship name (e.g., `Owner` for `OwnerId`)
- You can traverse multiple levels: `{{Account.Owner.Name}}`

---

## Collections (Iteration)

Loop through child records using the `{{#each}}` block helper.

### Syntax
```html
{{#each RelationshipName}}
  <!-- Content to repeat for each item -->
  {{FieldName}}
{{/each}}
```

### Example
```html
<h2>Opportunities</h2>
<ul>
{{#each Opportunities}}
  <li>{{Name}} - {{StageName}} - {{Amount}}</li>
{{/each}}
</ul>
```

### Output
```html
<h2>Opportunities</h2>
<ul>
  <li>Big Deal - Prospecting - 50000</li>
  <li>Medium Deal - Qualification - 25000</li>
  <li>Small Deal - Closed Won - 10000</li>
</ul>
```

### Special Variables in Collections

Inside an `{{#each}}` block, you have access to special variables:

| Variable | Type | Description |
|----------|------|-------------|
| `{{@index}}` | Number | Zero-based index of current item |
| `{{@first}}` | Boolean | `true` for the first item |
| `{{@last}}` | Boolean | `true` for the last item |

### Example with Special Variables
```html
<table>
{{#each Opportunities}}
  <tr class="{{#if @first}}first-row{{/if}} {{#if @last}}last-row{{/if}}">
    <td>{{@index}}</td>
    <td>{{Name}}</td>
    <td>{{Amount}}</td>
  </tr>
{{/each}}
</table>
```

---

## Conditionals

Show or hide content based on field values using `{{#if}}` blocks.

### Syntax
```html
{{#if FieldName}}
  <!-- Content when field is truthy -->
{{/if}}
```

### With Else
```html
{{#if FieldName}}
  <!-- Content when field is truthy -->
{{else}}
  <!-- Content when field is falsy -->
{{/if}}
```

### Example
```html
{{#if Phone}}
  <p>Phone: {{Phone}}</p>
{{else}}
  <p>No phone number available</p>
{{/if}}
```

### Truthy Values
A field is considered "truthy" if it:
- Is not `null`
- Is not `undefined`
- Is not `false`
- Is not an empty string `""`
- Is not `0`

### Example with Nested Paths
```html
{{#if Owner.Name}}
  <p>Assigned to: {{Owner.Name}}</p>
{{else}}
  <p>Unassigned</p>
{{/if}}
```

### Conditionals in Collections
```html
{{#each Opportunities}}
  <div>
    <h3>{{Name}}</h3>
    {{#if Amount}}
      <p>Amount: ${{Amount}}</p>
    {{else}}
      <p>Amount not set</p>
    {{/if}}
  </div>
{{/each}}
```

---

## Advanced Collections with Filtering

For more advanced scenarios (filtering, sorting, limiting), use the `{{#eachRelated}}` syntax. This is parsed by the discovery engine to build optimized SOQL subqueries.

### Syntax
```html
{{#eachRelated RelationshipName where="predicate" orderBy="field direction" limit="number"}}
  <!-- Content -->
{{/eachRelated}}
```

**Note:** Quotes around the relationship name are optional. Both `{{#eachRelated Opportunities}}` and `{{#eachRelated "Opportunities"}}` are valid.

### Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `RelationshipName` | Yes | Name of child relationship (quotes optional) | `Opportunities` or `"Opportunities"` |
| `where` | No | Filter predicate (JSON) | `where='{"operator":"eq","field":"StageName","value":"Prospecting"}'` |
| `orderBy` | No | Comma-separated field and direction | `orderBy="Amount DESC"` |
| `limit` | No | Maximum number of records | `limit="5"` |
| `offset` | No | Number of records to skip | `offset="10"` |

### Filter Operators

The `where` parameter uses a JSON predicate structure:

#### Comparison Operators
- `eq` - Equals
- `ne` - Not equals
- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal
- `contains` - Contains substring
- `startswith` - Starts with
- `endswith` - Ends with
- `in` - In list
- `isnull` - Is null
- `isnotnull` - Is not null

#### Logical Operators
- `and` - Combines predicates (all must be true)
- `or` - Combines predicates (at least one must be true)
- `not` - Negates a predicate

### Examples

#### Simple Filter - Opportunities in Prospecting Stage
```html
{{#eachRelated "Opportunities" where='{"operator":"eq","field":"StageName","value":"Prospecting"}'}}
  <p>{{Name}} - {{Amount}}</p>
{{/eachRelated}}
```

#### Filter with Ordering
```html
{{#eachRelated "Opportunities" where='{"operator":"eq","field":"StageName","value":"Closed Won"}' orderBy="CloseDate DESC"}}
  <p>{{Name}} - Closed on {{CloseDate}}</p>
{{/eachRelated}}
```

#### Filter with Limit - Top 5 Opportunities by Amount
```html
{{#eachRelated "Opportunities" orderBy="Amount DESC" limit="5"}}
  <p>{{Name}} - ${{Amount}}</p>
{{/eachRelated}}
```

#### Complex Filter - Opportunities over $50K in Prospecting or Qualification
```html
{{#eachRelated "Opportunities" where='{"operator":"and","children":[{"operator":"gte","field":"Amount","value":50000},{"operator":"or","children":[{"operator":"eq","field":"StageName","value":"Prospecting"},{"operator":"eq","field":"StageName","value":"Qualification"}]}]}'}}
  <p>{{Name}} - {{StageName}} - ${{Amount}}</p>
{{/eachRelated}}
```

### Predicate JSON Structure

For complex filters, build the JSON like this:

#### Simple Predicate
```json
{
  "operator": "eq",
  "field": "StageName",
  "value": "Prospecting"
}
```

#### AND Predicate
```json
{
  "operator": "and",
  "children": [
    {"operator": "gte", "field": "Amount", "value": 50000},
    {"operator": "eq", "field": "StageName", "value": "Prospecting"}
  ]
}
```

#### OR Predicate
```json
{
  "operator": "or",
  "children": [
    {"operator": "eq", "field": "StageName", "value": "Prospecting"},
    {"operator": "eq", "field": "StageName", "value": "Qualification"}
  ]
}
```

---

## Complete Examples

### Example 1: Account Summary with Filtered Opportunities

```html
<!DOCTYPE html>
<html>
<head>
  <title>Account Summary</title>
  <style>
    body { font-family: Arial, sans-serif; }
    .header { background-color: #0070d2; color: white; padding: 20px; }
    .section { margin: 20px 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{Name}}</h1>
    <p>Account Type: {{Type}}</p>
  </div>

  <div class="section">
    <h2>Contact Information</h2>
    <p><strong>Phone:</strong> {{Phone}}</p>
    <p><strong>Website:</strong> {{Website}}</p>
    <p><strong>Billing Address:</strong><br>
       {{BillingStreet}}<br>
       {{BillingCity}}, {{BillingState}} {{BillingPostalCode}}
    </p>
  </div>

  <div class="section">
    <h2>Account Owner</h2>
    {{#if Owner.Name}}
      <p><strong>Name:</strong> {{Owner.Name}}</p>
      <p><strong>Email:</strong> {{Owner.Email}}</p>
      <p><strong>Phone:</strong> {{Owner.Phone}}</p>
    {{else}}
      <p>No owner assigned</p>
    {{/if}}
  </div>

  <div class="section">
    <h2>Open Opportunities (Over $25,000)</h2>
    <table>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Stage</th>
        <th>Amount</th>
        <th>Close Date</th>
      </tr>
      {{#eachRelated "Opportunities" where='{"operator":"and","children":[{"operator":"gte","field":"Amount","value":25000},{"operator":"ne","field":"StageName","value":"Closed Won"},{"operator":"ne","field":"StageName","value":"Closed Lost"}]}' orderBy="CloseDate ASC"}}
        <tr>
          <td>{{@index}}</td>
          <td>{{Name}}</td>
          <td>{{StageName}}</td>
          <td>${{Amount}}</td>
          <td>{{CloseDate}}</td>
        </tr>
      {{/eachRelated}}
    </table>
  </div>

  <div class="section">
    <h2>Recent Closed Won Opportunities</h2>
    {{#eachRelated "Opportunities" where='{"operator":"eq","field":"StageName","value":"Closed Won"}' orderBy="CloseDate DESC" limit="5"}}
      <div style="margin-bottom: 10px; padding: 10px; border: 1px solid #4caf50; background-color: #f1f8e9;">
        <strong>{{Name}}</strong> - ${{Amount}}<br>
        <em>Closed: {{CloseDate}}</em>
      </div>
    {{/eachRelated}}
  </div>

  <div class="section">
    <h2>All Contacts</h2>
    <ul>
    {{#each Contacts}}
      <li>
        {{Name}} - {{Title}}
        {{#if Email}}({{Email}}){{/if}}
        {{#if @first}}<strong>(Primary Contact)</strong>{{/if}}
      </li>
    {{/each}}
    </ul>
  </div>
</body>
</html>
```

### Example 2: Opportunity Report with Conditional Formatting

```html
<!DOCTYPE html>
<html>
<head>
  <title>Opportunity Pipeline</title>
  <style>
    .high-value { background-color: #fff3cd; }
    .closed-won { background-color: #d4edda; }
    .at-risk { background-color: #f8d7da; }
  </style>
</head>
<body>
  <h1>Opportunity: {{Name}}</h1>
  
  <div class="details">
    <p><strong>Account:</strong> {{Account.Name}}</p>
    <p><strong>Stage:</strong> {{StageName}}</p>
    <p><strong>Amount:</strong> ${{Amount}}</p>
    <p><strong>Close Date:</strong> {{CloseDate}}</p>
    <p><strong>Owner:</strong> {{Owner.Name}}</p>
  </div>

  {{#if Description}}
    <div class="section">
      <h2>Description</h2>
      <p>{{Description}}</p>
    </div>
  {{/if}}

  <div class="section">
    <h2>Products</h2>
    {{#each OpportunityLineItems}}
      <div style="margin-bottom: 10px;">
        <strong>{{Product2.Name}}</strong><br>
        Quantity: {{Quantity}} | Unit Price: ${{UnitPrice}} | Total: ${{TotalPrice}}
      </div>
    {{/each}}
  </div>

  <div class="section">
    <h2>Related Opportunities from Same Account</h2>
    {{#eachRelated "Account.Opportunities" where='{"operator":"ne","field":"Id","value":"{{Id}}"}' limit="10"}}
      <p>{{Name}} - {{StageName}} - ${{Amount}}</p>
    {{/eachRelated}}
  </div>
</body>
</html>
```

---

## Current Limitations

1. **No Math Operations**: The template engine doesn't support calculations like `{{Amount * 0.1}}` or `{{Price * Quantity}}`. These must be calculated in a formula field or by the backend.

2. **No Helper Functions**: Built-in helpers like `formatCurrency`, `formatDate`, etc. are not yet implemented. Use Salesforce formula fields for formatting.

3. **No Inline Comparisons**: You can't write `{{#if Amount > 1000}}`. Use the `where` clause in `{{#eachRelated}}` for filtering instead, or create a formula field for the comparison.

4. **Limited String Manipulation**: No `uppercase`, `lowercase`, `substring`, etc. Use formula fields or create the formatted value in Salesforce.

---

## Best Practices

1. **Use Formula Fields**: For complex formatting (currency, dates, calculations), create formula fields in Salesforce rather than trying to format in the template.

2. **Filter at Query Level**: Use `{{#eachRelated}}` with `where` clauses instead of fetching all records and conditionally displaying them.

3. **Order Your Data**: Always specify `orderBy` in `{{#eachRelated}}` to ensure consistent output.

4. **Limit Large Collections**: Use `limit` to prevent performance issues with large datasets.

5. **Test with Real Data**: Always preview your template with actual record data to ensure fields are accessible and formatting works as expected.

6. **Use CSS for Styling**: Add inline `<style>` tags or inline styles for PDF-friendly formatting.

---

## Security & Field-Level Security

- All fields in templates are subject to Salesforce Field-Level Security (FLS)
- If a user doesn't have access to a field, it will be filtered out during query execution
- Always test templates with users who have different permission levels
- The template engine respects sharing rules and object-level security

---

## Troubleshooting

### Fields Not Displaying
- **Check Field API Name**: Use the exact API name (e.g., `Custom_Field__c`)
- **Check FLS**: Ensure your user/profile has read access to the field
- **Check Discovery**: Click "Discover Fields" to validate field access
- **Check Console**: Look for validation errors in the browser console

### Collections Not Displaying
- **Check Relationship Name**: Use the child relationship name (e.g., `Opportunities`, not `Opportunity`)
- **Check SOQL**: Review the generated SOQL query in the console logs
- **Check Data**: Ensure the record actually has child records
- **Check Permissions**: Verify you have access to the child object

### Filtering Not Working
- **Use eachRelated**: Basic `{{#each}}` doesn't filter; use `{{#eachRelated}}` instead
- **Validate JSON**: Ensure the `where` JSON is properly formatted (use a JSON validator)
- **Check Operator**: Verify you're using a supported operator (see Filter Operators section)
- **Check Field Type**: Ensure the value matches the field type (strings need quotes, numbers don't)

---

## Need More Features?

The template engine is designed to be simple and Locker Service-compliant. For advanced scenarios:
- Use Salesforce formula fields for calculations and formatting
- Use validation rules to ensure data quality before generation
- Create custom fields with rollup summaries for aggregations
- Use Process Builder or Flow to prepare data before document generation

---

## Version
This guide is for DocGen Template Engine v1.0
Last Updated: October 2025

