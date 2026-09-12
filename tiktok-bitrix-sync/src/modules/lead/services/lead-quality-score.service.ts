import { Injectable } from '@nestjs/common';

@Injectable()
export class LeadQualityScoreService {
  // Evaluates lead engagement metrics and profile completeness (0 - 100 points)
  calculateQualityScore(leadData: {
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
    customQuestions?: any;
    interests?: any;
    ttclid?: string;
    utmSource?: string;
  }): number {
    let score = 0;

    // 1. Contact Completeness (Max 60 pts)
    if (leadData.phone && leadData.phone.trim().length >= 9) {
      score += 20; // Valid phone provided
    }
    if (leadData.email && leadData.email.includes('@')) {
      score += 20; // Valid email provided
    }
    if (leadData.name && leadData.name.trim().length > 1 && !leadData.name.toLowerCase().includes('anonymous')) {
      score += 10; // Real full name
    }
    if (leadData.city && leadData.city.trim().length > 0) {
      score += 10; // Geographic location provided
    }

    // 2. Engagement Depth & Form Questions (Max 20 pts)
    if (Array.isArray(leadData.customQuestions) && leadData.customQuestions.length > 0) {
      const answeredCount = leadData.customQuestions.filter(
        (q: any) => q.answer && String(q.answer).trim().length > 0,
      ).length;
      score += Math.min(20, answeredCount * 10);
    }

    // 3. User Interests & Affinity (Max 10 pts)
    if (Array.isArray(leadData.interests) && leadData.interests.length > 0) {
      score += 10;
    }

    // 4. Marketing Attribution & Ad Click Verification (Max 10 pts)
    if (leadData.ttclid && leadData.ttclid.trim().length > 0) {
      score += 10;
    } else if (leadData.utmSource) {
      score += 5;
    }

    return Math.min(100, score);
  }
}
