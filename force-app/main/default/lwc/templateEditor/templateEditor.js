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
import PIZZIP from '@salesforce/resourceUrl/pizzip';
import DOCXTEMPLATER from '@salesforce/resourceUrl/docxtemplater';

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
    @track extractedFields = [];
    @track hasTemplateFile = false;
    @track templateFileName = '';
    @track sourceType = 'HTML';
    @track status = 'Draft';

    userSettings = {};
    sampleRecordId = '';

    // Script loading flags (tracked for template reactivity)
    @track pizzipLoaded = false;
    @track docxtemplaterLoaded = false;
    pizzipLoadPromise = null;
    docxtemplaterLoadPromise = null;

    // Resource URLs for resourceLoader components
    get pizzipUrl() {
        return PIZZIP;
    }

    get docxtemplaterUrl() {
        return DOCXTEMPLATER;
    }

    connectedCallback() {
        this.loadUserSettings();

        if (this.recordId) {
            this.loadTemplate();
        }
    }

    renderedCallback() {
        // Update preview container when preview HTML changes
        if (this.showPreview && this.previewHtml) {
            this.updatePreviewContainer();
        }
    }

    // Event handlers for resourceLoader components
    handlePizzipLoaded() {
        this.pizzipLoaded = true;
        // eslint-disable-next-line no-console
        console.log('PizZip loaded successfully');
        // Resolve the promise if it exists
        if (this.pizzipLoadPromise) {
            this.pizzipLoadPromise.resolve();
        }
    }

    handleDocxtemplaterLoaded() {
        this.docxtemplaterLoaded = true;
        // eslint-disable-next-line no-console
        console.log('Docxtemplater loaded successfully', typeof window.docxtemplater);
        // Resolve the promise if it exists
        if (this.docxtemplaterLoadPromise) {
            this.docxtemplaterLoadPromise.resolve();
        }
    }

    handleResourceError(event) {
        const error = event.detail?.error || 'Unknown error';
        // eslint-disable-next-line no-console
        console.error('Error loading resource:', error);
        this.showToast(
            'Error',
            'Failed to load Word template libraries: ' + error,
            'error'
        );
    }

    /**
     * Wait for libraries to be loaded via resourceLoader components
     * Returns immediately if already loaded
     */
    waitForLibraries() {
        // If already loaded, return immediately
        if (this.pizzipLoaded && this.docxtemplaterLoaded) {
            return Promise.resolve();
        }

        // Create promises that will be resolved by event handlers
        const pizzipPromise = this.pizzipLoaded
            ? Promise.resolve()
            : new Promise((resolve) => {
                this.pizzipLoadPromise = { resolve };
            });

        const docxtemplaterPromise = this.docxtemplaterLoaded
            ? Promise.resolve()
            : new Promise((resolve) => {
                this.docxtemplaterLoadPromise = { resolve };
            });

        // Wait for both to load
        return Promise.all([pizzipPromise, docxtemplaterPromise]);
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

    handleSampleRecordChange(event) {
        this.sampleRecordId = event.target.value;
    }

    handleStatusChange(event) {
        this.status = event.detail.value;
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
                this.showToast(
                    'Error',
                    'Word templates are not supported yet. Please use HTML templates.',
                    'error'
                );
                this.isLoading = false;
                return;
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

        this.isLoading = true;
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

            let html = '';

            if (this.isWordTemplate) {
                html = await this.previewWordTemplate(dataJson);
            } else {
                html = await this.compileTemplate(this.htmlBody, dataJson);
            }

            this.previewHtml = html;
            this.showPreview = true;
            this.updatePreviewContainer();
        } catch (error) {
            this.showToast(
                'Error',
                'Preview failed: ' + (error.body?.message || error.message || error),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    async previewWordTemplate() {
        throw new Error('Word templates are not supported yet. Please use HTML templates.');
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
            this.showToast('Error', 'Word templates are not supported yet', 'error');
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

        try {
            const base64Data = await this.readFileAsBase64(file);

            // Wait for libraries to be loaded via resourceLoader
            await this.waitForLibraries();

            if (!window.PizZip || !window.docxtemplater) {
                this.showToast(
                    'Error',
                    'Required libraries not loaded. Please refresh the page.',
                    'error'
                );
                return;
            }

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
                    const discovery = discoverFields(
                        templateText,
                        this.template.Primary_Object__c
                    );
                    let fields = [...discovery.scalarPaths];
                    discovery.collections.forEach(collection => {
                        fields.push(...collection.fieldPaths);
                    });
                    this.extractedFields = [...new Set(fields)].sort();
                } else {
                    this.extractedFields = this.extractFieldPatterns(templateText);
                }

                this.showToast(
                    'Success',
                    `File "${file.name}" ready. Found ${this.extractedFields.length} fields.`,
                    'success'
                );
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
        setTimeout(() => {
            const container = this.template.querySelector('.preview-container');
            if (container && this.previewHtml) {
                container.innerHTML = this.previewHtml;
            }
        }, 0);
    }

    handleClosePreview() {
        this.showPreview = false;
        this.previewHtml = '';

        setTimeout(() => {
            const container = this.template.querySelector('.preview-container');
            if (container) {
                container.innerHTML = '';
            }
        }, 0);
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

    /**
     * Extract field patterns from template text (simple regex-based extraction)
     * Used when primary object is not set
     */
    extractFieldPatterns(templateText) {
        // eslint-disable-next-line no-console
        console.log('🔍 extractFieldPatterns called with text length:', templateText.length);
        const fields = new Set();

        // Match {field} or {nested.path}, but not {#...} or {/...}
        const variableRegex = /\{(?![#\/])([\w.]+)\}/g;
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
