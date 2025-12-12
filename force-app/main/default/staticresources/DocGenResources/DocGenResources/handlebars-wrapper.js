/**
 * Locker Service-compliant wrapper for Handlebars
 * This wraps the Handlebars library to work within Salesforce Lightning Locker Service
 */
(function () {
    'use strict';

    // Create a namespace for our library
    if (typeof window.DocGen === 'undefined') {
        window.DocGen = {};
    }

    // The handlebars.js file should have already been loaded
    // We're just exposing it in a Locker-compliant way
    if (typeof Handlebars !== 'undefined') {
        window.DocGen.Handlebars = Handlebars;
        console.log('✅ Handlebars wrapped successfully in DocGen namespace');
    } else {
        console.error('❌ Handlebars not found - make sure handlebars.js loads first');
    }
})();

