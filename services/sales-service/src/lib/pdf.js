import PDFDocument from 'pdfkit';

const money = (v) => `Q ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METHOD = { TARJETA: 'Tarjeta (simulado)', TRANSFERENCIA: 'Transferencia (simulado)', CONTRA_ENTREGA: 'Contra entrega (simulado)' };

export function documentPdf(doc, store) {
  const s = doc.snapshot;
  const pdf = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `Comprobante ${doc.number}`, Author: 'Exclusive', Subject: 'SIMULACIÓN — SIN VALIDEZ FISCAL' } });
  const W = pdf.page.width;
  const INK = '#1B2433';
  const JADE = '#0E6B58';
  const GRANA = '#B4233C';
  const MUTED = '#5E6672';

  pdf.save();
  pdf.rotate(-30, { origin: [W / 2, 420] });
  pdf.fontSize(58).fillColor(GRANA).fillOpacity(0.08).font('Helvetica-Bold').text('SIMULACIÓN', 0, 380, { width: W, align: 'center' });
  pdf.restore();
  pdf.fillOpacity(1);

  pdf.font('Helvetica-Bold').fontSize(22).fillColor(INK).text('EXCLUSIVE', 48, 48, { characterSpacing: 4 });
  pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(store?.legalName || 'Exclusive Moda', 48, 76).text(store?.address || '', 48, 88).text(`${store?.phone || ''}  ·  ${store?.email || ''}`, 48, 100);

  pdf.roundedRect(W - 260, 44, 212, 70, 6).lineWidth(1.2).strokeColor(GRANA).stroke();
  pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(GRANA).text('SIMULACIÓN — SIN VALIDEZ FISCAL', W - 252, 52, { width: 196, align: 'center' });
  pdf.font('Helvetica').fontSize(9).fillColor(INK).text('Comprobante de demostración', W - 252, 68, { width: 196, align: 'center' });
  pdf.font('Helvetica-Bold').fontSize(12).text(doc.number, W - 252, 84, { width: 196, align: 'center' });

  pdf.moveTo(48, 132).lineTo(W - 48, 132).lineWidth(2).strokeColor(JADE).stroke();

  pdf.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('CLIENTE', 48, 146);
  pdf.font('Helvetica').fontSize(10.5).fillColor(INK).text(s.customer.name, 48, 160).text(`NIT: ${s.customer.nit}`, 48, 174).text(s.customer.email, 48, 188);
  pdf.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('DATOS', 330, 146);
  pdf.font('Helvetica').fontSize(10.5).fillColor(INK)
    .text(`Pedido: ${s.orderCode}`, 330, 160)
    .text(`Fecha: ${new Date(doc.issuedAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'long', timeStyle: 'short' })}`, 330, 174)
    .text(`Pago: ${METHOD[s.paymentMethod] || s.paymentMethod}`, 330, 188);

  let y = 226;
  const cols = [48, 300, 350, 430, 500];
  pdf.rect(48, y, W - 96, 22).fill('#F4F5F3');
  pdf.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5);
  ['DESCRIPCIÓN', 'CANT.', 'PRECIO', 'DESC.', 'TOTAL'].forEach((h, i) => pdf.text(h, cols[i] + 6, y + 7, { width: i === 0 ? 240 : 60, align: i === 0 ? 'left' : 'right' }));
  y += 28;
  pdf.font('Helvetica').fontSize(9.5).fillColor(INK);
  for (const it of s.items) {
    const h = Math.max(16, pdf.heightOfString(it.description, { width: 240 }));
    pdf.text(it.description, cols[0] + 6, y, { width: 240 });
    pdf.fontSize(8).fillColor(MUTED).text(it.sku, cols[0] + 6, y + h, { width: 240 });
    pdf.fontSize(9.5).fillColor(INK);
    pdf.text(String(it.quantity), cols[1] + 6, y, { width: 40, align: 'right' });
    pdf.text(money(it.unitPrice), cols[2], y, { width: 70, align: 'right' });
    pdf.text(Number(it.discount) > 0 ? `- ${money(it.discount)}` : '—', cols[3], y, { width: 66, align: 'right' });
    pdf.text(money(it.total), cols[4], y, { width: 64, align: 'right' });
    y += h + 18;
    pdf.moveTo(48, y - 6).lineTo(W - 48, y - 6).lineWidth(0.5).strokeColor('#E3E6E2').stroke();
    if (y > 640) { pdf.addPage(); y = 60; }
  }

  const row = (label, value, bold = false) => {
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(INK).text(label, 330, y, { width: 120 }).text(value, 450, y, { width: 114, align: 'right' });
    y += bold ? 22 : 17;
  };
  y += 6;
  row('Subtotal', money(s.subtotal));
  if (Number(s.discount) > 0) row('Descuentos', `- ${money(s.discount)}`);
  row('Envío', Number(s.shipping) > 0 ? money(s.shipping) : 'Gratis');
  pdf.moveTo(330, y).lineTo(W - 48, y).lineWidth(1).strokeColor(INK).stroke();
  y += 8;
  row('Total', money(s.total), true);

  pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
    'Documento generado en un entorno académico. No corresponde a una factura electrónica (FEL) ni tiene validez tributaria. Los montos y pagos son simulados.',
    48, 700, { width: W - 96, align: 'center' },
  );
  pdf.end();
  return pdf;
}
