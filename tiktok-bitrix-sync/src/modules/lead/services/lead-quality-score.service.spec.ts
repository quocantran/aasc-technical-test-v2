import { LeadQualityScoreService } from './lead-quality-score.service';

describe('LeadQualityScoreService', () => {
  let service: LeadQualityScoreService;

  beforeEach(() => {
    service = new LeadQualityScoreService();
  });

  it('should score high for complete profile and answered questions', () => {
    const score = service.calculateQualityScore({
      name: 'Nguyen Van A',
      email: 'a@example.com',
      phone: '+84901234567',
      city: 'Ha Noi',
      customQuestions: [
        { question: 'Budget', answer: '50000000' },
        { question: 'Timeline', answer: 'Immediate' },
      ],
      interests: ['technology'],
      ttclid: 'TT-12345',
    });

    expect(score).toBe(100); // 20 + 20 + 10 + 10 + 20 + 10 + 10 = 100
  });

  it('should score low for incomplete contact info and no engagement', () => {
    const score = service.calculateQualityScore({
      name: 'Anonymous',
      phone: '123',
    });

    expect(score).toBe(0);
  });
});
