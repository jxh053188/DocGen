import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord } from 'lightning/uiRecordApi';
import { loadScript } from 'lightning/platformResourceLoader';
import html2pdf from '@salesforce/resourceUrl/html2pdf';
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

            // 2. Discover fields from HTML
            const discovery = discoverFields(template.Html_Body__c, template.Primary_Object__c);

            // 3. Build query plan
            const queryPlanJson = await buildQueryPlan({
                payloadJson: JSON.stringify(discovery),
                templateId: template.Id
            });

            // 4. Fetch data
            const dataJson = await fetchData({
                recordId: this.recordId,
                queryPlanJson: queryPlanJson
            });

            // 5. Compile template with Handlebars
            const html = await this.compileTemplate(template.Html_Body__c, dataJson);

            // 6. Render PDF via Function
            this.pdfBase64 = await this.renderPdf(html);

            // 7. Show preview
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

