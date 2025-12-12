/**
 * PDF Viewer Test Component for Salesforce LWS
 * 
 * This component demonstrates PDF.js rendering in a Salesforce LWC environment
 * with Lightning Web Security (LWS) / Locker Service constraints.
 * 
 * FIX NOTES:
 * 
 * 1. NULL CONTAINER FIX:
 *    - The error "Cannot use 'in' operator to search for 'childElementCount' in null"
 *      happened because renderedCallback fired before the DOM element existed.
 *    - The container is conditionally rendered (wrapped in if:true={pdfBytes}), so it
 *      may not exist on the first renderedCallback invocation.
 *    - FIX: Added explicit null check with early return before any operations.
 * 
 * 2. LOCKER "EMPTY REFERENCE" FIX:
 *    - "Caching an empty reference is prohibited" error occurs when you assign
 *      null/undefined to a component property after a DOM query fails.
 *    - LWS/Locker wraps DOM nodes in secure wrappers; storing null is forbidden.
 *    - FIX: Never store container references on `this`. Re-query the DOM fresh
 *      within the method scope. Only proceed if the element exists.
 * 
 * 3. ABORTCONTROLLER POLYFILL:
 *    - Added to pdfjs_dist_lws.js separately (see that file).
 *    - The "AbortController is not a constructor" error happens because
 *      Salesforce LWS may sandbox or block AbortController in some contexts.
 *    - FIX: Added minimal polyfill before PDF.js initialization.
 * 
 * 4. GETDOCUMENT OPTIONS:
 *    - Added disableAutoFetch, disableStream, and disableRange to reduce
 *      dependencies on features that may conflict with LWS restrictions.
 */
import { LightningElement, track } from 'lwc';
import jsPDF from '@salesforce/resourceUrl/jspdf';
import pdfjsMain from '@salesforce/resourceUrl/pdfjs_dist_lws';
import pdfjsWorker from '@salesforce/resourceUrl/pdfjs_worker_lws';

import { loadScript } from 'lightning/platformResourceLoader';

export default class PdfViewerTest extends LightningElement {
    static renderMode = 'light';
    @track pdfBytes = null;
    @track loading = false;
    @track error = '';
    @track pdfJsReady = false;

    pdfjs;

    // Use a simple boolean flag instead of storing DOM references
    _didRenderPdf = false;
    _isInitializing = false;

    connectedCallback() {
        // Polyfill AbortController if not available or not constructible
        this._ensureAbortControllerPolyfill();
        this.initializePdfJs();
    }

    /**
     * Ensure AbortController is available before PDF.js initializes.
     * Salesforce LWS may sandbox AbortController in some contexts.
     */
    _ensureAbortControllerPolyfill() {
        try {
            // Test if AbortController is constructible
            const testAc = new AbortController();
            if (testAc && typeof testAc.abort === 'function') {
                // AbortController works fine
                return;
            }
        } catch (e) {
            console.warn('[pdfViewerTest] AbortController test failed, installing polyfill:', e.message);
        }

        // Install minimal AbortController polyfill
        if (typeof globalThis !== 'undefined' && !globalThis._pdfjsAbortControllerPolyfilled) {
            console.log('[pdfViewerTest] Installing AbortController polyfill for LWS compatibility');

            class AbortSignalPolyfill {
                constructor() {
                    this.aborted = false;
                    this._listeners = [];
                }
                addEventListener(type, listener) {
                    if (type === 'abort') {
                        this._listeners.push(listener);
                    }
                }
                removeEventListener(type, listener) {
                    if (type === 'abort') {
                        this._listeners = this._listeners.filter(l => l !== listener);
                    }
                }
                _abort() {
                    this.aborted = true;
                    this._listeners.forEach(l => {
                        try { l(); } catch (e) { /* ignore */ }
                    });
                }
            }

            class AbortControllerPolyfill {
                constructor() {
                    this.signal = new AbortSignalPolyfill();
                }
                abort() {
                    this.signal._abort();
                }
            }

            // Only override if truly broken
            try {
                new AbortController();
            } catch (e) {
                globalThis.AbortController = AbortControllerPolyfill;
                if (typeof window !== 'undefined') {
                    window.AbortController = AbortControllerPolyfill;
                }
            }
            globalThis._pdfjsAbortControllerPolyfilled = true;
        }
    }

