import { GoogleAuth } from 'google-auth-library';
import { sheets_v4 } from 'googleapis';

// Interface defining client resolution for Google Sheets authentication strategies
export interface IGoogleSheetsAuthStrategy {
  // Returns initialized Google authentication client
  getAuthClient(): Promise<GoogleAuth | any>;

  // Returns ready-to-use Google Sheets v4 API instance
  getSheetsClient(): Promise<sheets_v4.Sheets>;
}
