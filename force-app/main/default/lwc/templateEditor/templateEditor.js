import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getTemplate from '@salesforce/apex/TemplateController.getTemplate';
import getTemplateFile from '@salesforce/apex/TemplateController.getTemplateFile';
import uploadTemplateFile from '@salesforce/apex/TemplateController.uploadTemplateFile';
import deleteTemplateFile from '@salesforce/apex/TemplateController.deleteTemplateFile';
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
    @track uploadedFile = null;
    @track uploadedFileName = '';
    @track extractedFields = [];
    @track hasTemplateFile = false;
    @track templateFileName = '';
    @track sourceType = 'HTML';
    @track status = 'Draft';

    userSettings = {};
    @track sampleRecordId = '';
    @track outputFormat = 'PDF'; // 'PDF' or 'DOCX' for Word templates
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


    get isWordTemplate() {
        return this.sourceType === 'Word';
    }

    get isHtmlTemplate() {
        return this.sourceType === 'HTML' || !this.sourceType;
    }

    get sourceTypeOptions() {
        return [
            { label: 'HTML', value: 'HTML' },
            { label: 'Word', value: 'Word' }
        ];
    }

    get statusOptions() {
        return [
            { label: 'Draft', value: 'Draft' },
            { label: 'Active', value: 'Active' },
            { label: 'Archived', value: 'Archived' }
        ];
    }

    get showFileUpload() {
        return this.isWordTemplate && !this.hasTemplateFile;
    }

    get showFileInfo() {
        return this.isWordTemplate && this.hasTemplateFile;
    }

    get showHtmlEditor() {
        return this.isHtmlTemplate;
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

            // Check if Word template has a file
            if (this.isWordTemplate) {
                await this.checkTemplateFile();
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

    async checkTemplateFile() {
        try {
            const fileData = await getTemplateFile({ templateId: this.recordId });
            if (fileData) {
                this.hasTemplateFile = true;
                this.templateFileName = fileData.fileName;
            } else {
                this.hasTemplateFile = false;
                this.templateFileName = '';
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('Failed to check template file:', error);
            this.hasTemplateFile = false;
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

    handleOutputFormatChange(event) {
        this.outputFormat = event.detail.value;
        // eslint-disable-next-line no-console
        console.log('Output format changed to:', this.outputFormat);
    }

    async handleSourceTypeChange(event) {
        const newSourceType = event.detail.value;

        // If switching to Word template, check for existing file
        if (newSourceType === 'Word') {
            await this.checkTemplateFile();
        }

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
            let templateText = '';

            if (this.isWordTemplate) {
                // Get the Word document file and extract template text
                if (!this.recordId) {
                    this.showToast('Error', 'Template ID is required to load the Word document.', 'error');
                this.isLoading = false;
                return;
                }


                const fileData = await getTemplateFile({ templateId: this.recordId });

                if (!fileData || !fileData.base64Data) {
                    this.showToast('Error', 'Word template file not found. Please upload a Word document first.', 'error');
                    this.isLoading = false;
                    return;
                }

                // Convert base64 to binary
                const binaryString = atob(fileData.base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                // Load into PizZip and extract document.xml
                const pizzip = new window.PizZip(bytes);
                const zip = pizzip;
                const documentXml = zip.files['word/document.xml']?.asText();

                if (!documentXml) {
                    this.showToast('Error', 'Could not extract document content from Word file.', 'error');
                    this.isLoading = false;
                    return;
                }

                // Extract template text from XML
                templateText = documentXml
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            } else {
                if (!this.htmlBody) {
                    this.showToast('Error', 'HTML body is required', 'error');
                    this.isLoading = false;
                    return;
                }
                templateText = this.htmlBody;
            }

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

            if (this.isWordTemplate) {
                // For Word templates, generate PDF or DOCX based on user selection
                if (this.outputFormat === 'PDF') {
                    const pdfBytes = await this.previewWordTemplate(dataJson, 'PDF');
                    // Store PDF bytes for viewer instead of downloading
                    this.previewPdfBytes = pdfBytes;
                    this.previewPdfUrl = null; // Clear old URL if any
                    this.showPreview = true;
                    // eslint-disable-next-line no-console
                    console.log('Word template PDF generated for preview');
            } else {
                    // DOCX format - download rendered DOCX directly (no viewer for DOCX)
                    const docxBytes = await this.previewWordTemplate(dataJson, 'DOCX');
                    this.downloadDocx(docxBytes, this.template.Name || 'document');
                    // eslint-disable-next-line no-console
                    console.log('Word template DOCX generated and downloaded');
                }
            } else {
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
            }

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

    /**
     * Download DOCX file
     * @param {Uint8Array} docxBytes - DOCX file bytes
     * @param {string} filename - Filename without extension
     */
    downloadDocx(docxBytes, filename) {
        try {
            // Validate input
            if (!docxBytes) {
                throw new Error('DOCX bytes are empty or undefined');
            }

            // Ensure docxBytes is a Uint8Array
            let bytes = docxBytes;
            if (!(bytes instanceof Uint8Array)) {
                // eslint-disable-next-line no-console
                console.warn('DOCX bytes is not Uint8Array, converting...', typeof bytes);
                if (Array.isArray(bytes)) {
                    bytes = new Uint8Array(bytes);
                } else if (bytes instanceof ArrayBuffer) {
                    bytes = new Uint8Array(bytes);
                } else {
                    throw new Error('Invalid DOCX bytes format: ' + typeof bytes);
                }
            }

            // Validate DOCX header (ZIP file signature: PK)
            if (bytes.length < 4) {
                throw new Error('DOCX bytes too short');
            }

            // Create blob from DOCX bytes
            // Use application/zip since DOCX files are ZIP archives (more compatible than the full MIME type)
            // The .docx extension in the download filename will ensure proper file association
            const blob = new Blob([bytes], { type: 'application/zip' });
            
            // Verify blob size
            if (blob.size === 0) {
                throw new Error('Created blob is empty');
            }

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename || 'document'}.docx`;
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
            
            this.showToast('Success', 'DOCX downloaded successfully', 'success');
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('DOCX download failed:', error);
            // eslint-disable-next-line no-console
            console.error('DOCX bytes type:', typeof docxBytes);
            // eslint-disable-next-line no-console
            console.error('DOCX bytes length:', docxBytes?.length);
            this.showToast('Error', 'Failed to download DOCX: ' + error.message, 'error');
        }
    }

    async previewWordTemplate(dataJson, format = 'PDF') {
        // Get the template file from the record
        if (!this.recordId) {
            throw new Error('Template ID is required to load the Word document.');
        }

        const fileData = await getTemplateFile({ templateId: this.recordId });

        if (!fileData || !fileData.base64Data) {
            throw new Error('Word template file not found. Please upload a Word document first.');
        }

        // Convert base64 to binary
        const binaryString = atob(fileData.base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Load into PizZip and create docxtemplater instance
        const pizzip = new window.PizZip(bytes);
        const doc = new window.docxtemplater(pizzip);

        // Parse the data
            const data = JSON.parse(dataJson);

        // Render the template with data
        try {
            doc.render(data);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Docxtemplater render error:', error);
            throw new Error('Failed to render Word template: ' + (error.message || error));
        }

        // Get the rendered ZIP
        const zip = doc.getZip();

        if (format === 'DOCX') {
            // Return DOCX bytes directly
            const docxBytes = zip.generate({ type: 'uint8array' });
            // eslint-disable-next-line no-console
            console.log('DOCX generated, bytes length:', docxBytes.length);
            return docxBytes;
        }

        // PDF format - convert DOCX to HTML using mammoth, then to PDF using jsPDF
        // Get the rendered DOCX as Uint8Array
        const docxBytes = zip.generate({ type: 'uint8array' });
        
        // eslint-disable-next-line no-console
        console.log('Rendered DOCX generated, bytes length:', docxBytes.length);

        // Convert DOCX to HTML using mammoth
        const mammothResult = await window.mammoth.convertToHtml({ arrayBuffer: docxBytes.buffer });
        const html = mammothResult.value;
        console.log('Mammoth HTML:', html);
        const messages = mammothResult.messages || [];

        // Log any conversion messages
        if (messages.length > 0) {
            // eslint-disable-next-line no-console
            console.log('Mammoth conversion messages:', messages);
        }

        // eslint-disable-next-line no-console
        console.log('Converted to HTML using mammoth, length:', html.length);

        // Convert HTML to PDF using jsPDF
        const pdfBytes = await this.renderPdf(html);

        // eslint-disable-next-line no-console
        console.log('PDF generated, bytes length:', pdfBytes.length);

        // Return PDF bytes directly (Uint8Array) for download
        return pdfBytes;
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
        if (this.isHtmlTemplate && !this.htmlBody) {
            this.showToast('Error', 'HTML body is required', 'error');
            return;
        }

        if (this.isWordTemplate && !this.hasTemplateFile && !this.uploadedFile) {
            this.showToast('Error', 'Word template file is required. Please upload a Word document.', 'error');
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

            const savedTemplateId = await saveTemplate({ template: updatedTemplate });

            if (this.isWordTemplate && this.uploadedFile) {
                try {
                    const base64Data = await this.readFileAsBase64(this.uploadedFile);

                    const fieldsString =
                        this.extractedFields && this.extractedFields.length > 0
                        ? this.extractedFields.join(', ')
                        : '';

                    // eslint-disable-next-line no-console
                    console.log('💾 Saving template with fields:', fieldsString);

                    await uploadTemplateFile({
                        templateId: savedTemplateId || this.recordId,
                        fileName: this.uploadedFileName,
                        base64Data,
                        templateFields: fieldsString
                    });

                    this.showToast(
                        'Success',
                        'Template and file saved successfully',
                        'success'
                    );
                    this.hasTemplateFile = true;
                    this.templateFileName = this.uploadedFileName;
                } catch (fileError) {
                    this.showToast(
                        'Warning',
                        'Template saved but file upload failed: ' +
                        (fileError.body?.message || fileError.message || fileError),
                        'warning'
                    );
                }
            } else {
                this.showToast('Success', 'Template saved successfully', 'success');
            }

            await this.loadTemplate();
            this.uploadedFile = null;
            this.uploadedFileName = '';
            this.extractedFields = [];
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

    async readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];

        if (!file.name.endsWith('.docx')) {
            this.showToast('Error', 'Please upload a .docx file', 'error');
            return;
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showToast('Error', 'File size must be less than 10MB', 'error');
            return;
        }

        this.uploadedFile = file;
        this.uploadedFileName = file.name;
        this.isLoading = true;

        try {
            const base64Data = await this.readFileAsBase64(file);


            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const pizzip = new window.PizZip(bytes);
            const doc = new window.docxtemplater(pizzip);

            const zip = doc.getZip();
            const documentXml = zip.files['word/document.xml']?.asText();

            if (documentXml) {
                const templateText = documentXml
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (this.template.Primary_Object__c) {
                    // Automatically discover fields and build query plan
                    const discovery = discoverFields(
                        templateText,
                        this.template.Primary_Object__c
                    );

                    // Extract field list for backward compatibility
                    let fields = [...discovery.scalarPaths];
                    discovery.collections.forEach(collection => {
                        fields.push(...collection.fieldPaths);
                    });
                    this.extractedFields = [...new Set(fields)].sort();

                    // Build query plan and update discoveredFields for UI display
                    try {
                        // eslint-disable-next-line no-console
                        console.log('📤 Auto-discovery payload:', discovery);

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

                        this.showToast(
                            'Success',
                            `File "${file.name}" uploaded. Discovered ${this.discoveredFields.length} field(s) automatically.`,
                            'success'
                        );
                    } catch (discoveryError) {
                        // eslint-disable-next-line no-console
                        console.error('Failed to build query plan:', discoveryError);
                        // Still show success for file upload, but warn about discovery
                        this.showToast(
                            'Success',
                            `File "${file.name}" uploaded. Found ${this.extractedFields.length} fields, but query plan generation failed.`,
                            'warning'
                        );
                    }
                } else {
                    // No primary object, just extract field patterns
                    this.extractedFields = this.extractFieldPatterns(templateText);
                    this.showToast(
                        'Success',
                        `File "${file.name}" ready. Found ${this.extractedFields.length} fields. Set Primary Object to enable automatic discovery.`,
                        'success'
                    );
                }
            } else {
                this.showToast(
                    'Warning',
                    `File "${file.name}" processed but no document content found.`,
                    'warning'
                );
                this.extractedFields = [];
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to process DOCX file:', error);
            this.showToast(
                'Error',
                `Failed to process file: ${error.message || error}`,
                'error'
            );
            this.extractedFields = [];
        } finally {
            this.isLoading = false;
        }
    }

    async handleDeleteFile() {
        // eslint-disable-next-line no-alert
        if (!confirm(`Are you sure you want to delete "${this.templateFileName}"?`)) {
            return;
        }

        this.isLoading = true;
        try {
            await deleteTemplateFile({ templateId: this.recordId });
            this.showToast('Success', 'File deleted successfully', 'success');
            await this.checkTemplateFile();
        } catch (error) {
            this.showToast(
                'Error',
                'Failed to delete file: ' + (error.body?.message || error.message || error),
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

    get outputFormatOptions() {
        return [
            { label: 'PDF', value: 'PDF' },
            { label: 'DOCX', value: 'DOCX' }
        ];
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

    /**
     * Extract field patterns from template text (simple regex-based extraction)
     * Used when primary object is not set
     */
    extractFieldPatterns(templateText) {
        // eslint-disable-next-line no-console
        console.log('🔍 extractFieldPatterns called with text length:', templateText.length);
        const fields = new Set();

        // Match {field} or {nested.path}, but not {#...} or {/...}
        const variableRegex = /\{(?![#/])([\w.]+)\}/g;
        let match;
        let matchCount = 0;

        // eslint-disable-next-line no-cond-assign
        while ((match = variableRegex.exec(templateText)) !== null) {
            matchCount++;
            const path = match[1].trim();
            // eslint-disable-next-line no-console
            console.log(`  Found match ${matchCount}: "${path}"`);
            if (
                path &&
                path !== 'each' &&
                path !== 'if' &&
                path !== 'unless' &&
                path !== 'with'
            ) {
                fields.add(path);
                // eslint-disable-next-line no-console
                console.log(`  ✅ Added field: "${path}"`);
            } else {
                // eslint-disable-next-line no-console
                console.log(`  ⏭️ Skipped keyword: "${path}"`);
            }
        }

        // eslint-disable-next-line no-console
        console.log(`📊 Total matches found: ${matchCount}, unique fields: ${fields.size}`);
        return Array.from(fields).sort();
    }
}
