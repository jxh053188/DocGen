import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import PDFJS from '@salesforce/resourceUrl/pdfjsbundled';

export default class PdfjsViewer extends LightningElement {
    _pdfBytes;

    @api
    get pdfBytes() {
        return this._pdfBytes;
    }

    set pdfBytes(value) {
        console.log('📥 pdfBytes setter called with:', value ? `${value.length || value.byteLength || 'unknown'} bytes` : 'null/undefined');
        this._pdfBytes = value;

        // Trigger rendering if component is ready
        if (this.pdfjsLoaded && value && !this._initialized) {
            console.log('🚀 pdfBytes set - triggering immediate render');
            this._currentPdfBytes = value;
            this.loadAndRenderPdf();
        }
    }
    @api fileName = 'document.pdf';

    @track loading = true;
    @track errorMessage = '';
    @track pageCount = 0;
    @track currentPage = 1;
    @track pdfjsLoaded = false;
    @track skipResourceLoader = false;

    _pdfjsLib = null;
    _pdfDocument = null;
    _initialized = false;
    _currentPdfBytes = null;
    pdfjsLoadPromise = null;

    // Resource URL for resourceLoader component
    get pdfjsUrl() {
        const url = PDFJS;
        console.log('🔗 Generated PDF.js URL:', url);
        return url;
    }

