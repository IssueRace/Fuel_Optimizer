/*
 * FuelFlow PDF Generator Service.
 * A serverless function that creates a customized PDF trip optimization report
 * using jsPDF on the server side.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jsPDF } from 'jspdf';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      origin, 
      destination, 
      distance, 
      cost, 
      stops, 
      fuelType, 
      consumption, 
      capacity, 
      isPossible, 
      stoppedAtKm,
      startingFuel
    } = req.body;

    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFillColor(30, 41, 59);
    doc.rect(15, y, w - 30, 25, 'F');
    
    doc.setFontSize(20);
    doc.setTextColor(56, 189, 248);
    doc.setFont('Helvetica', 'bold');
    doc.text('FuelFlow - Trip Optimization Report', w / 2, y + 16, { align: 'center' });
    y += 35;

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text('Trip Overview', 18, y);
    y += 6;
    doc.setDrawColor(226, 232, 240);
    doc.line(15, y, w - 15, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    doc.text(`Origin: ${origin || 'N/A'}`, 20, y);
    doc.text(`Destination: ${destination || 'N/A'}`, 20, y + 7);
    doc.text(`Total Distance: ${distance ? distance.toFixed(1) : '0.0'} km`, 20, y + 14);

    doc.text(`Fuel Type: ${fuelType || 'Petrol'}`, 110, y);
    doc.text(`Consumption: ${consumption || 0} ${fuelType === 'Electric' ? 'kWh' : 'L'}/100km`, 110, y + 7);
    doc.text(`Tank Capacity: ${capacity || 0} ${fuelType === 'Electric' ? 'kWh' : 'L'}`, 110, y + 14);
    y += 24;

    if (isPossible) {
      doc.setFillColor(240, 253, 250);
      doc.rect(15, y, w - 30, 16, 'F');
      doc.setTextColor(13, 148, 136);
      doc.setFont('Helvetica', 'bold');
      doc.text(`✓ Route is fully feasible. Starting Fuel Level: ${startingFuel || 0}%.`, 20, y + 10);
    } else {
      doc.setFillColor(254, 242, 242);
      doc.rect(15, y, w - 30, 16, 'F');
      doc.setTextColor(220, 38, 38);
      doc.setFont('Helvetica', 'bold');
      doc.text(`⚠ Route is IMPOSSIBLE. Vehicle ran out of fuel at ${stoppedAtKm ? stoppedAtKm.toFixed(1) : '0.0'} km.`, 20, y + 10);
    }
    y += 24;

    doc.setFillColor(248, 250, 252);
    doc.rect(15, y, w - 30, 20, 'F');
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Estimated Total Fuel Cost:', 20, y + 12);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(14, 165, 233);
    doc.text(`EUR ${cost ? cost.toFixed(2) : '0.00'}`, 110, y + 13);
    y += 30;

    if (stops && stops.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`Recommended Refueling Stops (${stops.length})`, 18, y);
      y += 6;
      doc.setDrawColor(226, 232, 240);
      doc.line(15, y, w - 15, y);
      y += 8;

      doc.setFillColor(30, 41, 59);
      doc.rect(15, y - 5, w - 30, 8, 'F');

      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.text('#', 20, y);
      doc.text('Station Brand / Name', 30, y);
      doc.text('Fuel Price', 110, y);
      doc.text(`Refuel Amount (${fuelType === 'Electric' ? 'kWh' : 'L'})`, 135, y);
      doc.text('Est. Cost', 175, y);
      y += 8;

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      stops.forEach((stop: any, i: number) => {
        if (y > 265) {
          doc.addPage();
          y = 25;
          doc.setFillColor(30, 41, 59);
          doc.rect(15, y - 5, w - 30, 8, 'F');
          doc.setFontSize(9);
          doc.setTextColor(255, 255, 255);
          doc.setFont('Helvetica', 'bold');
          doc.text('#', 20, y);
          doc.text('Station Brand / Name', 30, y);
          doc.text('Fuel Price', 110, y);
          doc.text(`Refuel Amount (${fuelType === 'Electric' ? 'kWh' : 'L'})`, 135, y);
          doc.text('Est. Cost', 175, y);
          y += 8;
          doc.setFont('Helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
        }

        const bg = i % 2 === 0 ? 248 : 255;
        doc.setFillColor(bg, bg, bg);
        doc.rect(15, y - 5, w - 30, 8, 'F');

        doc.text(`${i + 1}`, 20, y);
        
        const displayName = stop.stationName && stop.stationName.length > 35 
          ? stop.stationName.substring(0, 32) + '...' 
          : stop.stationName || 'Unknown Station';
        doc.text(displayName, 30, y);

        doc.text(`EUR ${stop.pricePerLiter ? stop.pricePerLiter.toFixed(2) : '0.00'}/L`, 110, y);
        doc.text(`${stop.amountToRefuel ? stop.amountToRefuel.toFixed(1) : '0.0'}`, 135, y);
        
        const stopCost = (stop.amountToRefuel || 0) * (stop.pricePerLiter || 0);
        doc.text(`EUR ${stopCost.toFixed(2)}`, 175, y);
        y += 8;
      });
    } else {
      doc.setFontSize(11);
      doc.setFont('Helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text('No stops required for this trip. You can reach the destination on the initial fuel tank.', 20, y);
      y += 10;
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(15, 275, w - 15, 275);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated on: ${new Date().toLocaleString('en-US')}`, 15, 281);
    doc.text('Powered by FuelFlow Serverless Function (Vercel)', w - 15, 281, { align: 'right' });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="trip-report.pdf"');
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    return res.status(500).json({ error: error.message || 'Serverless PDF generation failed' });
  }
}
