/**
 * Locker Service-compliant template engine for DocGen
 * Supports basic Mustache-like syntax without eval() or Function()
 */

/**
 * Render a template with data
 * @param {string} template - Template string with {{variable}} syntax
 * @param {object} data - Data object to render
 * @returns {string} Rendered HTML
 */
export function render(template, data) {
    if (!template || typeof template !== 'string') {
        return '';
    }
    if (!data || typeof data !== 'object') {
        return template;
    }

    let result = template;

    // Process {{#each collection [where="..."] [orderBy="..."] [limit="..."] [offset="..."]}} blocks
    result = processEach(result, data);

    // Process {{#if condition}} blocks
    result = processIf(result, data);

    // Process simple variables {{variable}} and {{nested.path}}
    result = processVariables(result, data);

    return result;
}

// Removed processEachRelated - now unified with processEach

/**
 * Parse WHERE clause DSL into predicate structure
 * Example: "StageName eq 'Prospecting' AND Amount gt 1000"
 * Supports: eq, ne, gt, gte, lt, lte, contains, startsWith, endsWith, in, isNull, isNotNull
 * Logical: AND, OR, NOT
 * Grouping: ( )
 */
function parseWhereDSL(whereClause) {
    if (!whereClause || !whereClause.trim()) {
        return null;
    }

    // Tokenize the expression
    const tokens = tokenizeWhere(whereClause);

    // Parse the tokens into a predicate tree
    let pos = 0;

    function parseExpression() {
        return parseOr();
    }

    function parseOr() {
        let left = parseAnd();

        while (pos < tokens.length && tokens[pos].toUpperCase() === 'OR') {
            pos++; // consume OR
            const right = parseAnd();
            left = {
                operator: 'or',
                children: [left, right]
            };
        }

        return left;
    }

    function parseAnd() {
        let left = parseNot();

        while (pos < tokens.length && tokens[pos].toUpperCase() === 'AND') {
            pos++; // consume AND
            const right = parseNot();
            left = {
                operator: 'and',
                children: [left, right]
            };
        }

        return left;
    }

    function parseNot() {
        if (pos < tokens.length && tokens[pos].toUpperCase() === 'NOT') {
            pos++; // consume NOT
            return {
                operator: 'not',
                children: [parsePrimary()]
            };
        }
        return parsePrimary();
    }

    function parsePrimary() {
        // Handle parentheses
        if (tokens[pos] === '(') {
            pos++; // consume (
            const expr = parseExpression();
            if (tokens[pos] === ')') {
                pos++; // consume )
            }
            return expr;
        }

        // Parse comparison: field operator value
        const field = tokens[pos++];
        const operator = tokens[pos++].toLowerCase();

        // Special case for isNull/isNotNull - no value needed
        if (operator === 'isnull' || operator === 'isnotnull') {
            return {
                operator: operator,
                field: field,
                value: null,
                children: []
            };
        }

        // For 'in' operator, parse array of values
        if (operator === 'in') {
            // Expect format: field in (val1, val2, val3)
            if (tokens[pos] === '(') {
                pos++; // consume (
                const values = [];
                while (pos < tokens.length && tokens[pos] !== ')') {
                    if (tokens[pos] !== ',') {
                        values.push(parseValue(tokens[pos]));
                    }
                    pos++;
                }
                if (tokens[pos] === ')') {
                    pos++; // consume )
                }
                return {
                    operator: 'in',
                    field: field,
                    value: values,
                    children: []
                };
            }
        }

        const value = parseValue(tokens[pos++]);

        return {
            operator: operator,
            field: field,
            value: value,
            children: []
        };
    }

    function parseValue(token) {
        // String literal
        if (token.startsWith("'") && token.endsWith("'")) {
            return token.slice(1, -1);
        }
        // Number
        if (!isNaN(token)) {
            return parseFloat(token);
        }
        // Boolean
        if (token.toLowerCase() === 'true') return true;
        if (token.toLowerCase() === 'false') return false;
        // null
        if (token.toLowerCase() === 'null') return null;

        return token;
    }

    return parseExpression();
}

/**
 * Tokenize WHERE clause into individual tokens
 */
