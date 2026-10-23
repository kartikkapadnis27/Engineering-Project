export type ProjectReport = {
  title: string;
  category: string;
  description: string;
  technologies: string[];
  version: string;
  sourceFileCount: number;
  linesOfCode: number;
  dependencyCount: number;
  readme: string;
  generatedAt: Date;
};

function escapePdfText(value: string) {
  return value
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(value: string, width = 88) {
  return value.split(/\r?\n/).flatMap((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (line && `${line} ${word}`.length > width) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    lines.push(line);
    return lines;
  });
}

export function buildProjectReportPdf(report: ProjectReport) {
  const lines = [
    'CODEMARKET - PROJECT DOCUMENTATION REPORT',
    `Generated: ${report.generatedAt.toISOString()}`,
    '',
    'PROJECT OVERVIEW',
    `Title: ${report.title}`,
    `Category: ${report.category}`,
    `Version: ${report.version || 'Not specified'}`,
    '',
    'ABSTRACT',
    ...wrapText(report.description),
    '',
    'TECHNOLOGY STACK',
    ...(report.technologies.length > 0 ? report.technologies.map((technology) => `- ${technology}`) : ['Not identified']),
    '',
    'SOURCE STRUCTURE SUMMARY',
    `Recognized source files: ${report.sourceFileCount}`,
    `Non-empty source lines: ${report.linesOfCode}`,
    `Declared dependencies: ${report.dependencyCount}`,
    '',
    'README EXCERPT',
    ...wrapText(report.readme || 'No README file was present in the submitted source archive.'),
    '',
    'ACADEMIC USE NOTICE',
    ...wrapText('This report summarizes seller-submitted project information and an automated local archive structure scan. It is not an independent verification of authorship, correctness, originality, or academic policy compliance. Review and adapt the software in accordance with your institution requirements and the applicable project license.'),
  ];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));

  const objects: string[] = [];
  const pageIds = pages.map((_page, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach((page, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const content = [
      'BT',
      '/F1 10 Tf',
      '48 748 Td',
      '14 TL',
      ...page.flatMap((line, lineIndex) => [
        ...(lineIndex === 0 ? [] : ['T*']),
        `(${escapePdfText(line)}) Tj`,
      ]),
      'ET',
    ].join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const crossReferenceOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
