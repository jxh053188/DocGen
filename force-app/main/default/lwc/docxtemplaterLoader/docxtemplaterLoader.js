import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import PIZZIP from '@salesforce/resourceUrl/pizzip';
import DOCXTEMPLATER from '@salesforce/resourceUrl/docxtemplater';
import HTML2CANVAS from '@salesforce/resourceUrl/html2canvas';
import PDFLIB from '@salesforce/resourceUrl/pdflib';
import MAMMOTH from '@salesforce/resourceUrl/mammoth';
import JSPDF from '@salesforce/resourceUrl/jspdf'

/**
 * Wrapper component for loading PizZip and Docxtemplater libraries
 * Workaround for known issue: https://help.salesforce.com/s/issue?id=a028c00000gAxQiAAK
 * This component handles loadScript calls internally to avoid the bug with
 * loadScript in renderedCallback on custom object flexipages.
 */
export default class DocxtemplaterLoader extends LightningElement {
    static renderMode = 'light';
    loadAttempted = false;
    pizzipLoaded = false;
    docxtemplaterLoaded = false;
    html2canvasLoaded = false;
    pdflibLoaded = false;
    mammothLoaded = false;
    pdfjsLoaded = false;
    connectedCallback() {
        if (!this.loadAttempted) {
            this.loadAttempted = true;
            this.loadLibraries();
        }
    }

    async loadPizzip() {
        try {
            await loadScript(this, PIZZIP);
            this.pizzipLoaded = true;
            this.dispatchEvent(new CustomEvent('pizziploaded'));
        } catch (error) {
            console.error('❌ Failed to load PizZip:', error);
        }
    }

    async loadDocxtemplater() {
        try {
            await loadScript(this, DOCXTEMPLATER);
            this.docxtemplaterLoaded = true;
            this.dispatchEvent(new CustomEvent('docxtemplaterloaded'));
        } catch (error) {
            console.error('❌ Failed to load Docxtemplater:', error);
        }
    }

    async loadPdflib() {
        try {
            await loadScript(this, PDFLIB);
            this.pdflibLoaded = true;
            this.dispatchEvent(new CustomEvent('pdflibloaded'));
        } catch (error) {
            console.error('❌ Failed to load Pdflib:', error);
        }
    }

    async loadHtml2canvas() {
        try {
            await loadScript(this, HTML2CANVAS);
            this.html2canvasLoaded = true;
            this.dispatchEvent(new CustomEvent('html2canvasloaded'));
        } catch (error) {
            console.error('❌ Failed to load Html2canvas:', error);
        }
    }
    async loadMammoth() {
        try {
            await loadScript(this, MAMMOTH);
            this.mammothLoaded = true;
            this.dispatchEvent(new CustomEvent('mammothloaded'));
        } catch (error) {
            console.error('❌ Failed to load Mammoth:', error);
        }
    }

    async loadJspdf() {
        try {
            await loadScript(this, JSPDF);
            this.jspdfLoaded = true;
            this.dispatchEvent(new CustomEvent('jspdfloaded'));
        } catch (error) {
            console.error('❌ Failed to load Jspdf:', error);
        }
    }
    async loadLibraries() {
        try {
            // Load all libraries in parallel
            await Promise.all([
                this.loadPizzip(),
                this.loadDocxtemplater(),
                this.loadHtml2canvas(),
                this.loadPdflib(),
                this.loadMammoth(),
                this.loadJspdf(),
            ]);

            // Give scripts a moment to execute their window assignments
            // The IIFE window assignments at the end of static resources need time to run
            await new Promise((resolve) => {
                // Use a polling approach to check when libraries are ready
                let attempts = 0;
                const maxAttempts = 20; // 2 seconds max (20 * 100ms)
                const checkInterval = 100;

                const checkLibraries = () => {
                    attempts++;
                    const pizzipReady = !!(window.PizZip && typeof window.PizZip === 'function');
                    const docxtemplaterReady = !!(window.docxtemplater && typeof window.docxtemplater === 'function');
                    const html2canvasReady = !!(window.html2canvas && typeof window.html2canvas === 'function');
                    const pdflibReady = !!(window.PDFLib && typeof window.PDFLib === 'object');
                    const mammothReady = !!(window.mammoth && typeof window.mammoth === 'object');
                    const jspdfReady = !!(window.jsPDF && typeof window.jsPDF === 'function') || 
                                      !!(window.jspdf && (
                                          typeof window.jspdf === 'function' || 
                                          (typeof window.jspdf === 'object' && (window.jspdf.jsPDF || window.jspdf.default))
                                      ));
                    const pdfjsReady = !!(window.pdfjsLib && typeof window.pdfjsLib === 'object');

                    if (pizzipReady && docxtemplaterReady && html2canvasReady && pdflibReady && mammothReady && jspdfReady) {
                        console.log('✅ All libraries verified on window object:', {
                            PizZip: pizzipReady,
                            docxtemplater: docxtemplaterReady,
                            html2canvas: html2canvasReady,
                            PDFLib: pdflibReady,
                            Mammoth: mammothReady,
                            jspdf: jspdfReady,  
                        });
                        resolve();
                    } else if (attempts >= maxAttempts) {
                        console.warn('⚠️ Libraries not fully loaded after', maxAttempts * checkInterval, 'ms:', {
                            PizZip: pizzipReady,
                            docxtemplater: docxtemplaterReady,
                            html2canvas: html2canvasReady,
                            PDFLib: pdflibReady,
                            Mammoth: mammothReady,
                            jspdf: jspdfReady,
                        });
                        // Resolve anyway - the polling in waitForLibraries will handle retries
                        resolve();
                    } else {
                        // eslint-disable-next-line @lwc/lwc/no-async-operation
                        setTimeout(checkLibraries, checkInterval);
                    }
                };

                // Start checking
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(checkLibraries, checkInterval);
            });
        } catch (error) {
            console.error('❌ Failed to load libraries:', error);
            const errorMessage = error?.message || (error ? String(error) : 'Unknown error');
            this.dispatchEvent(new CustomEvent('loaderror', {
                detail: { error: errorMessage }
            }));
        }
    }
}