function tokenizeWhere(whereClause) {
    const tokens = [];
    let current = '';
    let inString = false;

    for (let i = 0; i < whereClause.length; i++) {
        const char = whereClause[i];

        if (char === "'" && (i === 0 || whereClause[i - 1] !== '\\')) {
            if (inString) {
                current += char;
                tokens.push(current);
                current = '';
                inString = false;
            } else {
                if (current.trim()) {
                    tokens.push(current.trim());
                }
                current = char;
                inString = true;
            }
        } else if (inString) {
            current += char;
        } else if (char === '(' || char === ')' || char === ',') {
            if (current.trim()) {
                tokens.push(current.trim());
            }
            tokens.push(char);
            current = '';
        } else if (/\s/.test(char)) {
            if (current.trim()) {
                tokens.push(current.trim());
            }
            current = '';
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        tokens.push(current.trim());
    }

    return tokens;
}

/**
 * Evaluate a predicate against an item
 */
function evaluatePredicate(item, predicate) {
    if (!predicate || !predicate.operator) {
        return true;
    }

    const { operator, field, value, children } = predicate;

    switch (operator.toLowerCase()) {
        case 'and':
            return children.every(child => evaluatePredicate(item, child));
        case 'or':
            return children.some(child => evaluatePredicate(item, child));
        case 'not':
            return !evaluatePredicate(item, children[0]);
        case 'eq':
            return getValue(item, field) == value;
        case 'ne':
            return getValue(item, field) != value;
        case 'gt':
            return getValue(item, field) > parseFloat(value);
        case 'gte':
            return getValue(item, field) >= parseFloat(value);
        case 'lt':
            return getValue(item, field) < parseFloat(value);
        case 'lte':
            return getValue(item, field) <= parseFloat(value);
        case 'contains':
            return String(getValue(item, field) || '').toLowerCase().includes(String(value).toLowerCase());
        case 'startswith':
            return String(getValue(item, field) || '').toLowerCase().startsWith(String(value).toLowerCase());
        case 'endswith':
            return String(getValue(item, field) || '').toLowerCase().endsWith(String(value).toLowerCase());
        case 'in':
            const values = Array.isArray(value) ? value : JSON.parse(value);
            return values.includes(getValue(item, field));
        case 'isnull':
            return getValue(item, field) == null || getValue(item, field) === '';
        case 'isnotnull':
            return getValue(item, field) != null && getValue(item, field) !== '';
        default:
            console.warn(`Unknown operator: ${operator}`);
            return true;
    }
}

/**
 * Apply sorting to a collection
 */
function applySorting(collection, orderByStr) {
    if (!orderByStr) return collection;

    // Parse "Field1 ASC, Field2 DESC" format
    const sorts = orderByStr.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        return {
            field: parts[0],
            direction: (parts[1] || 'ASC').toUpperCase()
        };
    });

    return [...collection].sort((a, b) => {
        for (const sort of sorts) {
            const aVal = getValue(a, sort.field);
            const bVal = getValue(b, sort.field);

            let comparison = 0;
            if (aVal < bVal) comparison = -1;
            else if (aVal > bVal) comparison = 1;

            if (comparison !== 0) {
                return sort.direction === 'DESC' ? -comparison : comparison;
            }
        }
        return 0;
    });
}

/**
 * Process {{#each collection [where="..."] [orderBy="..."] [limit="..."] [offset="..."]}}...{{/each}} blocks
 * Supports optional client-side filtering, ordering, and limiting
 */
