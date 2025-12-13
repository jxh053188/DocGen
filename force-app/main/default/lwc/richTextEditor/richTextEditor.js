import { LightningElement, api, track } from "lwc";
import EDITOR from '@salesforce/resourceUrl/TinyMCE';

export default class RichTextEditor extends LightningElement {
	@api label = 'Rich Text Editor';
	_showCard = true; // Default to true for standalone use
	
	@api
	get showCard() {
		return this._showCard;
	}
	
	set showCard(value) {
		this._showCard = value === true || value === 'true';
	}
	
	@track editorLoaded = false;
	@track showViewer = false;
	iframeElement = null;
	_value = '';
	editorURL = '';

	@api
	get value() {
		return this._value;
	}

	set value(content) {
		this._value = content || '';
		// Send content to iframe if editor is ready
		if (this.iframeElement && this.iframeElement.contentWindow && this._value) {
			this.sendContentToEditor();
		}
	}

	connectedCallback() {
		// Set the URL to the TinyMCE HTML file in the static resource
		this.editorURL = EDITOR + '/tinymce/js/tinymce/tinymce.html';
		// Set up message listener for communication with iframe
		window.addEventListener('message', this.handleMessage.bind(this));
	}

	disconnectedCallback() {
		// Clean up message listener
		window.removeEventListener('message', this.handleMessage.bind(this));
	}

	renderedCallback() {
		if (this.editorURL && !this.showViewer) {
			this.showViewer = true;
		}
	}

	handleIframeLoad() {
		console.log('TinyMCE iframe loaded');
		this.iframeElement = this.template.querySelector('iframe');
		
		if (this.iframeElement && this.iframeElement.contentWindow) {
			// If we have initial content, send it to the editor
			if (this._value) {
				// Wait a bit for the editor to be ready
				// eslint-disable-next-line @lwc/lwc/no-async-operation
				setTimeout(() => {
					this.sendContentToEditor();
				}, 500);
			}
		}
	}

	handleMessage(event) {
		// Listen for messages from the TinyMCE iframe
		if (event.data && event.data.type) {
			switch (event.data.type) {
				case 'EDITOR_READY':
					console.log('TinyMCE editor is ready');
					this.editorLoaded = true;
					// Send initial content if we have it
					if (this._value) {
						this.sendContentToEditor();
					}
					break;
				case 'EDITOR_CONTENT_UPDATE':
					console.log('Editor content updated:', event.data.content);
					this._value = event.data.content;
					// Dispatch change event to parent component
					this.dispatchEvent(new CustomEvent('change', {
						detail: { value: this._value }
					}));
					break;
				default:
					break;
			}
		}
	}

	sendContentToEditor() {
		if (this.iframeElement && this.iframeElement.contentWindow && this._value !== undefined) {
			try {
				this.iframeElement.contentWindow.postMessage({
					type: 'SET_CONTENT',
					content: this._value
				}, '*');
				console.log('Content sent to editor:', this._value);
			} catch (error) {
				console.error('Error sending content to editor:', error);
			}
		}
	}
}