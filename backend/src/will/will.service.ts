import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WillService {
  constructor(private readonly db: DatabaseService) {}

  async getWillByUserId(userId: number) {
    const wills = await this.db.query('SELECT * FROM wills WHERE user_id = $1', [userId]);
    if (wills.length === 0) {
      // Create a default one if it somehow doesn't exist
      const newWill = await this.db.query(
        'INSERT INTO wills (user_id, status) VALUES ($1, $2) RETURNING *',
        [userId, 'IN_PROGRESS']
      );
      return this.getWillDetails(newWill[0].id);
    }
    return this.getWillDetails(wills[0].id);
  }

  async getWillById(willId: number, userId?: number) {
    const wills = await this.db.query('SELECT * FROM wills WHERE id = $1', [willId]);
    if (wills.length === 0) {
      throw new NotFoundException(`Will with ID ${willId} not found`);
    }
    const will = wills[0];
    if (userId && will.user_id !== userId) {
      throw new ForbiddenException('You do not have permission to access this will');
    }
    return this.getWillDetails(willId);
  }

  private async getWillDetails(willId: number) {
    const wills = await this.db.query('SELECT * FROM wills WHERE id = $1', [willId]);
    if (wills.length === 0) return null;
    const will = wills[0];

    const assets = await this.db.query('SELECT id, asset_name FROM assets WHERE will_id = $1', [willId]);
    const beneficiaries = await this.db.query('SELECT id, name, relationship, share_percentage FROM beneficiaries WHERE will_id = $1', [willId]);
    const witnesses = await this.db.query('SELECT id, name FROM witnesses WHERE will_id = $1', [willId]);

    // Calculate percentage based on 7 requirements: Name, Age, Address, Executor, Assets, Beneficiaries, Witnesses
    let completedCount = 0;
    if (will.full_name && will.full_name.trim() !== '') completedCount++;
    if (will.age !== null && will.age !== undefined) completedCount++;
    if (will.address && will.address.trim() !== '') completedCount++;
    if (will.executor_name && will.executor_name.trim() !== '') completedCount++;
    if (assets.length > 0) completedCount++;
    if (beneficiaries.length > 0) completedCount++;
    if (witnesses.length >= 2) completedCount++;

    const progressPercentage = Math.round((completedCount / 7) * 100);

    return {
      ...will,
      assets,
      beneficiaries,
      witnesses,
      progressPercentage,
    };
  }

  async validateWill(willId: number, userId?: number) {
    const will = await this.getWillById(willId, userId);
    
    const errors: string[] = [];
    const warnings: string[] = [];

    // Rule 1: Executor missing
    if (!will.executor_name || will.executor_name.trim() === '') {
      errors.push('Executor is missing');
    }

    // Rule 2: Less than 2 witnesses
    if (will.witnesses.length < 2) {
      errors.push(`Less than 2 witnesses (currently: ${will.witnesses.length}, exactly 2 required)`);
    }

    // Rule 3: Witness is also a beneficiary
    const beneficiaryNames = new Set(will.beneficiaries.map((b: any) => b.name.toLowerCase().trim()));
    will.witnesses.forEach((w: any) => {
      if (beneficiaryNames.has(w.name.toLowerCase().trim())) {
        warnings.push(`Witness "${w.name}" is also a beneficiary. This can invalidate their share in many jurisdictions.`);
      }
    });

    return {
      errors,
      warnings,
      valid: errors.length === 0,
    };
  }

  async generateHtmlDocument(willId: number, userId?: number): Promise<string> {
    const will = await this.getWillById(willId, userId);

    const name = will.full_name || '________________________';
    const age = will.age !== null ? String(will.age) : '_____';
    const address = will.address || '________________________________________________';
    const executorName = will.executor_name || '________________________';
    const guardianName = will.guardian_name && will.guardian_name.toLowerCase() !== 'none' && will.guardian_name.toLowerCase() !== 'n/a' 
      ? will.guardian_name 
      : null;

    const assetsLi = will.assets.length > 0
      ? will.assets.map((a: any) => `<li>${a.asset_name}</li>`).join('')
      : '<li>All real and personal property (General Estate)</li>';

    const beneficiariesLi = will.beneficiaries.length > 0
      ? will.beneficiaries.map((b: any) => `<li><strong>${b.name}</strong> (${b.relationship}) - ${b.share_percentage}% share</li>`).join('')
      : '<li>No beneficiaries specified yet.</li>';

    const witnessesDiv = will.witnesses.length > 0
      ? will.witnesses.map((w: any, idx: number) => `
        <div style="flex: 1; min-width: 200px; margin-top: 20px;">
          <p><strong>Witness ${idx + 1}:</strong> ${w.name}</p>
          <div style="border-bottom: 1px solid #000; height: 40px; margin-bottom: 5px;"></div>
          <p style="font-size: 0.8em; color: #555;">Signature & Date</p>
        </div>
      `).join('')
      : `
        <div style="flex: 1; min-width: 200px; margin-top: 20px;">
          <p><strong>Witness 1:</strong> ________________________</p>
          <div style="border-bottom: 1px solid #000; height: 40px; margin-bottom: 5px;"></div>
          <p style="font-size: 0.8em; color: #555;">Signature & Date</p>
        </div>
        <div style="flex: 1; min-width: 200px; margin-top: 20px;">
          <p><strong>Witness 2:</strong> ________________________</p>
          <div style="border-bottom: 1px solid #000; height: 40px; margin-bottom: 5px;"></div>
          <p style="font-size: 0.8em; color: #555;">Signature & Date</p>
        </div>
      `;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Last Will and Testament - ${will.full_name || 'Draft'}</title>
  <style>
    body {
      font-family: 'Times New Roman', Times, serif;
      line-height: 1.6;
      color: #000;
      background-color: #fff;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1, h2 {
      text-align: center;
      text-transform: uppercase;
      margin-bottom: 30px;
    }
    h1 {
      font-size: 1.8em;
      letter-spacing: 2px;
    }
    h2 {
      font-size: 1.2em;
      margin-top: 40px;
      border-bottom: 1px solid #000;
      padding-bottom: 5px;
      text-align: left;
    }
    p, li {
      font-size: 1.1em;
      text-align: justify;
    }
    ol, ul {
      padding-left: 20px;
    }
    .signature-section {
      margin-top: 60px;
      page-break-inside: avoid;
    }
    .sig-row {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      margin-top: 40px;
    }
    .sig-box {
      width: 45%;
      min-width: 250px;
    }
    .line {
      border-bottom: 1px solid #000;
      height: 40px;
      margin-bottom: 5px;
    }
    @media print {
      body {
        padding: 0;
        margin: 0;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-family: sans-serif;">
    <div>
      <h3 style="margin: 0; color: #1f2937;">Will Document Draft</h3>
      <p style="margin: 5px 0 0 0; font-size: 0.85em; color: #4b5563;">This is a print-ready document preview. Use Ctrl+P to save as PDF or Print.</p>
    </div>
    <button onclick="window.print()" style="background-color: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: background-color 0.2s;">Print or Save PDF</button>
  </div>

  <h1>Last Will and Testament</h1>
  <p style="text-align: center; font-style: italic; margin-bottom: 40px;">of</p>
  <h2 style="text-align: center; border: none; padding: 0; margin-top: 0;">${name}</h2>

  <p>I, <strong>${name}</strong>, aged <strong>${age}</strong>, residing at <strong>${address}</strong>, being of sound mind and memory, and not acting under duress, menace, fraud, or undue influence of any person whomsoever, do hereby make, publish, and declare this instrument to be my Last Will and Testament, hereby revoking any and all prior wills and codicils made by me.</p>

  <h2>Declarations & Family</h2>
  <p>I declare that I am executing this Will as a statement of my final wishes. ${guardianName ? `I declare that I have minor children, and in the event of my death, I nominate <strong>${guardianName}</strong> to serve as the Guardian of their person and estate during their minority.` : 'I declare that I have no minor children requiring the appointment of a guardian.'}</p>

  <h2>Appointment of Executor</h2>
  <p>I hereby nominate, constitute, and appoint <strong>${executorName}</strong> as the Executor of this my Last Will and Testament. If this nominee is unable or unwilling to serve, I reserve the right for a court of competent jurisdiction to appoint a suitable successor. I direct that no executor nominated herein shall be required to post bond or other security in any jurisdiction for the faithful performance of their duties.</p>

  <h2>Disposition of Assets</h2>
  <p>I direct that all my just debts, funeral expenses, and expenses of administering my estate be paid first. Subject to these payments, I dispose of my property as follows:</p>
  
  <h3>Specific Assets Named:</h3>
  <ul>
    ${assetsLi}
  </ul>

  <h3>Distribution to Beneficiaries:</h3>
  <ul>
    ${beneficiariesLi}
  </ul>

  <p>If any beneficiary does not survive me by 30 days, their share shall be distributed pro-rata among the surviving beneficiaries, or become part of my residuary estate.</p>

  <h2>Signature of Testator</h2>
  <p>IN WITNESS WHEREOF, I have hereunto set my hand and seal to this, my Last Will and Testament, on this _____ day of ________________, 20___.</p>
  
  <div class="sig-row">
    <div class="sig-box">
      <div class="line"></div>
      <p><strong>${name}</strong><br>Testator / Testatrix</p>
    </div>
  </div>

  <h2>Attestation of Witnesses</h2>
  <p>The foregoing instrument was on the date thereof signed, published, and declared by the Testator to be their Last Will and Testament, in the presence of us, who, at their request, in their presence, and in the presence of each other, have subscribed our names as witnesses thereto, believing the Testator to be of sound mind and memory at the time of signing.</p>

  <div class="sig-row" style="margin-top: 20px;">
    ${witnessesDiv}
  </div>
</body>
</html>
`;
  }
}
