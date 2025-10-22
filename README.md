# DocGen - Salesforce PDF Generator

A powerful, client-heavy PDF generation application for Salesforce with browser-based rendering.

## Features

- 📄 **Template Management**: Upload Word docs or create HTML templates
- 🔧 **Visual Editor**: Edit templates with live preview
- 🎨 **Handlebars Templating**: Full support with custom helpers
- 🔐 **Security First**: FLS, sharing rules, and field-level permissions
- 📊 **Dynamic Data**: SOQL generation from template analysis
- 🖨️ **Browser-Based PDF**: Generate PDFs entirely client-side (no external services)
- 💾 **Auto-Save**: Generated PDFs saved to Files automatically

## Architecture

### Browser-Based PDF Generation
- Uses **html2pdf.js** (html2canvas + jsPDF)
- No server-side dependencies
- Zero additional costs
- Works on all Salesforce editions

See [ARCHITECTURE_BROWSER_PDF.md](./ARCHITECTURE_BROWSER_PDF.md) for detailed technical documentation.

## Quick Start

### 1. Deploy to Salesforce
```bash
sf project deploy start
```

### 2. Assign Permission Set
```bash
sf org assign permset --name PDF_Admin
```

### 3. Upload Static Resources
Static resources are included in the project:
- `handlebars.resource` - Template engine
- `mammoth.resource` - DOCX converter
- `html2pdf.resource` - PDF generator

### 4. Create Your First Template
1. Navigate to the **Templates** tab
2. Click **New Template**
3. Upload a Word doc OR paste HTML
4. Click **Save**

### 5. Generate a PDF
1. Open any record (Account, Opportunity, etc.)
2. Click **Generate Document** quick action
3. Select template
4. Preview and save

## Static Resources

| Resource | Size | Purpose |
|----------|------|---------|
| `handlebars` | ~90KB | Template compilation |
| `mammoth` | ~180KB | DOCX → HTML conversion |
| `html2pdf` | ~885KB | HTML → PDF rendering |

## Custom Objects

- **Template__c**: Stores templates with metadata
- **Template_Variable__c**: Defines data relationships
- **Document__c**: Logs generated PDFs

## Permission Sets

- **PDF_Admin**: Full administrative access
- **PDF_Template_Editor**: Create/edit templates
- **PDF_Generator**: Generate PDFs only

## Handlebars Helpers

### Iteration
- `{{#each items}}` - Loop through arrays
- `{{#if condition}}` - Conditional rendering

### Math
- `{{add a b}}` - Addition
- `{{multiply a b}}` - Multiplication
- `{{sum array "field"}}` - Array aggregation

### Formatting
- `{{formatNumber value}}` - Locale-aware numbers
- `{{formatCurrency amount}}` - Currency formatting
- `{{formatDate date "MM/DD/YYYY"}}` - Date formatting

### Comparison
- `{{gt a b}}` - Greater than
- `{{eq a b}}` - Equals

See [handlebarsHelpers.js](./force-app/main/default/lwc/handlebarsHelpers/handlebarsHelpers.js) for full list.

## Documentation

- [Architecture Overview](./ARCHITECTURE_BROWSER_PDF.md)
- [Deployment Guide](./DEPLOYMENT_COMPLETE_GUIDE.md)
- [Implementation Details](./COMPLETE_IMPLEMENTATION.md)
- [Static Resources Setup](./STATIC_RESOURCES_COMPLETE.md)

## Development

### Prerequisites
- Salesforce CLI
- Node.js 18+ (for local development)
- VS Code with Salesforce Extensions

### Project Structure
```
force-app/main/default/
├── classes/           # Apex classes
├── lwc/              # Lightning Web Components
├── objects/          # Custom objects & fields
├── staticresources/  # JavaScript libraries
├── permissionsets/   # Permission sets
└── tabs/             # Custom tabs
```

## Troubleshooting

### PDFs Not Generating
- Check that static resources are deployed
- Verify browser console for errors
- Ensure user has PDF_Generator permission

### Template Not Compiling
- Check Handlebars syntax
- Verify field API names
- Review Security Service logs

### Performance Issues
- Reduce image sizes in templates
- Limit table rows (< 100 per page)
- Simplify CSS layouts

## Support

For issues or questions:
1. Review documentation in this repo
2. Check browser console for errors
3. Review Apex debug logs

## License

This project is open source and available under the MIT License.

## Resources

- [Salesforce DX Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_intro.htm)
- [Lightning Web Components Guide](https://developer.salesforce.com/docs/component-library/documentation/en/lwc)
- [Handlebars Documentation](https://handlebarsjs.com/)
- [html2pdf.js Documentation](https://github.com/eKoopmans/html2pdf.js)
