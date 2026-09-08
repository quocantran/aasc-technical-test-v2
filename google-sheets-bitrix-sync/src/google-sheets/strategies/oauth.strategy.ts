import { Injectable } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import { IGoogleSheetsAuthStrategy } from '../interfaces/google-sheets-auth.interface.js';

// OAuth2 authentication strategy placeholder for user-delegated Google Sheets access
@Injectable()
export class GoogleOAuthStrategy implements IGoogleSheetsAuthStrategy {
  // Returns OAuth2 client instance for token exchange
  async getAuthClient(): Promise<any> {
    return new google.auth.OAuth2();
  }

  // Returns Sheets API client authenticated via OAuth2
  async getSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await this.getAuthClient();
    return google.sheets({ version: 'v4', auth });
  }
}
