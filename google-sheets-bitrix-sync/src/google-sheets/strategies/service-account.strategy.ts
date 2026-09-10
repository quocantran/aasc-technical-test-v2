import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import fs from 'fs';
import { IGoogleSheetsAuthStrategy } from '../interfaces/google-sheets-auth.interface.js';

// Authenticates with Google Sheets API v4 using Service Account key file or environment variables
@Injectable()
export class ServiceAccountStrategy implements IGoogleSheetsAuthStrategy {
  private sheetsClient: sheets_v4.Sheets | null = null;
  private authClient: any = null;

  constructor(private readonly configService: ConfigService) {}

  // Initializes and returns cached GoogleAuth client
  async getAuthClient(): Promise<any> {
    if (this.authClient) {
      return this.authClient;
    }

    const credentialsPath = this.configService.get<string>('googleSheets.credentialsPath');
    const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

    if (credentialsPath && fs.existsSync(credentialsPath)) {
      this.authClient = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes,
      });
    } else {
      this.authClient = new google.auth.GoogleAuth({
        scopes,
      });
    }

    return this.authClient;
  }

  // Returns singleton Google Sheets v4 API instance
  async getSheetsClient(): Promise<sheets_v4.Sheets> {
    if (this.sheetsClient) {
      return this.sheetsClient;
    }
    const auth = await this.getAuthClient();
    this.sheetsClient = google.sheets({ version: 'v4', auth });
    return this.sheetsClient;
  }
}