    renderedCallback() {
        // GUARD 1: Skip if we already rendered or are initializing
        if (this._didRenderPdf || this._isInitializing) {
            return;
        }

        // GUARD 2: Skip if prerequisites not met
        if (!this.pdfJsReady || !this.pdfBytes) {
            return;
        }

        // GUARD 3: Query container fresh - do NOT cache on `this`
        // This avoids "Caching an empty reference is prohibited" error
        let container;
        try {
            container = this.querySelector('[data-id="pdf-container"]');
        } catch (e) {
            // Locker Service restriction - just return silently
            console.warn('[pdfViewerTest] Cannot query template yet:', e.message);
            return;
        }

        // GUARD 4: If container doesn't exist yet, return early
        // This avoids "Cannot use 'in' operator to search for 'childElementCount' in null"
        if (!container) {
            // Container is conditionally rendered, may not exist yet
            return;
        }

        // All guards passed - schedule render on next microtask
        this._didRenderPdf = true;
        Promise.resolve().then(() => {
            this._renderPdfToContainer();
        });
    }

    async initializePdfJs() {
        if (this._isInitializing) {
            return;
        }
        this._isInitializing = true;

        try {
            console.log('🔧 Initializing PDF.js LWS...');
            console.log('📦 Worker URL:', pdfjsWorker);
            console.log('📦 Main URL:', pdfjsMain);

            // CRITICAL: Load worker bundle FIRST
            console.log('📦 Step 1: Loading PDF.js WORKER bundle (must be first)...');
            await loadScript(this, pdfjsWorker);
            console.log('✅ Worker bundle loaded');

            // Verify WorkerMessageHandler
            const hasHandler = typeof globalThis !== 'undefined' &&
                globalThis.pdfjsWorker &&
                globalThis.pdfjsWorker.WorkerMessageHandler;
            console.log('🔍 WorkerMessageHandler available:', !!hasHandler);

            if (!hasHandler) {
                console.warn('⚠️ WorkerMessageHandler not found - PDF parsing may fail');
            }

            // Load main bundle
            console.log('📦 Step 2: Loading PDF.js MAIN bundle...');
            await loadScript(this, pdfjsMain);
            console.log('✅ Main bundle loaded');

            // Find PDF.js library
            this.pdfjs = (typeof window !== 'undefined' && window.pdfjs_dist) ||
                (typeof globalThis !== 'undefined' && globalThis.pdfjs_dist) ||
                (typeof window !== 'undefined' && window.pdfjsLib) ||
                (typeof globalThis !== 'undefined' && globalThis.pdfjsLib);

            if (!this.pdfjs) {
                throw new Error('PDF.js library not found in globals');
            }

            if (!this.pdfjs.getDocument) {
                throw new Error('PDF.js getDocument method not found');
            }

            // Configure for LWS (disable worker)
            console.log('✅ Configuring PDF.js for LWS (main thread processing)');
            if (this.pdfjs.GlobalWorkerOptions) {
                this.pdfjs.GlobalWorkerOptions.workerSrc = '';
            }

            console.log('✅ PDF.js LWS initialized successfully');
            console.log('📦 PDF.js version:', this.pdfjs.version || 'unknown');
            this.pdfJsReady = true;

            // Generate test PDF
            await this.generateTestPdf();

        } catch (error) {
            console.error('❌ Failed to initialize PDF.js LWS:', error);
            this.error = 'Failed to initialize PDF.js: ' + String(error);
        } finally {
            this._isInitializing = false;

            // Explicitly trigger render after initialization completes
            // The renderedCallback guard blocks rendering while _isInitializing is true
            if (this.pdfJsReady && this.pdfBytes && !this._didRenderPdf) {
                console.log('🚀 Triggering PDF render after initialization');
                this._didRenderPdf = true;
                Promise.resolve().then(() => {
                    this._renderPdfToContainer();
                });
            }
        }
    }

