import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadScript } from 'lightning/platformResourceLoader';
import docxtemplater from '@salesforce/resourceUrl/docxtemplater';
import pizzip from '@salesforce/resourceUrl/pizzip';
import docx_preview from '@salesforce/resourceUrl/docx_preview';
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

const MAX_HTML_LENGTH = 131072; // Max characters for Html_Body__c field

export default class TemplateEditor extends LightningElement {
    @api recordId; // Template record Id

    @track template = {};
    @track htmlBody = '';
    @track isLoading = false;
    @track showPreview = false;
    @track previewHtml = '';
    @track queryPlan = null;
    @track discoveredFields = [];
    @track relationships = [];
    @track uploadedFile = null;
    @track uploadedFileName = '';
    @track hasTemplateFile = false;
    @track templateFileName = '';

    userSettings = {};
    sampleRecordId = '';
    docxLibrariesLoaded = false;

    connectedCallback() {
        this.loadUserSettings();

        if (this.recordId) {
            this.loadTemplate();
        }
    }

    get isWordTemplate() {
        return this.template.Source_Type__c === 'Word';
    }

    get isHtmlTemplate() {
        return this.template.Source_Type__c === 'HTML' || !this.template.Source_Type__c;
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

    async loadUserSettings() {
        try {
            this.userSettings = await getUserSettings();
        } catch (error) {
            console.error('Failed to load user settings:', error);
        }
    }

    async loadTemplate() {
        this.isLoading = true;
        try {
            this.template = await getTemplate({ templateId: this.recordId });
            this.htmlBody = this.template.Html_Body__c || '';

            // Load relationships for primary object
            if (this.template.Primary_Object__c) {
                this.relationships = await getChildRelationships({
                    sObjectName: this.template.Primary_Object__c
                });
            }

            // Check if Word template has a file
            if (this.isWordTemplate) {
                await this.checkTemplateFile();
                // Load DOCX libraries for Word templates
                await this.loadDocxLibraries();
            }
        } catch (error) {
            this.showToast('Error', 'Failed to load template: ' + error.body?.message, 'error');
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
            console.warn('Failed to check template file:', error);
            this.hasTemplateFile = false;
        }
    }

    async loadDocxLibraries() {
        if (this.docxLibrariesLoaded) {
            return;
        }

        try {
            // Load PizZip first (required by docxtemplater)
            await loadScript(this, pizzip);
            console.log('✅ PizZip loaded successfully');

            // Load docxtemplater
            await loadScript(this, docxtemplater);
            console.log('✅ docxtemplater loaded successfully');

            // Load docx-preview
            await loadScript(this, docx_preview);
            console.log('✅ docx-preview loaded successfully');

            this.docxLibrariesLoaded = true;
        } catch (error) {
            console.error('❌ Failed to load DOCX libraries:', error);
            this.showToast('Error', 'Failed to load DOCX processing libraries', 'error');
        }
    }

    handleHtmlChange(event) {
        this.htmlBody = event.target.value;
    }

    handleSampleRecordChange(event) {
        this.sampleRecordId = event.target.value;
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
                // For Word templates, extract text from DOCX file
                if (!this.hasTemplateFile) {
                    this.showToast('Error', 'Please upload a DOCX file first', 'error');
                    this.isLoading = false;
                    return;
                }

                const fileData = await getTemplateFile({ templateId: this.recordId });
                if (!fileData) {
                    this.showToast('Error', 'Template file not found', 'error');
                    this.isLoading = false;
                    return;
                }

                templateText = await this.extractTextFromDocx(fileData.base64Data);
            } else {
                // For HTML templates, use HTML body
                if (!this.htmlBody) {
                    this.showToast('Error', 'HTML body is required', 'error');
                    this.isLoading = false;
                    return;
                }
                templateText = this.htmlBody;
            }

            // Discover fields from template text
            const discovery = discoverFields(templateText, this.template.Primary_Object__c);

            // Debug: Log the discovery payload BEFORE sending to Apex
            console.log('📤 Sending to Apex (before JSON.stringify):', discovery);
            const payloadJson = JSON.stringify(discovery);
            console.log('📤 JSON string being sent to Apex:', payloadJson);

            // Build query plan
            const queryPlanJson = await buildQueryPlan({
                payloadJson: payloadJson,
                templateId: this.recordId
            });

            this.queryPlan = JSON.parse(queryPlanJson);

            // Extract discovered fields for display
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
            this.showToast('Error', 'Discovery failed: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
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
                return '';
            }

            // Get XML content as text
            const xmlText = documentXml.asText();
            
            // Simple extraction: remove XML tags and get text content
            let text = xmlText
                .replace(/<[^>]+>/g, ' ') // Remove XML tags
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();

            return text;
        } catch (error) {
            console.warn('Failed to extract text from DOCX:', error);
            return '';
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

        this.isLoading = true;
        try {
            // Log the query for debugging
            console.log('📊 SOQL Query:', this.queryPlan.soqlQuery);
            console.log('📋 Full Query Plan:', JSON.stringify(this.queryPlan, null, 2));

            // Fetch data
            const dataJson = await fetchData({
                recordId: this.sampleRecordId,
                queryPlanJson: JSON.stringify(this.queryPlan)
            });

            // Log the returned data
            console.log('✅ Fetched Data JSON:', dataJson);
            const data = JSON.parse(dataJson);
            console.log('📦 Parsed Data Object:', data);

            let html = '';

            if (this.isWordTemplate) {
                // For Word templates, process DOCX and convert to HTML
                html = await this.previewWordTemplate(dataJson);
            } else {
                // For HTML templates, compile normally
                html = await this.compileTemplate(this.htmlBody, dataJson);
            }

            this.previewHtml = html;
            this.showPreview = true;

        } catch (error) {
            this.showToast('Error', 'Preview failed: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async previewWordTemplate(dataJson) {
        if (!this.hasTemplateFile) {
            throw new Error('No DOCX file found for this template');
        }

        // Ensure libraries are loaded
        await this.loadDocxLibraries();

        // Get DOCX file
        const fileData = await getTemplateFile({ templateId: this.recordId });
        if (!fileData) {
            throw new Error('Template file not found');
        }

        // Process DOCX with docxtemplater
        const processedDocx = await this.processDocx(fileData.base64Data, dataJson);

        // Convert DOCX to HTML
        const html = await this.docxToHtml(processedDocx);

        return html;
    }

    async processDocx(base64Data, dataJson) {
        try {
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

            // Parse data for docxtemplater
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
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                if (value.length > 0 && value[0].records) {
                    result[key] = value[0].records;
                } else {
                    result[key] = value;
                }
            } else if (typeof value === 'object' && value !== null) {
                if (value.records) {
                    result[key] = value.records;
                } else {
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
            const docxLib = window.docx || window.docxPreview;
            if (!docxLib) {
                throw new Error('docx-preview library not loaded');
            }

            const container = document.createElement('div');
            container.style.width = '210mm';
            container.style.padding = '20mm';
            container.style.fontFamily = 'Arial, sans-serif';
            container.style.backgroundColor = '#ffffff';
            document.body.appendChild(container);

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
                docxLib.render(docxArray, container);
            } else {
                throw new Error('docx-preview render method not found');
            }

            const html = container.innerHTML;
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

    async handleSave() {
        if (this.isHtmlTemplate && !this.htmlBody) {
            this.showToast('Error', 'HTML body is required', 'error');
            return;
        }

        if (this.isWordTemplate && !this.hasTemplateFile && !this.uploadedFile) {
            this.showToast('Error', 'Please upload a DOCX file for Word templates', 'error');
            return;
        }

        this.isLoading = true;
        try {
            const updatedTemplate = {
                Id: this.recordId,
                Html_Body__c: this.htmlBody,
                Version__c: this.template.Version__c
            };

            const savedTemplateId = await saveTemplate({ template: updatedTemplate });

            // If Word template and file is uploaded, upload the file
            if (this.isWordTemplate && this.uploadedFile) {
                try {
                    const base64Data = await this.readFileAsBase64(this.uploadedFile);
                    await uploadTemplateFile({
                        templateId: savedTemplateId || this.recordId,
                        fileName: this.uploadedFileName,
                        base64Data
                    });
                    this.showToast('Success', 'Template and file saved successfully', 'success');
                } catch (fileError) {
                    this.showToast('Warning', 'Template saved but file upload failed: ' + fileError.body?.message, 'warning');
                }
            } else {
                this.showToast('Success', 'Template saved successfully', 'success');
            }

            // Reload template to get new version
            await this.loadTemplate();
            this.uploadedFile = null;
            this.uploadedFileName = '';

        } catch (error) {
            this.showToast('Error', 'Save failed: ' + (error.body?.message || error.message), 'error');
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

    handleFileUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];
        
        // Validate file type
        if (!file.name.endsWith('.docx')) {
            this.showToast('Error', 'Please upload a .docx file', 'error');
            return;
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showToast('Error', 'File size must be less than 10MB', 'error');
            return;
        }

        this.uploadedFile = file;
        this.uploadedFileName = file.name;
        this.showToast('Success', `File "${file.name}" ready for upload`, 'success');
    }

    async handleDeleteFile() {
        if (!confirm(`Are you sure you want to delete "${this.templateFileName}"?`)) {
            return;
        }

        this.isLoading = true;
        try {
            await deleteTemplateFile({ templateId: this.recordId });
            this.showToast('Success', 'File deleted successfully', 'success');
            await this.checkTemplateFile();
        } catch (error) {
            this.showToast('Error', 'Failed to delete file: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleClosePreview() {
        this.showPreview = false;
        this.previewHtml = '';
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
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}