function processEach(template, data) {
    // Match: {{#each CollectionName [params]}}...{{/each}}
    // Capture collection name and optional parameters
    const eachRegex = /\{\{#each\s+(\w+)\s*([^}]*?)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(eachRegex, (match, collectionName, params, blockContent) => {
        let collection = getValue(data, collectionName);

        // Handle Salesforce child relationship structure
        if (collection && typeof collection === 'object' && !Array.isArray(collection)) {
            if (Array.isArray(collection.records)) {
                console.log(`🔄 Converting Salesforce child relationship '${collectionName}' from object to array`);
                collection = collection.records;
            }
        }

        if (!Array.isArray(collection)) {
            console.warn(`⚠️ Collection '${collectionName}' is not an array:`, collection);
            return '';
        }

        console.log(`🔍 Original ${collectionName} collection: ${collection.length} items`);

        // Parse optional parameters
        const whereMatch = params.match(/where="([^"]+)"|where='([^']+)'/);
        const orderByMatch = params.match(/orderBy="([^"]+)"|orderBy='([^']+)'/);
        const limitMatch = params.match(/limit="?(\d+)"?/);
        const offsetMatch = params.match(/offset="?(\d+)"?/);

        // Apply WHERE filter using DSL syntax
        if (whereMatch) {
            const whereClause = whereMatch[1] || whereMatch[2];
            console.log(`  🔍 Applying filter: ${whereClause}`);
            try {
                const predicate = parseWhereDSL(whereClause);
                collection = collection.filter(item => evaluatePredicate(item, predicate));
                console.log(`  ✅ After filter: ${collection.length} items`);
            } catch (e) {
                console.error(`❌ Failed to parse where clause "${whereClause}":`, e);
            }
        }

        // Apply ORDER BY
        if (orderByMatch) {
            const orderByStr = orderByMatch[1] || orderByMatch[2];
            console.log(`  📊 Applying orderBy: ${orderByStr}`);
            collection = applySorting(collection, orderByStr);
        }

        // Apply OFFSET
        if (offsetMatch) {
            const offset = parseInt(offsetMatch[1]);
            console.log(`  ⏭️ Applying offset: ${offset}`);
            collection = collection.slice(offset);
        }

        // Apply LIMIT
        if (limitMatch) {
            const limit = parseInt(limitMatch[1]);
            console.log(`  🔢 Applying limit: ${limit}`);
            collection = collection.slice(0, limit);
        }

        if (collection.length === 0) {
            console.log(`ℹ️ Collection '${collectionName}' is empty after filtering`);
            return '';
        }

        console.log(`✅ Processing ${collection.length} items in '${collectionName}'`);

        return collection.map((item, index) => {
            const itemContext = {
                ...item,
                '@index': index,
                '@first': index === 0,
                '@last': index === collection.length - 1
            };

            let rendered = blockContent;
            rendered = processVariables(rendered, itemContext);
            return rendered;
        }).join('');
    });
}

/**
 * Process {{#if condition}}...{{/if}} and {{#if condition}}...{{else}}...{{/if}}
 */
function processIf(template, data) {
    const ifRegex = /\{\{#if\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

    return template.replace(ifRegex, (match, condition, trueBlock, falseBlock = '') => {
        const value = getValue(data, condition);
        const isTruthy = value !== null && value !== undefined && value !== false && value !== '' && value !== 0;

        return isTruthy ? trueBlock : falseBlock;
    });
}

/**
 * Process simple variables {{variable}} and {{nested.path}}
 */
function processVariables(template, data) {
    // Match {{variable}} or {{nested.path}} but not {{#helper}} or {{/helper}}
    const varRegex = /\{\{(?!#|\/)([\w.@]+)\}\}/g;

    return template.replace(varRegex, (match, path) => {
        const value = getValue(data, path);
        return formatValue(value);
    });
}

/**
 * Get value from object using dot notation path
 * @param {object} obj - Object to get value from
 * @param {string} path - Dot notation path (e.g., 'Owner.Name')
 * @returns {*} Value at path or empty string
 */
function getValue(obj, path) {
    if (!obj || !path) {
        return '';
    }

    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
        if (value === null || value === undefined) {
            return '';
        }
        value = value[key];
    }

    return value;
}

/**
 * Format value for output (handle null, undefined, objects, etc.)
 */
function formatValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        // Don't render [object Object]
        return JSON.stringify(value);
    }
    return String(value);
}

/**
 * Helper function to escape HTML (for safe rendering)
 * Use this when you want to prevent XSS
 */
export function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Register helper functions for advanced formatting
 * This allows components to add custom helpers
 */
const helpers = {};

export function registerHelper(name, fn) {
    helpers[name] = fn;
}

export function getHelper(name) {
    return helpers[name];
}