    async generateTestPdf() {
        this.loading = true;
        this.error = '';

        try {
            // Load jsPDF
            await loadScript(this, jsPDF);
            const { jsPDF: jsPDFLib } = window.jspdf;

            // Generate a test PDF
            const pdf = new jsPDFLib();
            pdf.setFontSize(20);
            pdf.text('PDF Viewer Test', 20, 20);
            pdf.setFontSize(12);
            pdf.text('This is a test PDF to verify the PDF.js viewer works.', 20, 40);
            pdf.text('If you can see this PDF rendered below, the viewer is working!', 20, 50);
            pdf.text('Generated at: ' + new Date().toLocaleString(), 20, 70);

            // Get PDF as Uint8Array
            const pdfOutput = pdf.output('arraybuffer');
            this.pdfBytes = new Uint8Array(pdfOutput);

            console.log('Test PDF generated, bytes:', this.pdfBytes.length);

        } catch (error) {
            this.error = 'Error generating test PDF: ' + String(error);
            console.error('PDF generation error:', error);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Render PDF to the container element.
     * This method re-queries the DOM fresh to avoid Locker Service issues.
     */
    async _renderPdfToContainer() {
        if (!this.pdfjs || !this.pdfBytes) {
            console.log('❌ Missing requirements - pdfjs:', !!this.pdfjs, 'pdfBytes:', !!this.pdfBytes);
            return;
        }

        // Query container FRESH each time - never store on `this`
        let container;
        try {
            container = this.querySelector('[data-id="pdf-container"]');
        } catch (e) {
            console.error('❌ Failed to get container (Locker restriction):', e.message);
            return;
        }

        if (!container) {
            console.warn('⚠️ Container not found in DOM.');
            this._didRenderPdf = false; // Allow retry
            return;
        }

        console.log('✅ Found PDF container:', container.tagName);

        try {
            console.log('🎯 Rendering PDF with LWS, bytes:', this.pdfBytes.length);

            // Ensure worker is disabled
            if (this.pdfjs.GlobalWorkerOptions) {
                this.pdfjs.GlobalWorkerOptions.workerSrc = '';
            }

            // Clear previous content
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            // Store PDF data globally for WorkerMessageHandler
            if (typeof globalThis !== 'undefined') {
                globalThis._pdfjs_pending_data = this.pdfBytes;
            }
            if (typeof window !== 'undefined') {
                window._pdfjs_pending_data = this.pdfBytes;
            }

            // Load PDF document with LWS-safe options
            console.log('📄 Calling getDocument...');
            const loadingTask = this.pdfjs.getDocument({
                data: this.pdfBytes,
                // LWS-safe options: disable features that may cause issues
                disableAutoFetch: true,
                disableStream: true,
                disableRange: true,
                // CRITICAL: Use system fonts to avoid needing standardFontDataUrl
                // This fixes the blank canvas caused by missing font data in LWS
                useSystemFonts: true,
                // Disable font fetching since we can't load external fonts in LWS
                disableFontFace: false
            });

            const pdf = await loadingTask.promise;
            console.log('📄 PDF loaded with LWS, pages:', pdf.numPages);

            // Render first page
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 });
            console.log('📏 Viewport dimensions:', viewport.width, 'x', viewport.height);

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.style.border = '2px solid green'; // Success indicator
            canvas.style.display = 'block';
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Render page
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Re-query container to ensure it still exists before appending
            const finalContainer = this.querySelector('[data-id="pdf-container"]');
            if (finalContainer) {
                finalContainer.appendChild(canvas);
                console.log('✅ PDF rendered successfully with LWS');
            } else {
                console.warn('⚠️ Container disappeared before canvas could be appended');
            }

        } catch (error) {
            console.error('❌ Error rendering PDF with LWS:', error);
            console.error('Stack:', error.stack);
            this.error = 'Error rendering PDF: ' + String(error);
            this._didRenderPdf = false; // Allow retry
        }
    }

    handleRegenerate() {
        this.pdfBytes = null;
        this._didRenderPdf = false;
        this.generateTestPdf();
    }
}
