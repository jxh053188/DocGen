import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord } from 'lightning/uiRecordApi';
import { loadScript } from 'lightning/platformResourceLoader';
import html2pdf from '@salesforce/resourceUrl/html2pdf';
import docxtemplater from '@salesforce/resourceUrl/docxtemplater';
import pizzip from '@salesforce/resourceUrl/pizzip';
import docx_preview from '@salesforce/resourceUrl/docx_preview';
import getTemplatesForObject from '@salesforce/apex/TemplateController.getTemplatesForObject';
import getTemplate from '@salesforce/apex/TemplateController.getTemplate';
import getTemplateFile from '@salesforce/apex/TemplateController.getTemplateFile';
import buildQueryPlan from '@salesforce/apex/TemplateController.buildQueryPlan';
import fetchData from '@salesforce/apex/TemplateController.fetchData';
import savePdf from '@salesforce/apex/TemplateController.savePdf';
import logPreview from '@salesforce/apex/TemplateController.logPreview';
import getUserSettings from '@salesforce/apex/TemplateController.getUserSettings';
import { discoverFields } from 'c/discoveryUtils';
import { render as renderTemplate } from 'c/templateEngine';

export default class GenerateDocumentAction extends LightningElement {
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
    html2pdfLoaded = false;
    docxtemplaterLoaded = false;
    pizzipLoaded = false;
    docxPreviewLoaded = false;

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

        // Load html2pdf library
        try {
            await loadScript(this, html2pdf);
            this.html2pdfLoaded = true;
            console.log('✅ html2pdf loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load html2pdf:', error);
            this.showToast('Error', 'Failed to load PDF library', 'error');
        }

        // Load DOCX libraries (lazy load when needed)
        // We'll load them when a Word template is selected
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
                this.showToast('Info', `No active templates found for ${this.objectApiName}`, 'info');
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

            // 2. Check template type and process accordingly
            if (template.Source_Type__c === 'Word') {
                await this.processWordTemplate(template);
            } else {
                await this.processHtmlTemplate(template);
            }

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

    async processWordTemplate(template) {
        // 1. Load DOCX libraries if not already loaded
        await this.loadDocxLibraries();

        // 2. Get DOCX file from Apex
        const fileData = await getTemplateFile({ templateId: template.Id });
        if (!fileData) {
            throw new Error('No DOCX file found for this template');
        }

        // 3. Extract template text from DOCX for field discovery
        const templateText = await this.extractTextFromDocx(fileData.base64Data);

        // 4. Discover fields from extracted text
        const discovery = discoverFields(templateText, template.Primary_Object__c);

        // 5. Build query plan
        const queryPlanJson = await buildQueryPlan({
            payloadJson: JSON.stringify(discovery),
            templateId: template.Id
        });

        // 6. Fetch data
        const dataJson = await fetchData({
            recordId: this.recordId,
            queryPlanJson: queryPlanJson
        });

        // 7. Process DOCX with docxtemplater
        const processedDocx = await this.processDocx(fileData.base64Data, dataJson);

        // 8. Convert DOCX to HTML
        const html = await this.docxToHtml(processedDocx);

        // 9. Render PDF
        this.pdfBase64 = await this.renderPdf(html);
    }

    async extractTextFromDocx(base64Data) {
        try {
            if (!window.PizZip) {
                throw new Error('PizZip library not loaded');
            }

            // Convert base64 to binary
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Load DOCX with PizZip
            const zip = new window.PizZip(bytes);

            // Extract text from document.xml
            const documentXml = zip.files['word/document.xml'];
            if (!documentXml) {
                console.warn('Could not find document.xml in DOCX');
                return ''; // Return empty string, field discovery will be limited
            }

            // Get XML content as text
            const xmlText = documentXml.asText();

            // Simple extraction: remove XML tags and get text content
            // This is a basic approach - for production, use proper XML parsing
            let text = xmlText
                .replace(/<[^>]+>/g, ' ') // Remove XML tags
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();

            return text;
        } catch (error) {
            console.warn('Failed to extract text from DOCX:', error);
            // Return empty string as fallback
            return '';
        }
    }

    async loadDocxLibraries() {
        if (this.docxtemplaterLoaded && this.pizzipLoaded && this.docxPreviewLoaded) {
            return; // Already loaded
        }

        try {
            // Load PizZip first (required by docxtemplater)
            if (!this.pizzipLoaded) {
                await loadScript(this, pizzip);
                this.pizzipLoaded = true;
                console.log('✅ PizZip loaded successfully');
            }

            // Load docxtemplater
            if (!this.docxtemplaterLoaded) {
                await loadScript(this, docxtemplater);
                this.docxtemplaterLoaded = true;
                console.log('✅ docxtemplater loaded successfully');
            }

            // Load docx-preview
            if (!this.docxPreviewLoaded) {
                await loadScript(this, docx_preview);
                this.docxPreviewLoaded = true;
                console.log('✅ docx-preview loaded successfully');
            }
        } catch (error) {
            console.error('❌ Failed to load DOCX libraries:', error);
            throw new Error('Failed to load DOCX processing libraries: ' + error.message);
        }
    }