    connectedCallback() {
        console.log('🔄 PdfjsViewer connectedCallback - initializing PDF.js library');
        console.log('📂 PDF.js Resource URL:', this.pdfjsUrl);
        console.log('🌐 Current window location:', window.location?.href);

        // First check if library is already available
        if (this.checkForExistingLibrary()) {
            console.log('📚 PDF.js library already available');
            return;
        }

        // Set a timeout to fallback to direct loading if resourceLoader fails
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            if (!this.pdfjsLoaded) {
                console.log('⚠️ ResourceLoader timeout - falling back to direct loading');
                this.skipResourceLoader = true;
                this.initializePdfJsLibrary();
            }
        }, 3000);
    }

    renderedCallback() {
        console.log('🔄 renderedCallback called');
        console.log('  📊 pdfBytes:', this.pdfBytes ? `${this.pdfBytes.length || this.pdfBytes.byteLength || 'unknown'} bytes` : 'null/undefined');
        console.log('  📚 pdfjsLoaded:', this.pdfjsLoaded);
        console.log('  🔧 _initialized:', this._initialized);
        console.log('  💾 _currentPdfBytes:', this._currentPdfBytes ? `${this._currentPdfBytes.length || this._currentPdfBytes.byteLength || 'unknown'} bytes` : 'null/undefined');

        // Check if pdfBytes changed
        if (this.pdfBytes && this.pdfBytes !== this._currentPdfBytes) {
            console.log('📝 PDF bytes changed - updating current bytes');
            this._currentPdfBytes = this.pdfBytes;
            this._initialized = false;
        }

        // If PDF bytes are available and library is loaded, render the PDF
        if (this.pdfjsLoaded && this._currentPdfBytes && !this._initialized) {
            console.log('🚀 Triggering loadAndRenderPdf from renderedCallback');
            this.loadAndRenderPdf();
        } else {
            console.log('⏸️ Not rendering because:', {
                pdfjsLoaded: this.pdfjsLoaded,
                hasCurrentPdfBytes: !!this._currentPdfBytes,
                initialized: this._initialized
            });
        }
    }

    async initializePdfJsLibrary() {
        console.log('🔧 initializePdfJsLibrary called');

        // First, check if PDF.js is already loaded in window
        if (this.checkForExistingLibrary()) {
            console.log('📚 Library already exists, returning early');
            return;
        }

        // Try loading via direct loadScript as fallback
        try {
            console.log('🔄 Attempting to load PDF.js via loadScript...');
            console.log('📂 Resource URL:', PDFJS);

            // Validate URL before loading
            if (!this.validateResourceUrl(PDFJS)) {
                throw new Error('Invalid resource URL: ' + PDFJS);
            }

            await loadScript(this, PDFJS);
            console.log('✅ loadScript completed successfully');

            // Wait a moment for the library to attach
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                console.log('⏰ Checking for library after timeout');
                if (!this.checkForExistingLibrary()) {
                    console.error('❌ Library still not found after loadScript and timeout');
                    this.errorMessage = 'PDF.js library loaded but not found in window object';
                    this.loading = false;
                }
            }, 200);
        } catch (error) {
            console.error('❌ Failed to load PDF.js via loadScript:', error);
            console.error('Error details:', {
                message: error?.message,
                stack: error?.stack,
                name: error?.name
            });
            this.errorMessage = 'Failed to load PDF.js library: ' + (error?.message || String(error));
            this.loading = false;
        }
    }

    checkForExistingLibrary() {
        console.log('🔍 Checking for existing PDF.js library...');

        // Check multiple possible library locations
        this._pdfjsLib = window.pdfjs_dist || window.pdfjsLib || window.pdfjs || window.pdfjsDistClean;

        if (this._pdfjsLib) {
            console.log('📚 PDF.js library found at:', this._pdfjsLib === window.pdfjs_dist ? 'window.pdfjs_dist' :
                this._pdfjsLib === window.pdfjsLib ? 'window.pdfjsLib' :
                    this._pdfjsLib === window.pdfjs ? 'window.pdfjs' : 'window.pdfjsDistClean');

            // Validate that the library has required methods
            if (typeof this._pdfjsLib.getDocument !== 'function') {
                console.error('❌ PDF.js library found but missing getDocument method');
                console.log('Available methods:', Object.keys(this._pdfjsLib));
                this._pdfjsLib = null;
                return false;
            }

            console.log('✅ PDF.js library found and validated:', !!this._pdfjsLib);
            this.pdfjsLoaded = true;

            // CRITICAL: Completely disable workers for Locker Service compliance
            try {
                console.log('🔍 Configuring PDF.js for Locker Service compliance');

                if (this._pdfjsLib.GlobalWorkerOptions) {
                    console.log('🔧 Completely disabling PDF.js workers');

                    // Force disable workers by setting workerSrc to a data URL that does nothing
                    // This makes PDF.js fall back to main thread processing
                    this._pdfjsLib.GlobalWorkerOptions.workerSrc = 'data:application/javascript;base64,Ly8gRW1wdHkgd29ya2VyIGZvciBMb2NrZXIgU2VydmljZQ==';
                    console.log('✅ Worker source set to empty data URL');

                    // Additional worker disabling
                    this._pdfjsLib.GlobalWorkerOptions.workerPort = null;
                    console.log('✅ Worker port disabled');
                } else {
                    console.log('⚠️ GlobalWorkerOptions not available on PDF.js library');
                }

                // Disable worker at library level
                console.log('🔧 Setting library-level worker disabling');
                this._pdfjsLib.disableWorker = true;

                // Mark Locker Service environment for bundle detection
                console.log('🔧 Setting Locker Service marker for PDF.js bundle');
                window.SalesforceLockerService = true;

                console.log('✅ All worker disabling completed');
            } catch (workerError) {
                console.error('❌ Error configuring workers:', workerError);
                console.log('📋 Worker error details:', {
                    name: workerError?.name,
                    message: workerError?.message,
                    stack: workerError?.stack
                });
                // Continue anyway - workers might not be critical for basic functionality
                console.log('⚠️ Continuing without worker configuration...');
            }
            try {
                console.log('🔧 Step 4: Resolving promises and loading PDF');
                if (this.pdfjsLoadPromise) {
                    console.log('✅ Resolving pdfjsLoadPromise');
                    this.pdfjsLoadPromise.resolve();
                }

                // If PDF bytes are already available, render now
                console.log('📦 Current PDF bytes available:', !!this.pdfBytes);
                if (this.pdfBytes) {
                    console.log('🚀 Loading and rendering PDF with existing bytes');
                    this._currentPdfBytes = this.pdfBytes;
                    console.log('🚀 Calling loadAndRenderPdf from checkForExistingLibrary');
                    this.loadAndRenderPdf();
                    console.log('✅ loadAndRenderPdf call completed');
                } else {
                    console.log('📋 No PDF bytes available yet, setting loading to false');
                    this.loading = false;
                }
            } catch (renderError) {
                console.error('❌ Error in PDF loading phase:', renderError);
                console.log('📋 Render error details:', {
                    name: renderError?.name,
                    message: renderError?.message,
                    stack: renderError?.stack
                });
                this.errorMessage = 'Error initializing PDF rendering: ' + (renderError?.message || String(renderError));
                this.loading = false;
            }

            return true;
        }

        console.log('🔍 PDF.js library not found. Available window properties with "pdf":',
            Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));

        // Log other available libraries to see if static resource loading is working at all
        console.log('📚 Other libraries found in window:');
        console.log('- jsPDF:', !!window.jsPDF);
        console.log('- html2canvas:', !!window.html2canvas);
        console.log('- PDFLib:', !!window.PDFLib);
        console.log('- mammoth:', !!window.mammoth);
        console.log('- docxtemplater:', !!window.docxtemplater);

        // Also log all window properties that might be related to PDF
        const allWindowProps = Object.getOwnPropertyNames(window);
        const pdfRelated = allWindowProps.filter(prop =>
            prop.toLowerCase().includes('pdf') ||
            prop.toLowerCase().includes('document') ||
            prop.toLowerCase().includes('viewer')
        );
        console.log('🔍 All PDF/document-related window properties:', pdfRelated);

        return false;
    }

    // Event handlers for resourceLoader component
    handlePdfjsLoaded() {
        console.log('PDF.js loaded via resourceLoader');
        // Wait a moment then check for the library
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            if (!this.checkForExistingLibrary()) {
                console.warn('ResourceLoader reported success but library not found in window');
            }
        }, 100);
    }

    handleResourceError(event) {
        const error = event.detail?.error || 'Unknown error';
        console.error('❌ Error loading PDF.js resource via resourceLoader:', error);

        // Hide the resource loader and try direct loading
        this.skipResourceLoader = true;
        console.log('🔄 Switching to direct loading method...');

        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.initializePdfJsLibrary();
        }, 100);
    }

    /**
     * Wait for PDF.js library to be loaded via resourceLoader component
     * Returns immediately if already loaded
     */
    waitForPdfjsLibrary() {
        if (this.pdfjsLoaded) {
            return Promise.resolve();
        }

        if (!this.pdfjsLoadPromise) {
            this.pdfjsLoadPromise = {};
            this.pdfjsLoadPromise.promise = new Promise((resolve, reject) => {
                this.pdfjsLoadPromise.resolve = resolve;
                this.pdfjsLoadPromise.reject = reject;
            });
        }

        return this.pdfjsLoadPromise.promise;
    }

    // Validate static resource URL
    validateResourceUrl(url) {
        console.log('🔍 Validating resource URL:', url);

        if (!url) {
            console.error('❌ Resource URL is null or undefined');
            return false;
        }

        if (typeof url !== 'string') {
            console.error('❌ Resource URL is not a string:', typeof url, url);
            return false;
        }

        // Check for 'undefined' in URL which indicates import issues
        if (url.includes('undefined')) {
            console.error('❌ URL contains "undefined" - resource import failed');
            return false;
        }

        // Check if URL looks like a valid Salesforce static resource URL
        const sfUrlPattern = /\/resource\/\d+\/\w+/;
        if (!sfUrlPattern.test(url)) {
            console.warn('⚠️ URL does not match expected Salesforce static resource pattern:', url);
        }

        console.log('✅ Resource URL validation passed');
        return true;
    }

    async loadAndRenderPdf() {
        console.log('🎯 loadAndRenderPdf called');
        try {
            // Wait for PDF.js library if not loaded yet
            console.log('📚 Checking if PDF.js library is loaded:', this.pdfjsLoaded);
            if (!this.pdfjsLoaded) {
                console.log('⏳ Waiting for PDF.js library...');
                await this.waitForPdfjsLibrary();
            }

            console.log('🔍 Validating prerequisites...');
            if (!this._pdfjsLib) {
                console.error('❌ PDF.js library not available');
                return;
            }
            if (!this._currentPdfBytes) {
                console.error('❌ No PDF bytes available');
                return;
            }
            console.log('✅ Prerequisites validated');

            this.loading = true;
            this.errorMessage = '';
            this._initialized = true;
            console.log('🚀 Starting PDF loading process...');

            // Convert to Uint8Array if needed
            const pdfData = this._currentPdfBytes instanceof Uint8Array
                ? this._currentPdfBytes
                : new Uint8Array(this._currentPdfBytes);

            console.log('Loading PDF, bytes length:', pdfData.length);

            // Load the PDF document without workers for Locker Service compatibility
            console.log('📄 Creating PDF document task without workers');

            // Create loading task without specifying worker (let PDF.js handle main thread fallback)
            console.log('🔧 Creating PDF loading task with main-thread fallback');

            // Store PDF data globally before creating the loading task
            // This ensures our WorkerMessageHandler can access it
            console.log('💾 Storing PDF data globally before loading task creation');
            window._pdfMainThreadData = pdfData;

            const loadingTask = this._pdfjsLib.getDocument({
                data: pdfData,
                // Worker configuration
                useWorkerFetch: false,
                disableAutoFetch: true,
                disableCreateObjectURL: true,
                // Security and compatibility settings
                isEvalSupported: false,
                maxImageSize: 1024 * 1024,
                // CRITICAL: Use system fonts to avoid needing standardFontDataUrl
                // This fixes blank canvas caused by missing font data in LWS
                useSystemFonts: true,
                stopAtErrors: false,
                // Explicitly disable range requests and streaming
                disableRange: true,
                disableStream: true
            });

            console.log('✅ PDF document task created successfully');

            console.log('⏳ Waiting for loadingTask.promise to resolve...');
            console.log('LoadingTask properties:', Object.keys(loadingTask));
            console.log('LoadingTask promise state:', loadingTask.promise);

            // Add timeout to detect if promise is stuck (increased to 15 seconds for debugging)
            const timeoutPromise = new Promise((_, reject) => {
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => {
                    reject(new Error('PDF loading timeout - promise did not resolve within 15 seconds'));
                }, 15000);
            });

            try {
                this._pdfDocument = await Promise.race([loadingTask.promise, timeoutPromise]);
            } catch (timeoutError) {
                if (timeoutError.message.includes('timeout')) {
                    console.error('⏰ PDF loading timed out - likely worker message issue');
                    console.log('🔍 LoadingTask state at timeout:', {
                        destroyed: loadingTask.destroyed,
                        promise: loadingTask.promise,
                        docId: loadingTask.docId
                    });
                    // Check if we have transport for debugging
                    if (loadingTask._transport) {
                        console.log('🔍 Transport state:', Object.keys(loadingTask._transport));
                    }
                    throw new Error('PDF loading failed: Worker message system not completing properly');
                }
                throw timeoutError;
            }
            this.pageCount = this._pdfDocument.numPages;
            console.log('✅ PDF loaded successfully, page count:', this.pageCount);

            // Set loading to false BEFORE rendering so container becomes visible
            this.loading = false;

            // Use Promise.resolve to allow DOM update in next microtask
            console.log('🎨 Starting to render all pages...');
            await Promise.resolve(); // Allow DOM update
            await this.renderAllPages();
            console.log('✅ All pages rendered successfully');
        } catch (error) {
            console.error('❌ Error in loadAndRenderPdf:', error);
            console.log('📋 Error details:', {
                name: error?.name,
                message: error?.message,
                stack: error?.stack,
                toString: String(error)
            });
            this.errorMessage = 'Error loading PDF: ' + (error?.message || String(error) || 'Unknown error');
            this.loading = false;
        }
    }

    async renderAllPages() {
        console.log('🎨 renderAllPages called');
        if (!this._pdfDocument) {
            console.error('❌ No PDF document available for rendering');
            return;
        }

        const container = this.template.querySelector('.pdf-pages-container');
        if (!container) {
            console.error('❌ PDF pages container not found in template');
            return;
        }
        console.log('✅ PDF container found:', container);

        // Clear existing content by removing all child nodes
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        // Render all pages sequentially (to avoid overwhelming the browser)
        for (let pageNum = 1; pageNum <= this.pageCount; pageNum++) {
            // eslint-disable-next-line no-await-in-loop
            await this.renderPage(pageNum, container);
        }
    }

    async renderPage(pageNum, container) {
        console.log(`🎨 Starting to render page ${pageNum}`);
        try {
            console.log(`📄 Getting page ${pageNum} from PDF document`);
            const page = await this._pdfDocument.getPage(pageNum);
            console.log(`📏 Getting viewport for page ${pageNum}`);
            const viewport = page.getViewport({ scale: 1.5 });
            console.log(`✅ Page ${pageNum} viewport:`, { width: viewport.width, height: viewport.height });

            // Create canvas element
            console.log(`🖼️ Creating canvas for page ${pageNum}`);
            const canvas = document.createElement('canvas');
            if (!canvas) {
                throw new Error('Failed to create canvas element');
            }

            console.log(`🎯 Getting 2D context for page ${pageNum}`);
            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error('Failed to get 2D canvas context');
            }

            canvas.height = viewport.height;
            canvas.width = viewport.width;
            console.log(`📐 Canvas dimensions set: ${canvas.width}x${canvas.height}`);
            canvas.className = 'pdf-page-canvas';
            canvas.style.display = 'block';
            canvas.style.margin = '10px auto';
            canvas.style.border = '1px solid #ccc';
            canvas.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

            // Create page wrapper
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'pdf-page-wrapper';
            pageWrapper.style.marginBottom = '20px';
            pageWrapper.style.textAlign = 'center';
            pageWrapper.appendChild(canvas);
            container.appendChild(pageWrapper);

            // Render the page
            console.log(`🎨 Starting PDF.js render for page ${pageNum}`);
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;
            console.log(`✅ Page ${pageNum} rendered successfully`);

            // Extract and display text content from the page
            console.log(`📝 Extracting text from page ${pageNum}`);
            try {
                // Call the extractPdfText method we added to the page
                const extractedText = page.extractPdfText ? page.extractPdfText() : null;

                if (extractedText && extractedText.length > 10) {
                    console.log(`📄 Extracted text from page ${pageNum}:`, extractedText.substring(0, 200));

                    // Create text display element with MAXIMUM visibility for debugging
                    const textDiv = document.createElement('div');
                    textDiv.className = 'pdf-page-text';
                    textDiv.style.marginTop = '30px';
                    textDiv.style.padding = '30px';
                    textDiv.style.backgroundColor = '#ff0000'; // Bright red background to be obvious
                    textDiv.style.border = '5px solid #000000'; // Thick black border
                    textDiv.style.borderRadius = '10px';
                    textDiv.style.fontSize = '20px';
                    textDiv.style.lineHeight = '1.8';
                    textDiv.style.textAlign = 'center';
                    textDiv.style.width = '95%';
                    textDiv.style.margin = '30px auto';
                    textDiv.style.wordWrap = 'break-word';
                    textDiv.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';
                    textDiv.style.zIndex = '9999';
                    textDiv.style.position = 'relative';
                    textDiv.style.minHeight = '100px';

                    // Add header with maximum visibility
                    const textHeader = document.createElement('h2');
                    textHeader.textContent = `🔥 EXTRACTED TEXT FROM PDF 🔥`;
                    textHeader.style.marginBottom = '20px';
                    textHeader.style.color = '#ffffff'; // White text on red background
                    textHeader.style.fontSize = '24px';
                    textHeader.style.fontWeight = 'bold';
                    textHeader.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
                    textDiv.appendChild(textHeader);

                    // Add extracted text with highlighting (without innerHTML)
                    const textContent = document.createElement('div');
                    textContent.style.margin = '0';
                    textContent.style.fontSize = '15px';

                    // Create label
                    const label = document.createElement('strong');
                    label.textContent = 'Extracted Text:';
                    textContent.appendChild(label);

                    // Create line break
                    textContent.appendChild(document.createElement('br'));

                    // Create extremely visible text span
                    const textSpan = document.createElement('div');
                    textSpan.textContent = extractedText;
                    textSpan.style.backgroundColor = '#ffff00'; // Bright yellow
                    textSpan.style.color = '#000000'; // Black text
                    textSpan.style.padding = '15px 20px';
                    textSpan.style.borderRadius = '8px';
                    textSpan.style.display = 'block';
                    textSpan.style.marginTop = '15px';
                    textSpan.style.border = '3px solid #ff6600';
                    textSpan.style.fontSize = '18px';
                    textSpan.style.fontWeight = 'bold';
                    textSpan.style.textAlign = 'center';
                    textContent.appendChild(textSpan);

                    textDiv.appendChild(textContent);

                    pageWrapper.appendChild(textDiv);
                    console.log(`✅ Text display div added to page ${pageNum}:`, textDiv);
                } else {
                    console.log(`⚠️ No meaningful text extracted from page ${pageNum}`);

                    // Show message about text extraction
                    const noTextDiv = document.createElement('div');
                    noTextDiv.style.marginTop = '10px';
                    noTextDiv.style.padding = '10px';
                    noTextDiv.style.backgroundColor = '#fff3cd';
                    noTextDiv.style.border = '1px solid #ffeaa7';
                    noTextDiv.style.borderRadius = '4px';
                    noTextDiv.style.textAlign = 'center';
                    noTextDiv.style.fontSize = '14px';
                    noTextDiv.style.color = '#856404';
                    noTextDiv.textContent = `Page ${pageNum}: PDF rendered visually - text may be image-based or encoded`;
                    pageWrapper.appendChild(noTextDiv);
                }
            } catch (textError) {
                console.error(`❌ Error extracting text from page ${pageNum}:`, textError);

                // Show error message
                const errorTextDiv = document.createElement('div');
                errorTextDiv.style.marginTop = '10px';
                errorTextDiv.style.padding = '10px';
                errorTextDiv.style.backgroundColor = '#f8d7da';
                errorTextDiv.style.border = '1px solid #f5c6cb';
                errorTextDiv.style.borderRadius = '4px';
                errorTextDiv.style.textAlign = 'center';
                errorTextDiv.style.fontSize = '14px';
                errorTextDiv.style.color = '#721c24';
                errorTextDiv.textContent = `Page ${pageNum}: Text extraction failed - ${textError.message}`;
                pageWrapper.appendChild(errorTextDiv);
            }
        } catch (error) {
            console.error(`❌ Error rendering page ${pageNum}:`, error);
            console.error(`❌ Error details:`, {
                name: error?.name,
                message: error?.message,
                stack: error?.stack
            });

            // Create error placeholder
            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '20px';
            errorDiv.style.border = '2px solid #ff0000';
            errorDiv.style.backgroundColor = '#ffe6e6';
            errorDiv.style.margin = '10px';
            errorDiv.style.textAlign = 'center';
            errorDiv.textContent = `Error rendering page ${pageNum}: ${error.message}`;
            container.appendChild(errorDiv);
        }
    }

    @api
    refresh(bytes) {
        // Allow parent to refresh with new PDF bytes
        this._currentPdfBytes = bytes || this.pdfBytes;
        this._initialized = false;
        this.loading = true;
        this.errorMessage = '';
        this.pageCount = 0;
        this.currentPage = 1;
        this._pdfDocument = null;

        // Clear container
        const container = this.template.querySelector('.pdf-pages-container');
        if (container) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
        }

        // Reload PDF if library is ready
        if (this.pdfjsLoaded && this._currentPdfBytes) {
            this.loadAndRenderPdf();
        }
    }
}
