import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.js',
  import.meta.url
).toString();


export const isPDFFile = (file: File): boolean => {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};


export async function extractTextFromPDF(file: File): Promise<string> {
  if (!isPDFFile(file)) {
    throw new Error('Not a PDF file');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();

    const loadingTask = (pdfjsLib as any).getDocument({ data: arrayBuffer });
    const doc = await loadingTask.promise; 

    const numPages = doc.numPages || 0;
    const pageTexts: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const textContent: any = await page.getTextContent();

        const pageText = (textContent.items || [])
          .map((item: any) => {
            return item?.str ?? item?.unicode ?? '';
          })
          .join(' ')
          .trim();

        pageTexts.push(pageText);

        if (typeof page.cleanup === 'function') page.cleanup();
      } catch (pageErr) {
        console.warn(`Failed to extract text from PDF page ${i}:`, pageErr);
        pageTexts.push(''); 
      }
    }

    if (typeof doc.destroy === 'function') await doc.destroy();

    const fullText = pageTexts.filter(Boolean).join('\n\n').trim();
    return fullText;
  } catch (err: any) {
    console.error('extractTextFromPDF error:', err);
    throw new Error('Failed to extract text from PDF file');
  }
}
