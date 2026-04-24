import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getTemplate from '@salesforce/apex/TemplateController.getTemplate';
import saveTemplate from '@salesforce/apex/TemplateController.saveTemplate';
import buildQueryPlan from '@salesforce/apex/TemplateController.buildQueryPlan';
import fetchData from '@salesforce/apex/TemplateController.fetchData';
import getUserSettings from '@salesforce/apex/TemplateController.getUserSettings';
import getChildRelationships from '@salesforce/apex/TemplateController.getChildRelationships';
import { discoverFields } from 'c/discoveryUtils';
import { render as renderTemplate } from 'c/templateEngine';
import PdfjsViewer from 'c/pdfjsViewer';

export default class TemplateEditor extends LightningElement {
    @api recordId; // Template record Id

    @track template = {};
    @track htmlBody = '';
    @track isLoading = false;
    @track showPreview = false;
    @track previewHtml = '';
    @track previewLoading = false;
    @track previewPdfUrl = null;
    @track previewPdfBytes = null; // Uint8Array of PDF bytes for pdfjs viewer
    @track queryPlan = null;
    @track discoveredFields = [];
    @track relationships = [];
    @track sourceType = 'HTML';
    @track status = 'Draft';

    userSettings = {};
    @track sampleRecordId = '';
    @track sidebarVisible = true; // Sidebar visibility state

    connectedCallback() {
        this.loadUserSettings();

        if (this.recordId) {
            this.loadTemplate();
        }
    }

    renderedCallback() {
        // Update preview container when preview HTML changes and modal is visible
        if (this.showPreview && this.previewHtml && !this.previewLoading) {
            // eslint-disable-next-line no-console
            console.log('renderedCallback: Calling updatePreviewContainer');
            this.updatePreviewContainer();
        }
    }


    get isHtmlTemplate() {
        return true; // Only HTML templates are supported
    }

    get sourceTypeOptions() {
        return [
            { label: 'HTML', value: 'HTML' }
        ];
    }

    get statusOptions() {
        return [
            { label: 'Draft', value: 'Draft' },
            { label: 'Active', value: 'Active' },
            { label: 'Archived', value: 'Archived' }
        ];
    }

    get showHtmlEditor() {
        return true; // Always show HTML editor
    }

    get sidebarVisibleText() {
        return this.sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar';
    }

    get sidebarIcon() {
        return this.sidebarVisible ? 'utility:chevronright' : 'utility:chevronleft';
    }

    get editorColumnClass() {
        // Full width when sidebar is hidden, 2/3 width when visible
        if (this.sidebarVisible) {
            return 'slds-col slds-size_1-of-1 slds-large-size_2-of-3';
        }
        return 'slds-col slds-size_1-of-1';
    }

    toggleSidebar() {
        this.sidebarVisible = !this.sidebarVisible;
    }

    async loadUserSettings() {
        try {
            this.userSettings = await getUserSettings();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to load user settings:', error);
        }
    }

