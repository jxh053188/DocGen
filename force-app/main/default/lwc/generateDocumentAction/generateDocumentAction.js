import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord } from 'lightning/uiRecordApi';
import getTemplatesForObject from '@salesforce/apex/TemplateController.getTemplatesForObject';
import getTemplate from '@salesforce/apex/TemplateController.getTemplate';
import buildQueryPlan from '@salesforce/apex/TemplateController.buildQueryPlan';
import fetchData from '@salesforce/apex/TemplateController.fetchData';
import savePdf from '@salesforce/apex/TemplateController.savePdf';
import logPreview from '@salesforce/apex/TemplateController.logPreview';
import getUserSettings from '@salesforce/apex/TemplateController.getUserSettings';
import { discoverFields } from 'c/discoveryUtils';
import { render as renderTemplate } from 'c/templateEngine';

export default class GenerateDocumentAction extends LightningElement {
    static renderMode = 'light';
    @api recordId;
    @api objectApiName;

    @track templates = [];
    @track selectedTemplateId;
    @track isLoading = false;
    @track step = 'select'; // select, preview, save
    @track pdfUrl = null;
    @track pdfBase64 = null;
    @track fileName = 'document.pdf';

    userSettings = {};




    get showTemplateSelect() {
        return this.step === 'select';
    }

    get showPreview() {
        return this.step === 'preview';
    }

    get templateOptions() {
        return this.templates.map(t => ({
            label: `${t.Name} (v${t.Version__c})`,
            value: t.Id
        }));
    }

    async connectedCallback() {
        this.loadUserSettings();
        this.loadTemplates();
    }

    async loadUserSettings() {
        try {
            this.userSettings = await getUserSettings();
        } catch (error) {
            console.error('Failed to load user settings:', error);
            // Use defaults
            this.userSettings = {
                locale: 'en-US',
                timezone: 'UTC',
                currencyCode: 'USD'
            };
        }
    }

