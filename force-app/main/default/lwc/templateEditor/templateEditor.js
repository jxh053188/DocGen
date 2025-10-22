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

    userSettings = {};
    sampleRecordId = '';

    connectedCallback() {
        this.loadUserSettings();
        if (this.recordId) {
            this.loadTemplate();
        }
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
        } catch (error) {
            this.showToast('Error', 'Failed to load template: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleHtmlChange(event) {
        this.htmlBody = event.target.value;
    }

    handleSampleRecordChange(event) {
        this.sampleRecordId = event.target.value;
    }

    async handleDiscoverFields() {
        if (!this.htmlBody || !this.template.Primary_Object__c) {
            this.showToast('Error', 'HTML body and primary object are required', 'error');
            return;
        }

        this.isLoading = true;
        try {
            // Discover fields from template
            const discovery = discoverFields(this.htmlBody, this.template.Primary_Object__c);

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

            // Compile template
            const html = await this.compileTemplate(this.htmlBody, dataJson);

            this.previewHtml = html;
            this.showPreview = true;

        } catch (error) {
            this.showToast('Error', 'Preview failed: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async compileTemplate(htmlTemplate, dataJson) {
        // Use our custom Locker Service-compliant template engine
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
                Version__c: this.template.Version__c
            };

            await saveTemplate({ template: updatedTemplate });
            this.showToast('Success', 'Template saved successfully', 'success');

            // Reload template to get new version
            await this.loadTemplate();

        } catch (error) {
            this.showToast('Error', 'Save failed: ' + (error.body?.message || error.message), 'error');
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

