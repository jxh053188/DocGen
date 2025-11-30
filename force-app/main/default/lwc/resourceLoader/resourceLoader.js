import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';

/**
 * Simple wrapper component for loading static resources
 * Workaround for known issue: https://help.salesforce.com/s/issue?language=en_US&id=a028c00000gAxQiAAK
 */
export default class ResourceLoader extends LightningElement {
    @api resourceUrl;

    loadAttempted = false;

    renderedCallback() {
        // Only attempt to load once
        if (this.loadAttempted || !this.resourceUrl) {
            return;
        }

        this.loadAttempted = true;

        loadScript(this, this.resourceUrl)
            .then(() => {
                console.log('✅ Resource loaded successfully:', this.resourceUrl);
                this.dispatchEvent(new CustomEvent('resourceloaded'));
            })
            .catch((error) => {
                console.error('❌ Failed to load resource:', this.resourceUrl, error);
                this.dispatchEvent(new CustomEvent('resourceerror', {
                    detail: { error: error.message }
                }));
            });
    }
}