    async loadTemplates() {
        if (!this.objectApiName) return;

        this.isLoading = true;
        try {
            this.templates = await getTemplatesForObject({ sObjectName: this.objectApiName });

            if (this.templates.length === 0) {
                // Removed toast - it was annoying on page load
                // this.showToast('Info', `No active templates found for ${this.objectApiName}`, 'info');
            }
        } catch (error) {
            this.showToast('Error', 'Failed to load templates: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleTemplateChange(event) {
        this.selectedTemplateId = event.detail.value;
    }

    async handleGenerate() {
        if (!this.selectedTemplateId) {
            this.showToast('Error', 'Please select a template', 'error');
            return;
        }

        this.isLoading = true;
        try {
            // 1. Get template
            const template = await getTemplate({ templateId: this.selectedTemplateId });

            // 2. Process HTML template
            await this.processHtmlTemplate(template);

            // Show preview
            this.pdfUrl = 'data:application/pdf;base64,' + this.pdfBase64;
            this.fileName = `${template.Name}_${this.recordId}.pdf`;
            this.step = 'preview';

            // Log preview
            logPreview({ recordId: this.recordId, templateId: template.Id })
                .catch(err => console.warn('Failed to log preview:', err));

        } catch (error) {
            console.error('Generation error:', error);
            this.showToast('Error', 'Failed to generate document: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async processHtmlTemplate(template) {
        // 1. Discover fields from HTML
        const discovery = discoverFields(template.Html_Body__c, template.Primary_Object__c);

        // 2. Build query plan
        const queryPlanJson = await buildQueryPlan({
            payloadJson: JSON.stringify(discovery),
            templateId: template.Id
        });

        // 3. Fetch data
        const dataJson = await fetchData({
            recordId: this.recordId,
            queryPlanJson: queryPlanJson
        });

        // 4. Compile template
        const html = await this.compileTemplate(template.Html_Body__c, dataJson);

        // 5. Render PDF
        this.pdfBase64 = await this.renderPdf(html);
    }










    async compileTemplate(htmlTemplate, dataJson) {
        // Use our custom Locker Service-compliant template engine
        const data = JSON.parse(dataJson);
        return renderTemplate(htmlTemplate, data);
    }

    async renderPdf(html) {
        try {
            // Check if html2canvas and PDFLib are available
            if (!window.html2canvas) {
                throw new Error('html2canvas library not loaded. Please refresh the page.');
            }
            if (!window.PDFLib) {
                throw new Error('PDFLib library not loaded. Please refresh the page.');
            }

            // Create a temporary container for the HTML
            // Based on https://github.com/niklasvh/html2canvas/issues/2929
            // html2canvas requires elements to be fully visible, not transformed, and in viewport
            const container = document.createElement('div');
            container.classList.add('pdf-render-container');
            // eslint-disable-next-line @lwc/lwc/no-inner-html
            container.innerHTML = html;
            
            // Style the container - must be fully visible, no transforms, in viewport
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '794px'; // A4 width in pixels (210mm at 96 DPI)
            container.style.minHeight = '1123px'; // A4 height in pixels (297mm at 96 DPI)
            container.style.backgroundColor = 'white';
            container.style.padding = '20px';
            container.style.boxSizing = 'border-box';
            container.style.overflow = 'visible';
            container.style.zIndex = '999999';
            // Make it very small but fully visible (no transform, no opacity)
            // Use width/height instead of transform to avoid iframe cloning issues
            container.style.width = '79px'; // 10% of original size
            container.style.minHeight = '112px'; // 10% of original size
            container.style.fontSize = '1px'; // Scale down font proportionally
            
            document.body.appendChild(container);

            // Force a reflow to ensure element is laid out
            // eslint-disable-next-line no-unused-expressions
            container.offsetHeight;

            // Wait for content to render and layout to settle
            await new Promise((resolve) => {
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => {
                    resolve();
                }, 500);
            });

            // Convert HTML to canvas using html2canvas
            // Use onclone to ensure element is accessible in cloned document
            // The element parameter is the cloned element itself
            const canvas = await window.html2canvas(container, {
                scale: 10, // Scale up to compensate for small size
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                removeContainer: false,
                onclone: (clonedDoc, clonedElement) => {
                    // clonedElement is the cloned container element
                    // Based on https://github.com/niklasvh/html2canvas/issues/2929
                    if (clonedElement) {
                        // Reset styles in cloned document to ensure it's visible and accessible
                        clonedElement.style.position = 'absolute';
                        clonedElement.style.top = '0';
                        clonedElement.style.left = '0';
                        clonedElement.style.width = '794px';
                        clonedElement.style.minHeight = '1123px';
                        clonedElement.style.fontSize = '16px'; // Reset font size
                        clonedElement.style.visibility = 'visible';
                        clonedElement.style.opacity = '1';
                    }
                }
            });

            // Remove temporary container
            if (container.parentNode) {
                document.body.removeChild(container);
            }

            // Convert canvas to image data
            const imgData = canvas.toDataURL('image/png');

            // Create PDF using pdf-lib
            const { PDFDocument } = window.PDFLib;
            const pdfDoc = await PDFDocument.create();
            
            // A4 dimensions in points (1 point = 1/72 inch)
            const pageWidth = 595.28; // A4 width in points
            const pageHeight = 841.89; // A4 height in points
            
            // Calculate dimensions to fit page
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
            const scaledWidth = imgWidth * scale;
            const scaledHeight = imgHeight * scale;
            
            // Add page and embed image
            const page = pdfDoc.addPage([pageWidth, pageHeight]);
            const pngImage = await pdfDoc.embedPng(imgData);
            page.drawImage(pngImage, {
                x: 0,
                y: pageHeight - scaledHeight, // Top-left origin in pdf-lib
                width: scaledWidth,
                height: scaledHeight
            });

            // Generate PDF bytes
            const pdfBytes = await pdfDoc.save();

            // Convert Uint8Array to base64 efficiently
            const pdfBase64 = this.uint8ArrayToBase64(pdfBytes);

            return pdfBase64;

        } catch (error) {
            console.error('PDF rendering failed:', error);
            throw new Error('PDF rendering failed: ' + error.message);
        }
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove data URL prefix to get just base64
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Convert Uint8Array to base64 string efficiently
     * Handles large arrays without stack overflow
     */
    uint8ArrayToBase64(uint8Array) {
        let binary = '';
        const chunkSize = 8192; // Process in chunks to avoid stack overflow
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    async handleSave() {
        if (!this.pdfBase64) {
            this.showToast('Error', 'No PDF to save', 'error');
            return;
        }

        this.isLoading = true;
        try {
            await savePdf({
                recordId: this.recordId,
                templateId: this.selectedTemplateId,
                fileName: this.fileName,
                pdfBase64: this.pdfBase64
            });

            this.showToast('Success', 'PDF saved and attached to record', 'success');
            this.handleClose();

        } catch (error) {
            this.showToast('Error', 'Failed to save PDF: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleDownload() {
        if (!this.pdfBase64) return;

        // Create download link
        const link = document.createElement('a');
        link.href = this.pdfUrl;
        link.download = this.fileName;
        link.click();
    }

    handleBack() {
        this.step = 'select';
        this.pdfUrl = null;
        this.pdfBase64 = null;
    }

    handleClose() {
        // Close quick action
        const closeEvent = new CustomEvent('close');
        this.dispatchEvent(closeEvent);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}

