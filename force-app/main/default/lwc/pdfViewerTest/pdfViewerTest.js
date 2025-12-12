import { LightningElement, track } from 'lwc';
import jsPDF from '@salesforce/resourceUrl/jspdf';
import PDFJS_RESOURCE from '@salesforce/resourceUrl/pdfjs';

import { loadScript } from 'lightning/platformResourceLoader';

export default class PdfViewerTest extends LightningElement {
    @track pdfBytes = null;

    async convertPdfDataToBase64AndBlob() {
        // 1. Check for data availability
        if (!this.pdfBytes || !(this.pdfBytes instanceof Uint8Array)) {
            console.error('❌ PDF data (this.pdfBytes) is not available or is not a Uint8Array.');
            return null;
        }

        const uint8array = this.pdfBytes;

        // --- Step 1: Convert Uint8Array to Base64 String ---
        // The most modern and reliable way is to use the FileReader API via a Promise.
        const base64String = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataURL = reader.result;
                // The result is a Data URL (e.g., "data:application/pdf;base64,BASE64_STRING")
                // We only want the BASE64_STRING part.
                // The split function is safe because a Data URL format is guaranteed.
                const base64 = dataURL.split(',')[1];
                resolve(base64);
            };
            reader.onerror = (error) => {
                console.error('FileReader error during Base64 conversion:', error);
                reject(error);
            };

            // Create a temporary Blob to use with FileReader
            const tempBlob = new Blob([uint8array], { type: 'application/octet-stream' });
            reader.readAsDataURL(tempBlob);
        });

        // --- Step 2: Create the PDF Blob ---
        // The Blob object represents the raw file data for downloads, uploads, etc.
        const pdfBlob = new Blob(
            [uint8array],
            { type: 'application/pdf' } // IMPORTANT: Set the correct MIME type for PDF
        );

        console.log('✅ PDF data successfully converted to Base64 string and PDF Blob.');

        return {
            base64String: base64String,
            pdfBlob: pdfBlob
        };
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

    // Property to hold the iframe reference
    iframeElement = null;

    // Flag to ensure DOM query runs only once
    hasRenderedIframe = false;
    // ... other properties (pdfBytes, loading, etc.)
    showViewer = false;
    viewerURL;

    connectedCallback() {
        this.viewerURL = PDFJS_RESOURCE + '/pdfjs/web/viewer.html';
    }

    renderedCallback() {
        if (this.viewerURL && !this.showViewer) {
            this.showViewer = true;
        }
    }

    testPdfViewer(event) {
        console.log('PDF viewer initiated by iframe onload event.');

        // 1. Get the iframe element using the LWC template method
        // NOTE: If you are using 'onload' in your HTML, the 'event.target' *is* the iframe.
        // However, sticking to 'this.template.querySelector' is generally safer for LWC context.
        // Since you are using 'this.querySelector('iframe');', you must ensure that 'this' 
        // is correctly scoped to the component instance, which it usually is. 
        // Let's switch to the standard LWC pattern for robustness.
        const iframe = this.template.querySelector('iframe');

        if (!iframe) {
            console.error('❌ Iframe element not found in template query.');
            return;
        }

        // 2. Store the element reference immediately
        this.iframeElement = iframe;
        this.hasRenderedIframe = true;
        console.log('✅ Iframe element captured.');
        console.log('iframeElement:', this.iframeElement);

        // 3. REMOVE the 7-SECOND TIMEOUT. The onload event is our timing trigger.
        // Use a minimal timeout (0ms) to ensure the current JavaScript stack completes 
        // and the browser has fully instantiated the 'contentWindow'.
        setTimeout(async () => {
            try {
                // Re-check for safety, though it should exist now
                if (!this.iframeElement || !this.iframeElement.contentWindow) {
                    console.error('❌ Iframe contentWindow is not yet available.');
                }

                // 4. Generate and Convert Data
                await this.generateTestPdf();
                const conversionResult = await this.convertPdfDataToBase64AndBlob();

                if (!conversionResult || !conversionResult.base64String) {
                    console.error('❌ PDF data conversion failed.');
                    return;
                }

                const dataUrl = `${conversionResult.base64String}`;

                // 5. Post the Message
                this.iframeElement.contentWindow.postMessage(dataUrl, "*");
                console.log('✅ PostMessage sent to iframe.');

            } catch (e) {
                console.error('❌ Error in PDF Viewer process:', e);
            }
        }, 0); // Minimal timeout to defer execution
    }
}
