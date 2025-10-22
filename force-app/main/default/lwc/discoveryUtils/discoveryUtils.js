/**
 * Utility for discovering fields and relationships from Handlebars templates
 */

/**
 * Parse template HTML and discover all field paths and collections
 * @param {string} htmlTemplate - HTML template with Handlebars tokens
 * @param {string} primaryObject - Primary SObject API name
 * @returns {Object} Discovery payload with scalarPaths and collections
 */
export function discoverFields(htmlTemplate, primaryObject) {
    const payload = {
        primaryObject,
        scalarPaths: new Set(),
        collections: []
    };

    if (!htmlTemplate) {
        return payload;
    }

    console.log('🔍 Starting field discovery...');
    console.log('📄 Original template length:', htmlTemplate.length);

    // First, extract and process {{#each}} blocks to avoid double-counting fields
    // Updated regex to capture optional parameters (where, orderBy, limit, offset)
    const eachRegex = /\{\{#each\s+(\w+)\s*([^}]*?)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    let match;

    // Extract all {{#each}} blocks
    let templateWithoutCollections = htmlTemplate;
    const eachMatches = [];
    while ((match = eachRegex.exec(htmlTemplate)) !== null) {
        eachMatches.push({
            fullMatch: match[0],
            relationshipName: match[1].trim(),
            params: match[2].trim(),  // Capture parameters but don't process them (client-side filtering)
            innerTemplate: match[3]
        });
    }
    console.log(`📦 Found ${eachMatches.length} {{#each}} blocks:`, eachMatches.map(m => m.relationshipName));

    // Remove {{#each}} blocks from template for scalar discovery
    for (const eachMatch of eachMatches) {
        templateWithoutCollections = templateWithoutCollections.replace(eachMatch.fullMatch, '');
    }
    console.log('📄 Template after removing {{#each}} blocks, length:', templateWithoutCollections.length);

    // Find scalar tokens: {{fieldPath}} (excluding those in {{#each}} blocks)
    const scalarRegex = /\{\{(?!\#|\/)([\w.]+)\}\}/g;
    const scalarMatches = [];
    while ((match = scalarRegex.exec(templateWithoutCollections)) !== null) {
        const path = match[1].trim();
        scalarMatches.push(path);
        if (path && !isHelperCall(path) && !isSpecialToken(path)) {
            payload.scalarPaths.add(path);
        }
    }
    console.log(`✅ Found ${scalarMatches.length} scalar field references:`, scalarMatches);
    console.log(`✅ After filtering, ${payload.scalarPaths.size} unique scalar paths:`, Array.from(payload.scalarPaths));

    // Process {{#each}} blocks separately
    console.log(`🔄 Processing ${eachMatches.length} {{#each}} collections...`);
    for (const eachMatch of eachMatches) {
        console.log(`  📦 Processing {{#each ${eachMatch.relationshipName}}}`);
        const collection = {
            relationshipName: eachMatch.relationshipName,
            fieldPaths: new Set(),
            wherePredicate: null,
            orderBy: [],
            limitVal: null,
            offsetVal: null
        };

        // Find fields within the collection block
        const innerRegex = /\{\{([\w.]+)\}\}/g;
        let innerMatch;
        while ((innerMatch = innerRegex.exec(eachMatch.innerTemplate)) !== null) {
            const path = innerMatch[1].trim();
            if (path && !isHelperCall(path) && !isSpecialToken(path) && !path.startsWith('@')) {
                collection.fieldPaths.add(path);
            }
        }
        console.log(`    ✅ Found ${collection.fieldPaths.size} fields:`, Array.from(collection.fieldPaths));

        payload.collections.push(collection);
    }

    // Note: Filtering is now handled client-side, no need to extract where clauses

    // Merge collections with the same relationship name
    console.log(`🔄 Merging collections with duplicate relationship names...`);
    const collectionMap = new Map();

    for (const collection of payload.collections) {
        const key = collection.relationshipName;

        if (collectionMap.has(key)) {
            // Merge with existing collection
            const existing = collectionMap.get(key);
            console.log(`  🔀 Merging duplicate collection '${key}'`);

            // Combine field paths
            for (const field of collection.fieldPaths) {
                existing.fieldPaths.add(field);
            }

            // If new collection has filtering/ordering and existing doesn't, use the new one
            // Otherwise, prefer the one with more specific criteria
            if (collection.wherePredicate && !existing.wherePredicate) {
                existing.wherePredicate = collection.wherePredicate;
                console.log(`    ✅ Applied where clause from duplicate`);
            }
            if (collection.orderBy.length > 0 && existing.orderBy.length === 0) {
                existing.orderBy = collection.orderBy;
                console.log(`    ✅ Applied orderBy from duplicate`);
            }
            if (collection.limitVal !== null && existing.limitVal === null) {
                existing.limitVal = collection.limitVal;
                console.log(`    ✅ Applied limit from duplicate`);
            }
            if (collection.offsetVal !== null && existing.offsetVal === null) {
                existing.offsetVal = collection.offsetVal;
                console.log(`    ✅ Applied offset from duplicate`);
            }
        } else {
            // First occurrence of this relationship
            collectionMap.set(key, collection);
        }
    }

    // Replace collections array with merged collections
    payload.collections = Array.from(collectionMap.values());
    console.log(`  ✅ Reduced ${collectionMap.size} unique collections from duplicates`);

    // Convert Sets to Arrays for serialization
    // NOTE: We send collections WITHOUT filtering/ordering to Apex - filtering happens client-side
    // This allows multiple filtered views of the same relationship in one template
    payload.scalarPaths = Array.from(payload.scalarPaths);
    payload.collections = payload.collections.map(c => ({
        relationshipName: c.relationshipName,
        fieldPaths: Array.from(c.fieldPaths),
        wherePredicate: null,  // No server-side filtering
        orderBy: [],           // No server-side ordering
        limitVal: null,        // No server-side limiting
        offsetVal: null
    }));

    console.log('🎯 FINAL DISCOVERY PAYLOAD:');
    console.log('  📝 Scalar Paths:', payload.scalarPaths);
    console.log('  📦 Collections:', payload.collections.length);
    payload.collections.forEach((c, i) => {
        console.log(`    [${i}] ${c.relationshipName}:`, c.fieldPaths);
        if (c.wherePredicate) console.log(`        WHERE:`, c.wherePredicate);
        if (c.orderBy.length) console.log(`        ORDER BY:`, c.orderBy);
        if (c.limitVal) console.log(`        LIMIT:`, c.limitVal);
    });

    return payload;
}

/**
 * Normalize a predicate object to match Apex DTO structure
 * Ensures all required properties are present for JSON deserialization
 */
function normalizePredicateForApex(predicate) {
    if (!predicate) {
        return null;
    }

    // Handle value serialization
    let normalizedValue = null;
    if (predicate.value !== undefined && predicate.value !== null) {
        // For 'in' operator, value is an array - convert to JSON string for Apex to parse
        if (predicate.operator === 'in' && Array.isArray(predicate.value)) {
            normalizedValue = JSON.stringify(predicate.value);
        } else if (Array.isArray(predicate.value)) {
            // Other array values (shouldn't happen, but handle it)
            normalizedValue = JSON.stringify(predicate.value);
        } else {
            // Scalar values: string, number, boolean, null
            normalizedValue = String(predicate.value);
        }
    }

    return {
        operator: predicate.operator || null,
        field: predicate.field || null,
        value: normalizedValue,
        children: predicate.children
            ? predicate.children.map(c => normalizePredicateForApex(c))
            : []
    };
}

/**
 * Check if token is a helper call (contains spaces or parentheses)
 */
function isHelperCall(token) {
    return token.includes(' ') || token.includes('(') || token.includes(')');
}

/**
 * Check if token is a special Handlebars token
 */
function isSpecialToken(token) {
    const special = ['this', '@index', '@key', '@first', '@last', '@root', '@../'];
    return special.some(s => token.startsWith(s));
}

/**
 * Parse where parameter from eachRelated
 * Returns predicate AST or null
 */
function parseWhereParam(params) {
    // Try JSON format first: where='{"operator":"eq","field":"StageName","value":"Prospecting"}'
    const jsonMatch = /where='([^']+)'/.exec(params) || /where="([^"]+)"/.exec(params);
    if (jsonMatch) {
        try {
            // Parse JSON directly
            const predicate = JSON.parse(jsonMatch[1]);
            return predicate;
        } catch (e) {
            console.error('Failed to parse where clause JSON:', e);
            return null;
        }
    }

    // Fall back to DSL format: where=(eq "StageName" "Prospecting")
    const dslMatch = /where=\(([^)]+)\)/.exec(params);
    if (dslMatch) {
        const whereExpr = dslMatch[1].trim();
        return parsePredicateExpression(whereExpr);
    }

    return null;
}

/**
 * Parse orderBy parameter
 * Returns array of {field, direction}
 */
function parseOrderByParam(params) {
    // Try simple format first: orderBy="Amount DESC" or orderBy="CloseDate ASC, Amount DESC"
    const simpleMatch = /orderBy="([^"]+)"/.exec(params) || /orderBy='([^']+)'/.exec(params);
    if (simpleMatch) {
        const orderClauses = simpleMatch[1].split(',');
        const orderBy = [];

        for (const clause of orderClauses) {
            const parts = clause.trim().split(/\s+/);
            if (parts.length >= 1) {
                orderBy.push({
                    field: parts[0],
                    direction: parts[1] ? parts[1].toUpperCase() : 'ASC'
                });
            }
        }

        return orderBy;
    }

    // Fall back to DSL format: orderBy=(array "Amount" "DESC")
    const dslMatch = /orderBy=\(array\s+([^)]+)\)/.exec(params);
    if (dslMatch) {
        const parts = dslMatch[1].split(/\s+/).map(p => p.replace(/"/g, '').trim()).filter(Boolean);
        const orderBy = [];

        for (let i = 0; i < parts.length; i += 2) {
            if (i + 1 < parts.length) {
                orderBy.push({
                    field: parts[i],
                    direction: parts[i + 1].toUpperCase()
                });
            }
        }

        return orderBy;
    }

    return [];
}

/**
 * Parse limit parameter
 */
function parseLimitParam(params) {
    // Support both limit="5" and limit=5
    const limitMatch = /limit="?(\d+)"?/.exec(params);
    return limitMatch ? parseInt(limitMatch[1], 10) : null;
}

/**
 * Parse offset parameter
 */
function parseOffsetParam(params) {
    // Support both offset="10" and offset=10
    const offsetMatch = /offset="?(\d+)"?/.exec(params);
    return offsetMatch ? parseInt(offsetMatch[1], 10) : null;
}

/**
 * Parse predicate expression into AST
 * Simplified parser for demonstration
 */
function parsePredicateExpression(expr) {
    expr = expr.trim();

    // Handle logical operators (all, any, not)
    if (expr.startsWith('all ')) {
        const children = parseChildPredicates(expr.substring(4));
        return { operator: 'and', children };
    }

    if (expr.startsWith('any ')) {
        const children = parseChildPredicates(expr.substring(4));
        return { operator: 'or', children };
    }

    if (expr.startsWith('not ')) {
        const child = parsePredicateExpression(expr.substring(4));
        return { operator: 'not', children: [child] };
    }

    // Handle comparison operators
    const comparisonMatch = /^(eq|ne|gt|gte|lt|lte|contains|startsWith|endsWith|in)\s+"([^"]+)"\s+(.+)$/.exec(expr);
    if (comparisonMatch) {
        const [, operator, field, valueStr] = comparisonMatch;
        return {
            operator,
            field,
            value: parseValue(valueStr),
            children: []
        };
    }

    // Handle isNull, isNotNull
    if (expr.startsWith('isNull ')) {
        return { operator: 'isNull', field: expr.substring(7).replace(/"/g, '').trim(), children: [] };
    }

    if (expr.startsWith('isNotNull ')) {
        return { operator: 'isNotNull', field: expr.substring(10).replace(/"/g, '').trim(), children: [] };
    }

    return null;
}

/**
 * Parse child predicates (simplified)
 */
function parseChildPredicates(expr) {
    // This is a simplified implementation
    // In production, use a proper parser
    const children = [];
    const parts = expr.match(/\([^)]+\)/g) || [];

    for (const part of parts) {
        const inner = part.substring(1, part.length - 1);
        const pred = parsePredicateExpression(inner);
        if (pred) children.push(pred);
    }

    return children;
}

/**
 * Parse value from string
 */
function parseValue(valueStr) {
    valueStr = valueStr.trim();

    // Remove quotes
    if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
        (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
        return valueStr.substring(1, valueStr.length - 1);
    }

    // Parse number
    if (/^-?\d+(\.\d+)?$/.test(valueStr)) {
        return parseFloat(valueStr);
    }

    // Parse boolean
    if (valueStr === 'true') return true;
    if (valueStr === 'false') return false;

    // Parse null
    if (valueStr === 'null') return null;

    return valueStr;
}

/**
 * Extract field references from predicate tree
 */
function extractFieldsFromPredicate(predicate, fieldSet) {
    if (!predicate) return;

    if (predicate.field) {
        fieldSet.add(predicate.field);
    }

    if (predicate.children) {
        for (const child of predicate.children) {
            extractFieldsFromPredicate(child, fieldSet);
        }
    }
}

/**
 * Validate discovery payload
 */
export function validateDiscovery(payload) {
    const errors = [];

    if (!payload.primaryObject) {
        errors.push('Primary object is required');
    }

    if (!payload.scalarPaths || payload.scalarPaths.length === 0) {
        if (!payload.collections || payload.collections.length === 0) {
            errors.push('Template must contain at least one field reference');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

