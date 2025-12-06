extractTextFromXml(xmlContent) {
    try {
        // Simple text extraction from XML - remove XML tags and get content
        let text = xmlContent
            .replace(/<[^>]+>/g, ' ') // Remove XML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        return text;
    } catch (error) {
        console.warn('Failed to extract text from XML:', error);
        return '';
    }
}