    async processDocx(base64Data, dataJson) {
        try {
            // Check libraries are loaded
            if (!window.PizZip || !window.Docxtemplater) {
                throw new Error('DOCX libraries not loaded');
            }

            // Convert base64 to binary
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Load DOCX with PizZip
            const zip = new window.PizZip(bytes);
            const doc = new window.Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true
            });

            // Parse data for docxtemplater (convert our format to docxtemplater format)
            const data = JSON.parse(dataJson);
            const docxData = this.convertDataForDocxtemplater(data);

            // Render template
            doc.setData(docxData);
            doc.render();

            // Get processed DOCX as binary
            const processedZip = doc.getZip();
            const processedDocx = processedZip.generate({ type: 'uint8array' });

            return processedDocx;
        } catch (error) {
            console.error('DOCX processing failed:', error);
            throw new Error('Failed to process DOCX template: ' + error.message);
        }
    }

    convertDataForDocxtemplater(data) {
        // Convert our nested data structure to docxtemplater format
        // docxtemplater expects: { Name: "value", Opportunities: [{ StageName: "value" }] }
        const result = {};

        // Process scalar fields
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                // Handle collections - extract records array if present
                if (value.length > 0 && value[0].records) {
                    result[key] = value[0].records;
                } else {
                    result[key] = value;
                }
            } else if (typeof value === 'object' && value !== null) {
                // Handle nested objects - flatten if needed
                if (value.records) {
                    result[key] = value.records;
                } else {
                    // Flatten nested object
                    for (const [nestedKey, nestedValue] of Object.entries(value)) {
                        result[`${key}.${nestedKey}`] = nestedValue;
                    }
                }
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    async docxToHtml(docxArray) {
        try {
            // Check for docx-preview library (it might be window.docx or window.docxPreview)
            const docxLib = window.docx || window.docxPreview;
            if (!docxLib) {
                throw new Error('docx-preview library not loaded');
            }

            // Create a container for rendering
            const container = document.createElement('div');
            container.style.width = '210mm'; // A4 width
            container.style.padding = '20mm';
            container.style.fontFamily = 'Arial, sans-serif';
            container.style.backgroundColor = '#ffffff';
            document.body.appendChild(container);

            // Render DOCX to HTML
            // docx-preview API: renderAsync(buffer, container, options)
            if (docxLib.renderAsync) {
                await docxLib.renderAsync(docxArray, container, {
                    className: 'docx-wrapper',
                    inWrapper: true,
                    ignoreWidth: false,
                    ignoreHeight: false,
                    ignoreFonts: false,
                    breakPages: true,
                    ignoreLastRenderedPageBreak: true
                });
            } else if (docxLib.render) {
                // Fallback if renderAsync doesn't exist
                docxLib.render(docxArray, container);
            } else {
                throw new Error('docx-preview render method not found');
            }

            // Get HTML
            const html = container.innerHTML;

            // Remove container
            document.body.removeChild(container);

            return html;
        } catch (error) {
            console.error('DOCX to HTML conversion failed:', error);
            throw new Error('Failed to convert DOCX to HTML: ' + error.message);
        }
    }

    async compileTemplate(htmlTemplate, dataJson) {
        // Use our custom Locker Service-compliant template engine
        const data = JSON.parse(dataJson);
        return renderTemplate(htmlTemplate, data);
    }

    async renderPdf(html) {
        try {
            // Check if html2pdf is loaded
            if (!this.html2pdfLoaded || !window.html2pdf) {
                throw new Error('PDF library not loaded. Please refresh the page.');
            }

            // Create a temporary container for the HTML
            const container = document.createElement('div');
            container.innerHTML = html;
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.width = '210mm'; // A4 width
            document.body.appendChild(container);

            // Configure pdf options
            const options = {
                margin: 10,
                filename: this.fileName,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    letterRendering: true
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait'
                }
            };

            // Generate PDF and get as blob
            const pdf = await window.html2pdf()
                .set(options)
                .from(container)
                .outputPdf('blob');

            // Remove temporary container
            document.body.removeChild(container);

            // Convert blob to base64
            const pdfBase64 = await this.blobToBase64(pdf);

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

