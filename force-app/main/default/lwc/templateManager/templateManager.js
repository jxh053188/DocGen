import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getAllTemplates from '@salesforce/apex/TemplateController.getAllTemplates';
import saveTemplate from '@salesforce/apex/TemplateController.saveTemplate';
import deleteTemplate from '@salesforce/apex/TemplateController.deleteTemplate';
import validateSObject from '@salesforce/apex/TemplateController.validateSObject';
import uploadTemplateFile from '@salesforce/apex/TemplateController.uploadTemplateFile';
import getTemplateFile from '@salesforce/apex/TemplateController.getTemplateFile';
import deleteTemplateFile from '@salesforce/apex/TemplateController.deleteTemplateFile';
import { discoverFields } from 'c/discoveryUtils';
import PIZZIP from '@salesforce/resourceUrl/pizzip';
import DOCXTEMPLATER from '@salesforce/resourceUrl/docxtemplater';

const COLUMNS = [
    { label: 'Name', fieldName: 'Name', type: 'text' },
    { label: 'Primary Object', fieldName: 'Primary_Object__c', type: 'text' },
    { label: 'Status', fieldName: 'Status__c', type: 'text' },
    { label: 'Source Type', fieldName: 'Source_Type__c', type: 'text' },
    { label: 'Version', fieldName: 'Version__c', type: 'number' },
    { label: 'Last Modified', fieldName: 'LastModifiedDate', type: 'date' },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [
                { label: 'Edit', name: 'edit' },
                { label: 'Delete', name: 'delete' }
            ]
        }
    }
];

export default class TemplateManager extends LightningElement {
    @track templates = [];
    @track showModal = false;
    @track isLoading = false;
    @track currentTemplate = {};
    @track uploadedFile = null;
    @track uploadedFileName = '';

    columns = COLUMNS;
    wiredTemplatesResult;
    @track pizzipLoaded = false;
    @track docxtemplaterLoaded = false;
    pizzipLoadPromise = null;
    docxtemplaterLoadPromise = null;

    // Form fields
    templateName = '';
    primaryObject = '';
    sourceType = 'HTML';
    status = 'Draft';
    htmlBody = '';
    allowedFields = '';

    // Resource URLs for resourceLoader components
    get pizzipUrl() {
        return PIZZIP;
    }

