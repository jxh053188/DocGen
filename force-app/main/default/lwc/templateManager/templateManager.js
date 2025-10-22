import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import { loadScript } from 'lightning/platformResourceLoader';
import mammoth from '@salesforce/resourceUrl/mammoth';
import getAllTemplates from '@salesforce/apex/TemplateController.getAllTemplates';
import saveTemplate from '@salesforce/apex/TemplateController.saveTemplate';
import deleteTemplate from '@salesforce/apex/TemplateController.deleteTemplate';
import validateSObject from '@salesforce/apex/TemplateController.validateSObject';

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

    columns = COLUMNS;
    wiredTemplatesResult;
    mammothLoaded = false;

    // Form fields
    templateName = '';
    primaryObject = '';
    sourceType = 'HTML';
    status = 'Draft';
    htmlBody = '';
    allowedFields = '';

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

    get modalTitle() {
        return this.currentTemplate.Id ? 'Edit Template' : 'New Template';
    }

    get showFileUpload() {
        return this.sourceType === 'Word';
    }

    async connectedCallback() {
        // Load mammoth library for DOCX conversion
        try {
            await loadScript(this, mammoth);
            this.mammothLoaded = true;
            console.log('✅ Mammoth.js loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load Mammoth.js:', error);
            this.showToast('Error', 'Failed to load DOCX converter library', 'error');
        }
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
        const files = event.target.files;
        if (!files || files.length === 0) {
            return;
        }

        const file = files[0];
        this.uploadedFile = file;

        // If Word file, convert to HTML using Mammoth
        if (this.sourceType === 'Word') {
            await this.convertDocxToHtml(file);
        }
    }

    async convertDocxToHtml(file) {
        this.isLoading = true;
        try {
            // Check if Mammoth is loaded
            if (!this.mammothLoaded || !window.mammoth) {
                this.showToast('Error', 'DOCX converter library not loaded. Please refresh the page.', 'error');
                this.isLoading = false;
                return;
            }

            const mammoth = window.mammoth;

            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });

            this.htmlBody = result.value;
            this.showToast('Success', 'DOCX converted to HTML successfully', 'success');

            if (result.messages.length > 0) {
                console.warn('Conversion warnings:', result.messages);
            }
        } catch (error) {
            this.showToast('Error', 'Failed to convert DOCX: ' + error.message, 'error');
        } finally {
            this.isLoading = false;
        }
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

            await saveTemplate({ template });
            this.showToast('Success', 'Template saved successfully', 'success');
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

        if (!this.htmlBody) {
            this.showToast('Error', 'HTML body is required', 'error');
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
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}

