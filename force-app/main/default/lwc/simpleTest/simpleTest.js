import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import pdfjsbundled from '@salesforce/resourceUrl/pdfjsbundled';

export default class SimpleTest extends LightningElement {
    renderedCallback() {
        console.log('SimpleTest: Component rendered');
        console.log('SimpleTest: pdfjsbundled URL:', pdfjsbundled);
        this.loadPdfJs();
    }

    async loadPdfJs() {
        try {
            console.log('SimpleTest: Starting loadScript...');
            console.log('SimpleTest: URL being loaded:', pdfjsbundled);

            await loadScript(this, pdfjsbundled);

            console.log('SimpleTest: loadScript completed successfully');
            console.log('SimpleTest: Checking global variables...');
            console.log('SimpleTest: window.pdfjsLib:', window.pdfjsLib);
            console.log('SimpleTest: window.pdfjs_dist:', window.pdfjs_dist);
            console.log('SimpleTest: globalThis.pdfjsLib:', globalThis.pdfjsLib);
            console.log('SimpleTest: globalThis.pdfjs_dist:', globalThis.pdfjs_dist);
            console.log('SimpleTest: window.pdfjsWorker:', window.pdfjsWorker);

            // Check what's available in the global scope
            const globalKeys = Object.keys(window).filter(key => key.toLowerCase().includes('pdf'));
            console.log('SimpleTest: Global keys containing "pdf":', globalKeys);

            // If pdfjs_dist is available, test it
            if (window.pdfjs_dist) {
                console.log('SimpleTest: Found pdfjs_dist! Properties:', Object.keys(window.pdfjs_dist));
                console.log('SimpleTest: pdfjs_dist.getDocument:', typeof window.pdfjs_dist.getDocument);
                console.log('SimpleTest: pdfjs_dist.version:', window.pdfjs_dist.version);
            }

        } catch (error) {
            console.error('SimpleTest: loadScript failed:', error);
            console.error('SimpleTest: Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
    }
}