    get docxtemplaterUrl() {
        return DOCXTEMPLATER;
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

    get modalTitle() {
        return this.currentTemplate.Id ? 'Edit Template' : 'New Template';
    }

    get showFileUpload() {
        return this.sourceType === 'Word';
    }

    get showHtmlEditor() {
        return this.sourceType === 'HTML';
    }

    @wire(getAllTemplates)
    wiredTemplates(result) {
        this.wiredTemplatesResult = result;
        if (result.data) {
            this.templates = result.data;
        } else if (result.error) {
            this.showToast('Error', 'Failed to load templates', 'error');
        }
    }

    handleNewTemplate() {
        this.resetForm();
        this.showModal = true;
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        switch (actionName) {
            case 'edit':
                this.handleEdit(row);
                break;
            case 'delete':
                this.handleDelete(row);
                break;
        }
    }

    handleEdit(template) {
        this.currentTemplate = { ...template };
        this.templateName = template.Name;
        this.primaryObject = template.Primary_Object__c;
        this.sourceType = template.Source_Type__c || 'HTML';
        this.status = template.Status__c || 'Draft';
        this.htmlBody = template.Html_Body__c || '';
        this.allowedFields = template.Allowed_Fields__c || '';
        this.showModal = true;
    }

    async handleDelete(template) {
        if (!confirm(`Are you sure you want to delete "${template.Name}"?`)) {
            return;
        }

        this.isLoading = true;
        try {
            await deleteTemplate({ templateId: template.Id });
            this.showToast('Success', 'Template deleted successfully', 'success');
            await refreshApex(this.wiredTemplatesResult);
        } catch (error) {
            this.showToast('Error', error.body?.message || 'Failed to delete template', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleInputChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.value;

        switch (field) {
            case 'name':
                this.templateName = value;
                break;
            case 'primaryObject':
                this.primaryObject = value;
                break;
            case 'sourceType':
                this.sourceType = value;
                break;
            case 'status':
                this.status = value;
                break;
            case 'htmlBody':
                this.htmlBody = value;
                break;
            case 'allowedFields':
                this.allowedFields = value;
                break;
        }
    }

    async handleFileUpload(event) {
        console.log("🚀 handleFileUpload called", event);
        const files = event.target.files;
        if (!files || files.length === 0) {
            console.log("📁 Files selected:", files?.length || 0, files);
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

        // Extract fields from DOCX using docxtemplater
        try {
            console.log('🔍 Starting DOCX processing with docxtemplater...');
            const base64Data = await this.readFileAsBase64(file);
            console.log('✅ File read as base64, length:', base64Data.length);

            // Convert base64 to binary array buffer
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('✅ Converted to binary array, length:', bytes.length);

            // Wait for libraries to be loaded via resourceLoader
            await this.waitForLibraries();

            // Check if libraries are available
            if (!window.PizZip || !window.docxtemplater) {
                this.showToast('Error', 'Required libraries not loaded. Please refresh the page.', 'error');
                return;
            }

            // Create PizZip instance from bytes, then create docxtemplater instance
            console.log('📄 Creating PizZip instance...');
            const pizzip = new window.PizZip(bytes);
            console.log('📄 Creating docxtemplater instance...');
            const doc = new window.docxtemplater(pizzip);

            // Get the raw XML content to extract template fields
            console.log('📁 Getting ZIP from docxtemplater...');
            const zip = doc.getZip();
            console.log('📁 ZIP obtained, checking for document.xml...');
            console.log('📁 Available files in ZIP:', Object.keys(zip.files || {}));
            const documentXml = zip.files['word/document.xml']?.asText();
            console.log('📄 Document XML length:', documentXml?.length || 'undefined');

            if (documentXml) {
                // Extract template fields from the XML content
                const templateText = documentXml
                    .replace(/<[^>]+>/g, ' ') // Remove XML tags
                    .replace(/\\s+/g, ' ') // Normalize whitespace  
                    .trim();

                if (this.primaryObject) {
                    const discovery = discoverFields(templateText, this.primaryObject);
                    let fields = [...discovery.scalarPaths];
                    discovery.collections.forEach(collection => {
                        fields.push(...collection.fieldPaths);
                    });
                    this.extractedFields = [...new Set(fields)].sort();
                } else {
                    this.extractedFields = this.extractFieldPatterns(templateText);
                }

                this.showToast('Success', `File "${file.name}" ready. Found ${this.extractedFields.length} fields.`, 'success');
            } else {
                this.showToast('Warning', `File "${file.name}" processed but no document content found.`, 'warning');
                this.extractedFields = [];
            }
        } catch (error) {
            console.error('Failed to process DOCX file:', error);
            this.showToast('Error', `Failed to process file: ${error.message}`, 'error');
            this.extractedFields = [];
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

    async handleSave() {
        if (!this.validateForm()) {
            return;
        }

        // Validate SObject name
        const isValid = await validateSObject({ sObjectName: this.primaryObject });
        if (!isValid) {
            this.showToast('Error', `"${this.primaryObject}" is not a valid SObject API name`, 'error');
            return;
        }

        this.isLoading = true;
        try {
            const template = {
                Id: this.currentTemplate.Id,
                Name: this.templateName,
                Primary_Object__c: this.primaryObject,
                Source_Type__c: this.sourceType,
                Status__c: this.status,
                Html_Body__c: this.htmlBody,
                Allowed_Fields__c: this.allowedFields,
                Renderer_Strategy__c: 'Function'
            };

            const savedTemplateId = await saveTemplate({ template });

            // If Word template and file is uploaded, upload the file
            if (this.sourceType === 'Word' && this.uploadedFile) {
                try {
                    const base64Data = await this.readFileAsBase64(this.uploadedFile);
                    await uploadTemplateFile({
                        templateId: savedTemplateId || this.currentTemplate.Id,
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

            this.handleCancel();
            await refreshApex(this.wiredTemplatesResult);
        } catch (error) {
            this.showToast('Error', error.body?.message || 'Failed to save template', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleCancel() {
        this.showModal = false;
        this.resetForm();
    }

    validateForm() {
        if (!this.templateName) {
            this.showToast('Error', 'Template name is required', 'error');
            return false;
        }

        if (!this.primaryObject) {
            this.showToast('Error', 'Primary object is required', 'error');
            return false;
        }

        // For HTML templates, htmlBody is required
        // For Word templates, either htmlBody or uploadedFile is required
        if (this.sourceType === 'HTML' && !this.htmlBody) {
            this.showToast('Error', 'HTML body is required for HTML templates', 'error');
            return false;
        }

        if (this.sourceType === 'Word' && !this.uploadedFile && !this.currentTemplate.Id) {
            this.showToast('Error', 'Please upload a DOCX file for Word templates', 'error');
            return false;
        }

        return true;
    }

    resetForm() {
        this.currentTemplate = {};
        this.templateName = '';
        this.primaryObject = '';
        this.sourceType = 'HTML';
        this.status = 'Draft';
        this.htmlBody = '';
        this.allowedFields = '';
        this.uploadedFile = null;
        this.uploadedFileName = '';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}