    async loadTemplate() {
        this.isLoading = true;
        try {
            this.template = await getTemplate({ templateId: this.recordId });
            this.htmlBody = this.template.Html_Body__c || '';
            this.sourceType = this.template.Source_Type__c || 'HTML';
            this.status = this.template.Status__c || 'Draft';

            // Load relationships for primary object
            if (this.template.Primary_Object__c) {
                this.relationships = await getChildRelationships({
                    sObjectName: this.template.Primary_Object__c
                });
            }
        } catch (error) {
            this.showToast(
                'Error',
                'Failed to load template: ' + (error.body?.message || error.message || error),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }


    handleHtmlChange(event) {
        this.htmlBody = event.target.value;
    }

    handleRichTextChange(event) {
        this.htmlBody = event.detail.value || '';
    }

    handleSampleRecordChange(event) {
        this.sampleRecordId = event.detail.value;
        // eslint-disable-next-line no-console
        console.log('Sample Record ID changed to:', this.sampleRecordId);
    }

    handleStatusChange(event) {
        this.status = event.detail.value;
    }

    async handleSourceTypeChange(event) {
        const newSourceType = event.detail.value;
        this.sourceType = newSourceType;

        // Reset discovery artefacts when switching
        this.discoveredFields = [];
        this.queryPlan = null;
    }

    async handleDiscoverFields() {
        if (!this.template.Primary_Object__c) {
            this.showToast('Error', 'Primary object is required', 'error');
            return;
        }

        this.isLoading = true;
        try {
                if (!this.htmlBody) {
                    this.showToast('Error', 'HTML body is required', 'error');
                    this.isLoading = false;
                    return;
            }

            const templateText = this.htmlBody;

            const discovery = discoverFields(templateText, this.template.Primary_Object__c);

            // Debug
            // eslint-disable-next-line no-console
            console.log('📤 Discovery payload:', discovery);

            const payloadJson = JSON.stringify(discovery);

            const queryPlanJson = await buildQueryPlan({
                payloadJson: payloadJson,
                templateId: this.recordId
            });

            this.queryPlan = JSON.parse(queryPlanJson);

            this.discoveredFields = [
                ...discovery.scalarPaths.map(p => ({ type: 'Scalar', path: p })),
                ...discovery.collections.map(c => ({
                    type: 'Collection',
                    path: c.relationshipName,
                    fields: c.fieldPaths.join(', ')
                }))
            ];

            this.showToast('Success', 'Fields discovered successfully', 'success');
        } catch (error) {
            this.showToast(
                'Error',
                'Discovery failed: ' + (error.body?.message || error.message || error),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    async handlePreview() {
        if (!this.sampleRecordId) {
            this.showToast('Error', 'Please enter a sample record ID for preview', 'error');
            return;
        }

        if (!this.queryPlan) {
            await this.handleDiscoverFields();
            if (!this.queryPlan) return;
        }

        // Show spinner but don't open modal yet
        this.isLoading = true;
        this.previewLoading = true;
        this.showPreview = false;

        try {
            // eslint-disable-next-line no-console
            console.log('📊 SOQL Query:', this.queryPlan.soqlQuery);
            // eslint-disable-next-line no-console
            console.log('📋 Full Query Plan:', JSON.stringify(this.queryPlan, null, 2));

            const dataJson = await fetchData({
                recordId: this.sampleRecordId,
                queryPlanJson: JSON.stringify(this.queryPlan)
            });

            // eslint-disable-next-line no-console
            console.log('✅ Fetched Data JSON:', dataJson);

            // For HTML templates, convert to PDF and show in viewer
            const htmlContent = await this.compileTemplate(this.htmlBody, dataJson);
            // eslint-disable-next-line no-console
            console.log('HTML template compiled, converting to PDF, length:', htmlContent?.length || 0);
            const pdfBytes = await this.renderPdf(htmlContent);
            // Store PDF bytes for viewer instead of downloading
            this.previewPdfBytes = pdfBytes;
            this.previewPdfUrl = null; // Clear old URL if any
            this.showPreview = true;
            // eslint-disable-next-line no-console
            console.log('HTML template PDF generated for preview');

            this.previewLoading = false;
        } catch (error) {
            this.previewLoading = false;
            this.showPreview = false;
            this.showToast(
                'Error',
                'Preview failed: ' + (error.body?.message || error.message || error),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Download PDF file
     * @param {Uint8Array} pdfBytes - PDF file bytes
     * @param {string} filename - Filename without extension
     */
    downloadPdf(pdfBytes, filename) {
        try {
            // Validate input
            if (!pdfBytes) {
                throw new Error('PDF bytes are empty or undefined');
            }

            // Ensure pdfBytes is a Uint8Array
            let bytes = pdfBytes;
            if (!(bytes instanceof Uint8Array)) {
                // eslint-disable-next-line no-console
                console.warn('PDF bytes is not Uint8Array, converting...', typeof bytes);
                if (Array.isArray(bytes)) {
                    bytes = new Uint8Array(bytes);
                } else if (bytes instanceof ArrayBuffer) {
                    bytes = new Uint8Array(bytes);
                } else if (typeof bytes === 'string') {
                    // Handle base64 string - decode it
                    try {
                        const binaryString = atob(bytes);
                        bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
        } catch (error) {
                        throw new Error('Invalid PDF bytes format: string is not valid base64 - ' + error.message);
                    }
                } else {
                    throw new Error('Invalid PDF bytes format: ' + typeof bytes);
                }
            }

            // Validate PDF header
            if (bytes.length < 4) {
                throw new Error('PDF bytes too short');
            }

            // Create blob from PDF bytes
            const blob = new Blob([bytes], { type: 'application/pdf' });
            
            // Verify blob size
            if (blob.size === 0) {
                throw new Error('Created blob is empty');
            }

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename || 'document'}.pdf`;
            link.style.display = 'none';
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            
            // Clean up after a short delay to ensure download starts
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
            
            this.showToast('Success', 'PDF downloaded successfully', 'success');
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('PDF download failed:', error);
            // eslint-disable-next-line no-console
            console.error('PDF bytes type:', typeof pdfBytes);
            // eslint-disable-next-line no-console
            console.error('PDF bytes length:', pdfBytes?.length);
            this.showToast('Error', 'Failed to download PDF: ' + error.message, 'error');
        }
    }


    async renderPdf(html) {
        try {
            // Get jsPDF from window
            const jsPDF = window.jsPDF || 
                         (window.jspdf && (window.jspdf.jsPDF || window.jspdf.default)) ||
                         (typeof window.jspdf === 'function' ? window.jspdf : null);
            
            if (!jsPDF || typeof jsPDF !== 'function') {
                throw new Error('jsPDF library not loaded. Please refresh the page.');
            }

            // Ensure HTML is a string
            let htmlContent = html;
            if (typeof htmlContent !== 'string') {
                htmlContent = String(htmlContent);
            }
            
            // Clean HTML - remove script tags and other problematic elements
            htmlContent = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            
            // If mammoth output is a full HTML document, extract the body content
            if (htmlContent.includes('<body')) {
                const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                if (bodyMatch && bodyMatch[1]) {
                    htmlContent = bodyMatch[1].trim();
                }
            }

            // Create jsPDF instance (A4 format, portrait)
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // Parse HTML and convert to text with line breaks preserved
            // Create a temporary DOM element to parse HTML
            const tempDiv = document.createElement('div');
            // eslint-disable-next-line @lwc/lwc/no-inner-html
            tempDiv.innerHTML = htmlContent;
            
            // Extract text content while preserving line breaks
            // Replace <br> and </p><p> with newlines
            const textWithBreaks = tempDiv.innerHTML
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>\s*<p>/gi, '\n\n')
                .replace(/<\/div>\s*<div>/gi, '\n')
                .replace(/<[^>]+>/g, '') // Remove all remaining HTML tags
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");

            // Split into lines and add to PDF
            const lines = textWithBreaks.split('\n');
            const margin = 20; // 20mm margins
            const pageWidth = 210 - (margin * 2); // A4 width minus margins
            let yPosition = margin;
            const lineHeight = 7; // Line height in mm
            const fontSize = 12; // Font size in points

            pdf.setFontSize(fontSize);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (!line) {
                    // Empty line - add spacing
                    yPosition += lineHeight * 0.5;
                } else {
                    // Check if we need a new page
                    if (yPosition + lineHeight > 297 - margin) {
                        pdf.addPage();
                        yPosition = margin;
                    }
                    
                    // Split long lines to fit page width
                    const textLines = pdf.splitTextToSize(line, pageWidth);
                    pdf.text(textLines, margin, yPosition);
                    yPosition += textLines.length * lineHeight;
                }
            }

            // Get PDF as Uint8Array
            const pdfBytes = pdf.output('arraybuffer');
            const uint8Array = new Uint8Array(pdfBytes);

            // Validate PDF bytes
            if (!uint8Array || uint8Array.length === 0) {
                throw new Error('Generated PDF is empty');
            }

            // Verify PDF header (PDF files start with %PDF)
            const header = String.fromCharCode(...uint8Array.slice(0, 4));
            if (header !== '%PDF') {
                // eslint-disable-next-line no-console
                console.warn('PDF header validation failed, but continuing...');
            }

            return uint8Array;
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('PDF rendering failed:', error);
            throw new Error('PDF rendering failed: ' + error.message);
        }
    }


    async compileTemplate(htmlTemplate, dataJson) {
        const data = JSON.parse(dataJson);
        return renderTemplate(htmlTemplate, data);
    }

    async handleSave() {
        if (!this.htmlBody) {
            this.showToast('Error', 'HTML body is required', 'error');
            return;
        }

        this.isLoading = true;
        try {
            const updatedTemplate = {
                Id: this.recordId,
                Html_Body__c: this.htmlBody,
                Source_Type__c: this.sourceType,
                Status__c: this.status,
                Version__c: this.template.Version__c
            };

            await saveTemplate({ template: updatedTemplate });
                this.showToast('Success', 'Template saved successfully', 'success');
            await this.loadTemplate();
        } catch (error) {
            this.showToast(
                'Error',
                'Save failed: ' + (error.body?.message || error.message || error),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    updatePreviewContainer() {
        // eslint-disable-next-line no-console
        console.log('🔄 updatePreviewContainer called');
        // eslint-disable-next-line no-console
        console.log('  - showPreview:', this.showPreview);
        // eslint-disable-next-line no-console
        console.log('  - previewHtml length:', this.previewHtml?.length || 0);
        // eslint-disable-next-line no-console
        console.log('  - previewLoading:', this.previewLoading);

        // Use a small delay to ensure DOM is ready
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            // eslint-disable-next-line no-console
            console.log('  - Looking for container...');
            const container = this.template.querySelector('.preview-container');
            // eslint-disable-next-line no-console
            console.log('  - Container found:', !!container);

            if (!container) {
                // eslint-disable-next-line no-console
                console.error('❌ Preview container not found! Trying again...');
                // Try again after a longer delay
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => {
                    const retryContainer = this.template.querySelector('.preview-container');
                    // eslint-disable-next-line no-console
                    console.log('  - Retry: Container found:', !!retryContainer);
                    if (retryContainer) {
                        this.populateContainer(retryContainer);
                    } else {
                        // eslint-disable-next-line no-console
                        console.error('❌ Container still not found after retry');
                    }
                }, 500);
            return;
        }

            this.populateContainer(container);
        }, 100);
    }

    populateContainer(container) {
        // eslint-disable-next-line no-console
        console.log('📝 populateContainer called');

        if (!this.previewHtml) {
            // eslint-disable-next-line no-console
            console.warn('No preview HTML to display');
            // eslint-disable-next-line @lwc/lwc/no-inner-html
            container.innerHTML = '<p>No preview content available.</p>';
            return;
        }

        // Extract body content if it's a full HTML document
        let htmlContent = this.previewHtml.trim();
        // eslint-disable-next-line no-console
        console.log('  - Original HTML content length:', htmlContent.length);

        // Check if it's a full HTML document
        if (htmlContent.includes('<body')) {
            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (bodyMatch && bodyMatch[1]) {
                htmlContent = bodyMatch[1].trim();
                // eslint-disable-next-line no-console
                console.log('  - Extracted body content, length:', htmlContent.length);
                // eslint-disable-next-line no-console
                console.log('  - Body content preview:', htmlContent.substring(0, 200));
            }
        }

        // Extract styles
        const styleMatch = this.previewHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        let styles = '';
        if (styleMatch && styleMatch[1]) {
            styles = styleMatch[1];
            // eslint-disable-next-line no-console
            console.log('  - Extracted styles, length:', styles.length);
        }

        // Clear container first
        // eslint-disable-next-line @lwc/lwc/no-inner-html
        container.innerHTML = '';
        // eslint-disable-next-line no-console
        console.log('  - Container cleared');

        // Add styles if present
        if (styles) {
            const styleEl = document.createElement('style');
            styleEl.textContent = styles;
            container.appendChild(styleEl);
            // eslint-disable-next-line no-console
            console.log('  - ✅ Added style element');
        }

        // Add content
        if (htmlContent) {
            // Create a wrapper div for the content
            const contentDiv = document.createElement('div');
            // eslint-disable-next-line @lwc/lwc/no-inner-html
            contentDiv.innerHTML = htmlContent;
            container.appendChild(contentDiv);

            // eslint-disable-next-line no-console
            console.log('  - ✅ Preview content added to container');
            // eslint-disable-next-line no-console
            console.log('  - Content div innerHTML length:', contentDiv.innerHTML.length);
            // eslint-disable-next-line no-console
            console.log('  - Container children count:', container.children.length);
            // eslint-disable-next-line no-console
            console.log('  - Content div textContent:', contentDiv.textContent?.substring(0, 100));
        } else {
            // eslint-disable-next-line @lwc/lwc/no-inner-html
            container.innerHTML = '<p>No content found in preview.</p>';
            // eslint-disable-next-line no-console
            console.warn('  - ⚠️ No HTML content to display after extraction');
        }
    }

    handleClosePreview() {
        this.showPreview = false;
        this.previewHtml = '';
        this.previewPdfUrl = null;
        this.previewPdfBytes = null; // Clear PDF bytes
        this.previewLoading = false;
    }

    handleDownloadPreview() {
        if (this.previewPdfBytes) {
            this.downloadPdf(this.previewPdfBytes, this.template.Name || 'document');
        }
    }

    get discoveredFieldsColumns() {
        return [
            { label: 'Type', fieldName: 'type' },
            { label: 'Path', fieldName: 'path' },
            { label: 'Fields', fieldName: 'fields' }
        ];
    }

    get relationshipOptions() {
        return this.relationships.map(r => ({ label: r, value: r }));
    }


    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

}
