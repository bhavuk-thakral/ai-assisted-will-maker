import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { WillService } from '../will/will.service';
import OpenAI from 'openai';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly willService: WillService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim() !== '') {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn('OPENAI_API_KEY is not set. Chat will operate in demo/fallback mode.');
    }
  }

  async getChatHistory(willId: number) {
    return this.db.query(
      'SELECT id, role, message FROM messages WHERE will_id = $1 ORDER BY id ASC',
      [willId]
    );
  }

  async sendMessage(userId: number, userMessage: string) {
    if (!userMessage || userMessage.trim() === '') {
      throw new BadRequestException('Message cannot be empty');
    }

    // 1. Get user's active will details
    const will = await this.willService.getWillByUserId(userId);
    const willId = will.id;

    // 2. Save user message to database
    await this.db.query(
      'INSERT INTO messages (will_id, role, message) VALUES ($1, $2, $3)',
      [willId, 'user', userMessage]
    );

    // 3. Get last 10 messages for context
    const messagesContext = await this.db.query(
      'SELECT role, message FROM messages WHERE will_id = $1 ORDER BY id DESC LIMIT 10',
      [willId]
    );
    // Reverse to get chronological order
    messagesContext.reverse();

    let reply = '';
    let extractedData: any = null;

    // Check if we have OpenAI configured
    if (this.openai) {
      try {
        // Construct the system instructions
        const systemPrompt = `You are a warm, professional, and empathetic legal interviewer guiding the user to draft their Last Will and Testament.
Your goal is to collect all the necessary details step-by-step. 

RULES:
1. Ask only ONE question at a time. Do not overwhelm the user.
2. If the user provides partial info, politely ask for the rest.
3. Be concise and conversational.
4. Collect the following information:
   - Full Name
   - Age (must be a number)
   - Address
   - Assets (e.g. house, bank account, jewelry)
   - Beneficiaries (name, relationship to user, and share percentage of estate. If multiple, ensure shares add up to 100% or ask them to clarify)
   - Executor (the person who will execute this will)
   - Guardian (ask if they have minor children under 18; if yes, ask for a guardian's name. If no children or they are adults, set to 'None')
   - Two Witnesses (names of two individuals who will witness the signing. Note: they should not be beneficiaries)

Current Database State of the Will (use this to guide the conversation and fill missing information):
${JSON.stringify({
  fullName: will.full_name,
  age: will.age,
  address: will.address,
  executorName: will.executor_name,
  guardianName: will.guardian_name,
  assets: will.assets.map((a: any) => a.asset_name),
  beneficiaries: will.beneficiaries.map((b: any) => ({
    name: b.name,
    relationship: b.relationship,
    sharePercentage: Number(b.share_percentage)
  })),
  witnesses: will.witnesses.map((w: any) => w.name)
}, null, 2)}

You MUST respond in JSON format matching this schema:
{
  "reply": "Your conversational reply/question to the user",
  "extractedData": {
    "fullName": "string or null",
    "age": number or null,
    "address": "string or null",
    "executorName": "string or null",
    "guardianName": "string or null", // 'None' if not applicable
    "assets": ["string"], // array of asset names
    "beneficiaries": [
      { "name": "string", "relationship": "string", "sharePercentage": number }
    ],
    "witnesses": ["string"] // list of witness names
  }
}

Important: Analyze the user's latest input along with the message history to update the extractedData fields. If a field was previously known and the user did not change it, preserve it in the extractedData. Only update fields if the user has provided new or revised details.`;

        const openAiMessages: any[] = [
          { role: 'system', content: systemPrompt },
          ...messagesContext.map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.message,
          })),
        ];

        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: openAiMessages,
          response_format: { type: 'json_object' },
        });

        const content = completion.choices[0].message.content || '{}';
        const parsed = JSON.parse(content);
        
        reply = parsed.reply || 'Could you please elaborate on that?';
        extractedData = parsed.extractedData;
      } catch (err) {
        this.logger.error('OpenAI API call failed, falling back to rule-based mock response:', err);
        // Fallback inside catch block
        const fallback = this.getFallbackMockResponse(userMessage, will);
        reply = fallback.reply;
        extractedData = fallback.extractedData;
      }
    } else {
      // API Key is not set, use interactive mock responder
      const fallback = this.getFallbackMockResponse(userMessage, will);
      reply = fallback.reply;
      extractedData = fallback.extractedData;
    }

    // 4. Save AI response to messages table
    await this.db.query(
      'INSERT INTO messages (will_id, role, message) VALUES ($1, $2, $3)',
      [willId, 'assistant', reply]
    );

    // 5. Sync extractedData with database tables if available
    if (extractedData) {
      await this.syncExtractedWillData(willId, extractedData);
    }

    // 6. Get updated will status
    const updatedWill = await this.willService.getWillById(willId, userId);

    return {
      reply,
      will: updatedWill,
    };
  }

  private getFallbackMockResponse(msg: string, will: any) {
    const text = msg.toLowerCase();
    
    // Create copy of current fields to update
    const fullName = will.full_name;
    const age = will.age;
    const address = will.address;
    const executorName = will.executor_name;
    const guardianName = will.guardian_name || 'None';
    const assets = will.assets.map((a: any) => a.asset_name);
    const beneficiaries = will.beneficiaries.map((b: any) => ({
      name: b.name,
      relationship: b.relationship,
      sharePercentage: Number(b.share_percentage)
    }));
    const witnesses = will.witnesses.map((w: any) => w.name);

    let reply = '';
    const extractedData = {
      fullName,
      age,
      address,
      executorName,
      guardianName,
      assets,
      beneficiaries,
      witnesses
    };

    // Extremely simple keyword-based mock parser for testing UI
    if (!fullName) {
      if (text.includes('name is') || text.includes('am') || msg.split(' ').length <= 3) {
        const cleaned = msg.replace(/my name is|i am/gi, '').trim();
        extractedData.fullName = cleaned;
        reply = `Thanks, ${cleaned}! What is your age?`;
      } else {
        reply = "Hello! Let's get started on your will. First, what is your full name?";
      }
    } else if (age === null) {
      const match = msg.match(/\d+/);
      if (match) {
        extractedData.age = parseInt(match[0], 10);
        reply = `Got it, you are ${match[0]} years old. What is your current residential address?`;
      } else {
        reply = `Hi ${fullName}, could you please tell me how old you are?`;
      }
    } else if (!address) {
      extractedData.address = msg;
      reply = `Thank you. Now, let's list some assets. What assets do you own? (e.g. house, bank account, vehicle)`;
    } else if (assets.length === 0) {
      extractedData.assets = [msg];
      reply = `Great, I've noted that asset. Who would you like to nominate as the beneficiaries of your estate? Please specify their name, relationship, and what percentage they get.`;
    } else if (beneficiaries.length === 0) {
      extractedData.beneficiaries = [{
        name: msg.replace(/my spouse|my child|gets|receives/gi, '').trim() || 'Beneficiary 1',
        relationship: 'Family',
        sharePercentage: 100
      }];
      reply = `I have added them as a 100% beneficiary. Who would you like to appoint as the Executor to carry out your will?`;
    } else if (!executorName) {
      extractedData.executorName = msg;
      reply = `Do you have minor children? If yes, who should be their Guardian if they are under 18? If no, please say 'no'.`;
    } else if (guardianName === 'None' && !text.includes('no') && !text.includes('none')) {
      extractedData.guardianName = msg;
      reply = `Perfect. Finally, we need the names of two witnesses. Who will be your first witness?`;
    } else if (witnesses.length < 2) {
      if (witnesses.length === 0) {
        extractedData.witnesses = [msg];
        reply = `Added the first witness: ${msg}. Who will be your second witness?`;
      } else {
        extractedData.witnesses = [witnesses[0], msg];
        reply = `Excellent! We have collected all details. You can view your completed Will on the right panel.`;
      }
    } else {
      reply = "All details are collected! You can check the preview panel and validate or download your Will document.";
    }

    return { reply, extractedData };
  }

  private async syncExtractedWillData(willId: number, data: any) {
    await this.db.transaction(async (client) => {
      // 1. Update wills main details
      await client.query(
        `UPDATE wills 
         SET full_name = COALESCE($1, full_name),
             age = COALESCE($2, age),
             address = COALESCE($3, address),
             executor_name = COALESCE($4, executor_name),
             guardian_name = COALESCE($5, guardian_name)
         WHERE id = $6`,
        [
          data.fullName || null,
          data.age !== null && data.age !== undefined ? parseInt(data.age, 10) : null,
          data.address || null,
          data.executorName || null,
          data.guardianName || null,
          willId
        ]
      );

      // 2. Sync assets (Delete and insert new)
      if (Array.isArray(data.assets)) {
        await client.query('DELETE FROM assets WHERE will_id = $1', [willId]);
        for (const asset of data.assets) {
          if (asset && asset.trim() !== '') {
            await client.query(
              'INSERT INTO assets (will_id, asset_name) VALUES ($1, $2)',
              [willId, asset.trim()]
            );
          }
        }
      }

      // 3. Sync beneficiaries (Delete and insert new)
      if (Array.isArray(data.beneficiaries)) {
        await client.query('DELETE FROM beneficiaries WHERE will_id = $1', [willId]);
        for (const b of data.beneficiaries) {
          if (b && b.name && b.name.trim() !== '') {
            const pct = b.sharePercentage !== undefined && b.sharePercentage !== null 
              ? Number(b.sharePercentage) 
              : 100;
            await client.query(
              'INSERT INTO beneficiaries (will_id, name, relationship, share_percentage) VALUES ($1, $2, $3, $4)',
              [willId, b.name.trim(), (b.relationship || 'Unspecified').trim(), pct]
            );
          }
        }
      }

      // 4. Sync witnesses (Delete and insert new)
      if (Array.isArray(data.witnesses)) {
        await client.query('DELETE FROM witnesses WHERE will_id = $1', [willId]);
        for (const witness of data.witnesses) {
          if (witness && witness.trim() !== '') {
            await client.query(
              'INSERT INTO witnesses (will_id, name) VALUES ($1, $2)',
              [willId, witness.trim()]
            );
          }
        }
      }
    });
  }
}
